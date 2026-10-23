import { AuthGate } from "@/components/auth/auth-gate";

/**
 * Named access (Plan 11): a hospital admin with named access on. The admin
 * layout around it already asks for two-step; anyone else goes home, and
 * with the sign-off key off that is everyone.
 */
export default function NamedAccessLayout({
  children,
}: LayoutProps<"/admin/named-access">) {
  return <AuthGate need="named-admin">{children}</AuthGate>;
}
