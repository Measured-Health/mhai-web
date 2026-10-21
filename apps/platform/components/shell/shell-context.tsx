"use client";
import { createContext, useContext } from "react";

export type ShellCtx = { openDrawer(): void; closeDrawer(): void };

export const ShellContext = createContext<ShellCtx | null>(null);

/** Outside an AppShell the drawer actions do nothing. */
export function useShell(): ShellCtx {
  return useContext(ShellContext) ?? { openDrawer() {}, closeDrawer() {} };
}
