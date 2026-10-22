// The order of rows in a list view. Shown rows sort by their value, largest
// first. Hidden rows come after them in a fixed order (the display name,
// with "Not standardised" and "… not recorded" last), so their order never
// gives away their true size. With every row hidden, every row sorts by
// name. Age band, sex and location type always keep their fixed order,
// whatever order the server sends. The views, the tables and the CSV all use
// this order.
import type { GuardedOut } from "../api/admin-contract";
import type { ConditionRef, ViewId, ViewOut } from "../api/analysis-contract";
import { dismissReasonLabel } from "../notifications/alert-view";
import { shows } from "./guards";
import {
  NOT_STANDARDISED,
  conditionName,
  locationText,
  specialtyText,
} from "./labels";
import { AGE_BANDS, SETTINGS, SEXES } from "./read";

/** A row's fixed sort key: its display name, a tie-breaker, and whether it goes last. */
export type RowKey = { name: string; tie?: string; last: boolean };

const compareText = (a: string, b: string) =>
  a.localeCompare(b, "en-GB", { sensitivity: "base" }) ||
  (a < b ? -1 : a > b ? 1 : 0);

const compareKey = (a: RowKey, b: RowKey) =>
  Number(a.last) - Number(b.last) ||
  compareText(a.name, b.name) ||
  compareText(a.tie ?? "", b.tie ?? "");

/** Shown rows by value, largest first; then hidden rows by their fixed key. */
export function orderRows<R>(
  rows: readonly R[],
  value: (r: R) => GuardedOut,
  key: (r: R) => RowKey,
): R[] {
  const shown = rows.filter((r) => shows(value(r)));
  const rest = rows.filter((r) => !shows(value(r)));
  return [
    ...shown
      .map((r, i) => ({ r, i }))
      .sort(
        (a, b) =>
          value(b.r).value! - value(a.r).value! ||
          compareKey(key(a.r), key(b.r)) ||
          a.i - b.i,
      )
      .map((x) => x.r),
    ...[...rest].sort((a, b) => compareKey(key(a), key(b))),
  ];
}

/** Rows in the fixed order of `order`, anything unknown (or null) last. */
function fixedOrder<R, K>(
  rows: readonly R[],
  key: (r: R) => K,
  order: readonly K[],
): R[] {
  const at = (r: R) => {
    const i = order.indexOf(key(r));
    return i < 0 ? order.length : i;
  };
  return [...rows].sort((a, b) => at(a) - at(b));
}

const conditionKey = (c: ConditionRef): RowKey => ({
  name: conditionName(c),
  tie: `${c.icd10 ?? ""} ${c.id}`,
  last: c.name === null,
});

type Orderer = { [V in ViewId]: (d: ViewOut[V]) => ViewOut[V] };
const ORDER: Orderer = {
  prevalence: (d) => ({
    ...d,
    by_condition: orderRows(
      d.by_condition,
      (r) => r.cases,
      (r) => conditionKey(r.condition),
    ),
  }),
  // Age band, sex and location type always use their fixed order, shown or
  // hidden, so a hidden row's place never gives away its size.
  affected: (d) => ({
    ...d,
    by_age: fixedOrder(d.by_age, (r) => r.band, AGE_BANDS),
    by_sex: fixedOrder(d.by_sex, (r) => r.sex, SEXES),
    by_setting: fixedOrder(d.by_setting, (r) => r.setting, [...SETTINGS, null]),
    by_location: orderRows(
      d.by_location,
      (r) => r.patients,
      (r) => ({
        name: locationText(r.location),
        tie: r.location?.id ?? "",
        last: r.location === null,
      }),
    ),
    by_specialty: orderRows(
      d.by_specialty,
      (r) => r.patients,
      (r) => ({ name: specialtyText(r.specialty), last: r.specialty === null }),
    ),
  }),
  "co-occurring": (d) => ({
    ...d,
    pairs: orderRows(
      d.pairs,
      (r) => r.patients,
      (r) => ({
        name: `${conditionName(r.a)} + ${conditionName(r.b)}`,
        tie: `${r.a.id} ${r.b.id}`,
        last: r.a.name === null || r.b.name === null,
      }),
    ),
  }),
  findings: (d) => ({
    ...d,
    alerts: {
      ...d.alerts,
      dismiss_reasons: orderRows(
        d.alerts.dismiss_reasons,
        (r) => r.count,
        (r) => ({
          name: dismissReasonLabel(r.reason) ?? r.reason,
          last: false,
        }),
      ),
    },
    findings: orderRows(
      d.findings,
      (r) => r.patients,
      (r) => ({
        name: r.name ?? NOT_STANDARDISED,
        tie: r.flag ?? "",
        last: r.name === null,
      }),
    ),
  }),
  quality: (d) => ({
    ...d,
    by_condition: orderRows(
      d.by_condition,
      (r) => r.consultations,
      (r) => conditionKey(r.condition),
    ),
  }),
};

/** The view with every list in the page's order. */
export const orderView = <V extends ViewId>(view: V, d: ViewOut[V]) =>
  (ORDER[view] as (x: ViewOut[V]) => ViewOut[V])(d);
