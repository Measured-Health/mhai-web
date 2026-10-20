import type { Metadata } from "next";
import { CodeForm } from "@/components/auth/code-form";

export const metadata: Metadata = { title: "Enter your code · MHAI" };

export default function CodePage() {
  return <CodeForm />;
}
