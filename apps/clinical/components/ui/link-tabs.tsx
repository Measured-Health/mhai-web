"use client";
import Link from "next/link";
import { cn } from "./cn";

export interface LinkTab {
  id: string;
  href: string;
  label: string;
}

/** Page tabs where each tab is its own route; the current one has aria-current. */
export function LinkTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: readonly LinkTab[];
  current: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-4 flex w-fit flex-wrap gap-1 rounded-full bg-lilac p-1"
    >
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={current === t.id ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep sm:min-h-9",
            current === t.id ? "bg-white text-ink shadow-sm" : "text-bloom",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
