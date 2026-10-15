"use client";
import { useState } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import type { FirstStep } from "@/lib/auth/types";
import { useRedirect } from "@/lib/auth/use-redirect";
import { MfaSetup } from "./mfa-setup";
import { NewPasswordStep } from "./new-password-step";
import { TermsStep } from "./terms-step";

type Shown = FirstStep | "codes";
const LABEL: Record<Shown, string> = {
  terms: "First sign-in",
  password: "Your password",
  mfa: "Protect your account",
  codes: "Just in case",
};

export function WelcomeFlow() {
  const auth = useAuth();
  // The plan is fixed once known, so "Step n of N" doesn't jump.
  const [plan, setPlan] = useState<Shown[] | null>(null);
  if (plan === null && auth.status === "signed_in" && auth.steps.length)
    setPlan(
      auth.steps.flatMap((s): Shown[] =>
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

  const current = auth.steps[0]!;
  const eyebrow = (s: Shown) =>
    `Step ${plan.indexOf(s) + 1} of ${plan.length} · ${LABEL[s]}`;

  if (current === "terms")
    return (
      <TermsStep
        eyebrow={eyebrow("terms")}
        onDone={() => auth.completeStep("terms")}
      />
    );
  if (current === "password")
    return (
      <NewPasswordStep
        eyebrow={eyebrow("password")}
        onDone={() => auth.completeStep("password")}
      />
    );
  return (
    <MfaSetup
      eyebrow={(p) => eyebrow(p === "codes" ? "codes" : "mfa")}
      onDone={() => auth.completeStep("mfa")}
    />
  );
}
