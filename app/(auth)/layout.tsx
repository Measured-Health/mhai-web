import { AuthLayout } from "@/components/auth/auth-layout";

export default function AuthRoutesLayout({ children }: LayoutProps<"/">) {
  return <AuthLayout>{children}</AuthLayout>;
}
