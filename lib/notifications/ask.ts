import type { AlertOut, AlertSeverity } from "../api/alerts-contract";
import type { Urgency } from "../api/contract";
import { emptyForm, type FormValues } from "../form-schema";
import { findingLine, recordedLabel, severityOf } from "./alert-view";

const PRIORITY: Record<AlertSeverity, Urgency> = {
  critical: "emergency",
  urgent: "urgent",
  info: "routine",
};
const SYMPTOM_MAX = 200;
const QUESTION_MAX = 2000;

/**
 * A consultation pre-filled from an alert (spec §3): age, sex, a priority
 * from the severity, and the finding as a symptom and as the question. Never
 * the patient's name, MRN or location, the source, the record link, or
 * MHAI's suggested causes: the consultation reasons on its own (R11, spec §5).
 */
export function askFromAlert(a: AlertOut, now: number): FormValues {
  const line = findingLine(a.finding);
  const when = recordedLabel(a.finding, now);
  const age =
    a.age !== null && Number.isInteger(a.age) && a.age >= 0 && a.age <= 120
      ? String(a.age)
      : "";
  return {
    ...emptyForm,
    age,
    sex: a.sex ?? "",
    urgency: PRIORITY[severityOf(a.severity)],
    symptoms: [`Abnormal result: ${line}`.slice(0, SYMPTOM_MAX)],
    question:
      `${line}${when ? `, recorded ${when}` : ""}. What are the likely causes, and what should I check or do next?`.slice(
        0,
        QUESTION_MAX,
      ),
  };
}

// One pre-filled form waiting for the consultation page, in memory only. The
// URL carries a random token that says nothing about the patient (R3).
let stash: { token: string; values: FormValues } | null = null;

/** Holds `values` for the next consultation form; returns the token for `/?prefill=`. */
export function stashPrefill(values: FormValues): string {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  stash = { token, values };
  return token;
}

/** The waiting form for this token, or null (unknown, replaced or cleared). Reading keeps it. */
export function readPrefill(token: string | null): FormValues | null {
  return token && stash?.token === token ? stash.values : null;
}

/** After the question is sent, and on sign-out. */
export function clearPrefill(): void {
  stash = null;
}
