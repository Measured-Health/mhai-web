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
import { TooManyRowsError } from "./audit-contract";
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
  [
    "listAudit",
    (c) =>
      c.listAudit(
        {
          hospital: "h_1",
          type: ["staff", "export"],
          flagged: true,
          from: "2026-10-01T00:00:00.000Z",
        },
        "c1",
      ),
    "GET",
    "/api/v1/platform/audit?hospital=h_1&type=staff%2Cexport&flagged=true&from=2026-10-01T00%3A00%3A00.000Z&limit=50&cursor=c1",
    undefined,
  ],
  [
    "getAuditEvent",
    (c) => c.getAuditEvent("ev_1"),
    "GET",
    "/api/v1/platform/audit/ev_1",
    undefined,
  ],
  [
    "getAuditPatients",
    (c) => c.getAuditPatients("ev_1"),
    "GET",
    "/api/v1/platform/audit/ev_1/patients",
    undefined,
  ],
  [
    "searchAuditPeople",
    (c) => c.searchAuditPeople("ada"),
    "GET",
    "/api/v1/platform/audit/people?q=ada",
    undefined,
  ],
  [
    "listAuditHospitals",
    (c) => c.listAuditHospitals(),
    "GET",
    "/api/v1/platform/audit/hospitals",
    undefined,
  ],
  [
    "reportUndisplayable",
    (c) => c.reportUndisplayable(["ev_1"], K),
    "POST",
    "/api/v1/platform/audit/undisplayable",
    { ids: ["ev_1"] },
  ],
  [
    "listNamedAccess",
    (c) => c.listNamedAccess({ clearance: "cl_1" }, "c2"),
    "GET",
    "/api/v1/platform/audit/named-access?clearance=cl_1&cursor=c2",
    undefined,
  ],
  [
    "createExport",
    (c) =>
      c.createExport(
        { kind: "events", filters: {}, reason: "internal_review", ...CODE },
        K,
      ),
    "POST",
    "/api/v1/platform/audit/exports",
    {
      kind: "events",
      filters: {},
      reason: "internal_review",
      mfa_code: "123456",
    },
  ],
  [
    "getHealth",
    (c) => c.getHealth(),
    "GET",
    "/api/v1/platform/health",
    undefined,
  ],
  [
    "listJobs",
    (c) =>
      c.listJobs({
        status: "all",
        type: "ingest_document",
        hospital: "h_northgate",
        kind: "unreadable",
        cursor: "50",
      }),
    "GET",
    "/api/v1/platform/jobs?status=all&type=ingest_document&hospital=h_northgate&kind=unreadable&cursor=50",
    undefined,
  ],
  [
    "retryJobs",
    (c) => c.retryJobs({ ids: ["job_a", "job_b"] }, K),
    "POST",
    "/api/v1/platform/jobs/retry",
    { ids: ["job_a", "job_b"] },
  ],
  [
    "cancelJobs",
    (c) =>
      c.cancelJobs(
        { ids: ["job_a"], reason: "other", note: "Done by hand.", ...CODE },
        K,
      ),
    "POST",
    "/api/v1/platform/jobs/cancel",
    {
      ids: ["job_a"],
      reason: "other",
      note: "Done by hand.",
      mfa_code: "123456",
    },
  ],
  [
    "downloadExport",
    (c) => c.downloadExport("ex_1"),
    "GET",
    "/api/v1/platform/audit/exports/ex_1/file",
    undefined,
  ],
  [
    "listExports",
    (c) => c.listExports("c3"),
    "GET",
    "/api/v1/platform/audit/exports?cursor=c3",
    undefined,
  ],
  [
    "startCheck",
    (c) => c.startCheck(K),
    "POST",
    "/api/v1/platform/audit/verify",
    undefined,
  ],
  [
    "getIntegrityStatus",
    (c) => c.getIntegrityStatus(),
    "GET",
    "/api/v1/platform/audit/verify/status",
    undefined,
  ],
  [
    "listRuns",
    (c) => c.listRuns(),
    "GET",
    "/api/v1/platform/audit/verify/runs",
    undefined,
  ],
  [
    "getRun",
    (c) => c.getRun("run_1"),
    "GET",
    "/api/v1/platform/audit/verify/runs/run_1",
    undefined,
  ],
  [
    "addOutcome",
    (c) => c.addOutcome("run_1", { note: "Looked into it", version: 2 }, K),
    "POST",
    "/api/v1/platform/audit/verify/runs/run_1/outcome",
    { note: "Looked into it", version: 2 },
  ],
  [
    "listHolds",
    (c) =>
      c.listHolds({
        status: "lifted",
        hospital: "h_north",
        q: "HC/2026",
        cursor: "50",
      }),
    "GET",
    "/api/v1/platform/legal-holds?status=lifted&hospital=h_north&q=HC%2F2026&cursor=50",
    undefined,
  ],
  [
    "placeHold",
    (c) =>
      c.placeHold(
        {
          hospital_id: "h_north",
          from: "2025-01-01",
          reason: "court_case",
          reference: "HC/1",
          asked_by: "Solicitors",
          review_on: "2027-04-22",
          ...CODE,
        },
        K,
      ),
    "POST",
    "/api/v1/platform/legal-holds",
    {
      hospital_id: "h_north",
      from: "2025-01-01",
      reason: "court_case",
      reference: "HC/1",
      asked_by: "Solicitors",
      review_on: "2027-04-22",
      mfa_code: "123456",
    },
  ],
  [
    "getHold",
    (c) => c.getHold("hold_hv"),
    "GET",
    "/api/v1/platform/legal-holds/hold_hv",
    undefined,
  ],
  [
    "editHold",
    (c) => c.editHold("hold_hv", { note: null, version: 2 }, K),
    "PATCH",
    "/api/v1/platform/legal-holds/hold_hv",
    { note: null, version: 2 },
  ],
  [
    "requestLift",
    (c) =>
      c.requestLift(
        "hold_hv",
        { reason: "case_closed", authority: "Letter", ...CODE },
        K,
      ),
    "POST",
    "/api/v1/platform/legal-holds/hold_hv/lift",
    { reason: "case_closed", authority: "Letter", mfa_code: "123456" },
  ],
  [
    "approveLift",
    (c) => c.approveLift("hold_hv", { version: 3, ...CODE }, K),
    "POST",
    "/api/v1/platform/legal-holds/hold_hv/lift/approve",
    { version: 3, mfa_code: "123456" },
  ],
  [
    "cancelLift",
    (c) => c.cancelLift("hold_hv", { version: 3 }, K),
    "POST",
    "/api/v1/platform/legal-holds/hold_hv/lift/cancel",
    { version: 3 },
  ],
  [
    "undoLift",
    (c) => c.undoLift("hold_hv", { version: 4, backup_code: "AAAA-BBBB" }, K),
    "POST",
    "/api/v1/platform/legal-holds/hold_hv/lift/undo",
    { version: 4, backup_code: "AAAA-BBBB" },
  ],
  [
    "getSettings",
    (c) => c.getSettings(),
    "GET",
    "/api/v1/platform/settings",
    undefined,
  ],
  [
    "previewRetention",
    (c) => c.previewRetention("pending_corrections", 90),
    "GET",
    "/api/v1/platform/settings/retention/pending_corrections/preview?days=90",
    undefined,
  ],
  [
    "setRetention",
    (c) =>
      c.setRetention(
        "records",
        { days: 1095, reason: "Agreed", version: 2, ...CODE },
        K,
      ),
    "PUT",
    "/api/v1/platform/settings/retention/records",
    { days: 1095, reason: "Agreed", version: 2, mfa_code: "123456" },
  ],
  [
    "setCleanUpPaused",
    (c) =>
      c.setCleanUpPaused(
        { paused: true, reason: "Audit", version: 1, ...CODE },
        K,
      ),
    "PUT",
    "/api/v1/platform/settings/retention-pause",
    { paused: true, reason: "Audit", version: 1, mfa_code: "123456" },
  ],
  [
    "setTriage",
    (c) =>
      c.setTriage(
        {
          enabled: true,
          reason: "Ready",
          clinical_signoff: "Dr Eze, ref CS-12",
          version: 1,
          ...CODE,
        },
        K,
      ),
    "PUT",
    "/api/v1/platform/settings/triage",
    {
      enabled: true,
      reason: "Ready",
      clinical_signoff: "Dr Eze, ref CS-12",
      version: 1,
      mfa_code: "123456",
    },
  ],
  [
    "approveRequest",
    (c) => c.approveRequest("req_1", { version: 3, ...CODE }, K),
    "POST",
    "/api/v1/platform/settings/requests/req_1/approve",
    { version: 3, mfa_code: "123456" },
  ],
  [
    "cancelRequest",
    (c) => c.cancelRequest("req_1", { version: 3 }, K),
    "POST",
    "/api/v1/platform/settings/requests/req_1/cancel",
    { version: 3 },
  ],
  [
    "resetFeedbackBuffer",
    (c) => c.resetFeedbackBuffer({ reason: "Training data", ...CODE }, K),
    "POST",
    "/api/v1/platform/settings/feedback-buffer/reset",
    { reason: "Training data", mfa_code: "123456" },
  ],
  [
    "listConnectorTypes",
    (c) => c.listConnectorTypes(),
    "GET",
    "/api/v1/platform/emr/connector-types",
    undefined,
  ],
  [
    "listConnections",
    (c) => c.listConnections({ hospital: "h_havana", state: "off" }),
    "GET",
    "/api/v1/platform/emr/connections?hospital=h_havana&state=off",
    undefined,
  ],
  [
    "getConnection",
    (c) => c.getConnection("emr_hv1"),
    "GET",
    "/api/v1/platform/emr/connections/emr_hv1",
    undefined,
  ],
  [
    "addConnection",
    (c) =>
      c.addConnection(
        "h_westfield",
        {
          type: "fhir_r4",
          source_label: "Main record",
          base_url: "https://records.westfield.example/fhir",
          settings: { client_id: "a" },
          credentials: { private_key: "k" },
          ...CODE,
        },
        K,
      ),
    "POST",
    "/api/v1/platform/hospitals/h_westfield/emr/connections",
    {
      type: "fhir_r4",
      source_label: "Main record",
      base_url: "https://records.westfield.example/fhir",
      settings: { client_id: "a" },
      credentials: { private_key: "k" },
      mfa_code: "123456",
    },
  ],
  [
    "updateConnection",
    (c) =>
      c.updateConnection(
        "emr_hv1",
        { source_label: "Main", version: 2, ...CODE },
        K,
      ),
    "PATCH",
    "/api/v1/platform/emr/connections/emr_hv1",
    { source_label: "Main", version: 2, mfa_code: "123456" },
  ],
  [
    "setConnectionEnabled",
    (c) =>
      c.setConnectionEnabled(
        "emr_hv1",
        { enabled: false, version: 2, backup_code: "AAAA-BBBB" },
        K,
      ),
    "PUT",
    "/api/v1/platform/emr/connections/emr_hv1/enabled",
    { enabled: false, version: 2, backup_code: "AAAA-BBBB" },
  ],
  [
    "testConnection",
    (c) => c.testConnection("emr_hv1", K),
    "POST",
    "/api/v1/platform/emr/connections/emr_hv1/test",
    undefined,
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
    // Only the poll is marked as background.
    expect(
      fetchImpl.mock.calls.map(
        ([, init]) =>
          (init?.headers as Record<string, string>)["X-MHAI-Background"],
      ),
    ).toEqual(["1", undefined, undefined, undefined]);
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

  it("only getHealth({background: true}) is marked as background", async () => {
    await client().getHealth();
    await client().getHealth({ background: false });
    await client().getHealth({ background: true });
    await client().listJobs({});
    await client().retryJobs({ ids: ["job_a"] }, K);
    await client().cancelJobs(
      { ids: ["job_a"], reason: "cant_succeed", ...CODE },
      K,
    );
    expect(
      fetchImpl.mock.calls.map(
        ([, init]) =>
          (init?.headers as Record<string, string>)["X-MHAI-Background"],
      ),
    ).toEqual([undefined, undefined, "1", undefined, undefined, undefined]);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/platform/health",
      "/api/v1/platform/health",
      "/api/v1/platform/health",
      "/api/v1/platform/jobs",
      "/api/v1/platform/jobs/retry",
      "/api/v1/platform/jobs/cancel",
    ]);
  });

  it("the connections list sends hospital and state, and leaves out unset ones", async () => {
    await client().listConnections({});
    await client().listConnections({ state: "not_connected" });
    await client().listConnections({ hospital: "h_a b", state: "all" });
    await client().getConnection("emr/../x");
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/platform/emr/connections",
      "/api/v1/platform/emr/connections?state=not_connected",
      "/api/v1/platform/emr/connections?hospital=h_a+b&state=all",
      "/api/v1/platform/emr/connections/emr%2F..%2Fx",
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
    await client().listHolds({});
    await client().approveLift("a/b", { version: 1, ...CODE }, K);
    await client().approveRequest("a/b", { version: 1, ...CODE }, K);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/platform/hospitals",
      "/api/v1/platform/activity",
      "/api/v1/platform/hospitals/a%20b%2Fc",
      "/api/v1/platform/analytics/changes/a%2Fb/series?period=30d",
      "/api/v1/platform/analytics/changes/a%2Fb/follow-up",
      "/api/v1/platform/legal-holds",
      "/api/v1/platform/legal-holds/a%2Fb/lift/approve",
      "/api/v1/platform/settings/requests/a%2Fb/approve",
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

  describe("the audit log", () => {
    it("listAudit sends type as a comma list, flagged only when true, and limit=50", async () => {
      await client().listAudit({ type: ["sign_in", "staff"], flagged: true });
      await client().listAudit({ flagged: false, type: [] });
      expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
        "/api/v1/platform/audit?type=sign_in%2Cstaff&flagged=true&limit=50",
        "/api/v1/platform/audit?limit=50",
      ]);
    });

    it("writes carry an Idempotency-Key", async () => {
      await client().reportUndisplayable(["ev_1"], { idempotencyKey: "k-1" });
      await client().startCheck({ idempotencyKey: "k-2" });
      await client().createExport(
        { kind: "events", filters: {}, reason: "other", ...CODE },
        { idempotencyKey: "k-3" },
      );
      await client().addOutcome(
        "run_1",
        { note: "n", version: 1 },
        { idempotencyKey: "k-4" },
      );
      const keys = fetchImpl.mock.calls.map(
        ([, init]) =>
          (init?.headers as Record<string, string>)["Idempotency-Key"],
      );
      expect(keys).toEqual(["k-1", "k-2", "k-3", "k-4"]);
    });

    it("the integrity status and a run are background reads, the rest are not", async () => {
      const c = client();
      await c.getIntegrityStatus();
      await c.getRun("run_1");
      await c.listRuns();
      await c.listAudit({});
      expect(
        fetchImpl.mock.calls.map(
          ([, init]) =>
            (init?.headers as Record<string, string>)["X-MHAI-Background"],
        ),
      ).toEqual(["1", "1", undefined, undefined]);
    });

    it("too_many_rows becomes TooManyRowsError with rows", async () => {
      reply(() =>
        Response.json({ code: "too_many_rows", rows: 62310 }, { status: 422 }),
      );
      const e = await client()
        .createExport(
          { kind: "events", filters: {}, reason: "other", ...CODE },
          K,
        )
        .catch((x) => x);
      expect(e).toBeInstanceOf(TooManyRowsError);
      expect(e).toMatchObject({
        status: 422,
        code: "too_many_rows",
        rows: 62310,
      });
      // Without a whole, non-negative rows it is an ordinary refusal.
      reply(() =>
        Response.json({ code: "too_many_rows", rows: -5 }, { status: 422 }),
      );
      const plain = await client()
        .listAudit({})
        .catch((x) => x);
      expect(plain).not.toBeInstanceOf(TooManyRowsError);
      expect(plain).toMatchObject({ status: 422, code: "too_many_rows" });
    });

    it("downloadExport returns the blob, and a 410 throws ApiError gone", async () => {
      reply(
        () =>
          new Response("a,b\n", { headers: { "Content-Type": "text/csv" } }),
      );
      const blob = await client().downloadExport("ex_1");
      expect(await blob.text()).toBe("a,b\n");
      const [url, init] = call();
      expect(url).toBe("/api/v1/platform/audit/exports/ex_1/file");
      expect(init).toMatchObject({
        credentials: "same-origin",
        cache: "no-store",
      });

      reply(() => Response.json({ code: "gone" }, { status: 410 }));
      const e = await client()
        .downloadExport("ex_1")
        .catch((x) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ status: 410, code: "gone" });

      reply(() => new Response(null, { status: 401 }));
      await expect(client().downloadExport("ex_1")).rejects.toMatchObject({
        status: 401,
      });
      expect(unauthorized).toHaveBeenCalledTimes(1);
    });
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
