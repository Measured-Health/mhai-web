import { AppShell } from "@/components/shell/app-shell";

export default function ClinicalLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
