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
import { useSession } from "@/lib/session-store";
import { MobileDrawer } from "./mobile-drawer";
import { Sidebar } from "./sidebar";

/** Returns true to allow navigation, false to block it (the guard handles the block itself). */
export type NavigationGuard = (href: string) => boolean;

type ShellCtx = {
  openDrawer(): void;
  openSearch(): void;
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
      searchOpen: false,
      closeSearch() {},
      navigate: (href) => router.push(href),
      setNavigationGuard() {},
    }
  );
}

export function AppShell({ children }: { children: ReactNode }) {
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
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const ctx = useMemo<ShellCtx>(
    () => ({
      openDrawer: () => setDrawer(true),
      openSearch,
      searchOpen,
      closeSearch: () => setSearchOpen(false),
      navigate,
      setNavigationGuard,
    }),
    [openSearch, searchOpen, navigate, setNavigationGuard],
  );
  return (
    <Ctx.Provider value={ctx}>
      <div className="grid h-dvh grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)]">
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
          {children}
        </main>
      </div>
      <MobileDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        items={items}
        onOpenSearch={openSearch}
      />
    </Ctx.Provider>
  );
}
