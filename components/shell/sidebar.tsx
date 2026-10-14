"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MoreHorizontal,
  Plus,
  Search,
  Stethoscope,
  Building2,
  CircleHelp,
} from "lucide-react";
import { historyStatus, type SessionItem } from "@/lib/session-store";
import { useNow } from "@/lib/hooks/use-now";
import { Logo, Mark } from "../ui/brand";
import { cn } from "../ui/cn";
import { groupHistory } from "./group-history";

export const DEMO_USER = {
  initials: "DR",
  name: "Dr. Reyes",
  role: "Attending · Internal Medicine",
  hospital: "Havana Hospital",
};
const DOT = {
  high: "bg-ok",
  caution: "bg-warn",
  review: "bg-bad",
  failed: "bg-ink-3",
} as const;
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60000));
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};

/** `rail` hides labels (tablet). Labels stay in the accessibility tree via sr-only. */
export function Sidebar({
  items,
  rail = false,
  onOpenSearch,
}: {
  items: SessionItem[];
  rail?: boolean;
  onOpenSearch?: () => void;
}) {
  const path = usePathname();
  const now = useNow(60_000);
  const label = rail ? "sr-only" : "";
  return (
    <nav
      aria-label="Consultations"
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-line bg-gradient-to-b from-white to-[#fbf8fc] py-[18px]",
        rail ? "items-center px-3" : "px-3.5",
      )}
    >
      <div className={cn("pb-4", rail ? "" : "px-1.5")}>
        {rail ? (
          <Mark />
        ) : (
          <>
            <Logo />
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3">
              <span className="relative size-[7px] rounded-full bg-mint after:absolute after:-inset-[3px] after:animate-[ring_calc(var(--t-story)*3.4)_ease-out_infinite] after:rounded-full after:border-[1.5px] after:border-mint" />
              Clinical decision support
            </p>
          </>
        )}
      </div>
      <Link
        href="/"
        title="New consultation"
        className={cn(
          "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-mint font-semibold text-white shadow-[0_10px_24px_-10px_var(--color-mint)]",
          rail ? "size-11" : "px-3",
        )}
      >
        <Plus aria-hidden className="size-5" />
        <span className={label}>New consultation</span>
      </Link>
      <button
        type="button"
        onClick={onOpenSearch}
        title="Search consultations (⌘K)"
        className={cn(
          "mt-2.5 flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-bg text-[13px] text-ink-3",
          rail ? "w-11 justify-center" : "px-2.5",
        )}
      >
        <Search aria-hidden className="size-4" />
        <span className={label}>Search consultations</span>
        {!rail && (
          <kbd className="ml-auto rounded border border-lilac-2 px-1.5 font-mono text-[10.5px]">
            ⌘K
          </kbd>
        )}
      </button>
      <div className="mt-2 flex-1 overflow-y-auto">
        {groupHistory(items, now).map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h3
              className={cn(
                "mx-2 mb-1.5 mt-[18px] text-[10.5px] uppercase tracking-[.1em] text-ink-3",
                rail && "sr-only",
              )}
            >
              {g.label}
            </h3>
            {g.items.map((i) => {
              const on = path === `/c/${i.id}`;
              const status = historyStatus(i);
              return (
                <Link
                  key={i.id}
                  href={`/c/${i.id}`}
                  title={i.title}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-start gap-2.5 rounded-[10px] p-2 text-[13px] leading-tight hover:bg-bg",
                    on &&
                      "bg-mint-wash shadow-[inset_3px_0_0_var(--color-mint)]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg bg-lilac text-bloom",
                      on && "bg-white text-mint-deep",
                      rail && "size-[38px]",
                    )}
                  >
                    <Stethoscope className="size-3.5" />
                  </span>
                  <span className={label}>
                    {i.title}
                    {i.flagged && (
                      <span
                        aria-label="Flagged"
                        className="ml-1.5 inline-block size-[7px] rounded-full bg-[#f0a640]"
                      />
                    )}
                    <small className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                      {status.dot && (
                        <span
                          aria-hidden
                          className={cn(
                            "size-[7px] rounded-full",
                            DOT[status.dot],
                          )}
                        />
                      )}
                      {status.label} · {ago(i.createdAt, now)}
                    </small>
                  </span>
                </Link>
              );
            })}
          </section>
        ))}
        <p
          className={cn(
            "px-2 pt-2 text-[10.5px] text-ink-3",
            rail && "sr-only",
          )}
        >
          History is kept for this session only.
        </p>
      </div>
      <Link
        href="/help"
        title="Help"
        className={cn(
          "mb-1.5 flex min-h-11 items-center gap-2 rounded-[10px] text-[13px] text-ink-2 hover:bg-bg",
          rail ? "size-11 justify-center" : "px-2.5",
        )}
      >
        <CircleHelp aria-hidden className="size-4" />
        <span className={label}>Help</span>
      </Link>
      <div
        className={cn(
          "flex items-center gap-2.5 border-t border-line pt-2.5 text-[13px]",
          rail ? "justify-center" : "px-1.5",
        )}
        title={`${DEMO_USER.name} · ${DEMO_USER.role} · ${DEMO_USER.hospital}`}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orchid to-[#6e3c6a] text-xs font-bold text-white"
        >
          {DEMO_USER.initials}
        </span>
        <span className={label}>
          {DEMO_USER.name}
          <small className="block text-[11px] text-ink-3">
            {DEMO_USER.role}
          </small>
          <small className="flex items-center gap-1 text-[11px] font-medium text-mint-deep">
            <Building2 aria-hidden className="size-3" />
            {DEMO_USER.hospital}
          </small>
        </span>
        {!rail && (
          <MoreHorizontal aria-hidden className="ml-auto size-4 text-ink-3" />
        )}
      </div>
    </nav>
  );
}
