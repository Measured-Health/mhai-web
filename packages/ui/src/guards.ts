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
/** Shaped like a guarded number (a `value` and a `suppressed` flag). */
export const isGuardedValue = (v: unknown): v is GuardedValue =>
  isObj(v) && "suppressed" in v && "value" in v;
/** Shown with a number: neither hidden nor "nothing to measure". */
export const shows = (g: GuardedValue) => !g.suppressed && g.value !== null;

/** No key beyond the allowed ones (an extra key may carry a name or a number). */
export function hasOnlyKeys(o: Obj, allowed: readonly string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

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
  // A median of whole minutes is whole or a half.
  if (kind === "minutes") return Number.isInteger(n * 2);
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
  total: GuardedValue | null,
  members: GuardedValue[],
): boolean {
  const all = total ? [total, ...members] : members;
  if (all.filter(isHiddenValue).length === 1) return true;
  if (!total) return false;
  if (isHiddenValue(total))
    // A total of 1–4 leaves every member hidden or 0.
    return members.some((m) => shows(m) && m.value! > 0);
  if (!shows(total)) return members.some(shows);
  let rest = total.value!;
  for (const m of members) if (shows(m)) rest -= m.value!;
  if (rest < 0) return true;
  return members.some(isHiddenValue)
    ? rest < SMALL_GROUP_MIN
    : isSmallCount(rest);
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
 * A share no whole numerator rounds to falls back to the floor and ceiling
 * of `total × share`.
 */
export function numeratorLeaks(
  total: GuardedValue,
  share: GuardedValue,
): boolean {
  if (!shows(total) || !shows(share)) return false;
  const t = total.value!;
  const s = share.value!;
  const half = 0.5 * 10 ** -places(s);
  const eps = 1e-9;
  const lo = Math.max(0, Math.ceil((s - half) * t - eps));
  const hi = Math.min(t, Math.floor((s + half) * t + eps));
  if (lo > hi) {
    // No whole numerator rounds to this share: it was rounded more coarsely
    // than it says. Fail when the nearest numerators, either side, are 1–4
    // or leave 1–4.
    const x = s * t;
    return [Math.floor(x + eps), Math.ceil(x - eps)]
      .map((n) => Math.min(t, Math.max(0, n)))
      .some((n) => isSmallCount(n) || isSmallCount(t - n));
  }
  let numerator = true;
  let complement = true;
  for (let n = lo; n <= hi; n++) {
    if (!isSmallCount(n)) numerator = false;
    if (!isSmallCount(t - n)) complement = false;
  }
  return numerator || complement;
}

const drillable = (v: Obj) =>
  !v.suppressed &&
  isNum(v.value) &&
  v.value >= SMALL_GROUP_MIN &&
  typeof v.drill === "string" &&
  /^[A-Za-z0-9_-]+$/.test(v.drill);

/**
 * Every hidden value as `{ value: null, suppressed: true }`, deep. A
 * Drillable keeps its `drill` only while shown, 5 or more and opaque.
 */
export function scrub<T>(v: T): T {
  if (Array.isArray(v)) return v.map(scrub) as T;
  if (!isObj(v)) return v;
  if (typeof v.suppressed === "boolean" && "value" in v) {
    const g = v.suppressed ? HIDDEN : { value: v.value, suppressed: false };
    return (
      "drill" in v ? { ...g, drill: drillable(v) ? v.drill : null } : g
    ) as T;
  }
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, scrub(x)]),
  ) as T;
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
