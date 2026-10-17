import type {
  ConfidenceLevel,
  OversightItemOut,
  UsageOut,
  UsagePeriod,
} from "../api/admin-contract";

export const PERIODS: readonly { id: UsagePeriod; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90_days", label: "Last 90 days" },
];

export const CONFIDENCE_ORDER: readonly ConfidenceLevel[] = [
  "high",
  "caution",
  "review",
  "failed",
];

/** Whole percentages of the total; null when there's nothing to share out. */
export function shares(
  c: UsageOut["confidence"],
): Record<ConfidenceLevel, number> | null {
  const total = CONFIDENCE_ORDER.reduce((n, k) => n + c[k], 0);
  if (!total) return null;
  return {
    high: Math.round((c.high * 100) / total),
    caution: Math.round((c.caution * 100) / total),
    review: Math.round((c.review * 100) / total),
    failed: Math.round((c.failed * 100) / total),
  };
}

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`;

export const hoursLabel = (h: number) =>
  h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1).replace(/\.0$/, "")} h`;

export const countLabel = (n: number) => n.toLocaleString("en-GB");

/** Fewer eligible reviewers than this is "Short" (R12). */
export const SHORT_OF_REVIEWERS = 2;
export const isShort = (n: number) => n < SHORT_OF_REVIEWERS;

/** Overdue after the hospital's own turnaround (R12), not the clinical placeholder. */
export function isOverdueItem(
  item: Pick<OversightItemOut, "submitted_at">,
  overdueHours: number,
  now: number,
): boolean {
  const t = Date.parse(item.submitted_at);
  return Number.isFinite(t) && now - t > overdueHours * 3_600_000;
}

export const oversightOrder = (items: OversightItemOut[]) =>
  [...items].sort(
    (a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at),
  );
