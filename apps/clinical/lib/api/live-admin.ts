import type { AdminClient } from "./admin";
import type { ActivityQuery, StaffRemoveAuth } from "./admin-contract";
import type { WriteOpts } from "./contract";
import { apiOk, keyHeader } from "./request";

/** The hospital admin API through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveAdminClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AdminClient {
  const ok = <T>(
    path: string,
    method = "GET",
    body?: unknown,
    opts?: WriteOpts,
  ) =>
    apiOk<T>(fetchImpl, `/hospital${path}`, {
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
  /** The admin's own two-step code, as the API takes it (amendment 1). */
  const codeBody = (a: StaffRemoveAuth) =>
    "mfaCode" in a ? { mfa_code: a.mfaCode } : { backup_code: a.backupCode };

  return {
    listStaff: () => ok("/staff"),
    inviteStaff: (i, o) => ok("/staff/invites", "POST", i, o),
    updateStaff: (s, p, o) => ok(`/staff/${id(s)}`, "PATCH", p, o),
    staffAction: (s, a, o) => ok(`/staff/${id(s)}/${a}`, "POST", undefined, o),
    async removeStaff(s, auth, o) {
      await ok(`/staff/${id(s)}`, "DELETE", codeBody(auth), o);
    },
    getSettings: () => ok("/settings"),
    updateSettings: (p, o) => ok("/settings", "PATCH", p, o),
    getUsage: (period) => ok(`/usage?period=${id(period)}`),
    listActivity: (q) => ok(`/activity${query(q)}`),
    getOversight: () => ok("/review-oversight"),
    listEligibleReviewers: (c) =>
      ok(`/corrections/${id(c)}/eligible-reviewers`),
    async remindReviewers(c, o) {
      await ok(`/corrections/${id(c)}/remind`, "POST", undefined, o);
    },
    async assignReviewer(c, staffId, o) {
      await ok(
        `/corrections/${id(c)}/assign`,
        "POST",
        { staff_id: staffId },
        o,
      );
    },
  };
}
