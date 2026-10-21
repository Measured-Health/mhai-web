"use client";
import { MoreHorizontal, Power, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { isPlatformAdmin } from "@/lib/auth/types";
import { cn } from "@mhai/ui/cn";
import { useShell } from "./shell-context";

export const roleLabel = (u: Parameters<typeof isPlatformAdmin>[0]) =>
  isPlatformAdmin(u) ? "Platform admin" : "Auditor";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orchid to-[#6e3c6a] text-xs font-bold text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] hover:bg-bg focus-visible:bg-bg focus-visible:outline-none";

/** The sidebar footer: who you are, with Account and Sign out. */
export function AccountMenu() {
  const { user } = useAuth();
  const { closeDrawer } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  if (!user) return null;

  // Esc closes only the menu, so an open phone drawer stays put.
  const onEscape = (e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    items[to]?.focus();
  };
  const leave = () => {
    setOpen(false);
    closeDrawer();
  };

  return (
    <div
      ref={ref}
      onKeyDown={onEscape}
      className="relative border-t border-line pt-2.5"
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu: ${user.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 text-left text-[13px] hover:bg-bg"
      >
        <Avatar name={user.name} />
        <span className="min-w-0">
          <span className="block truncate">{user.name}</span>
          <small className="block truncate text-[11px] text-ink-3">
            {roleLabel(user)}
          </small>
        </span>
        <MoreHorizontal
          aria-hidden
          className="ml-auto size-4 shrink-0 text-ink-3"
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <div className="px-2.5 py-2 text-[13px]">
            <b className="block truncate">{user.name}</b>
            <small className="block truncate text-ink-3">{user.email}</small>
          </div>
          <Link
            role="menuitem"
            href="/account"
            className={ITEM}
            onClick={leave}
          >
            <UserRound aria-hidden className="size-4" />
            Account
          </Link>
          <Link
            role="menuitem"
            href="/sign-out"
            className={cn(ITEM, "text-bad")}
            onClick={leave}
          >
            <Power aria-hidden className="size-4" />
            Sign out
          </Link>
        </div>
      )}
    </div>
  );
}
