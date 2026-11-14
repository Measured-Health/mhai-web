// The Analysis replies as core openapi 1.19.0 sends them
// (`AnalysisFilters`, `AnalysisView` and the per-view fields of its
// renderer, `AnalysisPatients`), and the patient list's query as the BFF
// lets it go upstream: these keys and no others, at every level. The shape is checked
// here; the small-group rules (no shown 1–4, sets that can't give a hidden
// member away, shares and medians over hidden counts) are checked on top by
// `lib/analysis/read.ts`. Anything that fails either is a failed view, never
// a guess.
import { z } from "zod";
import type { ViewId } from "./analysis-contract";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** An ISO instant with its zone: a bare time would be read in the browser's own zone. */
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const id = z.string().regex(ID);
const day = z
  .string()
  .regex(DAY)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  });
const instant = z
  .string()
  .regex(INSTANT)
  .refine((s) => !Number.isNaN(Date.parse(s)));
const label = z
  .string()
  .max(200)
  .refine((s) => s.trim() !== "");

export const PERIOD_LEVEL = z.enum(["week", "month", "quarter"]);
const AGE_BAND = z.enum(["0-17", "18-39", "40-64", "65-79", "80+"]);
const SEX = z.enum(["female", "male", "other", "not_recorded"]);
const SETTING = z.enum(["admitted", "outpatient", "emergency"]);

/** `GuardedCount`: never 1 to 4 (read.ts checks); hidden is `{null, true}`. */
export const GUARDED_COUNT = z.strictObject({
  value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  suppressed: z.boolean(),
});
/** `GuardedShare`: 0 to 1; `{null, false}` is nothing to divide by. */
export const GUARDED_SHARE = z.strictObject({
  value: z.number().min(0).max(1).nullable(),
  suppressed: z.boolean(),
});
/** `AnalysisMinutes`: a whole number or a half. */
export const MINUTES = z.strictObject({
  value: z
    .number()
    .min(0)
    .refine((m) => Number.isInteger(m * 2))
    .nullable(),
  suppressed: z.boolean(),
});
/** A drill key: 43 characters of base64url (an HMAC core derives per row). */
export const DRILL_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
/** A pseudonym anywhere in a string: no drill key may hold one (core drops those). */
const PID_IN = /(^|[^A-Za-z0-9])P-[A-Z0-9]{4,12}([^A-Za-z0-9]|$)/;
export const DRILL_KEY = z
  .string()
  .regex(DRILL_KEY_RE)
  .refine((k) => !PID_IN.test(k));
/**
 * `AnalysisDrillable` (1.19.0): `drill` is set only on a shown count of 5
 * or more where core allows a list (`read.ts` checks where), else null.
 */
export const DRILLABLE = z.strictObject({
  value: GUARDED_COUNT.shape.value,
  suppressed: z.boolean(),
  drill: DRILL_KEY.nullable(),
});
/** `AnalysisConditionRef`: name null reads "Not standardised". */
export const CONDITION_REF = z.strictObject({
  id,
  name: label.nullable(),
  icd10: z.string().max(16).nullable(),
});
const LOCATION_REF = z.strictObject({
  id,
  label,
  setting: SETTING.nullable(),
});
const PERIOD = z.strictObject({ level: PERIOD_LEVEL, start: day });
const HISTORY_POINT = z.strictObject({
  start: day,
  cases: GUARDED_COUNT,
  new: GUARDED_COUNT,
  patients: GUARDED_COUNT,
});

/** `AnalysisView`'s Meta and history, shared by every view. */
const META = {
  updated_at: instant,
  from: day,
  to: day,
  bucket: z.enum(["week", "month"]),
  patients: GUARDED_COUNT,
  period: PERIOD,
  history: z.array(HISTORY_POINT).max(7),
};

const G = GUARDED_COUNT;
const part = <K extends z.ZodType>(key: string, k: K) =>
  z.array(z.strictObject({ [key]: k, patients: DRILLABLE }));

