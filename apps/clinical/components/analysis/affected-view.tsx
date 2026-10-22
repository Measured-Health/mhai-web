"use client";
import type {
  AffectedOut,
  AnalysisFilters,
  Drillable,
} from "@/lib/api/analysis-contract";
import { frameState, useAnalysisView } from "@/lib/analysis-queries";
import {
  AGE_LABEL,
  SEX_LABEL,
  countText,
  locationText,
  settingText,
  specialtyText,
} from "@/lib/analysis/labels";
import { viewSummary } from "@/lib/analysis/summary";
import { BarList } from "@mhai/ui/charts/bar-list";
import { DataTable } from "./data-table";
import { Panel, ViewFrame } from "./view-frame";

/** One breakdown of the patients: its title, the group's name and its rows. */
type Group = {
  title: string;
  column: string;
  rows: { key: string; label: string; patients: Drillable }[];
};

export function affectedGroups(d: AffectedOut): Group[] {
  return [
    {
      title: "By age band",
      column: "Age band",
      rows: d.by_age.map((r) => ({
        key: r.band,
        label: AGE_LABEL[r.band],
        patients: r.patients,
      })),
    },
    {
      title: "By sex",
      column: "Sex",
      rows: d.by_sex.map((r) => ({
        key: r.sex,
        label: SEX_LABEL[r.sex],
        patients: r.patients,
      })),
    },
    {
      title: "By location type",
      column: "Location type",
      rows: d.by_setting.map((r) => ({
        key: r.setting ?? "none",
        label: settingText(r.setting),
        patients: r.patients,
      })),
    },
    {
      title: "By ward or clinic",
      column: "Ward or clinic",
      rows: d.by_location.map((r) => ({
        key: r.location?.id ?? "none",
        label: locationText(r.location),
        patients: r.patients,
      })),
    },
    {
      title: "By specialty",
      column: "Specialty",
      rows: d.by_specialty.map((r) => ({
        key: r.specialty ?? "none",
        label: specialtyText(r.specialty),
        patients: r.patients,
      })),
    },
  ];
}

const shown = (g: Drillable) => !g.suppressed && g.value !== null;

function AffectedCharts({ d }: { d: AffectedOut }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {affectedGroups(d).map((g) => (
        <Panel key={g.title} title={g.title}>
          <BarList
            label={`Patients ${g.title.toLowerCase()}`}
            items={g.rows.map((r) => ({
              key: r.key,
              label: r.label,
              value: r.patients.value,
              text: countText(r.patients),
              hidden: !shown(r.patients),
            }))}
          />
        </Panel>
      ))}
    </div>
  );
}

function AffectedTables({ d }: { d: AffectedOut }) {
  return (
    <div className="flex flex-col gap-4">
      {affectedGroups(d).map((g) => (
        <DataTable
          key={g.title}
          caption={`Patients ${g.title.toLowerCase()}`}
          columns={[
            { key: "group", label: g.column },
            { key: "patients", label: "Patients", numeric: true },
          ]}
          rows={g.rows.map((r) => ({
            key: r.key,
            cells: { group: r.label, patients: r.patients },
          }))}
        />
      ))}
    </div>
  );
}

/** Who is affected: the patients by age band, sex, setting, place and specialty. */
export function AffectedView({ filters }: { filters: AnalysisFilters }) {
  const q = useAnalysisView("affected", filters);
  const state = frameState(q);
  const d = state.status === "ok" ? state.data : null;
  const none = d !== null && d.patients.value === 0 && !d.patients.suppressed;
  return (
    <ViewFrame
      view="affected"
      state={state}
      updatedAt={d?.updated_at ?? null}
      onRetry={() => void q.refetch()}
      summary={d ? viewSummary("affected", d) : null}
      chart={d && !none ? <AffectedCharts d={d} /> : null}
      table={d && !none ? <AffectedTables d={d} /> : null}
    />
  );
}
