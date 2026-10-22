// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/events", () => ({ reportUnauthorized: unauthorized }));
const jar = vi.hoisted(() => ({
  get: () => undefined,
  set: () => {},
  delete: () => {},
}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import { ApiError } from "@mhai/api-client/errors";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/v1/[...path]/route";
import { BlockedError, type PlatformClient } from "./contract";
import { createLivePlatformClient } from "./live";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLivePlatformClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const reply = (make: () => Response) =>
  fetchImpl.mockImplementation(async () => make());
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
  reply(() => Response.json({}));
});

const K = { idempotencyKey: "key-1" };
const CODE = { mfa_code: "123456" };
type Row = [
  name: string,
  run: (c: PlatformClient) => Promise<unknown>,
  method: string,
  path: string,
  body: unknown,
];
const ROWS: Row[] = [
  [
    "listHospitals",
    (c) => c.listHospitals({ status: "active", q: "north gate", cursor: "25" }),
    "GET",
    "/api/v1/platform/hospitals?status=active&q=north+gate&cursor=25",
    undefined,
  ],
  [
    "addHospital",
    (c) =>
      c.addHospital(
        {
          name: "A",
          short_code: "AB",
          country: "NG",
          time_zone: "Africa/Lagos",
          email_domains: ["a.example"],
          first_admin: { name: "B", email: "b@a.example" },
        },
        K,
      ),
    "POST",
    "/api/v1/platform/hospitals",
    {
      name: "A",
      short_code: "AB",
      country: "NG",
      time_zone: "Africa/Lagos",
      email_domains: ["a.example"],
      first_admin: { name: "B", email: "b@a.example" },
    },
  ],
  [
    "getHospital",
    (c) => c.getHospital("h_north"),
    "GET",
    "/api/v1/platform/hospitals/h_north",
    undefined,
  ],
  [
    "updateHospital",
    (c) => c.updateHospital("h_north", { name: "N", version: 3 }, K),
    "PATCH",
    "/api/v1/platform/hospitals/h_north",
    { name: "N", version: 3 },
  ],
  [
    "deactivate",
    (c) => c.deactivate("h_north", { reason: "other", note: "n", ...CODE }, K),
    "POST",
    "/api/v1/platform/hospitals/h_north/deactivate",
    { reason: "other", note: "n", mfa_code: "123456" },
  ],
  [
    "reactivate",
    (c) =>
      c.reactivate("h_north", { reason: "r", backup_code: "AAAA-BBBB" }, K),
    "POST",
    "/api/v1/platform/hospitals/h_north/reactivate",
    { reason: "r", backup_code: "AAAA-BBBB" },
  ],
  [
    "requestRemoval",
    (c) => c.requestRemoval("h_north", { reason: "r", ...CODE }, K),
    "POST",
    "/api/v1/platform/hospitals/h_north/removal",
    { reason: "r", mfa_code: "123456" },
  ],
  [
    "approveRemoval",
    (c) => c.approveRemoval("h_north", CODE, K),
    "POST",
    "/api/v1/platform/hospitals/h_north/removal/approve",
    CODE,
  ],
  [
    "cancelRemoval",
    (c) => c.cancelRemoval("h_north", K),
    "POST",
    "/api/v1/platform/hospitals/h_north/removal/cancel",
    undefined,
  ],
  [
    "getSso",
    (c) => c.getSso("h_north"),
    "GET",
    "/api/v1/platform/hospitals/h_north/sso",
    undefined,
  ],
  [
    "saveSso",
    (c) =>
      c.saveSso(
        "h_north",
        {
          enabled: true,
          sign_in_url: "https://s.example",
          client_id: "c",
          issuer: "https://s.example",
          allowed_domains: [],
          version: 1,
        },
        K,
      ),
    "PUT",
    "/api/v1/platform/hospitals/h_north/sso",
    {
      enabled: true,
      sign_in_url: "https://s.example",
      client_id: "c",
      issuer: "https://s.example",
      allowed_domains: [],
      version: 1,
    },
  ],
  [
    "testSso",
    (c) => c.testSso("h_north", K),
    "POST",
    "/api/v1/platform/hospitals/h_north/sso/test",
    undefined,
  ],
  [
    "inviteAdmin",
    (c) => c.inviteAdmin("h_north", { name: "B", email: "b@a.example" }, K),
    "POST",
    "/api/v1/platform/hospitals/h_north/invites",
    { name: "B", email: "b@a.example" },
  ],
  [
    "resendInvite",
    (c) => c.resendInvite("h_north", "inv_1", K),
    "POST",
    "/api/v1/platform/hospitals/h_north/invites/inv_1/resend",
    undefined,
  ],
  ["listTeam", (c) => c.listTeam(), "GET", "/api/v1/platform/team", undefined],
  [
    "inviteTeam",
    (c) =>
      c.inviteTeam({ name: "S", email: "s@m.example", role: "auditor" }, K),
    "POST",
    "/api/v1/platform/team/invites",
    { name: "S", email: "s@m.example", role: "auditor" },
  ],
  [
    "changeRole",
    (c) => c.changeRole("tm_amara", { role: "auditor", version: 2 }, K),
    "PATCH",
    "/api/v1/platform/team/tm_amara",
    { role: "auditor", version: 2 },
  ],
  [
    "removeMember",
    (c) => c.removeMember("tm_amara", CODE, K),
    "DELETE",
    "/api/v1/platform/team/tm_amara",
    CODE,
  ],
  [
    "listActivity",
    (c) => c.listActivity({ hospital: "h_north", cursor: "50" }),
    "GET",
    "/api/v1/platform/activity?hospital=h_north&cursor=50",
    undefined,
  ],
  [
    "getAnalytics",
    (c) => c.getAnalytics("90d"),
    "GET",
    "/api/v1/platform/analytics?period=90d",
    undefined,
  ],
  [
    "getChangeSeries",
    (c) => c.getChangeSeries("chg_ngh_1", "7d"),
    "GET",
    "/api/v1/platform/analytics/changes/chg_ngh_1/series?period=7d",
    undefined,
  ],
  [
    "getHospitalSeries",
    (c) => c.getHospitalSeries("h_north", "needs_review_share", "30d"),
    "GET",
    "/api/v1/platform/analytics/hospitals/h_north/series?measure=needs_review_share&period=30d",
    undefined,
  ],
  [
    "followUp",
    (c) => c.followUp("chg_ngh_1", { note: "Called.", version: 3 }, K),
    "PUT",
    "/api/v1/platform/analytics/changes/chg_ngh_1/follow-up",
    { note: "Called.", version: 3 },
  ],
  [
    "undoFollowUp",
    (c) => c.undoFollowUp("chg_ngh_1", { version: 4 }, K),
    "DELETE",
    "/api/v1/platform/analytics/changes/chg_ngh_1/follow-up",
    { version: 4 },
  ],
  [
    "listNotifications",
    (c) => c.listNotifications(),
    "GET",
    "/api/v1/platform/notifications",
    undefined,
  ],
  [
    "markSeen",
    (c) => c.markSeen({ ids: ["ntf_chg_ngh_1"] }, K),
    "POST",
    "/api/v1/platform/notifications/seen",
    { ids: ["ntf_chg_ngh_1"] },
  ],
  [
    "getEmailPref",
    (c) => c.getEmailPref(),
    "GET",
    "/api/v1/platform/me/analytics-email",
    undefined,
  ],
  [
    "setEmailPref",
    (c) => c.setEmailPref({ mode: "critical", version: 2 }, K),
    "PUT",
    "/api/v1/platform/me/analytics-email",
    { mode: "critical", version: 2 },
  ],
];

