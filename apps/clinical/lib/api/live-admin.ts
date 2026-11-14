import type { z } from "zod";
import type { AdminClient } from "./admin";
import {
  stepUpBody,
  type ActivityQuery,
  type StaffOut,
} from "./admin-contract";
import {
  ACTIVITY_PAGE_SCHEMA,
  SETTINGS_SCHEMA,
  STAFF_LIST_SCHEMA,
  STAFF_SCHEMA,
  USAGE_SCHEMA,
} from "./admin-schema";
import type { WriteOpts } from "./contract";
import { ApiError } from "./errors";
import { apiOk, keyHeader } from "./request";

/**
 * Reads a reply strictly (core openapi 1.24.0): anything that doesn't match
 * is 502 `bad_gateway`, never shown in part.
 */
function read<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(502, "bad_gateway");
  return r.data;
}

/** The hospital admin API through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveAdminClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AdminClient {
  const ok = (path: string, method = "GET", body?: unknown, opts?: WriteOpts) =>
    apiOk<unknown>(fetchImpl, `/hospital${path}`, {
      method,
      body,
      headers: keyHeader(opts),
    });

  const id = encodeURIComponent;
  const query = (q: ActivityQuery) => {
    const p = new URLSearchParams();
    if (q.type) p.set("type", q.type);
    if (q.person) p.set("person", q.person);
    if (q.staff_id) p.set("staff_id", q.staff_id);
    if (q.from) p.set("from", q.from);
    if (q.to) p.set("to", q.to);
    if (q.flagged) p.set("flagged", "true");
    if (q.cursor) p.set("cursor", q.cursor);
    if (q.limit) p.set("limit", String(q.limit));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const staff = async (p: Promise<unknown>): Promise<StaffOut> =>
    read(STAFF_SCHEMA, await p);

  return {
    listStaff: async () => read(STAFF_LIST_SCHEMA, await ok("/staff")),
    // Every staff write carries the admin's step-up code (core 1.24.0).
    updateStaff: (s, p, auth, o) =>
      staff(ok(`/staff/${id(s)}`, "PATCH", { ...p, ...stepUpBody(auth) }, o)),
    staffAction: (s, a, auth, o) =>
      staff(ok(`/staff/${id(s)}/${a}`, "POST", stepUpBody(auth), o)),
    getSettings: async () => read(SETTINGS_SCHEMA, await ok("/settings")),
    // The code only when the edit loosens sign-in.
    updateSettings: async (p, auth, o) =>
      read(
        SETTINGS_SCHEMA,
        await ok(
          "/settings",
          "PATCH",
          auth ? { ...p, ...stepUpBody(auth) } : p,
          o,
        ),
      ),
    getUsage: async (period) =>
      read(USAGE_SCHEMA, await ok(`/usage?period=${id(period)}`)),
    listActivity: async (q) =>
      read(ACTIVITY_PAGE_SCHEMA, await ok(`/activity${query(q)}`)),
    getOversight: async () =>
      (await ok("/review-oversight")) as Awaited<
        ReturnType<AdminClient["getOversight"]>
      >,
    listEligibleReviewers: async (c) =>
      (await ok(`/corrections/${id(c)}/eligible-reviewers`)) as Awaited<
        ReturnType<AdminClient["listEligibleReviewers"]>
      >,
  };
}
