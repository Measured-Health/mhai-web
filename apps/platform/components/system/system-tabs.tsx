"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@mhai/ui/cn";

const TABS = [
  { href: "/system/health", label: "Health" },
  { href: "/system/jobs", label: "Failed jobs" },
] as const;

/** Health and Failed jobs: links, so each tab has its own address. */
export function SystemTabs() {
  const path = usePathname();
  return (
    <nav
      aria-label="System"
      className="flex gap-1 overflow-x-auto border-b border-line"
    >
      {TABS.map((t) => {
        const on = path === t.href || Boolean(path?.startsWith(`${t.href}/`));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
              on
                ? "border-mint-deep text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
