"use client";
import {
  Building2,
  CircleHelp,
  Keyboard,
  MoreHorizontal,
  PenLine,
  Power,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { initials, isAdminOnly, isHospitalAdmin } from "@/lib/auth/types";
import { cn } from "../ui/cn";
import { useShell } from "./app-shell";

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

/** The sidebar footer: who you are, and everything about "you" (design 4). */
export function AccountMenu({ rail }: { rail: boolean }) {
  const { user } = useAuth();
  const { navigate, openShortcuts, closeDrawer } = useShell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);
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
  const adminOnly = isAdminOnly(user);
  // "Medical director · Hospital admin" (mockup footer); clinicians keep their specialty.
  const role = [
    user.roleTitle,
    isHospitalAdmin(user) && user.roleTitle !== "Hospital admin"
      ? "Hospital admin"
      : user.specialty,
  ]
    .filter(Boolean)
    .join(" · ");

  // Esc closes only the menu, so an open mobile drawer stays put.
  const onEscape = (e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    close(true);
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

  return (
    <div
      ref={ref}
      onKeyDown={onEscape}
      className={cn(
        "relative border-t border-line pt-2.5",
        rail && "self-stretch",
      )}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.displayName}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-[10px] text-left text-[13px] hover:bg-bg",
          rail ? "justify-center" : "px-1.5 py-1",
        )}
      >
        <Avatar name={user.displayName} />
        {!rail && (
          <>
            <span className="min-w-0">
              <span className="block truncate">{user.displayName}</span>
              {role && (
                <small className="block truncate text-[11px] text-ink-3">
                  {role}
                </small>
              )}
              {user.hospital && (
                <small className="flex items-center gap-1 text-[11px] font-medium text-mint-deep">
                  <Building2 aria-hidden className="size-3" />
                  {user.hospital}
                </small>
              )}
            </span>
            <MoreHorizontal
              aria-hidden
              className="ml-auto size-4 shrink-0 text-ink-3"
            />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className={cn(
            "absolute z-30 rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line",
            rail
              ? "bottom-0 left-full ml-5 w-[260px]"
              : "bottom-[calc(100%+8px)] left-0 right-0",
          )}
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar name={user.displayName} />
            <span className="min-w-0 text-[13px]">
              <b className="block truncate">
                {user.fullName ?? user.displayName}
              </b>
              <small className="block truncate text-ink-3">
                {user.email ?? user.username}
              </small>
            </span>
          </div>
          <Link
            role="menuitem"
            href="/account"
            className={ITEM}
            onClick={() => {
              close(false);
              closeDrawer();
            }}
          >
            <UserRound aria-hidden className="size-4" />
            Profile &amp; security
          </Link>
          {/* An admin who isn't a clinician has no feedback, shortcuts or clinical help (R3). */}
          {!adminOnly && (
            <>
              <Link
                role="menuitem"
                href="/my-feedback"
                className={ITEM}
                onClick={() => {
                  close(false);
                  closeDrawer();
                }}
              >
                <PenLine aria-hidden className="size-4" />
                My feedback &amp; corrections
              </Link>
              <button
                role="menuitem"
                type="button"
                className={ITEM}
                onClick={() => {
                  close(false);
                  openShortcuts();
                }}
              >
                <Keyboard aria-hidden className="size-4" />
                Keyboard shortcuts
              </button>
              <Link
                role="menuitem"
                href="/help"
                className={ITEM}
                onClick={() => {
                  close(false);
                  closeDrawer();
                }}
              >
                <CircleHelp aria-hidden className="size-4" />
                Help &amp; guide
              </Link>
            </>
          )}
          <button
            role="menuitem"
            type="button"
            className={cn(ITEM, "text-bad")}
            onClick={() => {
              close(false);
              closeDrawer();
              navigate("/sign-out");
            }}
          >
            <Power aria-hidden className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
