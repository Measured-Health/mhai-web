"use client";
import { Menu } from "lucide-react";
import { useShell } from "./app-shell";

/** The "Open menu" (hamburger) button, shown below `md`. Use as `TopBar`'s `leading`. */
export function MenuButton() {
  const { openDrawer } = useShell();
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={openDrawer}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-ink-2 md:hidden"
    >
      <Menu aria-hidden className="size-5" />
    </button>
  );
}
