"use client";
import { useId, type ReactNode } from "react";
import type { AGuarded, QualityData } from "@/lib/api/analysis-contract";
import {
  TOO_FEW_HOSPITALS,
  conditionText,
  countShows,
  monthsText,
  valueText,
} from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { sortQuality, viewTables } from "@/lib/analysis/tables";
import { BarList } from "@mhai/ui/charts/bar-list";
import { FEWER_THAN_5, isSmallCount } from "@mhai/ui/small-groups";
import { ComparisonPanel } from "./comparison-panel";
import { SpecTables } from "./data-table";
import { HospitalRows } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { countValue } from "./view-parts";

const HEADLINE_LABEL = "Reviewers agreed";

type Row = QualityData["by_condition"][number];
const LEVELS = [
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
] as const;

/**
 * "Reviewers agreed 76% of 120 rated". A hidden agreement beside shown
 * ratings reads "Reviewers agreed: Not shown · 120 rated"; hidden ratings
 * read "Reviewers agreed: Fewer than 5 rated"; none, "No ratings yet".
 */
export function agreementText(agreed: AGuarded, rated: AGuarded): string {
  if (rated.why === "too_few_hospitals" || agreed.why === "too_few_hospitals")
    return `${HEADLINE_LABEL}: ${TOO_FEW_HOSPITALS}`;
  const r = valueText(rated, "count");
  if (!countShows(rated))
    return rated.suppressed ||
      (rated.value !== null && isSmallCount(rated.value))
      ? `${HEADLINE_LABEL}: ${FEWER_THAN_5} rated`
      : "No ratings yet";
  if (agreed.suppressed)
    return `${HEADLINE_LABEL}: ${valueText(agreed, "share")} · ${r} rated`;
  if (agreed.value === null) return "No ratings yet";
  return `${HEADLINE_LABEL} ${valueText(agreed, "share")} of ${r} rated`;
}
/** Per 1,000 (the headline) as a share of 0 to 1. */
const asShare = (g: AGuarded): AGuarded =>
  g.value === null ? g : { ...g, value: g.value / 1000 };

const count = (g: AGuarded) => valueText(g, "count");
const correctionsText = (r: Row) =>
  `Corrections: ${count(r.corrections.approved)} approved, ${count(r.corrections.rejected)} rejected, ${count(r.corrections.waiting)} waiting`;

const countOf = countValue;

function ConditionCard({ r }: { r: Row }) {
  const id = useId();
  const name = conditionText(r.condition);
  return (
    <li
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3"
    >
      <h3 id={id} className="text-[14px] font-semibold">
        {name}
      </h3>
      <p className="text-[13px] text-ink-2">
        {count(r.consultations)} consultations
      </p>
      <BarList
        label={`Confidence for ${name}`}
        items={LEVELS.map(([k, label]) => {
          const g = r.confidence[k];
          const n = countOf(g);
          return {
            key: k,
            label,
            value: n,
            text: count(g),
            hidden: n === null && g.why === undefined && g.value !== 0,
          };
        })}
      />
      <p className="text-[13.5px] font-semibold">
        {agreementText(r.agreement_rate, r.rated)}
      </p>
      <p className="text-[13px] text-ink-2">{count(r.reviewers)} reviewers</p>
      <p className="text-[13px] text-ink-2">{correctionsText(r)}</p>
    </li>
  );
}

/**
 * MHAI quality (spec §4.7), per condition: the confidence mix, how often
 * reviewers agreed with the rating, how many reviewers (a number, never a
 * name) and the corrections. The comparison is on the agreement rate.
 */
export function QualityView({
  state,
  onRetry,
  mode,
  onMode,
}: {
  state: ViewRead<"quality"> | undefined;
  onRetry(): void;
  mode: ChartOrTable;
  onMode(m: ChartOrTable): void;
}) {
  const ok = state?.status === "ok" ? state.data : null;
  let body: {
    summary: ReactNode;
    chart: ReactNode;
    table: ReactNode;
    comparison: ReactNode;
    hospitals: ReactNode;
  } | null = null;
  if (ok) {
    const rows = sortQuality(ok.data.by_condition);
    const h = ok.headline;
    body = {
      summary: (
        <p className="text-[14px] text-ink-2">
          {agreementText(asShare(h.per_1000), h.base)}, {monthsText(ok.period)}.
        </p>
      ),
      chart: (
        <ul aria-label="By condition" className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <ConditionCard key={r.condition.id} r={r} />
          ))}
        </ul>
      ),
      table: <SpecTables tables={viewTables("quality", ok)} />,
      comparison:
        ok.scope === "hospital" && ok.comparison ? (
          <ComparisonPanel comparison={ok.comparison} kind="share" />
        ) : null,
      hospitals:
        ok.scope === "all" && ok.hospitals ? (
          <HospitalRows
            rows={ok.hospitals}
            headlineLabel={HEADLINE_LABEL}
            headlineKind="share"
          />
        ) : null,
    };
  }
  return (
    <ViewFrame
      view="quality"
      state={state}
      onRetry={onRetry}
      mode={mode}
      onMode={onMode}
      {...body}
    />
  );
}
