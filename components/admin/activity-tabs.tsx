"use client";
import Link from "next/link";
import { useOversight } from "@/lib/admin-queries";
import { isOverdueItem } from "@/lib/admin/report";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "../ui/cn";

/** Log and Review oversight (hospital-admin.html tabs 6 and 7). */
export function ActivityTabs({ current }: { current: "log" | "oversight" }) {
  const o = useOversight();
  const now = useNow(60_000);
  const overdue = o.data
    ? o.data.items.filter((i) =>
        isOverdueItem(i, o.data.overdue_after_hours, now),
      ).length
    : 0;
  const tabs = [
    { id: "log", href: "/admin/activity", label: "Log" },
    {
      id: "oversight",
      href: "/admin/activity/oversight",
      label: overdue
        ? `Review oversight · ${overdue} overdue`
        : "Review oversight",
    },
  ] as const;
  return (
    <nav
      aria-label="Activity"
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
