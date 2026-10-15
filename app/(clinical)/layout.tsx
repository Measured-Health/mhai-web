import { ViewTransition } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";

export default function ClinicalLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <AppShell>
        <ViewTransition name="main-content">{children}</ViewTransition>
      </AppShell>
    </AuthGate>
  );
}
