"use client";
import { useOversight } from "@/lib/admin-queries";
import { isOverdueItem } from "@/lib/admin/report";
import { useNow } from "@/lib/hooks/use-now";
import { LinkTabs } from "../ui/link-tabs";

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
  ];
  return <LinkTabs label="Activity" tabs={tabs} current={current} />;
}
