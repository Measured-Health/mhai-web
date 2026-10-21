"use client";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthHeading } from "./auth-layout";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";

const COOLDOWN_S = 60;
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const mss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const BackToSignIn = () => (
  <p className="mt-1 text-center text-[13px]">
    <Link
      href="/sign-in"
      className="inline-flex min-h-11 items-center font-semibold text-mint-deep"
    >
      ← Back to sign in
    </Link>
  </p>
);

export function ForgotPassword() {
  const { client, capabilities: can } = useAuth();
  const id = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  const counting = now < resendAt;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);
  const left = Math.max(0, Math.ceil((resendAt - now) / 1000));

  if (!can.passwordReset)
    return (
      <>
        <AuthHeading
          title="Reset your password"
          sub="Ask your hospital admin to reset your password."
        />
        <BackToSignIn />
      </>
    );

  const send = async (to: string) => {
    setBusy(true);
    setError(null);
    try {
      await client.requestPasswordReset(to);
      setSentTo(to);
      const t = Date.now();
      setNow(t);
      setResendAt(t + COOLDOWN_S * 1000);
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    setInvalid(!looksLikeEmail(to));
    if (looksLikeEmail(to)) void send(to);
  };
  const banner = error && <AuthErrorBanner error={error} />;

  if (sentTo)
    return (
      <>
        <div
          aria-hidden
          className="mb-4 grid size-14 place-items-center rounded-2xl bg-mint-wash text-mint-deep"
        >
          <Mail className="size-6" />
        </div>
        <AuthHeading
          title="Check your email"
          sub={
            <>
              If an account exists for <b>{sentTo}</b>, a reset link is on its
              way. It expires in 30 minutes.
            </>
          }
        />
        {banner}
        <Button
          variant="ghost"
          className="w-full"
          disabled={left > 0 || busy}
          onClick={() => void send(sentTo)}
        >
          Resend link
          {left > 0 && <span className="font-mono tabular">{mss(left)}</span>}
        </Button>
        <p className="mt-4 text-center text-[13px] text-ink-3">
          Didn&apos;t get it? Check spam, or{" "}
          <b className="font-semibold text-mint-deep">
            contact your hospital admin
          </b>
        </p>
        <BackToSignIn />
      </>
    );

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        title="Reset your password"
        sub="Enter your work email and we'll send a reset link."
      />
      {banner}
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-ink-2">
        Work email
      </label>
      <input
        id={id}
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-err` : undefined}
        className={inputClass}
      />
      {invalid && (
        <p id={`${id}-err`} className="mt-1 text-[13px] text-bad">
          Enter a work email, like name@hospital.org.
        </p>
      )}
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        Send reset link
      </Button>
      {can.sso && (
        <p className="mt-4 text-center text-[13px] text-ink-3">
          Signing in with your hospital account?{" "}
          <b className="font-semibold text-mint-deep">
            Reset it with your hospital IT
          </b>
        </p>
      )}
      <BackToSignIn />
    </form>
  );
}
