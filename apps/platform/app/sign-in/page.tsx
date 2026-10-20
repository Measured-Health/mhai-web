import type { Metadata } from "next";
import { Logo } from "@mhai/ui/brand";

export const metadata: Metadata = { title: "Sign in" };

// A placeholder until the sign-in flow lands (Plan 7b, Task 7).
export default function SignInPage() {
  return (
    <main className="canvas-v3 grid min-h-full place-items-center p-6">
      <div className="card-v3 w-full max-w-md p-8">
        <Logo />
        <h1 className="mt-6 font-display text-3xl font-black text-ink">
          Sign in
        </h1>
      </div>
    </main>
  );
}
