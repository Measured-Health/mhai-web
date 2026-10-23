import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_NOW, mockAdminAs } from "@/tests/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import type {
  AlertSettingsPatchIn,
  EmrClient,
  RecordsStatus,
} from "./emr-contract";
import { FLAG_LEVELS } from "./emr-contract";
import { ApiError } from "./errors";
import { auditEvents, resetAudit } from "./mock-audit";
import { MOCK_SOURCES } from "./mock-alerts";
import { createMockEmr } from "./mock-emr";

const MIN = 60_000;
let n = 0;
const key = () => ({ idempotencyKey: `k-${n++}` });

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return "ok";
};

const as = (connection?: RecordsStatus): EmrClient => {
  const admin = mockAdminAs(DEMO_EMAILS.hospitalAdmin);
  return createMockEmr({
    now: () => ADMIN_NOW,
    me: async () => DEMO_EMAILS.hospitalAdmin,
    delayMs: 0,
    staff: () => admin.listStaff(),
    ...(connection ? { connection } : {}),
  });
};

beforeEach(resetAudit);

describe("the sample alert settings (Havana)", () => {
  it("Havana is connected through Main record and Results system", async () => {
    const s = await as().getAlertSettings();
    expect(s.connection.status).toBe("connected");
    expect(s.connection.sources.map((x) => x.label)).toEqual([...MOCK_SOURCES]);
    expect(s.connection.sources.map((x) => x.status)).toEqual([
      "connected",
      "connected",
    ]);
    expect(s.connection.sources.map((x) => x.last_update_at)).toEqual([
      new Date(ADMIN_NOW - 2 * MIN).toISOString(),
      new Date(ADMIN_NOW - 1 * MIN).toISOString(),
    ]);
    expect(s.version).toBe(1);
  });

  it("lists the units, categories and recipients of the plan", async () => {
    const s = await as().getAlertSettings();
    expect(s.units.map((u) => [u.label, u.covered])).toEqual([
      ["Ward 3", true],
      ["Ward 5", true],
      ["Ward 7", false],
      ["Intensive care", true],
      ["Emergency department", true],
      ["Cardiology clinic", true],
      ["Kidney clinic", false],
      ["Diabetes clinic", true],
    ]);
    expect(new Set(s.units.map((u) => u.source_label))).toEqual(
      new Set(["Main record"]),
    );
    expect(s.categories.map((c) => [c.label, c.example, c.level])).toEqual([
      ["Blood chemistry", "Potassium, sodium, calcium", "all"],
      ["Blood count", "Haemoglobin, platelets, white cells", "critical_urgent"],
      ["Kidney function", "Creatinine, urea", "critical_urgent"],
      ["Blood gases and lactate", null, "all"],
      ["Heart markers", "Troponin", "all"],
      ["Blood sugar", null, "critical_urgent"],
      ["Vital signs", "Blood pressure, heart rate, oxygen", "critical"],
      ["Infection markers and cultures", null, "critical_urgent"],
    ]);
    expect(s.recipients.queue).toBe(true);
    expect(s.recipients.clinicians.map((c) => c.display_name)).toEqual([
      "Dr. Reyes",
      "Dr. Mensah",
    ]);
  });

  it("reads the other connection states, worst first", async () => {
    const problems = await as("problems").getAlertSettings();
    expect(problems.connection.status).toBe("problems");
    expect(problems.connection.sources.map((x) => x.status)).toContain(
      "problems",
    );
    const off = await as("off").getAlertSettings();
    expect(off.connection.status).toBe("off");
    const none = await as("not_connected").getAlertSettings();
    expect(none.connection).toEqual({ status: "not_connected", sources: [] });
    // The other sections still show and save (spec §6).
    expect(none.units.length).toBeGreaterThan(0);
    expect(
      await code(
        as("not_connected").updateAlertSettings(
          { version: 1, units: { covered: [] } },
          key(),
        ),
      ),
    ).toBe("ok");
  });

  it("names no vendor and no technical detail", async () => {
    const keys = new Set<string>();
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, x] of Object.entries(v)) {
          keys.add(k);
          walk(x);
        }
    };
    for (const c of ["connected", "problems", "off", "not_connected"] as const)
      walk(await as(c).getAlertSettings());
    const m = as();
    const s = await m.getAlertSettings();
    walk(
      await m.updateAlertSettings(
        { version: s.version, rules: { levels: { "vital-signs": "all" } } },
        key(),
      ),
    );
    // Exactly the contract's fields: no address, type, credential or error.
    expect([...keys].sort()).toEqual(
      [
        "categories",
        "clinicians",
        "connection",
        "covered",
        "display_name",
        "example",
        "id",
        "kind",
        "label",
        "last_update_at",
        "level",
        "queue",
        "recipients",
        "source_label",
        "sources",
        "specialty",
        "status",
        "units",
        "updated_at",
        "updated_by",
        "version",
      ].sort(),
    );
    const text = strings.join(" ");
    expect(text).not.toMatch(/:\/\/|@|\bhttps?\b|\bport\b/i);
    expect(text).not.toMatch(/\b(fhir|hl7|api|server|feed|export)\b/i);
    for (const t of ["error", "auth", "refused", "timeout"])
      expect(text.toLowerCase()).not.toContain(t);
    // Labels people read carry no backend code.
    const labels = [
      ...s.units.map((u) => u.label),
      ...s.categories.flatMap((c) => [c.label, c.example ?? ""]),
      ...s.connection.sources.map((x) => x.label),
    ].join(" ");
    for (const t of FORBIDDEN_TERMS)
      expect(labels).not.toMatch(
        new RegExp(`\\b${t}\\b`, t === t.toUpperCase() ? "" : "i"),
      );
  });
});

