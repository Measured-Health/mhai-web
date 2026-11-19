import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { CODE, makeEvent, makeStaff, mockAdminAs } from "@/tests/admin";
import { ApiError } from "./errors";
import { createLiveAdminClient } from "./live-admin";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAdminClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
/** A fresh Response per call: a body can only be read once. */
const reply = (make: () => Response) =>
  fetchImpl.mockImplementation(async () => make());
const json = (body: unknown) => reply(() => Response.json(body));
const bad = new ApiError(502, "bad_gateway");
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

const sample = mockAdminAs(DEMO_EMAILS.director);
const staff = makeStaff();
const usage = () => sample.getUsage("this_month");

describe("live admin client (core 1.33.0)", () => {
  it("reads through the hospital routes", async () => {
    json([]);
    await client().listStaff();
    await client().getOversight();
    await client().listEligibleReviewers("c 1");
    json(await usage());
    await client().getUsage("last_month");
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/hospital/staff",
      "/api/v1/hospital/review-oversight",
      "/api/v1/hospital/corrections/c%201/eligible-reviewers",
      "/api/v1/hospital/usage?period=last_month",
    ]);
    expect(call()[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(call()[1].body).toBeUndefined();
  });

  it("returns what core sent when it matches the contract", async () => {
    json([staff]);
    await expect(client().listStaff()).resolves.toEqual([staff]);
    const settings = await sample.getSettings();
    json(settings);
    await expect(client().getSettings()).resolves.toEqual(settings);
    const u = await usage();
    json(u);
    await expect(client().getUsage("this_month")).resolves.toEqual(u);
    const page = { events: [makeEvent()], next_cursor: "50" };
    json(page);
    await expect(client().listActivity({})).resolves.toEqual(page);
  });

  it("reads an invited person as core sends one: active, with invite dates", async () => {
    const invited = {
      ...staff,
      status: "active",
      sign_in: null,
      joined_at: null,
      invited_at: "2026-10-09T10:00:00Z",
      invite_expires_at: "2026-10-16T10:00:00Z",
    };
    json([invited, { ...invited, id: "s-revoked", invite_expires_at: null }]);
    await expect(client().listStaff()).resolves.toHaveLength(2);
  });

  it.each([
    ["an unknown key", [{ ...staff, nickname: "x" }]],
    ["an unknown status", [{ ...staff, status: "pending" }]],
    // Core adds no status or issue for invites (core 1.33.0).
    ["an invited status", [{ ...staff, status: "invited" }]],
    ["an expired-invite issue", [{ ...staff, issues: ["invite_expired"] }]],
    ["an unknown issue", [{ ...staff, issues: ["locked"] }]],
    ["an invite date that isn't a date", [{ ...staff, invited_at: "soon" }]],
    ["a link in the list", [{ ...staff, link: null }]],
    ["reviewing by specialty", [{ ...staff, review_specialties: ["Surgery"] }]],
    ["a missing field", [{ ...staff, version: undefined }]],
    ["no list at all", { staff: [] }],
  ])("refuses a staff list with %s (502)", async (_n, body) => {
    json(body);
    await expect(client().listStaff()).rejects.toEqual(bad);
  });

  it("refuses an activity event with a device, a count or an extra field (502)", async () => {
    for (const e of [
      { ...makeEvent(), device: "Chrome on Windows" },
      { ...makeEvent(), count: 5 },
      { ...makeEvent(), roles_added: ["clinician"] },
      { ...makeEvent(), question_text: "chest pain" },
    ]) {
      json({ events: [e], next_cursor: null });
      await expect(client().listActivity({})).rejects.toEqual(bad);
    }
  });

  it("refuses usage alerts in the old shape, or missing (502)", async () => {
    const u = await usage();
    for (const alerts of [
      { ...(u.alerts as object), series: { bucket: "day", points: [] } },
      { total: { value: 3, suppressed: false } },
      { unavailable: false },
    ]) {
      json({ ...u, alerts });
      await expect(client().getUsage("this_month")).rejects.toEqual(bad);
    }
    const { alerts: _gone, ...noAlerts } = u;
    void _gone;
    json(noAlerts);
    await expect(client().getUsage("this_month")).rejects.toEqual(bad);
    json({ ...u, alerts: null });
    expect((await client().getUsage("this_month")).alerts).toBeNull();
    json({ ...u, alerts: { unavailable: true } });
    expect((await client().getUsage("this_month")).alerts).toEqual({
      unavailable: true,
    });
  });

  it("refuses a hidden count sent with its number (502)", async () => {
    const u = await usage();
    const a = u.alerts as { total: unknown };
    json({ ...u, alerts: { ...a, total: { value: 12, suppressed: true } } });
    await expect(client().getUsage("this_month")).rejects.toEqual(bad);
  });

  it("puts only the filters that are set in the activity query", async () => {
    json({ events: [], next_cursor: null });
    await client().listActivity({});
    await client().listActivity({
      type: "security",
      person: "Dr. O'Neil & co",
      flagged: true,
      from: "2026-10-01T00:00:00.000Z",
      cursor: "50",
    });
    expect(call(0)[0]).toBe("/api/v1/hospital/activity");
    expect(call(1)[0]).toBe(
      "/api/v1/hospital/activity?type=security&person=Dr.+O%27Neil+%26+co&from=2026-10-01T00%3A00%3A00.000Z&flagged=true&cursor=50",
    );
  });

  it("sends every staff write with the step-up code and its idempotency key", async () => {
    json(staff);
    await client().updateStaff(
      "s-1",
      { version: 3, specialty: "Surgery" },
      CODE,
      { idempotencyKey: "k-1" },
    );
    expect(call()).toEqual([
      "/api/v1/hospital/staff/s-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          version: 3,
          specialty: "Surgery",
          mfa_code: CODE.mfaCode,
        }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "k-1",
        }),
      }),
    ]);
    await client().staffAction(
      "s 1",
      "deactivate",
      { backupCode: "ABCD-1234" },
      { idempotencyKey: "k-2" },
    );
    expect(call(1)[0]).toBe("/api/v1/hospital/staff/s%201/deactivate");
    expect(call(1)[1].method).toBe("POST");
    expect(call(1)[1].body).toBe(JSON.stringify({ backup_code: "ABCD-1234" }));
    await client().staffAction("s-1", "reactivate", CODE);
    expect(call(2)[0]).toBe("/api/v1/hospital/staff/s-1/reactivate");
    expect(call(2)[1].body).toBe(JSON.stringify({ mfa_code: CODE.mfaCode }));
  });

  it("sends a reset or a new invite with the code, and keeps the link apart from the row", async () => {
    const link = {
      url: "/reset-password?token=abc",
      expires_at: "2026-10-16T10:30:00Z",
    };
    json({ ...staff, link });
    const r = await client().sendLink("s 1", "password-reset", CODE, {
      idempotencyKey: "k-1",
    });
    expect(r).toEqual({ staff, link });
    expect(r.staff).not.toHaveProperty("link");
    expect(call()).toEqual([
      "/api/v1/hospital/staff/s%201/password-reset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mfa_code: CODE.mfaCode }),
        headers: expect.objectContaining({ "Idempotency-Key": "k-1" }),
      }),
    ]);
    json({ ...staff, link: null });
    expect(await client().sendLink("s-1", "resend-invite", CODE)).toEqual({
      staff,
      link: null,
    });
    expect(call(1)[0]).toBe("/api/v1/hospital/staff/s-1/resend-invite");
    json(staff);
    await client().staffAction("s-1", "reset-mfa", CODE);
    expect(call(2)[0]).toBe("/api/v1/hospital/staff/s-1/reset-mfa");
    expect(call(2)[1].body).toBe(JSON.stringify({ mfa_code: CODE.mfaCode }));
  });

  it.each([
    ["no link", { ...staff }],
    [
      "a link to another site's path",
      {
        ...staff,
        link: { url: "//evil.test/x", expires_at: "2026-10-16T10:30:00Z" },
      },
    ],
    [
      "a script link",
      {
        ...staff,
        link: {
          url: "javascript:alert(1)",
          expires_at: "2026-10-16T10:30:00Z",
        },
      },
    ],
    [
      "a link with an extra key",
      {
        ...staff,
        link: {
          url: "/reset-password?token=a",
          expires_at: "2026-10-16T10:30:00Z",
          token: "a",
        },
      },
    ],
    [
      "a link without an end",
      { ...staff, link: { url: "/reset-password?token=a" } },
    ],
  ])("refuses a reply with %s (502)", async (_n, body) => {
    json(body);
    await expect(
      client().sendLink("s-1", "password-reset", CODE),
    ).rejects.toEqual(bad);
  });

  it("accepts a full https link", async () => {
    const link = {
      url: "https://clinical.example.org/reset-password?token=abc",
      expires_at: "2026-10-16T10:30:00Z",
    };
    json({ ...staff, link });
    expect(
      (await client().sendLink("s-1", "password-reset", CODE)).link,
    ).toEqual(link);
  });

  it("sends the two-step reminder without a code", async () => {
    json(staff);
    await client().remindStaff("s-1", { idempotencyKey: "k" });
    expect(call()[0]).toBe("/api/v1/hospital/staff/s-1/remind");
    expect(call()[1]).toMatchObject({ method: "POST", body: "{}" });
  });

  it("removes with a DELETE that carries the code, and takes a 204", async () => {
    reply(() => new Response(null, { status: 204 }));
    await expect(
      client().removeStaff("s 1", CODE, { idempotencyKey: "k" }),
    ).resolves.toBeUndefined();
    expect(call()).toEqual([
      "/api/v1/hospital/staff/s%201",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ mfa_code: CODE.mfaCode }),
      }),
    ]);
  });

  it("invites with the code and splits each invited person from their link", async () => {
    const invitedRow = {
      ...staff,
      status: "active",
      sign_in: null,
      joined_at: null,
      invited_at: "2026-10-16T10:00:00Z",
      invite_expires_at: "2026-10-23T10:00:00Z",
    };
    const link = {
      url: "/reset-password?token=abc",
      expires_at: "2026-10-23T10:00:00Z",
    };
    json({
      invited: [{ ...invitedRow, link }],
      skipped: [{ email: "b@x.org", reason: "already_staff" }],
    });
    const r = await client().inviteStaff(
      { emails: ["a@x.org", "b@x.org"], roles: ["clinician"], specialty: null },
      CODE,
      { idempotencyKey: "k" },
    );
    expect(r).toEqual({
      invited: [{ staff: invitedRow, link }],
      skipped: [{ email: "b@x.org", reason: "already_staff" }],
    });
    expect(call()).toEqual([
      "/api/v1/hospital/staff/invites",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          emails: ["a@x.org", "b@x.org"],
          roles: ["clinician"],
          specialty: null,
          mfa_code: CODE.mfaCode,
        }),
      }),
    ]);
    const elsewhere = {
      invited: [],
      skipped: [{ email: "c@x.org", reason: "not_available" }],
    };
    json(elsewhere);
    await expect(
      client().inviteStaff({ emails: ["c@x.org"], roles: ["clinician"] }, CODE),
    ).resolves.toEqual(elsewhere);
    json({
      invited: [],
      skipped: [{ email: "x", reason: "domain_not_allowed" }],
    });
    await expect(
      client().inviteStaff({ emails: ["x"], roles: ["clinician"] }, CODE),
    ).rejects.toEqual(bad);
  });

  it("reminds a correction's reviewers and assigns or clears one", async () => {
    reply(() => new Response(null, { status: 204 }));
    await client().remindReviewers("c 1", { idempotencyKey: "k" });
    await client().assignReviewer("c-1", "s-2");
    await client().assignReviewer("c-1", null);
    expect(fetchImpl.mock.calls.map((c) => [c[0], c[1]?.body])).toEqual([
      ["/api/v1/hospital/corrections/c%201/remind", "{}"],
      ["/api/v1/hospital/corrections/c-1/assign", '{"staff_id":"s-2"}'],
      ["/api/v1/hospital/corrections/c-1/assign", '{"staff_id":null}'],
    ]);
  });

  it.each([
    [503, "no_delivery"],
    [410, "invalid_token"],
    [501, "not_implemented"],
    [409, "conflict"],
    [429, "rate_limited"],
  ])("passes a new refusal through as %i %s", async (status, code) => {
    reply(() => Response.json({ code }, { status }));
    await expect(
      client().sendLink("s-1", "resend-invite", CODE),
    ).rejects.toMatchObject({ status, code });
  });

  it("sends the code with a settings edit only when it is given", async () => {
    json(await sample.getSettings());
    await client().updateSettings(
      { version: 1, allow_trust_device: false },
      null,
    );
    expect(call(0)[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ version: 1, allow_trust_device: false }),
    });
    await client().updateSettings(
      { version: 1, idle_timeout_minutes: 30 },
      CODE,
    );
    expect(call(1)[1].body).toBe(
      JSON.stringify({
        version: 1,
        idle_timeout_minutes: 30,
        mfa_code: CODE.mfaCode,
      }),
    );
  });

  it.each([
    [403, "mfa_required"],
    [403, "mfa_invalid"],
    [429, "mfa_locked"],
    [403, "self_change"],
    [409, "last_admin"],
    [409, "analysis_off"],
    [409, "analyst_cap"],
    [422, "not_eligible"],
  ])("passes a refusal through as %i %s", async (status, code) => {
    reply(() => Response.json({ code }, { status }));
    await expect(
      client().updateStaff("s-1", { version: 1, roles: ["clinician"] }, CODE),
    ).rejects.toMatchObject({ status, code });
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("turns other refusals into coded errors", async () => {
    fetchImpl.mockImplementationOnce(
      async () => new Response("<html>boom</html>", { status: 500 }),
    );
    await expect(client().listStaff()).rejects.toEqual(
      new ApiError(500, "error"),
    );
    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    await expect(client().listStaff()).rejects.toEqual(
      new ApiError(0, "network"),
    );
  });

  it("signs out once on 401", async () => {
    reply(() => new Response(null, { status: 401 }));
    await expect(client().getSettings()).rejects.toEqual(
      new ApiError(401, "session_expired"),
    );
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });
});
