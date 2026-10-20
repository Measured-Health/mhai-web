import type { SessionItem } from "@/lib/session-store";

export function groupHistory(items: SessionItem[], now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime(),
    yesterday = today - 86_400_000;
  const groups = {
    Today: [] as SessionItem[],
    Yesterday: [] as SessionItem[],
    Earlier: [] as SessionItem[],
  };
  for (const i of items)
    (i.createdAt >= today
      ? groups.Today
      : i.createdAt >= yesterday
        ? groups.Yesterday
        : groups.Earlier
    ).push(i);
  return (["Today", "Yesterday", "Earlier"] as const)
    .filter((l) => groups[l].length)
    .map((label) => ({ label, items: groups[label] }));
}
