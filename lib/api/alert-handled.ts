import type { AlertHandledOut } from "./alerts-contract";

const MAX_NAME = 200;

/**
 * Who handled an alert first, and when, read defensively from a 409
 * `already_handled` body (R7). The proxy and the live client both use this,
 * so the same rules apply on each side: only `status`, `handled_by.display_name`
 * and a parseable `handled_at` survive; nothing else in the body is kept.
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
    handled_at:
      typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : null,
  };
}
