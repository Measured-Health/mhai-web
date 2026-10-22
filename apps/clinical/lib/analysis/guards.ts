// The small-group guards for Analysis (spec §4), modelled on the platform
// app's analytics reader. The server computes and hides every number; these
// check it did, so a reader can fail a view closed ("Couldn't load {view}")
// rather than show a value it should have hidden. Neither app imports the
// other; sharing this code is a later clean-up.
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import type { GuardedOut } from "../api/admin-contract";

export type GuardKind = "count" | "share" | "minutes";

const HIDDEN: GuardedOut = { value: null, suppressed: true };

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export const hidden = (g: GuardedOut) => g.suppressed;
/** Shown with a number: neither hidden nor "nothing to measure". */
export const shows = (g: GuardedOut) => !g.suppressed && g.value !== null;

/**
 * A readable value of its kind. Hidden reads when it carries no number.
 * `value: null` unhidden is "nothing to
 * measure", readable only where `loose` (a share with nothing rated, a
 * median with nothing acknowledged). A count is whole, 0 or more, and
 * never 1–4 when shown. A share is 0 to 1. Minutes are 0 or more and may
 * be a half (a median of an even number of values: 12.5).
 */
export function guardedOk(v: unknown, kind: GuardKind, loose = false): boolean {
  if (!isObj(v) || typeof v.suppressed !== "boolean" || !("value" in v))
    return false;
  // A hidden value sent with its number is a value the server should have
  // hidden: not readable.
  if (v.suppressed) return v.value === null;
  if (v.value === null) return loose;
  const n = v.value;
  if (!isNum(n) || n < 0) return false;
  if (kind === "count") return Number.isInteger(n) && !isSmallCount(n);
  if (kind === "share") return n <= 1;
  return true;
}

/**
 * In a set that adds up (a total and its members), a hidden member can be
 * worked out when exactly one value in the set is hidden, or when the
 * total is shown and the hidden members together (the total minus the
 * shown ones) come to under 5. A set that can't add up (the shown members
 * exceed the total, a hidden total beside a shown member, or 1–4 left over
 * with nothing hidden) gives a group away too, or is wrong: either way the
 * view fails closed. `total` null: the members only (nothing to add up to).
 */
export function setGivesAway(
  total: GuardedOut | null,
  members: GuardedOut[],
): boolean {
  const all = total ? [total, ...members] : members;
  if (all.filter(hidden).length === 1) return true;
  if (!total) return false;
  if (hidden(total))
    // A total of 1–4 leaves every member hidden or 0.
    return members.some((m) => shows(m) && m.value! > 0);
  if (!shows(total)) return members.some(shows);
  let rest = total.value!;
  for (const m of members) if (shows(m)) rest -= m.value!;
  if (rest < 0) return true;
  return members.some(hidden) ? rest < SMALL_GROUP_MIN : isSmallCount(rest);
}

/** The decimal places a share was sent with: at least 2 (a whole percent). */
function places(x: number): number {
  const s = String(x);
  if (/e/i.test(s)) return 12;
  const dot = s.indexOf(".");
  return Math.max(2, dot < 0 ? 0 : s.length - dot - 1);
}

/**
 * A share of a shown count gives its numerator away (`total × share`) when
 * every whole number the rounded share could stand for is 1–4, or leaves
 * 1–4 outside it. A share that can't tell 4 from 5 gives nothing away.
 */
export function numeratorLeaks(total: GuardedOut, share: GuardedOut): boolean {
  if (!shows(total) || !shows(share)) return false;
  const t = total.value!;
  const s = share.value!;
  const half = 0.5 * 10 ** -places(s);
  const eps = 1e-9;
  const lo = Math.max(0, Math.ceil((s - half) * t - eps));
  const hi = Math.min(t, Math.floor((s + half) * t + eps));
  if (lo > hi) return false;
  let numerator = true;
  let complement = true;
  for (let n = lo; n <= hi; n++) {
    if (!isSmallCount(n)) numerator = false;
    if (!isSmallCount(t - n)) complement = false;
  }
  return numerator || complement;
}

/**
 * Every hidden value as `{ value: null, suppressed: true }`, deep. A
 * Drillable keeps its `drill` only while shown.
 */
export function scrub<T>(v: T): T {
  if (Array.isArray(v)) return v.map(scrub) as T;
  if (!isObj(v)) return v;
  if (typeof v.suppressed === "boolean" && "value" in v) {
    const g = v.suppressed ? HIDDEN : { value: v.value, suppressed: false };
    return (
      "drill" in v ? { ...g, drill: v.suppressed ? null : v.drill } : g
    ) as T;
  }
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, scrub(x)]),
  ) as T;
}
