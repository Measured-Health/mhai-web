"use client";
import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readBackupCode } from "@mhai/api-client/codes";
import { clearNewBackupCode as forgetStepUpCode } from "@mhai/api-client/new-backup-code";
import {
  endApprovalSession,
  flushPendingApprovals,
} from "../review/pending-approvals";
import { useSession } from "../session-store";
import { getAuthClient } from "./client";
import { onUnauthorized } from "./events";
import {
  ADMIN_HOME,
  AuthError,
  canUseAnalysis,
  isClinical,
  isHospitalAdmin,
  type AuthClient,
  type Capabilities,
  type FirstStep,
  type SignInResult,
  type User,
} from "./types";

export type SignOutReason = "idle" | "manual" | "expired";
type Status = "loading" | "signed_out" | "signed_in";
type State = { status: Status; user: User | null; steps: FirstStep[] };

export interface AuthCtx extends State {
  mfaPending: boolean;
  capabilities: Capabilities;
  client: AuthClient;
  signedOutReason: SignOutReason | null;
  dismissNotice(): void;
  signIn(login: string, password: string): Promise<SignInResult>;
  signInWithHospital(): Promise<SignInResult>;
  completeHospitalSignIn(code: string): Promise<SignInResult>;
  verifyCode(
    code: string,
    opts: { backup: boolean; trustDevice: boolean },
  ): Promise<SignInResult>;
  cancelMfa(): void;
  /**
   * The new backup code a backup-code sign-in returned, until the person
   * has seen it and pressed Continue. Memory only; null when none.
   */
  newBackupCode: string | null;
  /** Forgets the new backup code (Continue on the save screen). */
  clearNewBackupCode(): void;
  completeStep(step: FirstStep): void;
  updateUser(patch: Partial<User>): void;
  signOut(reason: SignOutReason): Promise<void>;
}

const SIGNED_OUT: State = { status: "signed_out", user: null, steps: [] };
const Ctx = createContext<AuthCtx | null>(null);

/**
 * The first sign-in steps still owed. Every hospital admin, including a
 * clinician who is one, must have two-step on: without it the setup step is
 * owed even if the session didn't list it (amendment 3). So must anyone who
 * can use Analysis.
 */
export function stepsOwed(user: User | null, steps: FirstStep[]): FirstStep[] {
  return (isHospitalAdmin(user) || canUseAnalysis(user)) &&
    !user?.mfaEnabled &&
    !steps.includes("mfa")
    ? [...steps, "mfa"]
    : steps;
}

function withOwed(s: State): State {
  const steps = stepsOwed(s.user, s.steps);
  return steps === s.steps ? s : { ...s, steps };
}

/** Where a signed-in person belongs right now (R2). */
export function homeFor(s: { user: User | null; steps: FirstStep[] }) {
  if (stepsOwed(s.user, s.steps).length) return "/welcome";
  if (isClinical(s.user)) return "/";
  if (isHospitalAdmin(s.user)) return ADMIN_HOME;
  return "/no-access";
}

/**
 * Who is signed in, in memory only (never browser storage). In live mode
 * the session itself is an httpOnly cookie that this code never reads.
 */
