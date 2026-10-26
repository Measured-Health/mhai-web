"use client";
import type { ReactNode } from "react";
import type { ViewRead } from "@/lib/analysis/read";
import {
  HOSPITAL_HEADLINE,
  affectedSets,
  shareText,
  viewTables,
  type AffectedGroup,
} from "@/lib/analysis/tables";
import { BarList } from "@mhai/ui/charts/bar-list";
import type { BarItem } from "@mhai/ui/charts/types";
import { SpecTables } from "./data-table";
import { HospitalRows } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { Block, GroupLine, shownValue } from "./view-parts";

/** A share bar: "62% · 140"; hidden reads in words and draws nothing. */
function barOf(s: AffectedGroup): BarItem {
  const v = shownValue(s.share);
  return {
    key: s.key,
    label: s.label,
    value: v === null ? null : v * 100,
    text: shareText(s),
  };
}

/**
 * Who is affected (spec §4.4): shares of the group by age band, sex,
 * setting and specialty, and by ward or clinic for one hospital. Each with
 * a table of the same numbers; the hospital rows across hospitals. No
 * comparison.
 */
export function AffectedView({
  state,
  onRetry,
  mode,
  onMode,
}: {
  state: ViewRead<"affected"> | undefined;
  onRetry(): void;
  mode: ChartOrTable;
  onMode(m: ChartOrTable): void;
}) {
  const ok = state?.status === "ok" ? state.data : null;
  let body: {
    summary: ReactNode;
    chart: ReactNode;
    table: ReactNode;
    hospitals: ReactNode;
  } | null = null;
  if (ok) {
    body = {
      summary: <GroupLine meta={ok} />,
      chart: (
        <div className="grid gap-4 md:grid-cols-2">
          {affectedSets(ok).map((g) => (
            <Block key={g.title} title={g.title}>
              <BarList
                label={g.title}
                items={g.rows.map(barOf)}
                empty="No one to show."
              />
            </Block>
          ))}
        </div>
      ),
      table: <SpecTables tables={viewTables("affected", ok)} />,
      hospitals:
        ok.scope === "all" && ok.hospitals ? (
          <HospitalRows
            rows={ok.hospitals}
            headlineLabel={HOSPITAL_HEADLINE.affected!.label}
          />
        ) : null,
    };
  }
  return (
    <ViewFrame
      view="affected"
      state={state}
      onRetry={onRetry}
      mode={mode}
      onMode={onMode}
      {...body}
    />
  );
}
