/** A refused or failed call to the app's own API proxy: its status and problem `code` only. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL = /^[^\s@<>"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const PEOPLE_MAX = 20;

const checked = (raw: unknown, ok: (s: string) => boolean): string[] =>
  Array.isArray(raw)
    ? raw
        .filter((v): v is string => typeof v === "string" && ok(v))
        .slice(0, PEOPLE_MAX)
    : [];

/**
 * 422 `not_eligible` (staff `ids`) or `not_eligible_platform` (platform
 * admin `emails`): who can't be covered by a clearance letter. Only opaque
 * ids and well-formed addresses are kept, at most 20 of each.
 */
export class NotEligibleError extends ApiError {
  readonly ids: readonly string[];
  readonly emails: readonly string[];
  constructor(
    code: "not_eligible" | "not_eligible_platform",
    people: { ids?: unknown; emails?: unknown },
  ) {
    super(422, code);
    this.name = "NotEligibleError";
    this.ids = checked(people.ids, (s) => ID.test(s));
    this.emails = checked(
      people.emails,
      (s) => s.length <= 254 && EMAIL.test(s),
    );
  }
}

/** The refusal for a non-2xx reply: its code, plus the people for `not_eligible*`. */
export function refusal(
  status: number,
  data: Record<string, unknown> | null,
): ApiError {
  const code = typeof data?.code === "string" ? data.code : "error";
  if (
    status === 422 &&
    (code === "not_eligible" || code === "not_eligible_platform")
  )
    return new NotEligibleError(code, data ?? {});
  return new ApiError(status, code);
}
