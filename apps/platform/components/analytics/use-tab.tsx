"use client";
import type { AnalyticsState } from "@/lib/analytics/read";
import { countText, isHidden, valueText } from "@/lib/analytics/measures";
import { dayMonthLabel } from "@/lib/format";
import { BarList } from "@mhai/ui/charts/bar-list";
import { ColumnChart } from "@mhai/ui/charts/column-chart";
import type { BarItem, Column } from "@mhai/ui/charts/types";
import { AreaPanel } from "./area-panel";

/**
 * Use: questions per active clinician for each hospital (rates, never
 * totals, so a big hospital doesn't outshine a small one), the median of
 * all hospitals in the note, and the questions over time.
 */
export function UseTab({
  state,
  failed,
  onRetry,
}: {
  state: AnalyticsState["use"] | null;
  failed: boolean;
  onRetry(): void;
}) {
  return (
    <AreaPanel area="use" state={state} failed={failed} onRetry={onRetry}>
      {(u) => {
        const items: BarItem[] = u.rows.map((r) => {
          const q = r.questions_per_clinician;
          const hidden = isHidden(q, "rate");
          return {
            key: r.hospital.id,
            label: r.hospital.name,
            value: hidden ? null : q.value,
            text: valueText(q, "rate"),
            hidden,
            note: `${valueText(r.questions, "count")} questions · ${valueText(r.active_clinicians, "count")} active clinicians`,
          };
        });
        // A hidden point reads "Fewer than 5" and draws no column.
        const columns: Column[] = u.trend.map((p, i) => {
          const hidden = isHidden(p.value, "count");
          return {
            key: `${p.start}-${i}`,
            label: dayMonthLabel(p.start),
            value: hidden ? 0 : (p.value.value ?? 0),
            hidden,
          };
        });
        return (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-[14px] font-semibold">
                Questions per active clinician
              </h3>
              <p className="mb-3 text-[13px] text-ink-2">
                Median of all hospitals:{" "}
                <b className="font-mono">
                  {valueText(u.median.questions_per_clinician, "rate")}
                </b>
              </p>
              <BarList
                items={items}
                label="Questions per active clinician, by hospital"
                empty="No hospitals to show yet."
              />
            </div>
            <ColumnChart
              title="Questions across all hospitals"
              columns={columns}
              summary={`Questions across all hospitals, by period, ${columns.length} in all.`}
              valueText={countText}
              headers={["Period starting", "Questions"]}
              markLegend="Marked"
            />
          </div>
        );
      }}
    </AreaPanel>
  );
}
