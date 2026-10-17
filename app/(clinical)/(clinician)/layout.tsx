import { AuthGate } from "@/components/auth/auth-gate";

/** Clinical screens: clinicians only. Anyone else goes to their home (R2). */
export default function ClinicianLayout({ children }: LayoutProps<"/">) {
  return <AuthGate need="clinical">{children}</AuthGate>;
}
