"use client";
import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { isClinical } from "@/lib/auth/types";
import { useShortcuts } from "@/lib/hooks/use-shortcuts";
import { useSession } from "@/lib/session-store";
import { CommandPalette } from "../utility/command-palette";
import { ShortcutsDialog } from "../utility/shortcuts-dialog";
import { DegradedStrip } from "../states/degraded-strip";
import { OfflineStrip } from "../states/offline-strip";
import { NotificationsProvider } from "../notifications/notifications-provider";
import { MobileDrawer } from "./mobile-drawer";
import { Sidebar } from "./sidebar";
import {
  ShellContext,
  type NavigationGuard,
  type ShellCtx,
} from "./shell-context";

export { useShell, type NavigationGuard } from "./shell-context";

export function AppShell({ children }: { children: ReactNode }) {
  // A hospital admin who isn't a clinician gets no clinical tools (R3).
  const { user } = useAuth();
  const clinical = isClinical(user);
  const { items } = useSession();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const guard = useRef<NavigationGuard | null>(null);
  const setNavigationGuard = useCallback((g: NavigationGuard | null) => {
    guard.current = g;
  }, []);
  const navigate = useCallback(
    (href: string) => {
      if (guard.current && !guard.current(href)) return false;
      router.push(href);
      return true;
    },
    [router],
  );
  // Close the mobile drawer first so two modals are never open together.
  const openSearch = useCallback(() => {
    setDrawer(false);
    setSearchOpen(true);
  }, []);
  const [keysOpen, setKeysOpen] = useState(false);
  const openShortcuts = useCallback(() => {
    setDrawer(false);
    setKeysOpen(true);
  }, []);
  useShortcuts(
    clinical
      ? { "mod+k": openSearch, "?": openShortcuts, n: () => navigate("/") }
      : {},
  );
  const ctx = useMemo<ShellCtx>(
    () => ({
      openDrawer: () => setDrawer(true),
      openSearch,
      openShortcuts,
      closeDrawer: () => setDrawer(false),
      searchOpen,
      closeSearch: () => setSearchOpen(false),
      navigate,
      setNavigationGuard,
    }),
    [openSearch, openShortcuts, searchOpen, navigate, setNavigationGuard],
  );
  const body = (
    <>
      <div className="grid h-[calc(100dvh-var(--demo-h,0px))] grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)]">
        {/* Sidebar reads usePathname(); it sits in Suspense. */}
        <div className="hidden md:block xl:hidden">
          <Suspense fallback={null}>
            <Sidebar items={items} rail onOpenSearch={openSearch} />
          </Suspense>
        </div>
        <div className="hidden xl:block">
          <Suspense fallback={null}>
            <Sidebar items={items} onOpenSearch={openSearch} />
          </Suspense>
        </div>
        <main className="canvas-v3 relative flex min-w-0 flex-col overflow-hidden">
          <OfflineStrip />
          {/* The health check is a clinical call. */}
          {clinical && <DegradedStrip />}
          {children}
        </main>
      </div>
      <MobileDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        items={items}
        onOpenSearch={openSearch}
      />
      {clinical && (
        <>
          <CommandPalette
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
          <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
        </>
      )}
    </>
  );
  return (
    <ShellContext.Provider value={ctx}>
      {/* Patient alerts and decisions, with their pop-ups, for clinicians (spec §2). */}
      {clinical ? <NotificationsProvider>{body}</NotificationsProvider> : body}
    </ShellContext.Provider>
  );
}
