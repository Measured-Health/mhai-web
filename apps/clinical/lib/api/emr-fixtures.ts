// The sample hospital's alert settings (Havana). Invented, synthetic data.
// The source labels are the ones the platform sample and the sample alerts
// use (`MOCK_SOURCES`), so both demos agree.
import type {
  AlertSettingsOut,
  CategoryOut,
  RecordsConnectionOut,
  RecordsStatus,
  RecipientsOut,
  UnitOut,
} from "./emr-contract";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

const MAIN = "Main record";
const RESULTS = "Results system";

/** What alerts can flag, with Havana's levels. Ids are opaque. */
export const SAMPLE_CATEGORIES: readonly CategoryOut[] = [
  {
    id: "blood-chemistry",
    label: "Blood chemistry",
    example: "Potassium, sodium, calcium",
    level: "all",
  },
  {
    id: "blood-count",
    label: "Blood count",
    example: "Haemoglobin, platelets, white cells",
    level: "critical_urgent",
  },
  {
    id: "kidney-function",
    label: "Kidney function",
    example: "Creatinine, urea",
    level: "critical_urgent",
  },
  {
    id: "blood-gases",
    label: "Blood gases and lactate",
    example: null,
    level: "all",
  },
  {
    id: "heart-markers",
    label: "Heart markers",
    example: "Troponin",
    level: "all",
  },
  {
    id: "blood-sugar",
    label: "Blood sugar",
    example: null,
    level: "critical_urgent",
  },
  {
    id: "vital-signs",
    label: "Vital signs",
    example: "Blood pressure, heart rate, oxygen",
    level: "critical",
  },
  {
    id: "infection",
    label: "Infection markers and cultures",
    example: null,
    level: "critical_urgent",
  },
];

/** A sample alert's category, as `AlertOut.category` carries it. */
export function categoryRef(id: string): { id: string; label: string } {
  const c = SAMPLE_CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown sample category ${id}`);
  return { id: c.id, label: c.label };
}

const unit = (
  id: string,
  label: string,
  kind: UnitOut["kind"],
  covered = true,
): UnitOut => ({ id, label, kind, source_label: MAIN, covered });

const SAMPLE_UNITS: readonly UnitOut[] = [
  unit("u-ward-3", "Ward 3", "ward"),
  unit("u-ward-5", "Ward 5", "ward"),
  unit("u-ward-7", "Ward 7", "ward", false),
  unit("u-icu", "Intensive care", "other"),
  unit("u-emergency", "Emergency department", "emergency"),
  unit("u-cardiology", "Cardiology clinic", "clinic"),
  unit("u-kidney", "Kidney clinic", "clinic", false),
  unit("u-diabetes", "Diabetes clinic", "clinic"),
];

/** Dr. Reyes (the demo clinician) and Dr. Mensah, from the sample staff. */
const SAMPLE_RECIPIENTS: RecipientsOut = {
  queue: true,
  clinicians: [
    {
      id: "s-reyes",
      display_name: "Dr. Reyes",
      specialty: "Internal Medicine",
    },
    { id: "s-mensah", display_name: "Dr. Mensah", specialty: "Cardiology" },
  ],
};

/** The connection as the hospital sees it: status, labels and times only. */
export function sampleConnection(
  now: number,
  status: RecordsStatus,
): RecordsConnectionOut {
  if (status === "not_connected") return { status, sources: [] };
  // "Problems" is one source late; "off" is both paused.
  const results = status === "problems" ? "problems" : status;
  return {
    status,
    sources: [
      {
        label: MAIN,
        status: status === "off" ? "off" : "connected",
        last_update_at: iso(now - 2 * MIN),
      },
      {
        label: RESULTS,
        status: results,
        last_update_at: iso(
          status === "problems" ? now - 95 * MIN : now - 1 * MIN,
        ),
      },
    ],
  };
}

/** Havana's settings as the demo starts. */
export function sampleAlertSettings(
  now: number,
  status: RecordsStatus = "connected",
): AlertSettingsOut {
  return structuredClone({
    connection: sampleConnection(now, status),
    units: [...SAMPLE_UNITS],
    categories: [...SAMPLE_CATEGORIES],
    recipients: SAMPLE_RECIPIENTS,
    updated_by: { display_name: "Grace Nwosu" },
    updated_at: iso(now - 3 * DAY),
    version: 1,
  });
}
