import type { Metadata } from "next";
import { WelcomeFlow } from "@/components/auth/welcome-flow";

export const metadata: Metadata = { title: "Welcome · MHAI" };

export default function WelcomePage() {
  return <WelcomeFlow />;
}
