import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { AlertHandledError, ApiError } from "./errors";
import { createLiveAlertsClient } from "./live-alerts";
import { patientFromAlert } from "../notifications/ask";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAlertsClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const header = (n: number, name: string) =>
  (call(n)[1].headers as Record<string, string>)[name];
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

/** One alert exactly as core openapi 1.20.0 sends it (synthetic). */
const coreAlert = (over: Record<string, unknown> = {}) => ({
  id: "0b8c7a9e-6a43-4b8e-9a3c-1f2d3e4f5a6b",
  severity: "critical",
  status: "new",
  finding: {
    name: "Potassium",
    value: "6.93",
    unit: "mmol/L",
    flag: "high",
    reference_range: "3.5–5.1",
    recorded_at: "2026-11-14T03:50:00.123456789Z",
    code_system: "loinc",
    standardised: true,
  },
  likely_causes: [],
  patient: {
    full_name: "Synthetic Patient",
    mrn: "SYN-0001",
    location: { kind: "admitted", ward: "Ward 3" },
  },
  age: 67,
  sex: "unknown",
  source_label: "Synthetic record",
  emr_link: null,
  handled_by: null,
  handled_at: null,
  dismiss_reason: null,
  created_at: "2026-11-14T03:51:00Z",
  category: { id: "blood_chemistry", label: "Blood chemistry" },
  routing: { to_you: false, queue: true },
  arrived_late: false,
  preliminary: false,
  amended: null,
  withdrawn: null,
  ...over,
});
const corePage = (alerts: unknown[] = []) => ({
  alerts,
  next_cursor: null,
  sources: ["Synthetic record"],
  queue: true,
  sources_status: [
    { label: "Synthetic record", status: "current", last_update_at: null },
  ],
  grouped: null,
});
const SETTINGS = { alert_popups: true, correction_popups: true };
/** The right reply for each path, as core sends it. */
const byPath = async (input: RequestInfo | URL) => {
  const u = String(input);
  if (u.includes("unread-count")) return Response.json({ count: 2 });
  if (u.includes("notification-settings")) return Response.json(SETTINGS);
  if (/acknowledge|dismiss/.test(u)) return Response.json(coreAlert());
  return Response.json(corePage());
};

describe("live alerts client", () => {
  it("reads alerts, the count and the settings through the proxy", async () => {
    fetchImpl.mockImplementation(byPath);
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

  it("sends sent_to in the query", async () => {
    fetchImpl.mockImplementation(byPath);
    await client().listAlerts({ sent_to: "queue" });
    await client().listAlerts({ status: "new", sent_to: "you", cursor: "20" });
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/alerts?sent_to=queue",
      "/api/v1/alerts?status=new&sent_to=you&cursor=20",
    ]);
  });

  it("returns the alert page as core sent it, record link included", async () => {
    const page = corePage([
      coreAlert({ emr_link: "https://record.example/p/1" }),
    ]);
    fetchImpl.mockImplementation(async () => Response.json(page));
    const got = await client().listAlerts({});
    expect(got.alerts[0]!.emr_link).toBe("https://record.example/p/1");
    expect(got.sources_status).toEqual(page.sources_status);
  });

  it("reads a missing bed or clinic as null, and a patient with no MRN", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        corePage([
          coreAlert(),
          coreAlert({
            patient: {
              full_name: "Synthetic Two",
              mrn: null,
              location: { kind: "outpatient" },
            },
          }),
        ]),
      ),
    );
    const { alerts } = await client().listAlerts({});
    expect(alerts[0]!.patient.location).toEqual({
      kind: "admitted",
      ward: "Ward 3",
      bed: null,
    });
    expect(alerts[1]!.patient).toEqual({
      full_name: "Synthetic Two",
      mrn: null,
      location: { kind: "outpatient", clinic: null },
    });
  });

  it("reads the patient's id when sent, and fails closed on a malformed one", async () => {
    const PID = "6f1c2a01-5e1d-4c3b-9a7e-000000000001";
    const patient = (id: unknown) => ({
      patient: {
        id,
        full_name: "Synthetic Patient",
        mrn: "SYN-0001",
        location: null,
      },
    });
    fetchImpl.mockImplementation(async () =>
      Response.json(corePage([coreAlert(patient(PID))])),
    );
    expect((await client().listAlerts({})).alerts[0]!.patient.id).toBe(PID);
    for (const bad of [
      PID.toUpperCase(),
      "00000000-0000-0000-0000-000000000000",
      "SYN-0001",
      7,
    ]) {
      fetchImpl.mockImplementation(async () =>
        Response.json(corePage([coreAlert(patient(bad))])),
      );
      await expect(client().listAlerts({})).rejects.toMatchObject({
        status: 502,
      });
    }
  });

  it("reads a null patient id (no longer active) as no link, and keeps the alert", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        corePage([
          coreAlert({
            patient: {
              id: null,
              full_name: "Synthetic Patient",
              mrn: "SYN-0001",
              location: null,
            },
          }),
        ]),
      ),
    );
    const [a] = (await client().listAlerts({})).alerts;
    expect(a!.patient.id).toBeNull();
    expect(patientFromAlert(a!)).toBeNull();
  });

  it("reads a withdrawn and an amended alert", async () => {
    const withdrawn = coreAlert({
      status: "dismissed",
      withdrawn: "source_retracted",
      amended: { previous_value: "6.1", amended_at: "2026-11-14T04:00:00Z" },
    });
    fetchImpl.mockImplementation(async () =>
      Response.json(corePage([withdrawn])),
    );
    const { alerts } = await client().listAlerts({});
    expect(alerts[0]).toMatchObject({
      withdrawn: "source_retracted",
      amended: { previous_value: "6.1" },
    });
  });

  it.each([
    ["an unknown field", corePage([coreAlert({ extra: "x" })])],
    [
      "a field core always sends, missing",
      { ...corePage(), sources_status: undefined },
    ],
    [
      "a cause marked high (never sent in v1)",
      corePage([
        coreAlert({
          likely_causes: [{ label: "x", confidence: "high", evidence: [] }],
        }),
      ]),
    ],
    ["an unknown severity", corePage([coreAlert({ severity: "severe" })])],
    [
      "a time without a zone",
      corePage([coreAlert({ created_at: "2026-11-14T03:51:00" })]),
    ],
    [
      "the old assumed page (no queue)",
      { alerts: [], next_cursor: null, sources: [] },
    ],
  ])("fails closed (502) on %s", async (_, body) => {
    fetchImpl.mockImplementation(async () => Response.json(body));
    await expect(client().listAlerts({})).rejects.toMatchObject({
      status: 502,
      code: "bad_gateway",
    });
  });

  it("fails closed on a count or settings reply of another shape", async () => {
    fetchImpl.mockImplementation(async () => Response.json({ count: -1 }));
    await expect(client().getUnreadCount()).rejects.toMatchObject({
      status: 502,
    });
    fetchImpl.mockImplementation(async () =>
      Response.json({ alert_popups: true }),
    );
    await expect(client().getNotificationSettings()).rejects.toMatchObject({
      status: 502,
    });
  });

  it("acknowledges, dismisses and saves settings with the idempotency key", async () => {
    fetchImpl.mockImplementation(byPath);
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
