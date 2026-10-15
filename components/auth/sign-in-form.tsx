"use client";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { SignedOutNotice } from "../states/signed-out-notice";
import { AuthErrorBanner } from "./auth-error-banner";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { errorCode } from "./auth-error-copy";
import { DemoHint } from "./demo-hint";
import { inputClass } from "./password-fields";

export { authErrorCopy, errorCode } from "./auth-error-copy";

export function SignInForm() {
  const auth = useAuth();
  const { capabilities: can } = auth;
  const router = useRouter();
  const id = useId();
  const noun = can.emailLogin ? "email" : "username";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState({ login: false, password: false });
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const run = async (attempt: () => ReturnType<typeof auth.signIn>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await attempt();
      if (r.status === "mfa_required") router.push("/sign-in/code");
      // Signed in: GuestGate sends them where they belong.
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = { login: !login.trim(), password: !password };
    setMissing(m);
    if (m.login) return loginRef.current?.focus();
    if (m.password) return passwordRef.current?.focus();
    void run(() => auth.signIn(login.trim(), password));
  };

  return (
    <>
      <SignedOutNotice />
      <AuthHeading title="Welcome back" sub="Sign in to continue to MHAI." />
      {error && (
        <AuthErrorBanner error={error} noun={noun}>
          <p className="mt-1.5 flex flex-wrap gap-x-3">
            {can.passwordReset && (
              <Link className="font-semibold underline" href="/forgot-password">
                Reset your password
              </Link>
            )}
            {can.sso && (
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => void run(auth.signInWithHospital)}
              >
                Use hospital account instead
              </button>
            )}
          </p>
        </AuthErrorBanner>
      )}
      {can.sso && (
        <>
          <Button
            variant="soft"
            className="w-full"
            disabled={busy}
            onClick={() => void run(auth.signInWithHospital)}
          >
            <Building2 aria-hidden className="size-4" />
            Continue with hospital account
          </Button>
          <p className="my-5 flex items-center gap-3 text-[12px] text-ink-3">
            <span aria-hidden className="h-px flex-1 bg-line" />
            or use {noun}
            <span aria-hidden className="h-px flex-1 bg-line" />
          </p>
        </>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div>
          <label
            htmlFor={`${id}-login`}
            className="mb-1.5 block text-[13px] font-semibold"
          >
            {can.emailLogin ? "Work email" : "Username"}
          </label>
          <input
            ref={loginRef}
            id={`${id}-login`}
            type={can.emailLogin ? "email" : "text"}
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
              {can.emailLogin
                ? "Enter your work email."
                : "Enter your username."}
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor={`${id}-pw`} className="text-[13px] font-semibold">
              Password
            </label>
            {can.passwordReset && (
              <Link
                href="/forgot-password"
                className="text-[13px] text-mint-deep"
              >
                Forgot?
              </Link>
            )}
          </div>
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
      <p className="mt-5 text-center text-[13px] text-ink-3">
        Access is for registered clinicians. New here? Ask your hospital admin.
      </p>
      <DemoHint
        onPick={(e) => {
          setLogin(e);
          setPassword("demo-password");
          setMissing({ login: false, password: false });
        }}
      />
    </>
  );
}
