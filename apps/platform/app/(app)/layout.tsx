import { AuthGate } from "@/components/auth/auth-gate";

// The shell (Task 8) goes inside the gate.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AuthGate>{children}</AuthGate>;
}
