import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { ApiError } from "./errors";
import { createLiveAdminClient } from "./live-admin";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAdminClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
/** A fresh Response per call: a body can only be read once. */
const reply = (make: () => Response) =>
  fetchImpl.mockImplementation(async () => make());
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

describe("live admin client", () => {
  it("reads through the hospital routes", async () => {
    reply(() => Response.json([]));
    await client().listStaff();
    await client().getUsage("last_month");
    await client().getOversight();
    await client().listEligibleReviewers("c 1");
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/hospital/staff",
      "/api/v1/hospital/usage?period=last_month",
      "/api/v1/hospital/review-oversight",
      "/api/v1/hospital/corrections/c%201/eligible-reviewers",
    ]);
    expect(call()[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(call()[1].body).toBeUndefined();
  });

  it("returns what the API sent", async () => {
    reply(() => Response.json([{ id: "s-1" }]));
    await expect(client().listStaff()).resolves.toEqual([{ id: "s-1" }]);
  });

  it("puts only the filters that are set in the activity query", async () => {
    reply(() => Response.json({ events: [], next_cursor: null }));
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

  it("sends writes with their idempotency key", async () => {
    reply(() => Response.json({ id: "s-1" }));
    await client().updateStaff(
      "s-1",
      { version: 3, specialty: "Surgery" },
      { idempotencyKey: "k-1" },
    );
    expect(call()).toEqual([
      "/api/v1/hospital/staff/s-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ version: 3, specialty: "Surgery" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "k-1",
        }),
      }),
    ]);
    await client().staffAction("s-1", "reset-mfa", { idempotencyKey: "k-2" });
    expect(call(1)[0]).toBe("/api/v1/hospital/staff/s-1/reset-mfa");
    expect(call(1)[1].method).toBe("POST");
    expect(call(1)[1].body).toBeUndefined();
    await client().inviteStaff(
      { emails: ["a@b.org"], roles: ["clinician"], specialty: null },
      { idempotencyKey: "k-4" },
    );
    expect(call(2)[0]).toBe("/api/v1/hospital/staff/invites");
    await client().updateSettings({ version: 1, idle_timeout_minutes: 30 });
    expect(call(3)[0]).toBe("/api/v1/hospital/settings");
    expect(call(3)[1].method).toBe("PATCH");
  });

  it("removes with DELETE, the two-step code in the body, and accepts an empty 204", async () => {
    reply(() => new Response(null, { status: 204 }));
    await expect(
      client().removeStaff(
        "s-1",
        { mfaCode: "123456" },
        { idempotencyKey: "k-3" },
      ),
    ).resolves.toBeUndefined();
    expect(call()).toEqual([
      "/api/v1/hospital/staff/s-1",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ mfa_code: "123456" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "k-3",
        }),
      }),
    ]);
    await client().removeStaff(
      "s 2",
      { backupCode: "ABCD-1234" },
      { idempotencyKey: "k-5" },
    );
    expect(call(1)[0]).toBe("/api/v1/hospital/staff/s%202");
    expect(call(1)[1].body).toBe(JSON.stringify({ backup_code: "ABCD-1234" }));
    await client().assignReviewer("c-1", "s-2");
    expect(call(2)).toEqual([
      "/api/v1/hospital/corrections/c-1/assign",
      expect.objectContaining({ body: JSON.stringify({ staff_id: "s-2" }) }),
    ]);
    await client().remindReviewers("c-1");
    expect(call(3)[0]).toBe("/api/v1/hospital/corrections/c-1/remind");
  });

  it.each([
    [403, "mfa_required"],
    [403, "mfa_invalid"],
    [429, "mfa_locked"],
  ])("passes a remove refusal through as %i %s", async (status, code) => {
    reply(() => Response.json({ code }, { status }));
    await expect(
      client().removeStaff(
        "s-1",
        { mfaCode: "000000" },
        { idempotencyKey: "k" },
      ),
    ).rejects.toEqual(new ApiError(status, code));
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("turns refusals into coded errors", async () => {
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "last_admin" }, { status: 409 }),
    );
    await expect(client().staffAction("s-1", "deactivate")).rejects.toEqual(
      new ApiError(409, "last_admin"),
    );
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

  it("hands back the usage alerts block as the API sent it", async () => {
    const body = { period: "this_month", alerts: { unavailable: true } };
    reply(() => Response.json(body));
    expect(await client().getUsage("this_month")).toEqual(body);
  });

  it("treats usage with no alerts key as switched off", async () => {
    reply(() => Response.json({ period: "this_month", consultations: 1 }));
    const usage = await client().getUsage("this_month");
    expect("alerts" in usage).toBe(false);
    expect(usage.alerts ?? null).toBeNull();
  });
});
