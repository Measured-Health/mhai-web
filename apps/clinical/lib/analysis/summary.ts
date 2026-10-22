// The one-sentence summary above each view, built only from shown values.
// A hidden value reads "fewer than 5"; nothing is ever worked out from one
// (no remainder, no total of the rest, no percentage of a hidden count).
import type { GuardedOut } from "../api/admin-contract";
import type { ViewId, ViewOut } from "../api/analysis-contract";
import { FEWER_THAN_5 } from "@mhai/ui/small-groups";
import {
  AGE_LABEL,
  NO_PATIENTS,
  conditionName,
  countText,
  minutesText,
  shareText,
} from "./labels";

const shows = (g: GuardedOut) => !g.suppressed && g.value !== null;
/** "fewer than 5" mid-sentence. */
const n = (g: GuardedOut) => (g.suppressed ? "fewer than 5" : countText(g));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const plural = (k: number, one: string, many: string) =>
  `${k} ${k === 1 ? one : many}`;
/** The shown row with the largest value, or null. */
function top<R>(list: R[], value: (r: R) => GuardedOut): R | null {
  let best: R | null = null;
  for (const r of list)
    if (shows(value(r)) && (!best || value(r).value! > value(best).value!))
      best = r;
  return best;
}

const SUMMARY: { [V in ViewId]: (d: ViewOut[V]) => string } = {
  prevalence: (d) =>
    `${cap(n(d.total.cases))} cases across ${plural(d.by_condition.length, "condition", "conditions")}; ${n(d.total.new)} new in this period.`,

  affected: (d) => {
    // The largest age group only when none is hidden: a hidden group
    // could be larger.
    const age = d.by_age.some((r) => r.patients.suppressed)
      ? null
      : top(d.by_age, (r) => r.patients);
    const largest =
      age && age.patients.value! > 0
        ? `; the largest age group is ${AGE_LABEL[age.band]} (${countText(age.patients)})`
        : "";
    return `${cap(n(d.patients))} patients${largest}.`;
  },

  "co-occurring": (d) => {
    const k = d.pairs.length;
    if (k === 0) return "No conditions found together.";
    const head = plural(k, "pair of conditions", "pairs of conditions");
    const best = top(d.pairs, (r) => r.patients);
    if (!best)
      return `${head} found together, each with ${FEWER_THAN_5.toLowerCase()} patients.`;
    return `${head} found together; the most common shown is ${conditionName(best.a)} + ${conditionName(best.b)} (${countText(best.patients)} patients).`;
  },

  findings: (d) => {
    const a = d.alerts;
    const median = shows(a.median_ack_minutes)
      ? `; median time to acknowledge ${minutesText(a.median_ack_minutes)}`
      : "";
    return `${cap(n(a.total))} alerts, ${n(a.by_severity.critical)} critical${median}.`;
  },

  quality: (d) => {
    const k = d.by_condition.length;
    if (k === 0) return "No consultations in this period.";
    const head = plural(
      k,
      "condition with consultations",
      "conditions with consultations",
    );
    const best = top(d.by_condition, (r) => r.consultations);
    if (!best)
      return `${head}, each with ${FEWER_THAN_5.toLowerCase()} consultations.`;
    const agreed =
      shows(best.agreement_rate) && shows(best.rated)
        ? `, clinicians agreed ${shareText(best.agreement_rate)} of ${countText(best.rated)} rated`
        : best.rated.suppressed
          ? `, ${n(best.rated)} rated`
          : "";
    return `${head}; ${conditionName(best.condition)}: ${countText(best.consultations)} consultations${agreed}.`;
  },
};

/**
 * One sentence for the view. With no patients: "No patients match these
 * filters"; with a hidden patient count, every number is hidden, so it
 * says only that.
 */
export function viewSummary<V extends ViewId>(
  view: V,
  data: ViewOut[V],
): string {
  if (data.patients.suppressed)
    return `${FEWER_THAN_5} patients match these filters`;
  if (data.patients.value === 0) return NO_PATIENTS;
  return (SUMMARY[view] as (d: ViewOut[V]) => string)(data);
}
