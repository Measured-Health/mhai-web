"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";

/** Returns true to allow navigation, false to block it (the guard handles the block itself). */
export type NavigationGuard = (href: string) => boolean;

export type ShellCtx = {
  openDrawer(): void;
  openSearch(): void;
  openShortcuts(): void;
  closeDrawer(): void;
  searchOpen: boolean;
  closeSearch(): void;
  navigate(href: string): void;
  setNavigationGuard(guard: NavigationGuard | null): void;
};

// Its own module, so providers inside the shell can use it without importing
// the shell (Plan 5a).
export const ShellContext = createContext<ShellCtx | null>(null);

/** Outside an AppShell the shell UI actions are no-ops, but `navigate` still routes. */
export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
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