describe("live platform client", () => {
  it("covers every method of the contract", () => {
    const methods = Object.keys(client()).sort();
    expect(ROWS.map((r) => r[0]).sort()).toEqual(methods);
  });

  it.each(ROWS)(
    "each method calls the right method and path with an Idempotency-Key: %s",
    async (_name, run, method, path, body) => {
      await run(client());
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = call();
      expect(url).toBe(path);
      expect(init).toMatchObject({
        method,
        credentials: "same-origin",
        cache: "no-store",
      });
      const headers = init.headers as Record<string, string>;
      if (method === "GET") {
        expect(headers["Idempotency-Key"]).toBeUndefined();
        expect(init.body).toBeUndefined();
      } else expect(headers["Idempotency-Key"]).toBe("key-1");
      expect(
        init.body === undefined ? undefined : JSON.parse(String(init.body)),
      ).toEqual(body);
    },
  );

  it("the live client uses the paths and an Idempotency-Key", async () => {
    reply(() => Response.json({ items: [], unseen: 0 }));
    await client().listNotifications();
    await client().markSeen({}, { idempotencyKey: "seen-1" });
    await client().getEmailPref();
    await client().setEmailPref(
      { mode: "critical_and_digest", version: 1 },
      { idempotencyKey: "pref-1" },
    );
    const sent = fetchImpl.mock.calls.map(([url, init]) => [
      url,
      init?.method,
      (init?.headers as Record<string, string>)["Idempotency-Key"],
      init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    ]);
    expect(sent).toEqual([
      ["/api/v1/platform/notifications", "GET", undefined, undefined],
      ["/api/v1/platform/notifications/seen", "POST", "seen-1", {}],
      ["/api/v1/platform/me/analytics-email", "GET", undefined, undefined],
      [
        "/api/v1/platform/me/analytics-email",
        "PUT",
        "pref-1",
        { mode: "critical_and_digest", version: 1 },
      ],
    ]);
  });

  it("removeMember sends DELETE with the code in the body", async () => {
    reply(() => new Response(null, { status: 204 }));
    await expect(
      client().removeMember("tm_kemi", { backup_code: "4F7K-92QX" }, K),
    ).resolves.toBeUndefined();
    const [url, init] = call();
    expect(url).toBe("/api/v1/platform/team/tm_kemi");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ backup_code: "4F7K-92QX" });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("leaves out unset filters and escapes ids", async () => {
    await client().listHospitals({});
    await client().listActivity({});
    await client().getHospital("a b/c");
    await client().getChangeSeries("a/b", "30d");
    await client().followUp("a/b", { version: 1 }, K);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/platform/hospitals",
      "/api/v1/platform/activity",
      "/api/v1/platform/hospitals/a%20b%2Fc",
      "/api/v1/platform/analytics/changes/a%2Fb/series?period=30d",
      "/api/v1/platform/analytics/changes/a%2Fb/follow-up",
    ]);
  });

  it("turns refusals into ApiError, blocked removals into BlockedError, 401 into sign-out", async () => {
    reply(() => Response.json({ code: "conflict" }, { status: 409 }));
    const e1 = await client()
      .getHospital("h_1")
      .catch((e) => e);
    expect(e1).toBeInstanceOf(ApiError);
    expect(e1).toMatchObject({ status: 409, code: "conflict" });

    reply(() =>
      Response.json(
        { code: "blocked", blocking: ["legal_hold"] },
        { status: 409 },
      ),
    );
    const e2 = await client()
      .approveRemoval("h_1", CODE, K)
      .catch((e) => e);
    expect(e2).toBeInstanceOf(BlockedError);
    expect(e2).toMatchObject({
      status: 409,
      code: "blocked",
      blocking: ["legal_hold"],
    });

    reply(() => new Response(null, { status: 401 }));
    await expect(client().listTeam()).rejects.toMatchObject({
      status: 401,
      code: "session_expired",
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  describe("against the proxy's shape table", () => {
    beforeEach(() => {
      vi.stubEnv("PLATFORM_SESSION_SECRET", "p".repeat(40));
      vi.stubEnv("MHAI_API_URL", "http://api.test/");
    });
    afterEach(() => vi.unstubAllEnvs());
    const HANDLERS = { GET, POST, PATCH, PUT, DELETE } as Record<
      string,
      (r: Request, c: unknown) => Promise<Response>
    >;

    it.each(ROWS)("the proxy accepts %s", async (_name, run) => {
      await run(client());
      const [url, init] = call();
      const u = new URL(url, "http://platform.test");
      const path = u.pathname
        .replace(/^\/api\/v1\//, "")
        .split("/")
        .map(decodeURIComponent);
      const req = new Request(u, {
        method: init.method,
        headers: {
          host: "platform.test",
          origin: "http://platform.test",
          ...(init.headers as Record<string, string>),
        },
        body: init.body,
      });
      const res = await HANDLERS[init.method!]!(req, {
        params: Promise.resolve({ path }),
      });
      // Past the shape check, a request with no session is signed out.
      expect(res.status).toBe(401);
    });

    it("refuses a shape the client never makes", async () => {
      const res = await GET(
        new Request("http://platform.test/api/v1/platform/nope"),
        { params: Promise.resolve({ path: ["platform", "nope"] }) },
      );
      expect(res.status).toBe(404);
    });
  });
});
