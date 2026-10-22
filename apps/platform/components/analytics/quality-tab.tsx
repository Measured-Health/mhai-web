"use client";
import type { AnalyticsState } from "@/lib/analytics/read";
import { valueText } from "@/lib/analytics/measures";
import { AreaPanel } from "./area-panel";
import { FactsList } from "./facts-list";

/**
 * Answer quality: per hospital the share needing review, the confidence
 * mix, how often reviewers agreed, and the median time to review.
 */
export function QualityTab({
  state,
  failed,
  onRetry,
}: {
  state: AnalyticsState["quality"] | null;
  failed: boolean;
  onRetry(): void;
}) {
  return (
    <AreaPanel area="quality" state={state} failed={failed} onRetry={onRetry}>
      {(q) => {
        const facts = (r: (typeof q)["median"]) => [
          {
            label: "Answers needing review",
            value: valueText(r.needs_review_share, "share"),
          },
          {
            label: "High confidence",
            value: valueText(r.confidence.high, "count"),
          },
          {
            label: "Medium confidence",
            value: valueText(r.confidence.medium, "count"),
          },
          {
            label: "Low confidence",
            value: valueText(r.confidence.low, "count"),
          },
          {
            label: "Agreement on reviews",
            value: valueText(r.agreement_rate, "share"),
          },
          {
            label: "Median review time",
            value: valueText(r.median_review_hours, "hours"),
          },
        ];
        return (
          <FactsList
            label="Answer quality, by hospital"
            cards={[
              {
                key: "median",
                name: "Median of all hospitals",
                facts: facts(q.median),
              },
              ...q.rows.map((r) => ({
                key: r.hospital.id,
                name: r.hospital.name,
                facts: facts(r),
              })),
            ]}
          />
        );
      }}
    </AreaPanel>
  );
}
