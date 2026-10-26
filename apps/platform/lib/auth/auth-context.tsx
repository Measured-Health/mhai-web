"use client";
import { useQueryClient } from "@tanstack/react-query";
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
import { queryKeys } from "../queries/keys";
import { endSessionRequests } from "../queries/session-end";
import { getAuthClient } from "./client";
import { onUnauthorized } from "./events";
import type { AuthClient, FirstStep, SignInResult, User } from "./types";

export { isAuditor, isPlatformAdmin } from "./types";

/**
 * Why the person is signed out, shown on the sign-in page. `not_platform`:
 * a hospital account was turned away (at the password or the code step).
 */
export type SignOutReason = "idle" | "manual" | "expired" | "not_platform";
type Status = "loading" | "signed_out" | "signed_in";
type State = { status: Status; user: User | null; steps: FirstStep[] };

export interface AuthCtx extends State {
  /** A password was accepted; the two-step code is owed. */
  mfaPending: boolean;
  client: AuthClient;
  signedOutReason: SignOutReason | null;
  dismissNotice(): void;
  signIn(login: string, password: string): Promise<SignInResult>;
  verifyCode(code: string, opts: { backup: boolean }): Promise<SignInResult>;
  cancelMfa(): void;
  completeStep(step: FirstStep): void;
  updateUser(patch: Partial<User>): void;
  /**
   * Ends the session, clears the cached data and goes to /sign-in. With
   * `elsewhere`, another tab has already ended the shared session: this tab
   * only follows, without asking the server again.
   */
  signOut(reason: SignOutReason, opts?: { elsewhere?: boolean }): Promise<void>;
  /**
   * Ends a session that can't use this app (no platform role) without
   * leaving the page, so the refusal stays on screen.
   */
  refuse(): Promise<void>;
}

const SIGNED_OUT: State = { status: "signed_out", user: null, steps: [] };
const Ctx = createContext<AuthCtx | null>(null);

/** Where a signed-in person belongs: first sign-in steps, else the hospitals. */
export function homeFor(s: { steps: FirstStep[] }) {
  return s.steps.length ? "/welcome" : "/hospitals";
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
  const queryClient = useQueryClient();
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
  // Read by signOut to stay idempotent; written in an effect and by signOut.
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
    if (r.status === "not_platform") {
      // The server (or mock) has already ended it; nothing is kept. The
      // sign-in page says why (the code page sends them back there).
      setState(SIGNED_OUT);
      setReason("not_platform");
      return r;
    }
    setReason(null);
    setState({ status: "signed_in", user: r.user, steps: r.steps });
    return r;
  }, []);

  // A sign-out still finishing: a sign-in waits for it, so it can't end
  // the next session.
  const signingOut = useRef<Promise<void> | null>(null);
  const afterSignOut = useCallback(
    async () => void (await signingOut.current),
    [],
  );

  const end = useCallback(
    async (after: () => void, elsewhere = false) => {
      if (!live.current.signedIn && !live.current.mfaPending) return;
      live.current = { signedIn: false, mfaPending: false };
      startTransition(() => {
        // Nothing fetched for this person outlives the session, and nothing
        // still in flight lands in the next person's.
        endSessionRequests(queryClient);
        // Named on purpose (clear() below removes them too): Analysis
        // figures, filters and its off mark never outlive the person.
        queryClient.removeQueries({ queryKey: queryKeys.analysis });
        queryClient.clear();
        setState(SIGNED_OUT);
        setMfaPending(false);
        after();
      });
      if (elsewhere) return;
      const finish = client.signOut().catch(() => {});
      signingOut.current = finish;
      await finish;
      if (signingOut.current === finish) signingOut.current = null;
    },
    [client, queryClient],
  );

  const signOut = useCallback(
    (why: SignOutReason, opts?: { elsewhere?: boolean }) =>
      end(() => {
        setReason(why);
        router.replace("/sign-in");
      }, opts?.elsewhere),
    [end, router],
  );
  const refuse = useCallback(() => end(() => setReason(null)), [end]);

  // A live call found the session gone: sign out once, saying why.
  useEffect(() => onUnauthorized(() => void signOut("expired")), [signOut]);

  const value = useMemo<AuthCtx>(
    () => ({
      ...state,
      mfaPending,
      client,
      signedOutReason: reason,
      dismissNotice: () => setReason(null),
      signIn: async (login, password) => {
        await afterSignOut();
        return apply(await client.signIn(login, password));
      },
      verifyCode: async (code, opts) => {
        await afterSignOut();
        return apply(await client.verifyCode(code, opts));
      },
      cancelMfa: () => setMfaPending(false),
      completeStep: (step) =>
        setState((s) => ({ ...s, steps: s.steps.filter((x) => x !== step) })),
      updateUser: (patch) =>
        setState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s)),
      signOut,
      refuse,
    }),
    [state, mfaPending, client, reason, apply, afterSignOut, signOut, refuse],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
