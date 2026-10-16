"use client";
import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  endApprovalSession,
  flushPendingApprovals,
} from "../review/pending-approvals";
import { useSession } from "../session-store";
import { getAuthClient } from "./client";
import { onUnauthorized } from "./events";
import {
  isClinical,
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
  completeStep(step: FirstStep): void;
  updateUser(patch: Partial<User>): void;
  signOut(reason: SignOutReason): Promise<void>;
}

const SIGNED_OUT: State = { status: "signed_out", user: null, steps: [] };
const Ctx = createContext<AuthCtx | null>(null);

/** Where a signed-in person belongs right now. */
export function homeFor(s: { user: User | null; steps: FirstStep[] }) {
  if (s.steps.length) return "/welcome";
  return isClinical(s.user) ? "/" : "/no-access";
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
  const [state, setState] = useState<State>(() =>
    initialUser === undefined
      ? { status: "loading", user: null, steps: [] }
      : initialUser
        ? { status: "signed_in", user: initialUser, steps: [] }
        : SIGNED_OUT,
  );
  const [mfaPending, setMfaPending] = useState(false);
  const [reason, setReason] = useState<SignOutReason | null>(null);
  // Read by signOut to stay idempotent; written only in an effect.
  const live = useRef({ signedIn: state.status === "signed_in", mfaPending });
  useEffect(() => {
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
      .catch(() => on && setState(SIGNED_OUT));
    return () => {
      on = false;
    };
  }, [client, initialUser]);

  const apply = useCallback((r: SignInResult) => {
    if (r.status === "mfa_required") {
      setMfaPending(true);
      return r;
    }
    setMfaPending(false);
    setReason(null);
    // A new sign-in: nothing from before is ever sent under it.
    endApprovalSession();
    setState({ status: "signed_in", user: r.user, steps: r.steps });
    return r;
  }, []);

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
        setState(SIGNED_OUT);
        setMfaPending(false);
        setReason(why);
        router.replace("/sign-in");
      });
      if (sent) {
        await sent;
        endApprovalSession();
      }
      await client.signOut().catch(() => {});
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
      signIn: async (login, password) =>
        apply(await client.signIn(login, password)),
      signInWithHospital: async () => apply(await client.signInWithHospital()),
      completeHospitalSignIn: async (code) =>
        apply(await client.completeHospitalSignIn(code)),
      verifyCode: async (code, opts) =>
        apply(await client.verifyCode(code, opts)),
      cancelMfa: () => setMfaPending(false),
      completeStep: (step) =>
        setState((s) => ({ ...s, steps: s.steps.filter((x) => x !== step) })),
      updateUser: (patch) =>
        setState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s)),
      signOut,
    }),
    [state, mfaPending, client, reason, apply, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
