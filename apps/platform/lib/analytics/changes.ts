// What changed: ordering and wording (spec §4). The server decides what
// changed and how serious it is; the app only orders and words it.
import { dayMonthLabel } from "../format";
import type { Change, FollowUp, Guarded } from "../api/analytics-contract";
import { LOWER_IS_BETTER } from "./measures";

export { dayMonthLabel };

/** Rows shown before "Show all ({n})". */
export const TOP = 5;

export type RankedChange = Change & {
  /** False when there is no previous period: "Not enough data to compare yet". */
  comparable: boolean;
  followedUp: boolean;
};

/** Nothing earlier to compare with (a new hospital), as opposed to hidden. */
export const noPrevious = (c: { previous: Guarded }) =>
  c.previous.value === null && !c.previous.suppressed;

/**
 * |current − previous| ÷ previous. Null when it can't be worked out (no
 * previous period, or a hidden value); from 0 it is 0 or Infinity.
 */
function size(c: Change): number | null {
  const p = c.previous;
  const n = c.current;
  if (p.suppressed || n.suppressed || p.value === null || n.value === null)
    return null;
  if (p.value === 0) return n.value === 0 ? 0 : Infinity;
  return Math.abs(n.value - p.value) / Math.abs(p.value);
}

/**
 * Not followed up before followed up; within each, serious first, then
 * the biggest change; changes without a size after those with one. Ties
 * keep the server's order.
 */
export function rankChanges(items: Change[]): RankedChange[] {
  const keyed = items.map((c, i) => ({
    c,
    i,
    done: c.follow_up !== null,
    s: size(c),
  }));
  keyed.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      Number(b.c.serious) - Number(a.c.serious) ||
      Number(a.s === null) - Number(b.s === null) ||
      (b.s ?? 0) - (a.s ?? 0) ||
      a.i - b.i,
  );
  return keyed.map(({ c, done }) => ({
    ...c,
    comparable: !noPrevious(c),
    followedUp: done,
  }));
}

export const showAllLabel = (n: number) => `Show all (${n})`;

/** The top 5, and the "Show all ({n})" link while more are hidden. */
export function topChanges<T>(
  ranked: T[],
  showAll = false,
): { shown: T[]; showAll: string | null } {
  if (showAll || ranked.length <= TOP) return { shown: ranked, showAll: null };
  return { shown: ranked.slice(0, TOP), showAll: showAllLabel(ranked.length) };
}

export type Sign = "⚠" | "↑" | "↓";
/** The direction in a word: the screen's lines and the CSV. */
export const DIRECTION_WORD: Record<Change["direction"], string> = {
  worse: "Worse",
  better: "Better",
  rising: "Rising",
  falling: "Falling",
};

/**
 * What the sign needs of a change. A notification has no values or measure,
 * so its sign for "better" reads the move from the words ("140 → 83").
 */
export type LineSource = Pick<Change, "direction" | "summary"> &
  Partial<Pick<Change, "measure" | "previous" | "current">>;

const MOVE = /(\d[\d,]*(?:\.\d+)?)[^\d→]{0,12}→\s*(\d[\d,]*(?:\.\d+)?)/;

/** Better points the way the value moved, or the measure's good way. */
function betterSign(c: LineSource): Sign {
  const p = c.previous?.value ?? null;
  const n = c.current?.value ?? null;
  if (
    c.previous &&
    c.current &&
    !c.previous.suppressed &&
    !c.current.suppressed &&
    p !== null &&
    n !== null &&
    p !== n
  )
    return n > p ? "↑" : "↓";
  if (!c.measure) {
    const m = MOVE.exec(c.summary);
    if (m) {
      const a = Number(m[1]!.replace(/,/g, ""));
      const b = Number(m[2]!.replace(/,/g, ""));
      if (a !== b) return b > a ? "↑" : "↓";
    }
    return "↑";
  }
  return LOWER_IS_BETTER.has(c.measure) ? "↓" : "↑";
}

/** A sign always with words, never colour alone. */
export function changeLine(c: LineSource): { sign: Sign; words: string } {
  const sign: Sign =
    c.direction === "worse"
      ? "⚠"
      : c.direction === "rising"
        ? "↑"
        : c.direction === "falling"
          ? "↓"
          : betterSign(c);
  return { sign, words: `${DIRECTION_WORD[c.direction]}: ${c.summary}` };
}

export const followUpLine = (f: FollowUp) =>
  `Followed up by ${f.by.name} · ${dayMonthLabel(f.at)}`;
