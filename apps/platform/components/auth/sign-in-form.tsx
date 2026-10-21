"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { useAuth, type SignOutReason } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { AuthErrorBanner, authErrorCopy, errorCode } from "./auth-error";
import { AuthHeading } from "./auth-layout";
import { DemoHint } from "./demo-hint";

const SIGNED_OUT: Record<
  SignOutReason,
  { tone: "info" | "bad"; title: string; body?: string }
> = {
  idle: {
    tone: "info",
    title: "You were signed out after 15 minutes without activity.",
  },
  manual: { tone: "info", title: "You've signed out." },
  expired: {
    tone: "info",
    title: "Your session ended. Sign in again to continue.",
  },
  not_platform: { tone: "bad", ...authErrorCopy("not_platform") },
};

/** Why you were signed out, until dismissed. Memory only. */
function SignedOutNotice() {
  const { signedOutReason, dismissNotice } = useAuth();
  if (!signedOutReason) return null;
  const { tone, title, body } = SIGNED_OUT[signedOutReason];
  return (
    <div className="mb-5">
      <Banner tone={tone} title={title}>
        {body && <p>{body}</p>}
        <Button variant="ghost" className="mt-2" onClick={dismissNotice}>
          Dismiss
        </Button>
      </Banner>
    </div>
  );
}

export function SignInForm() {
  const auth = useAuth();
  const router = useRouter();
  const id = useId();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState({ login: false, password: false });
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const m = { login: !login.trim(), password: !password };
    setMissing(m);
    if (m.login) return loginRef.current?.focus();
    if (m.password) return passwordRef.current?.focus();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await auth.signIn(login.trim(), password);
      if (r.status === "mfa_required") router.push("/sign-in/code");
      // Turned away: the signed-out notice above says why.
      else if (r.status === "not_platform") setPassword("");
      // Signed in: GuestGate sends them where they belong.
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SignedOutNotice />
      <AuthHeading
        title="Sign in to MHAI Platform"
        sub="For Measured Health platform admins and auditors."
      />
      {error && <AuthErrorBanner error={error} />}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <label
            htmlFor={`${id}-login`}
            className="mb-1.5 block text-[12.5px] text-ink-2"
          >
            Work email
          </label>
          <input
            ref={loginRef}
            id={`${id}-login`}
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            aria-invalid={missing.login || undefined}
            aria-describedby={missing.login ? `${id}-login-err` : undefined}
            className={inputClass}
          />
          {missing.login && (
            <p id={`${id}-login-err`} className="mt-1 text-[13px] text-bad">
              Enter your work email.
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor={`${id}-pw`}
            className="mb-1.5 block text-[12.5px] text-ink-2"
          >
            Password
          </label>
          <input
            ref={passwordRef}
            id={`${id}-pw`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={missing.password || undefined}
            aria-describedby={missing.password ? `${id}-pw-err` : undefined}
            className={inputClass}
          />
          {missing.password && (
            <p id={`${id}-pw-err`} className="mt-1 text-[13px] text-bad">
              Enter your password.
            </p>
          )}
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <DemoHint
        onPick={(email) => {
          setLogin(email);
          setPassword("demo-password");
          setMissing({ login: false, password: false });
        }}
      />
    </>
  );
}
