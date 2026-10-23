// Usage's own value guards (Plan 7c). They differ from the strict set in
// @mhai/ui/guards: a hidden value that carries a number still reads here (the
// reader scrubs it), a loose count may be a half, and a share's numerator is
// worked out by rounding. TODO: move Usage onto @mhai/ui/guards once its
// tests and server replies are checked against the strict rules.
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import { isNum, isObj, type GuardKind } from "@mhai/ui/guards";
import type { Guarded } from "../api/analytics-contract";

const HIDDEN: Guarded = { value: null, suppressed: true };
const hidden = (g: Guarded) => g.suppressed;
const shows = (g: Guarded) => !g.suppressed && g.value !== null;

/**
 * A readable value of its kind. Hidden is always readable (its number, if
 * any, is dropped). Null is nothing to show, allowed where `loose`. A
 * count sent unhidden between 0 and 5 is not readable (a leak). A count is
 * a whole number, except where `loose`: a median of counts over an even
 * number of hospitals, or a weekly average in a change, can be 125.5.
 */
export function usageGuardedOk(
  v: unknown,
  kind: GuardKind,
  loose: boolean,
): boolean {
  if (!isObj(v) || typeof v.suppressed !== "boolean") return false;
  if (v.suppressed) return true;
  if (v.value === null) return loose;
  if (kind === "count") {
    const n = v.value;
    if (!isNum(n) || n < 0 || (!loose && !Number.isInteger(n))) return false;
    return !(n > 0 && n < SMALL_GROUP_MIN);
  }
  if (kind === "share") return isNum(v.value) && v.value >= 0 && v.value <= 1;
  return isNum(v.value) && v.value >= 0;
}

/**
 * A share of a shown count gives its numerator away: `total × share`. It
 * must not come to 1–4, nor leave 1–4 outside it.
 */
export function usageNumeratorLeaks(total: Guarded, share: Guarded) {
  if (!shows(total) || !shows(share)) return false;
  const n = Math.round(total.value! * share.value!);
  return isSmallCount(n) || isSmallCount(total.value! - n);
}

/** Every hidden value as `{value: null, suppressed: true}`, deep. */
export function usageScrub<T>(v: T): T {
  if (Array.isArray(v)) return v.map(usageScrub) as T;
  if (!isObj(v)) return v;
  if (typeof v.suppressed === "boolean" && "value" in v)
    return (v.suppressed ? HIDDEN : { value: v.value, suppressed: false }) as T;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, usageScrub(x)]),
  ) as T;
}

/**
 * In a set that adds up (a total and its members), exactly one hidden
 * value can be worked out from the others; with the total shown, hidden
 * members together are the total minus the shown ones, which under 5 (or
 * at or under 0) gives them away (the Plan 5b rule).
 */
export function usageSetGivesAway(
  total: Guarded | null,
  members: Guarded[],
): boolean {
  const all = total ? [total, ...members] : members;
  if (all.filter(hidden).length === 1) return true;
  if (!total || !shows(total) || !members.some(hidden)) return false;
  let rest = total.value!;
  for (const m of members) if (shows(m)) rest -= m.value!;
  return rest < SMALL_GROUP_MIN;
}
