"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import type { FirstStep } from "@/lib/auth/types";
import { useRedirect } from "@/lib/auth/use-redirect";
import { MfaSetup } from "./mfa-setup";
import { NewPasswordStep } from "./new-password-step";
import { TermsStep } from "./terms-step";

type Shown = FirstStep | "codes";
const LABEL: Record<Shown, string> = {
  password: "Your password",
  terms: "Terms of use",
  mfa: "Protect your account",
  codes: "Backup codes",
};
const ORDER: FirstStep[] = ["password", "terms", "mfa"];

/**
 * First sign-in: a new password (if owed), the terms, then two-step setup
 * and the backup codes. Every step is required; none can be skipped.
 */
export function WelcomeFlow() {
  const auth = useAuth();
  // The plan is fixed once known, so "Step n of N" doesn't jump.
  const [plan, setPlan] = useState<Shown[] | null>(null);
  if (plan === null && auth.status === "signed_in" && auth.steps.length)
    setPlan(
      ORDER.filter((s) => auth.steps.includes(s)).flatMap((s): Shown[] =>
        s === "mfa" ? ["mfa", "codes"] : [s],
      ),
    );

  const target =
    auth.status === "signed_out"
      ? "/sign-in"
      : auth.status === "signed_in" && !auth.steps.length
        ? homeFor(auth)
        : null;
  useRedirect(target);
  if (auth.status === "loading" || target || !plan) return null;

  const current = ORDER.find((s) => auth.steps.includes(s))!;
  const eyebrow = (s: Shown) =>
    `Step ${plan.indexOf(s) + 1} of ${plan.length} · ${LABEL[s]}`;

  let step: ReactNode;
  if (current === "password")
    step = (
      <NewPasswordStep
        eyebrow={eyebrow("password")}
        onDone={() => auth.completeStep("password")}
      />
    );
  else if (current === "terms")
    step = (
      <TermsStep
        eyebrow={eyebrow("terms")}
        onDone={() => auth.completeStep("terms")}
      />
    );
  else
    step = (
      <MfaSetup
        eyebrow={(p) => eyebrow(p === "codes" ? "codes" : "mfa")}
        onDone={() => auth.completeStep("mfa")}
      />
    );
  return (
    <>
      {step}
      {/* Someone else's account (a shared device): a way out on every step. */}
      <p className="mt-5 text-center text-[13px]">
        <Link
          href="/sign-out"
          prefetch={false}
          className="inline-flex min-h-11 items-center text-ink-3 underline"
        >
          Not you? Sign out
        </Link>
      </p>
    </>
  );
}
