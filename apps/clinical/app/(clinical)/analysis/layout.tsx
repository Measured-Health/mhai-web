import { AuthGate } from "@/components/auth/auth-gate";
import { TwoStepRequired } from "@/components/auth/two-step-required";

/**
 * Analysis: hospital admins and clinicians who hold the analyst role, when
 * the feature is on. Two-step is required, as on the admin side.
 */
export default function AnalysisLayout({ children }: LayoutProps<"/analysis">) {
  return (
    <AuthGate need="analysis">
      <TwoStepRequired>{children}</TwoStepRequired>
    </AuthGate>
  );
}