export const VIEW_SCHEMAS = {
  prevalence: z.strictObject({
    ...META,
    total: z.strictObject({ cases: G, new: G, existing: G }),
    by_condition: z.array(
      z.strictObject({
        condition: CONDITION_REF,
        cases: DRILLABLE,
        new: G,
        existing: G,
      }),
    ),
    series: z.array(z.strictObject({ start: day, cases: G, new: G })),
  }),
  affected: z.strictObject({
    ...META,
    by_age: part("band", AGE_BAND.nullable()),
    by_sex: part("sex", SEX),
    by_setting: part("setting", SETTING.nullable()),
    by_location: part("location", LOCATION_REF.nullable()),
    by_specialty: part("specialty", label.nullable()),
  }),
  "co-occurring": z.strictObject({
    ...META,
    pairs: z
      .array(
        z.strictObject({
          a: CONDITION_REF,
          b: CONDITION_REF,
          a_patients: G,
          patients: DRILLABLE,
          share_of_a: GUARDED_SHARE,
        }),
      )
      .max(20),
  }),
  findings: z.strictObject({
    ...META,
    findings: z.array(
      z.strictObject({
        name: label.nullable(),
        flag: z.enum(["low", "high", "abnormal"]).nullable(),
        patients: DRILLABLE,
        results: G,
      }),
    ),
    alerts: z.strictObject({
      total: G,
      by_severity: z.strictObject({ critical: G, urgent: G, info: G }),
      median_ack_minutes: MINUTES,
      critical_median_ack_minutes: MINUTES,
      dismissed: G,
      dismiss_reasons: z.array(
        z.strictObject({
          reason: z.enum([
            "not_relevant",
            "already_known",
            "wrong_patient",
            "other",
          ]),
          count: G,
        }),
      ),
    }),
  }),
  quality: z.strictObject({
    ...META,
    by_condition: z.array(
      z.strictObject({
        condition: CONDITION_REF,
        consultations: G,
        confidence: z.strictObject({
          high: G,
          caution: G,
          review: G,
          failed: G,
        }),
        agreement_rate: GUARDED_SHARE,
        rated: G,
        corrections: z.strictObject({
          total: G,
          approved: G,
          rejected: G,
          waiting: G,
        }),
      }),
    ),
  }),
} satisfies Record<ViewId, z.ZodType>;

/** `AnalysisFilters`: the answerable periods, and one period's lists. */
export const FILTERS_SCHEMA = z.strictObject({
  updated_at: instant.nullable(),
  periods: z.strictObject({
    week: z.array(day),
    month: z.array(day),
    quarter: z.array(day),
  }),
  conditions: z.array(CONDITION_REF),
  locations: z.array(LOCATION_REF),
  specialties: z.array(label),
  sources: z.array(z.strictObject({ id, label })),
});

/** A pseudonym: `P-` and 4 to 12 capital letters or digits. */
export const PID_RE = /^P-[A-Z0-9]{4,12}$/;
/** The most rows a list may carry. */
export const PATIENT_ROWS_MAX = 200;

/**
 * `AnalysisPatients` (1.19.0): one de-identified list, behind a shown count
 * of 5 or more. At most 200 rows of exactly `{pid, age_band, sex, setting,
 * conditions, findings}`; a finding's `source_label` is always null.
 */
export const PATIENTS_SCHEMA = z.strictObject({
  level: z.literal("deidentified"),
  count: z.number().int().min(5).max(Number.MAX_SAFE_INTEGER),
  patients: z
    .array(
      z.strictObject({
        pid: z.string().regex(PID_RE),
        age_band: AGE_BAND.nullable(),
        sex: SEX,
        setting: SETTING.nullable(),
        conditions: z.array(CONDITION_REF).max(10),
        findings: z
          .array(
            z.strictObject({
              name: label.nullable(),
              flag: z.enum(["low", "high", "abnormal"]).nullable(),
              source_label: z.null(),
            }),
          )
          .max(10),
      }),
    )
    .max(PATIENT_ROWS_MAX),
});

/** The filters a list may be opened under: only those its rows show. */
export const DRILL_FILTERS = [
  "condition",
  "age_band",
  "sex",
  "setting",
] as const;
/** Filters under which core never sets a drill: a list there is `too_small`. */
export const NO_DRILL_FILTERS = ["location", "specialty", "source"] as const;

/**
 * `getAnalysisPatients`'s query as the analysis client sends it: the key,
 * the level, one period and the view's filters (at most two). Checked by the
 * BFF before anything goes upstream.
 */
export const PATIENTS_QUERY = z.strictObject({
  drill: z.string().regex(DRILL_KEY_RE),
  level: z.literal("deidentified"),
  period: PERIOD_LEVEL,
  start: z.string().regex(DAY),
  condition: z.string().regex(ID).optional(),
  age_band: AGE_BAND.optional(),
  sex: SEX.optional(),
  setting: SETTING.optional(),
});

/** Whether `raw` is exactly the 1.19.0 de-identified list. */
export const patientsShapeOk = (raw: unknown): boolean =>
  PATIENTS_SCHEMA.safeParse(raw).success;

/** Whether `raw` is exactly view `view`'s 1.19.0 shape. */
export const viewShapeOk = (view: ViewId, raw: unknown): boolean =>
  Object.hasOwn(VIEW_SCHEMAS, view) &&
  VIEW_SCHEMAS[view].safeParse(raw).success;

/** Whether `raw` is exactly the 1.19.0 filters shape. */
export const filtersShapeOk = (raw: unknown): boolean =>
  FILTERS_SCHEMA.safeParse(raw).success;
