import { ViewTransition } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";

/** One shell for both sides, so a medical director keeps it when switching (R2). */
export default function ClinicalAppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate need="any">
      <AppShell>
        <ViewTransition name="main-content">{children}</ViewTransition>
      </AppShell>
    </AuthGate>
  );
}
