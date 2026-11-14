// What a refused Analysis read means to the person, in plain words (core
// openapi 1.17.0). Only the status and the problem code are read; no
// upstream text is ever shown.
import { ApiError } from "@mhai/api-client/errors";

/**
 * - off: 404, the hospital's Analysis switch is off (or Analysis isn't
 *   signed off on this deployment).
 * - not_ready: 503 `not_ready`, the period isn't frozen yet or its numbers
 *   are still being worked out; ask again shortly.
 * - busy: 429, too many new views for now (the rate limit, the cap on new
 *   filter sets a person may open per period, or the per-request cap).
 * - invalid: 422, the period or filters can't be used.
 * - failed: anything else (a network error, 5xx, a reply that didn't read).
 */
export type Problem =
  | { kind: "off" }
  | { kind: "not_ready" }
  | { kind: "busy" }
  | { kind: "invalid"; code: "invalid_range" | "too_many_filters" | "other" }
  | { kind: "failed" };

export function problemOf(e: unknown): Problem {
  if (!(e instanceof ApiError)) return { kind: "failed" };
  if (e.status === 404) return { kind: "off" };
  if (e.status === 503 && e.code === "not_ready") return { kind: "not_ready" };
  if (e.status === 429) return { kind: "busy" };
  if (e.status === 422)
    return {
      kind: "invalid",
      code:
        e.code === "invalid_range" || e.code === "too_many_filters"
          ? e.code
          : "other",
    };
  return { kind: "failed" };
}

export const OFF_TEXT = "Analysis is not switched on for this hospital.";
export const NOT_READY_TEXT =
  "These numbers are still being prepared. Try again shortly.";
export const BUSY_TEXT =
  "Too many new views for now. Try again in a few minutes, or go back to a view you've already opened.";
export const INVALID_TEXT: Record<
  Extract<Problem, { kind: "invalid" }>["code"],
  string
> = {
  invalid_range:
    "That period can't be shown. Choose a finished week, month or quarter.",
  too_many_filters: "Choose up to two filters at a time.",
  other:
    "These filters can't be used for this period. Clear them and try again.",
};

/** The words for a problem; null for a plain failure (the caller says "Couldn't load …"). */
export function problemText(p: Problem): string | null {
  switch (p.kind) {
    case "off":
      return OFF_TEXT;
    case "not_ready":
      return NOT_READY_TEXT;
    case "busy":
      return BUSY_TEXT;
    case "invalid":
      return INVALID_TEXT[p.code];
    default:
      return null;
  }
}

/** Whether asking again could help: never for off or an invalid request. */
export const canRetry = (p: Problem) =>
  p.kind !== "off" && p.kind !== "invalid";

/**
 * Read queries: network errors and 5xx retry on their own, except
 * `not_ready` (the person is told and asks again). A 4xx never changes on
 * its own.
 */
export function shouldRetryAnalysis(failures: number, e: unknown): boolean {
  if (e instanceof ApiError) {
    if (e.status >= 400 && e.status < 500) return false;
    if (e.code === "not_ready") return false;
  }
  return failures < 3;
}

// ---- A patient list (`GET /analysis/patients`, core 1.19.0) ----------------------

/**
 * What a refused patient list means to the person. Only the status and the
 * problem code are read.
 *
 * - off: 404, Analysis is off (as on the views).
 * - gone: 422 `too_small`, the key no longer opens a list (another period,
 *   filters or hospital, or the count changed). Says nothing about the group.
 * - limit: 429, too many lists for now (10 a minute, 50 a day, or 300
 *   different patients a quarter).
 * - failed: anything else (a network error, 5xx, a reply that didn't read);
 *   the only state with Try again.
 */
export type ListProblem = "off" | "gone" | "limit" | "failed";

export function listProblemOf(e: unknown): ListProblem {
  if (!(e instanceof ApiError)) return "failed";
  if (e.status === 404) return "off";
  if (e.status === 422 && e.code === "too_small") return "gone";
  if (e.status === 429) return "limit";
  return "failed";
}

export const LIST_GONE_TEXT = "This list is no longer available";
export const LIST_LIMIT_TEXT =
  "You've opened many patient lists; try again later";
/** On a See patients core sent no key for (a shown count of 5 or more). */
export const NO_DRILL_TEXT = "not available for this breakdown";
/** Said with every list: core records each opening. */
export const AUDITED_TEXT =
  "This view is audited: opening a patient list is recorded under your name.";

/** The words for a refused list; null for a plain failure ("Couldn't load these patients"). */
export function listProblemText(p: ListProblem): string | null {
  switch (p) {
    case "off":
      return OFF_TEXT;
    case "gone":
      return LIST_GONE_TEXT;
    case "limit":
      return LIST_LIMIT_TEXT;
    default:
      return null;
  }
}
