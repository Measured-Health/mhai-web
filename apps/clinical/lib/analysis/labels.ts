// The Analysis wording: view titles, groups, conditions, locations and
// numbers under the small-group rule. A hidden value always reads
// "Fewer than 5"; 0 reads "0".
import { FEWER_THAN_5 } from "@mhai/ui/small-groups";
import type { GuardedOut } from "../api/admin-contract";
import type {
  AgeBand,
  ConditionRef,
  LocationRef,
  Setting,
  Sex,
  ViewId,
} from "../api/analysis-contract";
import { NO_DATA, minutesLabel } from "@/lib/admin/alert-usage";
import { countLabel, percentLabel } from "../admin/report";
import {
  LOCATION_NOT_RECORDED,
  NOT_STANDARDISED,
} from "../notifications/alert-view";

export { LOCATION_NOT_RECORDED, NOT_STANDARDISED };
export const NO_PATIENTS = "No patients match these filters";
export const SPECIALTY_NOT_RECORDED = "Specialty not recorded";

/** In page order. */
export const VIEWS: readonly ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
export const VIEW_TITLE: Record<ViewId, string> = {
  prevalence: "Prevalence and trends",
  affected: "Who is affected",
  "co-occurring": "Co-occurring conditions",
  findings: "Findings and alerts",
  quality: "MHAI quality",
};

/** "Couldn't load who is affected"; a leading acronym keeps its case ("MHAI quality"). */
export function failedText(view: ViewId): string {
  const title = VIEW_TITLE[view];
  const first = title.split(" ")[0];
  const lower =
    first === first.toUpperCase()
      ? title
      : title[0].toLowerCase() + title.slice(1);
  return `Couldn't load ${lower}`;
}

export const AGE_LABEL: Record<AgeBand, string> = {
  "0-17": "0–17",
  "18-39": "18–39",
  "40-64": "40–64",
  "65-79": "65–79",
  "80+": "80 and over",
};
export const SEX_LABEL: Record<Sex, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  not_recorded: "Not recorded",
};
export const SETTING_LABEL: Record<Setting, string> = {
  admitted: "Admitted",
  outpatient: "Outpatient",
  emergency: "Emergency",
};

/** The location type, "Location not recorded" when missing. */
export const settingText = (s: Setting | null) =>
  s ? SETTING_LABEL[s] : LOCATION_NOT_RECORDED;
export const specialtyText = (s: string | null) => s ?? SPECIALTY_NOT_RECORDED;

/** The condition's name as clinicians know it, or "Not standardised". */
export const conditionName = (c: ConditionRef) => c.name ?? NOT_STANDARDISED;
/** "Type 2 diabetes · E11", "Asthma", or "Not standardised". */
export const conditionText = (c: ConditionRef) =>
  c.name === null
    ? NOT_STANDARDISED
    : c.icd10
      ? `${c.name} · ${c.icd10}`
      : c.name;

export const locationText = (l: LocationRef | null) =>
  l ? l.label : LOCATION_NOT_RECORDED;

const words =
  (fmt: (n: number) => string) =>
  (g: GuardedOut): string =>
    g.suppressed ? FEWER_THAN_5 : g.value === null ? NO_DATA : fmt(g.value);

/** "1,204", "0", or "Fewer than 5". */
export const countText = words(countLabel);
/** "40%", or "Fewer than 5". */
export const shareText = words(percentLabel);
/** "12.5 min", "1.5 h", or "Fewer than 5". A median may be a half minute. */
export const minutesText = words((m) =>
  m < 59.75 && !Number.isInteger(m)
    ? `${Math.round(m * 2) / 2} min`
    : minutesLabel(m),
);
