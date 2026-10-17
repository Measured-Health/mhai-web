import { AuthGate } from "@/components/auth/auth-gate";
import { TwoStepRequired } from "@/components/auth/two-step-required";

/**
 * The hospital admin side: hospital admins only (spec §5.6). If the API says
 * two-step isn't set up, the admin goes to the setup step (amendment 3).
 */
export default function HospitalAdminLayout({
  children,
}: LayoutProps<"/admin">) {
  return (
    <AuthGate need="admin">
      <TwoStepRequired>{children}</TwoStepRequired>
    </AuthGate>
  );
}
