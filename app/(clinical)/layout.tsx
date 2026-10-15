import { ViewTransition } from "react";
import { AppShell } from "@/components/shell/app-shell";

export default function ClinicalLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell>
      <ViewTransition name="main-content">{children}</ViewTransition>
    </AppShell>
  );
}
