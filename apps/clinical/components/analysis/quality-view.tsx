"use client";
import {
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  OctagonX,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ConfidenceLevel, GuardedOut } from "@/lib/api/admin-contract";
import type { AnalysisFilters, QualityOut } from "@/lib/api/analysis-contract";
import { frameState, useAnalysisView } from "@/lib/analysis-queries";
import { shows } from "@/lib/analysis/guards";
import { conditionText, countText, shareText } from "@/lib/analysis/labels";
import { viewSummary } from "@/lib/analysis/summary";
import { RESULT_LABEL } from "@/lib/labels";
import type { BarItem } from "@mhai/ui/charts/types";
import { BarList } from "@mhai/ui/charts/bar-list";
import { DataTable } from "./data-table";
import { Panel, ViewFrame } from "./view-frame";

const LEVELS: readonly ConfidenceLevel[] = [
  "high",
  "caution",
  "review",
  "failed",
];
const LEVEL_ICON: Record<ConfidenceLevel, ReactNode> = {
  high: <ShieldCheck aria-hidden className="size-4 shrink-0" />,
  caution: <TriangleAlert aria-hidden className="size-4 shrink-0" />,
  review: <Eye aria-hidden className="size-4 shrink-0" />,
  failed: <OctagonX aria-hidden className="size-4 shrink-0" />,
};

type Row = QualityOut["by_condition"][number];

/** "Clinicians agreed 82% of 40 rated", or why it can't be said. */
export function agreementText(r: Row): string {
  if (r.rated.suppressed || r.agreement_rate.suppressed)
    return "Clinicians agreed: Fewer than 5 rated";
  if (r.rated.value === 0) return "No consultations rated yet";
  return `Clinicians agreed ${shareText(r.agreement_rate)} of ${countText(r.rated)} rated`;
}

function confidenceBars(r: Row): BarItem[] {
  return LEVELS.map((l) => ({
    key: l,
    label: RESULT_LABEL[l],
    icon: LEVEL_ICON[l],
    value: r.confidence[l].value,
    text: countText(r.confidence[l]),
    hidden: !shows(r.confidence[l]),
  }));
}

const OUTCOMES: readonly {
  key: "approved" | "rejected" | "waiting";
  label: string;
  icon: ReactNode;
}[] = [
  {
    key: "approved",
    label: "Approved",
    icon: <CircleCheck aria-hidden className="size-4 shrink-0" />,
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: <CircleX aria-hidden className="size-4 shrink-0" />,
  },
  {
    key: "waiting",
    label: "Waiting",
    icon: <Clock aria-hidden className="size-4 shrink-0" />,
  },
];

function correctionBars(r: Row): BarItem[] {
  return OUTCOMES.map((o) => {
    const g: GuardedOut = r.corrections[o.key];
    return {
      key: o.key,
      label: o.label,
      icon: o.icon,
      value: g.value,
      text: countText(g),
      hidden: !shows(g),
    };
  });
}

function QualityCharts({ d }: { d: QualityOut }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {d.by_condition.map((r) => (
        <Panel key={r.condition.id} title={conditionText(r.condition)}>
          <p className="mb-3 text-[13px] text-ink-2">
            {countText(r.consultations)} consultations
          </p>
          <BarList
            label={`Confidence, ${conditionText(r.condition)}`}
            items={confidenceBars(r)}
          />
          <p className="mt-3 text-[13px] font-semibold">{agreementText(r)}</p>
          <h4 className="mb-2 mt-3 text-[12px] font-semibold text-ink-3">
            Corrections
          </h4>
          <BarList
            label={`Corrections, ${conditionText(r.condition)}`}
            items={correctionBars(r)}
          />
        </Panel>
      ))}
    </div>
  );
}

function QualityTable({ d }: { d: QualityOut }) {
  return (
    <DataTable
      caption="MHAI quality by condition"
      columns={[
        { key: "condition", label: "Condition" },
        { key: "consultations", label: "Consultations", numeric: true },
        ...LEVELS.map((l) => ({
          key: l,
          label: RESULT_LABEL[l],
          numeric: true,
        })),
        { key: "rated", label: "Rated", numeric: true },
        { key: "agreed", label: "Clinicians agreed", numeric: true },
        { key: "approved", label: "Corrections approved", numeric: true },
        { key: "rejected", label: "Corrections rejected", numeric: true },
        { key: "waiting", label: "Corrections waiting", numeric: true },
      ]}
      rows={d.by_condition.map((r) => ({
        key: r.condition.id,
        cells: {
          condition: conditionText(r.condition),
          consultations: r.consultations,
          high: r.confidence.high,
          caution: r.confidence.caution,
          review: r.confidence.review,
          failed: r.confidence.failed,
          rated: r.rated,
          agreed: shareText(r.agreement_rate),
          approved: r.corrections.approved,
          rejected: r.corrections.rejected,
          waiting: r.corrections.waiting,
        },
      }))}
    />
  );
}

/** MHAI quality: per condition, how sure MHAI was, whether clinicians agreed, and corrections. */
export function QualityView({ filters }: { filters: AnalysisFilters }) {
  const q = useAnalysisView("quality", filters);
  const state = frameState(q);
  const d = state.status === "ok" ? state.data : null;
  const none = d !== null && d.patients.value === 0 && !d.patients.suppressed;
  return (
    <ViewFrame
      view="quality"
      state={state}
      updatedAt={d?.updated_at ?? null}
      onRetry={() => void q.refetch()}
      summary={d ? viewSummary("quality", d) : null}
      chart={d && !none ? <QualityCharts d={d} /> : null}
      table={d && !none ? <QualityTable d={d} /> : null}
    />
  );
}