export function AuthProvider({
  children,
  client: given,
  initialUser,
}: {
  children: ReactNode;
  client?: AuthClient;
  /** A user (signed in) or null (signed out) skips the session lookup. */
  initialUser?: User | null;
}) {
  const [client] = useState(() => given ?? getAuthClient());
  const history = useSession();
  const router = useRouter();
  const [state, setRaw] = useState<State>(() =>
    initialUser === undefined
      ? { status: "loading", user: null, steps: [] }
      : initialUser
        ? withOwed({ status: "signed_in", user: initialUser, steps: [] })
        : SIGNED_OUT,
  );
  // Every change keeps the owed steps complete: an admin who loses two-step
  // (e.g. the API says so) owes the setup step again, and keeps owing it
  // until the step itself is completed (after the backup codes).
  const setState = useCallback(
    (next: State | ((s: State) => State)) =>
      setRaw((s) => withOwed(typeof next === "function" ? next(s) : next)),
    [],
  );
  const [mfaPending, setMfaPending] = useState(false);
  const [newBackupCode, setNewBackupCode] = useState<string | null>(null);
  const [reason, setReason] = useState<SignOutReason | null>(null);
  // Read by signOut to stay idempotent; written in a layout effect and by
  // signOut. A layout effect, so it is current before any screen's effect
  // in the same commit: a /sign-out opened directly (or a refusal on a
  // reload) calls signOut on the very render the session lookup lands.
  const live = useRef({ signedIn: state.status === "signed_in", mfaPending });
  useLayoutEffect(() => {
    live.current = { signedIn: state.status === "signed_in", mfaPending };
  }, [state.status, mfaPending]);

  useEffect(() => {
    if (initialUser !== undefined) return;
    let on = true;
    client
      .getSession()
      .then((s) => {
        if (on)
          setState(
            s
              ? { status: "signed_in", user: s.user, steps: s.steps }
              : SIGNED_OUT,
          );
      })
      .catch(() => on && setRaw(SIGNED_OUT));
    return () => {
      on = false;
    };
  }, [client, initialUser, setState]);

  const apply = useCallback(
    (r: SignInResult) => {
      if (r.status === "mfa_required") {
        setMfaPending(true);
        return r;
      }
      setMfaPending(false);
      setReason(null);
      // A new sign-in: nothing from before is ever sent under it.
      endApprovalSession();
      // A backup code signed in: its replacement, shown once on the code
      // page before it moves on (set with the session, in one render).
      const fresh = readBackupCode(r.newBackupCode);
      setNewBackupCode(fresh);
      setState({
        status: "signed_in",
        user: fresh ? { ...r.user, backupCodesLeft: 1 } : r.user,
        steps: r.steps,
      });
      return r;
    },
    [setState],
  );

  // A sign-out still finishing (sending a waiting approval, then ending the
  // session): a sign-in waits for it, so it can't end the next session or
  // drop the next person's approvals. At most about 5 s (the flush cap).
  const signingOut = useRef<Promise<void> | null>(null);
  const afterSignOut = useCallback(
    async () => void (await signingOut.current),
    [],
  );

  const signOut = useCallback(
    async (why: SignOutReason) => {
      if (!live.current.signedIn && !live.current.mfaPending) return;
      live.current = { signedIn: false, mfaPending: false };
      // A waiting approval goes first, while the session still works (it
      // takes the approval, so leaving the page can't send it twice). An
      // expired session can't send it: it stays waiting. Then nothing from
      // this session is sent again (no retry after sign-out).
      const sent = why === "expired" ? null : flushPendingApprovals();
      if (!sent) endApprovalSession();
      startTransition(() => {
        history.clear();
        setRaw(SIGNED_OUT);
        setMfaPending(false);
        // A new backup code never outlives the session it came with.
        setNewBackupCode(null);
        forgetStepUpCode();
        setReason(why);
        router.replace("/sign-in");
      });
      const finish = (async () => {
        if (sent) {
          await sent;
          endApprovalSession();
        }
        await client.signOut().catch(() => {});
      })();
      signingOut.current = finish;
      await finish;
      if (signingOut.current === finish) signingOut.current = null;
    },
    [client, history, router],
  );

  // A live call found the session gone: sign out once, saying why.
  useEffect(() => onUnauthorized(() => void signOut("expired")), [signOut]);

  const value = useMemo<AuthCtx>(
    () => ({
      ...state,
      mfaPending,
      capabilities: client.capabilities,
      client,
      signedOutReason: reason,
      dismissNotice: () => setReason(null),
      signIn: async (login, password) => {
        await afterSignOut();
        return apply(await client.signIn(login, password));
      },
      signInWithHospital: async () => {
        await afterSignOut();
        return apply(await client.signInWithHospital());
      },
      completeHospitalSignIn: async (code) => {
        await afterSignOut();
        return apply(await client.completeHospitalSignIn(code));
      },
      verifyCode: async (code, opts) => {
        await afterSignOut();
        try {
          return apply(await client.verifyCode(code, opts));
        } catch (e) {
          // Refused after core spent the backup code: its replacement
          // still shows once, before the refusal.
          // The refusal goes on without it, so the code never lingers in
          // the page's error state.
          if (e instanceof AuthError && e.newBackupCode) {
            setNewBackupCode(readBackupCode(e.newBackupCode));
            throw new AuthError(e.code, e.attemptsLeft);
          }
          throw e;
        }
      },
      cancelMfa: () => setMfaPending(false),
      newBackupCode,
      clearNewBackupCode: () => setNewBackupCode(null),
      completeStep: (step) =>
        setState((s) => ({ ...s, steps: s.steps.filter((x) => x !== step) })),
      updateUser: (patch) =>
        setState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s)),
      signOut,
    }),
    [
      state,
      mfaPending,
      newBackupCode,
      client,
      reason,
      apply,
      afterSignOut,
      signOut,
      setState,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

/**
 * The auth state, or null outside an AuthProvider: for pieces that also
 * render without a signed-in person, and then show nothing about them.
 */
export const useOptionalAuth = (): AuthCtx | null => useContext(Ctx);
