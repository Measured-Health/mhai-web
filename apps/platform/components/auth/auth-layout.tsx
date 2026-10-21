import type { ReactNode } from "react";
import { Logo } from "@mhai/ui/brand";

export { AuthHeading } from "@mhai/ui/auth/auth-heading";

/** The logo with the "Platform" label beside it. */
export function PlatformLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className="h-10 w-auto" />
      <span className="rounded-full bg-bloom px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-[.08em] text-white">
        Platform
      </span>
    </div>
  );
}

/** Sign-in and first sign-in screens: one card on the v3 canvas. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="canvas-v3 flex min-h-full flex-col items-center px-4 py-10 sm:px-6">
      <div className="my-auto flex w-full max-w-[440px] flex-col items-center">
        <div className="mb-8">
          <PlatformLogo />
        </div>
        <div className="card-v3 w-full p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
