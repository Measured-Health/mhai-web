// The fail-closed small-group guards (spec §5.1, §5.2), shared by the
// platform app's Usage and Analysis readers. The server computes and hides
// every number; these check it did, so a reader can fail a view closed
// ("Couldn't load {view}") rather than show a value it should have hidden.
import { SMALL_GROUP_MIN, isSmallCount } from "./small-groups";

export type GuardedValue = { value: number | null; suppressed: boolean };
export type GuardKind = "count" | "rate" | "minutes" | "share" | "hours";
export type Obj = Record<string, unknown>;

const HIDDEN: GuardedValue = { value: null, suppressed: true };
const ID = /^[A-Za-z0-9_-]+$/;

export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
/** A whole number, 0 or more. */
export const isCount = (v: unknown): v is number =>
  isNum(v) && Number.isInteger(v) && v >= 0;
export const isTime = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}/.test(v) &&
  !Number.isNaN(Date.parse(v));
/** An opaque id: letters, digits, underscore and hyphen. */
export const isId = (v: unknown): v is string =>
  typeof v === "string" && ID.test(v);

export const isHiddenValue = (g: GuardedValue) => g.suppressed;
/** Shown with a number: neither hidden nor "nothing to measure". */
export const shows = (g: GuardedValue) => !g.suppressed && g.value !== null;

/** No key beyond the allowed ones (an extra key may carry a name or a number). */
export function hasOnlyKeys(o: Obj, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

/**
 * A readable value of its kind. Hidden is always readable (its number, if
 * any, is dropped by `scrub`). Null is nothing to show, allowed where
 * `loose`. A count sent unhidden between 0 and 5 is not readable (a leak).
 * A count is a whole number, except where `loose`: a median of counts over
 * an even number of hospitals can be 125.5.
 */
export function guardedOk(v: unknown, kind: GuardKind, loose = false): boolean {
  if (!isObj(v) || typeof v.suppressed !== "boolean") return false;
  if (v.suppressed) return true;
  if (v.value === null) return loose;
  if (kind === "count") {
    const n = v.value;
    if (!isNum(n) || n < 0 || (!loose && !Number.isInteger(n))) return false;
    return !isSmallCount(n);
  }
  if (kind === "share") return isNum(v.value) && v.value >= 0 && v.value <= 1;
  return isNum(v.value) && v.value >= 0;
}

/**
 * A share of a shown count gives its numerator away: `total × share`. It
 * must not come to 1–4, nor leave 1–4 outside it.
 */
export function numeratorLeaks(
  total: GuardedValue,
  share: GuardedValue,
): boolean {
  if (!shows(total) || !shows(share)) return false;
  const n = Math.round(total.value! * share.value!);
  return isSmallCount(n) || isSmallCount(total.value! - n);
}

/**
 * In a set that adds up (a total and its members), exactly one hidden
 * value can be worked out from the others; with the total shown, hidden
 * members together are the total minus the shown ones, which under 5 (or
 * at or under 0) gives them away.
 */
export function setGivesAway(
  total: GuardedValue | null,
  members: GuardedValue[],
): boolean {
  const all = total ? [total, ...members] : members;
  if (all.filter(isHiddenValue).length === 1) return true;
  if (!total || !shows(total) || !members.some(isHiddenValue)) return false;
  let rest = total.value!;
  for (const m of members) if (shows(m)) rest -= m.value!;
  return rest < SMALL_GROUP_MIN;
}

/**
 * The second-hiding check across rows (spec §5.2): a total and the parts it
 * is made of. A leak when the total shows and
 *  - exactly one part is hidden (the total minus the others is it);
 *  - two or more are hidden and the total minus the shown parts is under 5;
 *  - none is hidden and the parts don't add up to the total.
 * A hidden total is never a leak here: the rows are the same answers as each
 * hospital's own scope.
 */
export function remainderLeaks(
  total: GuardedValue,
  parts: GuardedValue[],
): boolean {
  if (!shows(total)) return false;
  const hiddenParts = parts.filter(isHiddenValue).length;
  if (hiddenParts === 1) return true;
  let rest = total.value!;
  for (const p of parts) if (shows(p)) rest -= p.value!;
  return hiddenParts >= 2 ? rest < SMALL_GROUP_MIN : rest !== 0;
}

/** Every hidden value as `{value: null, suppressed: true}`, deep. */
export function scrub<T>(v: T): T {
  if (Array.isArray(v)) return v.map(scrub) as T;
  if (!isObj(v)) return v;
  if (typeof v.suppressed === "boolean" && "value" in v)
    return (v.suppressed ? HIDDEN : { value: v.value, suppressed: false }) as T;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, scrub(x)]),
  ) as T;
}
