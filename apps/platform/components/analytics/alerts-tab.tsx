"use client";
import type { AnalyticsState } from "@/lib/analytics/read";
import { valueText } from "@/lib/analytics/measures";
import { AreaPanel } from "./area-panel";
import { FactsList } from "./facts-list";

/**
 * Alert safety: per hospital the severities, the median time to
 * acknowledge (overall and for Critical), Critical within target against
 * that hospital's own target, and the unhandled count.
 */
export function AlertsTab({
  state,
  failed,
  onRetry,
}: {
  state: AnalyticsState["alerts"] | null;
  failed: boolean;
  onRetry(): void;
}) {
  return (
    <AreaPanel area="alerts" state={state} failed={failed} onRetry={onRetry}>
      {(a) => {
        const facts = (r: (typeof a)["median"]) => [
          {
            label: "Critical",
            value: valueText(r.by_severity.critical, "count"),
          },
          { label: "Urgent", value: valueText(r.by_severity.urgent, "count") },
          { label: "Info", value: valueText(r.by_severity.info, "count") },
          {
            label: "Median time to acknowledge",
            value: valueText(r.median_ack_minutes, "minutes"),
          },
          {
            label: "Critical median time to acknowledge",
            value: valueText(r.critical_median_ack_minutes, "minutes"),
          },
          {
            label: "Critical within target",
            value: valueText(r.critical_within_target, "share"),
          },
          { label: "Unhandled", value: valueText(r.unhandled, "count") },
        ];
        return (
          <FactsList
            label="Alert safety, by hospital"
            cards={[
              {
                key: "median",
                name: "Median of all hospitals",
                facts: facts(a.median),
              },
              ...a.rows.map((r) => ({
                key: r.hospital.id,
                name: r.hospital.name,
                note: `Target ${r.critical_target_minutes} min`,
                facts: facts(r),
              })),
            ]}
          />
        );
      }}
    </AreaPanel>
  );
}