describe("saving alert settings", () => {
  it("covering units saves and logs alert_units_changed", async () => {
    const m = as();
    const s = await m.getAlertSettings();
    const covered = [...s.units.filter((u) => u.covered).map((u) => u.id)];
    const ward7 = s.units.find((u) => u.label === "Ward 7")!;
    const out = await m.updateAlertSettings(
      { version: s.version, units: { covered: [...covered, ward7.id] } },
      key(),
    );
    expect(out.version).toBe(s.version + 1);
    expect(out.units.find((u) => u.id === ward7.id)!.covered).toBe(true);
    expect(out.updated_by).toEqual({ display_name: "Grace Nwosu" });
    expect(out.updated_at).toBe(new Date(ADMIN_NOW).toISOString());
    expect((await m.getAlertSettings()).version).toBe(s.version + 1);
    const ev = auditEvents();
    expect(ev.map((e) => [e.type, e.kind])).toEqual([
      ["admin", "alert_units_changed"],
    ]);
    expect(ev[0]).toMatchObject({
      actor: { display_name: "Grace Nwosu" },
      target: null,
      flag: null,
    });
    // The admin mock lists it in Activity.
    const admin = mockAdminAs(DEMO_EMAILS.hospitalAdmin);
    const log = await admin.listActivity({ type: "admin" });
    expect(log.events[0]!.kind).toBe("alert_units_changed");
  });

  it("logs one event per section, by its own name", async () => {
    const m = as();
    let s = await m.getAlertSettings();
    s = await m.updateAlertSettings(
      { version: s.version, rules: { levels: { "vital-signs": "all" } } },
      key(),
    );
    expect(s.categories.find((c) => c.id === "vital-signs")!.level).toBe("all");
    s = await m.updateAlertSettings(
      {
        version: s.version,
        recipients: { queue: false, clinician_ids: ["s-okafor"] },
      },
      key(),
    );
    expect(s.recipients).toEqual({
      queue: false,
      clinicians: [
        {
          id: "s-okafor",
          display_name: "Dr. Okafor",
          specialty: "Infectious disease",
        },
      ],
    });
    expect(auditEvents().map((e) => e.kind)).toEqual([
      "alert_rules_changed",
      "alert_recipients_changed",
    ]);
  });

  it("a level outside the list is invalid", async () => {
    const m = as();
    const bad = {
      version: 1,
      rules: { levels: { "vital-signs": "urgent_only" } },
    } as unknown as AlertSettingsPatchIn;
    expect(await code(m.updateAlertSettings(bad, key()))).toBe("422 invalid");
    expect(FLAG_LEVELS).toEqual(["off", "critical", "critical_urgent", "all"]);
    expect(
      await code(
        m.updateAlertSettings(
          { version: 1, rules: { levels: { "no-such": "all" } } },
          key(),
        ),
      ),
    ).toBe("422 invalid");
    expect(
      await code(
        m.updateAlertSettings(
          { version: 1, units: { covered: ["u-ward-3", "u-nowhere"] } },
          key(),
        ),
      ),
    ).toBe("422 invalid");
    expect(auditEvents()).toEqual([]);
    expect((await m.getAlertSettings()).version).toBe(1);
  });

  it("no queue and nobody named is no_recipients", async () => {
    const m = as();
    expect(
      await code(
        m.updateAlertSettings(
          { version: 1, recipients: { queue: false, clinician_ids: [] } },
          key(),
        ),
      ),
    ).toBe("422 no_recipients");
    expect((await m.getAlertSettings()).recipients.queue).toBe(true);
    expect(auditEvents()).toEqual([]);
    // The queue alone, or one person alone, is enough.
    expect(
      await code(
        m.updateAlertSettings(
          { version: 1, recipients: { queue: true, clinician_ids: [] } },
          key(),
        ),
      ),
    ).toBe("ok");
  });

  it("a stale version is conflict", async () => {
    const m = as();
    const s = await m.getAlertSettings();
    await m.updateAlertSettings(
      { version: s.version, units: { covered: [] } },
      key(),
    );
    expect(
      await code(
        m.updateAlertSettings(
          { version: s.version, rules: { levels: { "blood-sugar": "all" } } },
          key(),
        ),
      ),
    ).toBe("409 conflict");
    expect(auditEvents()).toHaveLength(1);
  });

  it("a PATCH with two sections is invalid", async () => {
    const m = as();
    const two = {
      version: 1,
      units: { covered: [] },
      rules: { levels: {} },
    } as unknown as AlertSettingsPatchIn;
    expect(await code(m.updateAlertSettings(two, key()))).toBe("422 invalid");
    const none = { version: 1 } as unknown as AlertSettingsPatchIn;
    expect(await code(m.updateAlertSettings(none, key()))).toBe("422 invalid");
    const noVersion = {
      units: { covered: [] },
    } as unknown as AlertSettingsPatchIn;
    expect(await code(m.updateAlertSettings(noVersion, key()))).toBe(
      "422 invalid",
    );
    expect(auditEvents()).toEqual([]);
  });

  it("only active clinicians can be named", async () => {
    const m = as();
    const named = (id: string) =>
      code(
        m.updateAlertSettings(
          { version: 1, recipients: { queue: true, clinician_ids: [id] } },
          key(),
        ),
      );
    // Invited, deactivated, admin-only and unknown people are refused.
    for (const id of ["s-adeyemi", "s-eze", "s-nwosu", "s-nobody"])
      expect(await named(id), id).toBe("422 invalid");
    expect(await named("s-udo")).toBe("ok");
  });

  it("answers a retried save with the first reply, logging once", async () => {
    const m = as();
    const k = key();
    const p = { version: 1, units: { covered: ["u-ward-3"] } };
    const first = await m.updateAlertSettings(p, k);
    expect(await m.updateAlertSettings(p, k)).toEqual(first);
    expect(auditEvents()).toHaveLength(1);
  });

  it("hands out copies", async () => {
    const m = as();
    const s = await m.getAlertSettings();
    s.units[0]!.covered = false;
    s.recipients.clinicians.length = 0;
    const again = await m.getAlertSettings();
    expect(again.units[0]!.covered).toBe(true);
    expect(again.recipients.clinicians).toHaveLength(2);
  });
});
