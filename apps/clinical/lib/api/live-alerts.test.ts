import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { AlertHandledError, ApiError } from "./errors";
import { createLiveAlertsClient } from "./live-alerts";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAlertsClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const header = (n: number, name: string) =>
  (call(n)[1].headers as Record<string, string>)[name];
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

describe("live alerts client", () => {
  it("reads alerts, the count and the settings through the proxy", async () => {
    fetchImpl.mockImplementation(async () => Response.json({}));
    await client().listAlerts({});
    await client().listAlerts({
      status: "new",
      severity: "critical",
      source: "Main record",
      cursor: "20",
      limit: 20,
    });
    await client().getUnreadCount();
    await client().getNotificationSettings();
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/alerts",
      "/api/v1/alerts?status=new&severity=critical&source=Main+record&cursor=20&limit=20",
      "/api/v1/alerts/unread-count",
      "/api/v1/me/notification-settings",
    ]);
    expect(call()[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("returns the alert page as the API sent it, record link included", async () => {
    const page = {
      alerts: [{ id: "al-1", emr_link: "https://record.example/p/1" }],
      next_cursor: null,
      sources: [],
    };
    fetchImpl.mockImplementation(async () => Response.json(page));
    expect(await client().listAlerts({})).toEqual(page);
  });

  it("acknowledges, dismisses and saves settings with the idempotency key", async () => {
    fetchImpl.mockImplementation(async () => Response.json({ id: "a 1" }));
    await client().acknowledgeAlert("a 1", { idempotencyKey: "k1" });
    await client().dismissAlert(
      "a 1",
      { reason: "already_known", note: "Known." },
      { idempotencyKey: "k2" },
    );
    await client().updateNotificationSettings(
      { alert_popups: false },
      { idempotencyKey: "k3" },
    );
    expect(call(0)[0]).toBe("/api/v1/alerts/a%201/acknowledge");
    expect(call(0)[1]).toMatchObject({ method: "POST" });
    expect(call(0)[1].body).toBeUndefined();
    expect(header(0, "Idempotency-Key")).toBe("k1");
    expect(call(1)[0]).toBe("/api/v1/alerts/a%201/dismiss");
    expect(JSON.parse(call(1)[1].body as string)).toEqual({
      reason: "already_known",
      note: "Known.",
    });
    expect(header(1, "Idempotency-Key")).toBe("k2");
    expect(call(2)[0]).toBe("/api/v1/me/notification-settings");
    expect(call(2)[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(call(2)[1].body as string)).toEqual({
      alert_popups: false,
    });
    expect(header(2, "Idempotency-Key")).toBe("k3");
  });

  it("builds the who-and-when error from a 409 (Review Focus 1)", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        {
          code: "already_handled",
          status: "dismissed",
          handled_by: { display_name: "Nurse Bello" },
          handled_at: "2026-10-17T08:59:00.000Z",
        },
        { status: 409 },
      ),
    );
    const e = await client()
      .acknowledgeAlert("al-1")
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AlertHandledError);
    expect(e).toMatchObject({
      status: 409,
      code: "already_handled",
      handled: {
        status: "dismissed",
        handled_by: { display_name: "Nurse Bello" },
        handled_at: "2026-10-17T08:59:00.000Z",
      },
    });
  });

  it("reads a sparse 409 as handled by someone unnamed", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json({ code: "already_handled" }, { status: 409 }),
    );
    await expect(
      client().dismissAlert("al-1", { reason: "other" }),
    ).rejects.toMatchObject({
      handled: { status: "handled", handled_by: null, handled_at: null },
    });
  });

  it("keeps only the code for other refusals, signs out on 401 and reports no network", async () => {
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "not_found", detail: "x" }, { status: 404 }),
    );
    const e = await client()
      .listAlerts({})
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(AlertHandledError);
    expect(e).toMatchObject({ status: 404, code: "not_found" });
    fetchImpl.mockImplementationOnce(
      async () => new Response(null, { status: 401 }),
    );
    await expect(client().getUnreadCount()).rejects.toMatchObject({
      status: 401,
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);
    fetchImpl.mockImplementationOnce(async () => {
      throw new TypeError("offline");
    });
    await expect(client().getUnreadCount()).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });
});
