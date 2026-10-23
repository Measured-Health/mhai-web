import { describe, expect, it, vi } from "vitest";
import { ALERT_NOW, mockAlerts } from "@/tests/alerts";
import { AlertHandledError, ApiError } from "./errors";
import {
  ALERT_PAGE_SIZE,
  MOCK_ALERT_EVERY_MS,
  MOCK_ARRIVALS_MAX,
  MOCK_SOURCES,
  createMockAlerts,
} from "./mock-alerts";

const NOW_ISO = new Date(ALERT_NOW).toISOString();

describe("sample alerts", () => {
  it("has new, handled and dismissed alerts across severities and places", async () => {
    const { alerts, sources, next_cursor } = await mockAlerts().listAlerts({});
    expect(alerts).toHaveLength(8);
    expect(next_cursor).toBeNull();
    expect(sources).toEqual([...MOCK_SOURCES]);
    expect(new Set(alerts.map((a) => a.severity))).toEqual(
      new Set(["critical", "urgent", "info"]),
    );
    expect(new Set(alerts.map((a) => a.status))).toEqual(
      new Set(["new", "handled", "dismissed"]),
    );
    expect(
      new Set(alerts.map((a) => a.patient.location?.kind ?? "none")),
    ).toEqual(new Set(["admitted", "outpatient", "emergency", "none"]));
    expect(alerts.some((a) => !a.finding.standardised)).toBe(true);
    expect(alerts.some((a) => a.likely_causes.length === 0)).toBe(true);
    const times = alerts.map((a) => Date.parse(a.created_at));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("marks an unrecorded location as null, one form only", async () => {
    const { alerts } = await mockAlerts().listAlerts({});
    const unrecorded = alerts.filter((a) => a.patient.location === null);
    expect(unrecorded.map((a) => a.id)).toEqual(["al-104"]);
    expect(JSON.stringify(alerts)).not.toContain("not_recorded");
  });

  it("uses the hospital's own labels and opaque record links, never a vendor", async () => {
    const { alerts } = await mockAlerts().listAlerts({});
    for (const a of alerts) {
      expect(MOCK_SOURCES).toContain(a.source_label);
      expect(a.emr_link).toMatch(
        /^https:\/\/record\.example\/open\/[a-z0-9-]+$/,
      );
      expect(a.emr_link).not.toContain(a.patient.mrn);
    }
    expect(JSON.stringify(alerts)).not.toMatch(/\blab\b/i);
  });

  it("filters by status, severity and source", async () => {
    const m = mockAlerts();
    const ids = async (q: Parameters<typeof m.listAlerts>[0]) =>
      (await m.listAlerts(q)).alerts.map((a) => a.id);
    expect(await ids({ status: "new" })).toEqual([
      "al-101",
      "al-102",
      "al-103",
      "al-104",
      "al-105",
      "al-106",
    ]);
    expect(await ids({ status: "handled" })).toEqual(["al-107"]);
    expect(await ids({ status: "dismissed" })).toEqual(["al-108"]);
    expect(await ids({ status: "new", severity: "critical" })).toEqual([
      "al-101",
      "al-102",
    ]);
    expect(await ids({ status: "new", source: "Main record" })).toEqual([
      "al-101",
      "al-104",
    ]);
  });

  it("counts the new alerts", async () => {
    expect(await mockAlerts().getUnreadCount()).toEqual({ count: 6 });
  });

  it("brings a new sample alert every two minutes, up to a limit", async () => {
    let t = ALERT_NOW;
    const m = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    expect((await m.getUnreadCount()).count).toBe(6);
    t += MOCK_ALERT_EVERY_MS - 1;
    expect((await m.getUnreadCount()).count).toBe(6);
    t += 1;
    const first = (await m.listAlerts({ status: "new" })).alerts[0]!;
    expect(first).toMatchObject({
      id: "al-n1",
      severity: "urgent",
      status: "new",
      patient: { full_name: "Emeka Nnamdi" },
    });
    expect(Date.parse(first.created_at)).toBe(ALERT_NOW + MOCK_ALERT_EVERY_MS);
    t += MOCK_ALERT_EVERY_MS;
    expect((await m.listAlerts({ status: "new" })).alerts[0]).toMatchObject({
      id: "al-n2",
      severity: "critical",
      patient: { full_name: "Halima Garba" },
    });
    t += 1000 * MOCK_ALERT_EVERY_MS;
    expect((await m.getUnreadCount()).count).toBe(6 + MOCK_ARRIVALS_MAX);
  });

  it("pages with a cursor", async () => {
    let t = ALERT_NOW;
    const m = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 40 * MOCK_ALERT_EVERY_MS;
    const one = await m.listAlerts({ status: "new" });
    expect(one.alerts).toHaveLength(ALERT_PAGE_SIZE);
    expect(one.next_cursor).toBe(String(ALERT_PAGE_SIZE));
    const two = await m.listAlerts({
      status: "new",
      cursor: one.next_cursor!,
    });
    expect(two.alerts).toHaveLength(6 + MOCK_ARRIVALS_MAX - ALERT_PAGE_SIZE);
    expect(two.next_cursor).toBeNull();
    await expect(
      m.listAlerts({ cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("acknowledges as the signed-in clinician", async () => {
    const m = mockAlerts();
    const a = await m.acknowledgeAlert("al-101");
    expect(a).toMatchObject({
      id: "al-101",
      status: "handled",
      handled_by: { display_name: "Dr. Reyes" },
      handled_at: NOW_ISO,
      dismiss_reason: null,
    });
    expect((await m.listAlerts({ status: "handled" })).alerts[0]?.id).toBe(
      "al-101",
    );
    expect((await m.getUnreadCount()).count).toBe(5);
  });

  it("dismisses with a reason", async () => {
    const m = mockAlerts();
    const a = await m.dismissAlert("al-105", {
      reason: "already_known",
      note: "Known kidney disease.",
    });
    expect(a).toMatchObject({
      status: "dismissed",
      handled_by: { display_name: "Dr. Reyes" },
      dismiss_reason: "already_known",
    });
    expect(
      (await m.listAlerts({ status: "dismissed" })).alerts.map((x) => x.id),
    ).toEqual(["al-105", "al-108"]);
  });

  it("refuses a second handling with who and when (409, Review Focus 1)", async () => {
    const m = mockAlerts();
    m.handleElsewhere("al-101", "Dr. Okafor");
    const e = await m.acknowledgeAlert("al-101").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AlertHandledError);
    expect(e).toMatchObject({
      status: 409,
      code: "already_handled",
      handled: {
        status: "handled",
        handled_by: { display_name: "Dr. Okafor" },
        handled_at: NOW_ISO,
      },
    });
    await expect(
      m.dismissAlert("al-101", { reason: "other" }),
    ).rejects.toBeInstanceOf(AlertHandledError);
    m.handleElsewhere("al-102", "Nurse Bello", "dismissed");
    await expect(m.acknowledgeAlert("al-102")).rejects.toMatchObject({
      handled: {
        status: "dismissed",
        handled_by: { display_name: "Nurse Bello" },
      },
    });
  });

  it("answers a retry with the same key with the first result", async () => {
    const m = mockAlerts();
    const first = await m.acknowledgeAlert("al-103", { idempotencyKey: "k1" });
    await expect(
      m.acknowledgeAlert("al-103", { idempotencyKey: "k1" }),
    ).resolves.toEqual(first);
    await expect(
      m.acknowledgeAlert("al-103", { idempotencyKey: "k2" }),
    ).rejects.toBeInstanceOf(AlertHandledError);
  });

  it("refuses an unknown id, an unknown reason and a long note", async () => {
    const m = mockAlerts();
    const missing = await m.acknowledgeAlert("nope").catch((x: unknown) => x);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).toMatchObject({ status: 404, code: "not_found" });
    await expect(
      m.dismissAlert("al-101", { reason: "bored" as never }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      m.dismissAlert("al-101", { reason: "other", note: "x".repeat(501) }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await m.getUnreadCount()).count).toBe(6);
  });

  it("keeps notification settings in memory, both on at first", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const m = mockAlerts();
    expect(await m.getNotificationSettings()).toEqual({
      alert_popups: true,
      correction_popups: true,
    });
    expect(await m.updateNotificationSettings({ alert_popups: false })).toEqual(
      { alert_popups: false, correction_popups: true },
    );
    expect(await m.getNotificationSettings()).toEqual({
      alert_popups: false,
      correction_popups: true,
    });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("sent_to you lists only alerts routed to you", async () => {
    const page = await mockAlerts().listAlerts({ sent_to: "you" });
    expect(page.queue).toBe(true);
    expect(page.alerts.length).toBeGreaterThan(0);
    for (const a of page.alerts) expect(a.routing?.to_you, a.id).toBe(true);
    expect(page.alerts.map((a) => a.id)).toContain("al-101");
    expect(page.alerts.map((a) => a.id)).not.toContain("al-102");
  });

  it("sent_to queue lists only queue-only alerts", async () => {
    const m = mockAlerts();
    const page = await m.listAlerts({ sent_to: "queue" });
    expect(page.queue).toBe(true);
    for (const a of page.alerts)
      expect(a.routing, a.id).toEqual({ to_you: false, queue: true });
    const ids = page.alerts.map((a) => a.id);
    // al-101 is in the queue too, but it's for you.
    expect(ids).toContain("al-102");
    expect(ids).not.toContain("al-101");
    expect(
      page.alerts.some((a) => a.severity === "urgent" && a.status === "new"),
    ).toBe(true);
    const all = (await m.listAlerts({})).alerts.length;
    const you = (await m.listAlerts({ sent_to: "you" })).alerts.length;
    expect(you + page.alerts.length).toBe(all);
    expect((await m.listAlerts({})).queue).toBe(true);
  });

  it("every seed has a category, routing and at most three pieces of evidence per cause", async () => {
    const { alerts } = await mockAlerts().listAlerts({});
    for (const a of alerts) {
      expect(a.category, a.id).toEqual({
        id: expect.stringMatching(/^[a-z-]+$/),
        label: expect.any(String),
      });
      expect(a.routing, a.id).toEqual({
        to_you: expect.any(Boolean),
        queue: expect.any(Boolean),
      });
      expect(a.routing!.to_you || a.routing!.queue, a.id).toBe(true);
      for (const c of a.likely_causes) {
        expect(Array.isArray(c.evidence), a.id).toBe(true);
        expect(c.evidence!.length, a.id).toBeLessThanOrEqual(3);
      }
    }
    const one = alerts.find((a) => a.id === "al-101")!;
    expect(one.category).toEqual({
      id: "blood-chemistry",
      label: "Blood chemistry",
    });
    expect(one.routing).toEqual({ to_you: true, queue: true });
    const ev = Object.fromEntries(
      one.likely_causes.map((c) => [c.label, c.evidence]),
    );
    expect(ev["Diuretic treatment"]).toEqual([
      {
        label: "Furosemide 40 mg daily",
        value: "started 19 Oct",
        recorded_at: null,
      },
    ]);
    expect(ev["Low magnesium"]).toEqual([
      {
        label: "Magnesium",
        value: "0.6 mmol/L (low)",
        recorded_at: new Date(
          Date.parse(one.created_at) - 86_400_000,
        ).toISOString(),
      },
    ]);
    const lactate = alerts.find((a) => a.id === "al-102")!;
    expect(lactate.severity).toBe("critical");
    expect(lactate.routing).toEqual({ to_you: false, queue: true });
    expect(
      alerts.some(
        (a) =>
          a.severity === "info" &&
          a.routing!.to_you &&
          a.likely_causes.length > 0 &&
          a.likely_causes.every((c) => c.evidence!.length === 0),
      ),
    ).toBe(true);
    // Evidence is clinical values and dates, never an identifier.
    const text = JSON.stringify(alerts.map((a) => a.likely_causes));
    for (const a of alerts) {
      expect(text).not.toContain(a.patient.mrn);
      expect(text).not.toContain(a.patient.full_name);
    }
  });

  it("alternates arrivals for you and for the hospital queue", async () => {
    let t = ALERT_NOW;
    const m = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 4 * MOCK_ALERT_EVERY_MS;
    const { alerts } = await m.listAlerts({ status: "new" });
    const byId = Object.fromEntries(alerts.map((a) => [a.id, a]));
    expect(byId["al-n1"]!.routing).toEqual({ to_you: true, queue: false });
    expect(byId["al-n2"]!.routing).toEqual({ to_you: false, queue: true });
    expect(byId["al-n3"]!.routing).toEqual({ to_you: true, queue: false });
    // The fourth is the queue-only Urgent one (Review Focus 5).
    expect(byId["al-n4"]).toMatchObject({
      severity: "urgent",
      routing: { to_you: false, queue: true },
    });
    for (const a of alerts) expect(a.category, a.id).toBeTruthy();
  });

  it("refuses an unknown sent_to", async () => {
    await expect(
      mockAlerts().listAlerts({ sent_to: "other" as never }),
    ).rejects.toMatchObject({ status: 400, code: "invalid" });
  });

  it("returns copies, so callers can't change the samples", async () => {
    const m = mockAlerts();
    const { alerts } = await m.listAlerts({});
    alerts[0]!.patient.full_name = "Changed";
    expect((await m.listAlerts({})).alerts[0]!.patient.full_name).not.toBe(
      "Changed",
    );
  });
});
