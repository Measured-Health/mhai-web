"use client";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { IntegrityBanner } from "../audit/integrity-banner";
import { OfflineStrip } from "../states/offline-strip";
import { HealthBanner } from "./health-banner";
import { MobileDrawer } from "./mobile-drawer";
import { ShellContext, type ShellCtx } from "./shell-context";
import { Sidebar } from "./sidebar";

export { useShell } from "./shell-context";

/**
 * The frame for every signed-in page. The idle sign-out is mounted once,
 * in Providers, not here.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const ctx = useMemo<ShellCtx>(
    () => ({
      openDrawer: () => setDrawer(true),
      closeDrawer: () => setDrawer(false),
    }),
    [],
  );
  return (
    <ShellContext.Provider value={ctx}>
      <div className="grid h-dvh grid-cols-1 xl:grid-cols-[256px_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <Sidebar />
        </div>
        <main className="canvas-v3 relative flex min-w-0 flex-col overflow-hidden">
          <OfflineStrip />
          {/* The home page (spec §8.3); the audit view shows its own. */}
          {pathname === "/hospitals" && (
            <IntegrityBanner className="border-b px-4 py-2.5 md:px-[26px]" />
          )}
          <HealthBanner />
          {children}
        </main>
      </div>
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} />
    </ShellContext.Provider>
  );
}
