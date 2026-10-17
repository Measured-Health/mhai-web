"use client";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { isAdminOnly } from "@/lib/auth/types";
import { useShortcuts } from "@/lib/hooks/use-shortcuts";
import { useSession } from "@/lib/session-store";
import { CommandPalette } from "../utility/command-palette";
import { ShortcutsDialog } from "../utility/shortcuts-dialog";
import { DegradedStrip } from "../states/degraded-strip";
import { OfflineStrip } from "../states/offline-strip";
import { DecisionsProvider } from "../corrections/decisions-provider";
import { MobileDrawer } from "./mobile-drawer";
import { Sidebar } from "./sidebar";

/** Returns true to allow navigation, false to block it (the guard handles the block itself). */
export type NavigationGuard = (href: string) => boolean;

type ShellCtx = {
  openDrawer(): void;
  openSearch(): void;
  openShortcuts(): void;
  closeDrawer(): void;
  searchOpen: boolean;
  closeSearch(): void;
  navigate(href: string): void;
  setNavigationGuard(guard: NavigationGuard | null): void;
};
const Ctx = createContext<ShellCtx | null>(null);

/** Outside an AppShell the shell UI actions are no-ops, but `navigate` still routes. */
export function useShell(): ShellCtx {
  const ctx = useContext(Ctx);
  const router = useRouter();
  return (
    ctx ?? {
      openDrawer() {},
      openSearch() {},
      openShortcuts() {},
      closeDrawer() {},
      searchOpen: false,
      closeSearch() {},
      navigate: (href) => router.push(href),
      setNavigationGuard() {},
    }
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // A hospital admin who isn't a clinician gets no clinical tools (R3).
  const { user } = useAuth();
  const clinical = !isAdminOnly(user);
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
      if (guard.current && !guard.current(href)) return;
      router.push(href);
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
        {/* Sidebar reads usePathname(); with cacheComponents it must sit in Suspense. */}
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
    <Ctx.Provider value={ctx}>
      {/* Polls your corrections and toasts decisions, for clinicians (R9, Plan 3). */}
      {clinical ? <DecisionsProvider>{body}</DecisionsProvider> : body}
    </Ctx.Provider>
  );
}
