"use client";
import { Lock } from "lucide-react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { useRedirect } from "@/lib/auth/use-redirect";
import { useOutbox } from "@/lib/offline/outbox-context";
import { Button } from "@mhai/ui/button";

export function NoAccess() {
  const auth = useAuth();
  const { clearMine } = useOutbox();
  const target =
    auth.status === "signed_out"
      ? "/sign-in"
      : auth.status === "signed_in" && homeFor(auth) !== "/no-access"
        ? homeFor(auth)
        : null;
  useRedirect(target);
  if (auth.status === "loading" || target) return null;
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL;
  return (
    <main className="canvas-v3 grid min-h-[calc(100dvh-var(--demo-h,0px))] place-items-center p-6 text-center">
      <div>
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-20 place-items-center rounded-[26px] bg-lilac text-bloom"
        >
          <Lock className="size-8" />
        </div>
        <h1 className="font-display text-[42px] font-black leading-none">
          You don&apos;t have access
        </h1>
        <p className="mx-auto my-3 max-w-[420px] leading-relaxed text-ink-2">
          This app is for hospital staff. Measured Health platform admin and
          auditor accounts use the platform admin app.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {adminUrl && (
            <a
              href={adminUrl}
              className="inline-flex min-h-11 items-center rounded-full bg-mint px-5 font-semibold text-white"
            >
              Go to the platform admin app
            </a>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              // A manual sign-out deletes this user's unsent items (best effort).
              await clearMine().catch(() => {});
              await auth.signOut("manual");
            }}
          >
            Sign out
          </Button>
        </div>
        <p className="mt-3.5 font-mono text-xs text-ink-3">Error 403</p>
      </div>
    </main>
  );
}
