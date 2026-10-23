"use client";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { NotificationBell } from "../notifications/bell";
import { useShell } from "./shell-context";

/** The page header on the platform colour; the menu button shows below xl. */
export function TopBar({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  const { openDrawer } = useShell();
  return (
    <header className="relative flex items-center gap-3 bg-bloom px-4 py-3.5 text-white md:px-[26px] md:py-4">
      <button
        type="button"
        aria-label="Open menu"
        onClick={openDrawer}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/30 text-white focus-visible:outline-2 focus-visible:outline-white xl:hidden"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {sub && <p className="font-mono text-xs text-white/75">{sub}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
