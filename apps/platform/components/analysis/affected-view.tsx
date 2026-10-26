"use client";
import type { ReactNode } from "react";
import type {
  AllAgeBand,
  HospitalAgeBand,
  Setting,
  Sex,
  Share,
} from "@/lib/api/analysis-contract";
import {
  AGE_LABEL,
  SEX_LABEL,
  ageText,
  locationText,
  settingText,
  specialtyText,
  valueText,
  withCount,
} from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { BarList } from "@mhai/ui/charts/bar-list";
import type { BarItem } from "@mhai/ui/charts/types";
import { DataTable, type DataRow } from "./data-table";
import { HospitalRows } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import {
  Block,
  GroupLine,
  byShownThenName,
  isHiddenGroup,
  shownValue,
} from "./view-parts";

const HEADLINE_LABEL = "Per 1,000 seen";

/** One group's row: its words, its key and its share. */
type Group = { key: string; label: string } & Share;

const AGE_ORDER = Object.keys(AGE_LABEL) as (AllAgeBand | HospitalAgeBand)[];
const SEX_ORDER: Sex[] = ["female", "male", "other", "not_recorded"];
const SETTING_ORDER: (Setting | null)[] = [
  "admitted",
  "outpatient",
  "emergency",
  null,
];
/** In a fixed order, never by size. */
const inOrder =
  <T,>(order: readonly T[], of: (g: Group) => T) =>
  (rows: Group[]) =>
    [...rows].sort((a, b) => order.indexOf(of(a)) - order.indexOf(of(b)));

const shareText = (s: Share) =>
  withCount(s.share, s.patients, (g) => valueText(g, "share"));

function barOf(s: Group): BarItem {
  const hidden = isHiddenGroup(s.share, s.patients);
  const v = shownValue(s.share);
  return {
    key: s.key,
    label: s.label,
    value: v === null ? null : v * 100,
    text: shareText(s),
    hidden,
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
    const d = ok.data;
    const groups: { title: string; head: string; rows: Group[] }[] = [
      {
        title: "By age band",
        head: "Age band",
        rows: inOrder(
          AGE_ORDER as string[],
          (g) => g.key,
        )(d.by_age.map((r) => ({ ...r, key: r.band, label: ageText(r.band) }))),
      },
      {
        title: "By sex",
        head: "Sex",
        rows: inOrder(
          SEX_ORDER as string[],
          (g) => g.key,
        )(d.by_sex.map((r) => ({ ...r, key: r.sex, label: SEX_LABEL[r.sex] }))),
      },
      {
        title: "By setting",
        head: "Setting",
        rows: inOrder(SETTING_ORDER, (g) =>
          g.key === "-" ? null : (g.key as Setting),
        )(
          d.by_setting.map((r) => ({
            ...r,
            key: r.setting ?? "-",
            label: settingText(r.setting),
          })),
        ),
      },
      {
        title: "By specialty",
        head: "Specialty",
        rows: byShownThenName(
          d.by_specialty.map((r) => ({
            ...r,
            key: r.specialty ?? "-",
            label: specialtyText(r.specialty),
          })),
          (g) => shownValue(g.share),
          (g) => g.label,
        ),
      },
      ...(ok.scope === "hospital" && d.by_location
        ? [
            {
              title: "By ward or clinic",
              head: "Ward or clinic",
              rows: byShownThenName(
                d.by_location.map((r) => ({
                  ...r,
                  key: r.location?.id ?? "-",
                  label: locationText(r.location),
                })),
                (g) => shownValue(g.share),
                (g) => g.label,
              ),
            },
          ]
        : []),
    ];
    body = {
      summary: <GroupLine meta={ok} />,
      chart: (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
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
      table: (
        <>
          {groups.map((g) => (
            <DataTable
              key={g.title}
              caption={g.title}
              columns={[
                { key: "group", label: g.head },
                { key: "share", label: "Share", numeric: true },
                { key: "patients", label: "Patients", numeric: true },
              ]}
              rows={g.rows.map((r): DataRow => ({
                id: r.key,
                cells: {
                  group: r.label,
                  share: { g: r.share, kind: "share", beside: r.patients },
                  patients: { g: r.patients, kind: "count" },
                },
              }))}
            />
          ))}
        </>
      ),
      hospitals:
        ok.scope === "all" && ok.hospitals ? (
          <HospitalRows rows={ok.hospitals} headlineLabel={HEADLINE_LABEL} />
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
