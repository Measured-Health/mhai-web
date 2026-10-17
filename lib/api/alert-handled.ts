import type { AlertHandledOut } from "./alerts-contract";

const MAX_NAME = 200;
/** Longer than any ISO 8601 time with milliseconds and an offset. */
const MAX_TIME = 35;
/** An ISO 8601 date and time with seconds and a zone: "2026-10-17T09:00:00Z", "…+01:00". */
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** A short ISO 8601 time that parses; anything else is dropped (F12). */
const isoTime = (at: unknown): at is string =>
  typeof at === "string" &&
  at.length <= MAX_TIME &&
  ISO_TIME.test(at) &&
  !Number.isNaN(Date.parse(at));

/**
 * Who handled an alert first, and when, read defensively from a 409
 * `already_handled` body (R7). The proxy and the live client both use this,
 * so the same rules apply on each side: only `status`, `handled_by.display_name`
 * and an ISO 8601 `handled_at` survive; nothing else in the body is kept.
 */
export function handledFields(
  body: Record<string, unknown> | null,
): AlertHandledOut {
  const by = body?.handled_by as { display_name?: unknown } | null | undefined;
  const name =
    typeof by?.display_name === "string" ? by.display_name.trim() : "";
  const at = body?.handled_at;
  return {
    status: body?.status === "dismissed" ? "dismissed" : "handled",
    handled_by: name ? { display_name: name.slice(0, MAX_NAME) } : null,
    handled_at: isoTime(at) ? at : null,
  };
}
