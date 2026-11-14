import { describe, expect, it } from "vitest";
import {
  DEMO_EMAILS,
  MOCK_BACKUP_CODES,
  MOCK_CODE,
  MOCK_TOTP_SECRET,
} from "@/lib/auth/mock";
import {
  createMockAuthClient,
  createStepUp,
  MOCK_NEW_BACKUP_CODES,
} from "@/lib/auth/mock";
import { createMockAdmin, MOCK_ANALYST_CAP } from "./mock-admin";
import { totp } from "@mhai/api-client/totp";
import { ADMIN_NOW, mockAdminAs, mockAdminWith } from "@/tests/admin";
import { ApiError } from "./errors";
import { recordAudit, resetAudit } from "./mock-audit";
import type { StepUpAuth, UsageAlertsOut } from "./admin-contract";
import {
  ACTIVITY_PAGE_SCHEMA,
  SETTINGS_SCHEMA,
  STAFF_LIST_SCHEMA,
  STAFF_SCHEMA,
  USAGE_SCHEMA,
} from "./admin-schema";
import { SMALL_GROUP_MIN } from "@mhai/ui/small-groups";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return "ok";
};
const GOOD = { mfaCode: MOCK_CODE };
const WRONG = { mfaCode: "000000" };
const director = () => mockAdminAs(DEMO_EMAILS.director);
const row = async (a: ReturnType<typeof director>, id: string) =>
  (await a.listStaff()).find((s) => s.id === id)!;

describe("the sample hospital follows core's contract (1.24.0)", () => {
  it("lists 12 synthetic staff and marks who you are", async () => {
    const a = director();
    const staff = await a.listStaff();
    expect(staff).toHaveLength(12);
    expect(staff.filter((s) => s.is_you).map((s) => s.id)).toEqual(["s-obi"]);
    expect(
      (await mockAdminAs(DEMO_EMAILS.hospitalAdmin).listStaff()).find(
        (s) => s.is_you,
      )?.id,
    ).toBe("s-nwosu");
    expect((await mockAdminAs(null).listStaff()).some((s) => s.is_you)).toBe(
      false,
    );
  });

  it("sends exactly what core sends: no invites, reviewing derived", async () => {
    const a = director();
    const staff = await a.listStaff();
    expect(STAFF_LIST_SCHEMA.safeParse(staff).success).toBe(true);
    for (const s of staff) {
      expect(s.status).not.toBe("invited");
      expect(s.invited_at).toBeNull();
      expect(s.invite_expires_at).toBeNull();
      expect(s.review_specialties).toEqual([]);
      expect(s.can_review).toBe(
        s.status === "active" && s.roles.includes("clinician"),
      );
    }
    expect(SETTINGS_SCHEMA.safeParse(await a.getSettings()).success).toBe(true);
    for (const p of ["this_month", "last_month", "last_90_days"] as const)
      expect(USAGE_SCHEMA.safeParse(await a.getUsage(p)).success).toBe(true);
    expect(
      ACTIVITY_PAGE_SCHEMA.safeParse(await a.listActivity({})).success,
    ).toBe(true);
  });

  it("has the states the screens need", async () => {
    const staff = await director().listStaff();
    const by = (id: string) => staff.find((s) => s.id === id)!;
    expect(by("s-mensah").issues).toEqual(["mfa_not_set_up"]);
    expect(by("s-eze").status).toBe("deactivated");
    expect(by("s-eze").can_review).toBe(false);
    expect(by("s-nwosu").roles).toEqual(["hospital_admin"]);
    expect(by("s-obi").roles).toEqual(["clinician", "hospital_admin"]);
    expect(by("s-kemi").roles).toEqual(["clinician", "analyst"]);
  });

  it("returns copies, so a caller can't change the hospital by accident", async () => {
    const a = director();
    (await a.listStaff())[0]!.full_name = "changed";
    expect((await a.listStaff())[0]!.full_name).not.toBe("changed");
  });

  it("settings as core keeps them: no single sign-on, no reviewing by specialty", async () => {
    const s = await director().getSettings();
    expect(s.sso).toEqual({ status: "not_set_up", domain: null });
    expect(s.allowed_email_domains).toEqual([]);
    expect(s.reviewers_share_specialty).toBe(false);
  });
});

describe("staff writes need a step-up code", () => {
  it("changes roles and specialty with a code, and refuses a wrong one", async () => {
    const a = director();
    const bello = await row(a, "s-bello");
    expect(
      await code(
        a.updateStaff(
          "s-bello",
          { version: bello.version, specialty: "Surgery" },
          WRONG,
        ),
      ),
    ).toBe("403 mfa_invalid");
    const next = await a.updateStaff(
      "s-bello",
      { version: bello.version, specialty: "Surgery" },
      GOOD,
    );
    expect(next).toMatchObject({
      specialty: "Surgery",
      version: bello.version + 1,
    });
    expect(STAFF_SCHEMA.safeParse(next).success).toBe(true);
    expect((await a.listActivity({})).events[0]).toMatchObject({
      kind: "specialty_changed",
      specialty: "Surgery",
    });
  });

  it("an edit that changes nothing answers the person without spending a code", async () => {
    const a = director();
    const bello = await row(a, "s-bello");
    expect(
      await code(
        a.updateStaff(
          "s-bello",
          { version: bello.version, specialty: bello.specialty },
          WRONG,
        ),
      ),
    ).toBe("ok");
  });

  it("refuses any role you add to yourself, Clinician included (403 self_change)", async () => {
    const a = mockAdminAs(DEMO_EMAILS.hospitalAdmin);
    const me = await row(a, "s-nwosu");
    expect(
      await code(
        a.updateStaff(
          "s-nwosu",
          { version: me.version, roles: ["clinician", "hospital_admin"] },
          GOOD,
        ),
      ),
    ).toBe("403 self_change");
    expect((await row(a, "s-nwosu")).roles).toEqual(["hospital_admin"]);
    // Nothing is flagged: core refuses, so no self change is ever logged.
    expect((await a.listActivity({ flagged: true })).events).toEqual([]);
  });

  it("lets you remove your own Clinician role, never your own admin role", async () => {
    const a = director();
    const me = await row(a, "s-obi");
    expect(
      await code(
        a.updateStaff(
          "s-obi",
          { version: me.version, roles: ["clinician"] },
          GOOD,
        ),
      ),
    ).toBe("403 self_change");
    const next = await a.updateStaff(
      "s-obi",
      { version: me.version, roles: ["hospital_admin"] },
      GOOD,
    );
    expect(next.roles).toEqual(["hospital_admin"]);
    expect(next.can_review).toBe(false);
  });

  it("checks refusals that need no code first, so they never spend one", async () => {
    const backup = { backupCode: MOCK_BACKUP_CODES[2]! };
    const a = director();
    const me = await row(a, "s-obi");
    expect(
      await code(
        a.updateStaff(
          "s-obi",
          { version: me.version, roles: ["clinician"] },
          backup,
        ),
      ),
    ).toBe("403 self_change");
    expect(await code(a.staffAction("s-obi", "deactivate", backup))).toBe(
      "403 self_change",
    );
    // The code is still good.
    expect(await code(a.staffAction("s-bello", "deactivate", backup))).toBe(
      "ok",
    );
  });

  it("keeps at least one active hospital admin with two-step (409 last_admin)", async () => {
    // An admin who isn't on the list, so "yourself" never applies here.
    const a = mockAdminAs(null);
    await a.staffAction("s-nwosu", "deactivate", GOOD);
    // Dr. Obi is now the only active hospital admin.
    expect(await code(a.staffAction("s-obi", "deactivate", GOOD))).toBe(
      "409 last_admin",
    );
    const obi = await row(a, "s-obi");
    expect(
      await code(
        a.updateStaff(
          "s-obi",
          { version: obi.version, roles: ["clinician"] },
          GOOD,
        ),
      ),
    ).toBe("409 last_admin");
    expect(await code(a.staffAction("s-nwosu", "reactivate", GOOD))).toBe("ok");
    expect(await code(a.staffAction("s-obi", "deactivate", GOOD))).toBe("ok");
  });

  it("a stale version is refused (409 conflict), and an unknown id is 404", async () => {
    const a = director();
    const before = await row(a, "s-bello");
    await a.updateStaff(
      "s-bello",
      { version: before.version, specialty: "Cardiology" },
      GOOD,
    );
    expect(
      await code(
        a.updateStaff(
          "s-bello",
          { version: before.version, specialty: "Surgery" },
          GOOD,
        ),
      ),
    ).toBe("409 conflict");
    expect(await code(a.staffAction("nobody", "deactivate", GOOD))).toBe(
      "404 not_found",
    );
  });

  it("deactivates and reactivates with a code, each recorded in the log", async () => {
    const a = director();
    expect(await code(a.staffAction("s-bello", "deactivate", WRONG))).toBe(
      "403 mfa_invalid",
    );
    expect((await a.staffAction("s-bello", "deactivate", GOOD)).status).toBe(
      "deactivated",
    );
    expect(await code(a.staffAction("s-bello", "deactivate", GOOD))).toBe(
      "409 conflict",
    );
    const back = await a.staffAction("s-bello", "reactivate", GOOD);
    expect(back).toMatchObject({ status: "active", can_review: true });
    const log = (await a.listActivity({ type: "admin" })).events.map(
      (e) => e.kind,
    );
    expect(log.slice(0, 2)).toEqual(["reactivated", "deactivated"]);
  });

  it("deactivating ends Analyst: reactivating needs a fresh grant", async () => {
    const a = director();
    await a.staffAction("s-kemi", "deactivate", GOOD);
    const back = await a.staffAction("s-kemi", "reactivate", GOOD);
    expect(back.roles).toEqual(["clinician"]);
  });

  it("needs two-step turned on (403 mfa_required)", async () => {
    const a = mockAdminAs(DEMO_EMAILS.newAdmin);
    expect(await code(a.staffAction("s-bello", "deactivate", GOOD))).toBe(
      "403 mfa_required",
    );
  });

  it("accepts the demo code, a real authenticator code and a backup code once", async () => {
    const deact = (a: ReturnType<typeof director>, id: string, c: StepUpAuth) =>
      code(a.staffAction(id, "deactivate", c));
    expect(await deact(director(), "s-bello", GOOD)).toBe("ok");
    const real = await totp(MOCK_TOTP_SECRET, ADMIN_NOW);
    expect(await deact(director(), "s-bello", { mfaCode: real })).toBe("ok");
    const c = director();
    const backup = MOCK_BACKUP_CODES[0]!;
    expect(await deact(c, "s-bello", { backupCode: backup })).toBe("ok");
    expect(
      await deact(c, "s-okafor", { backupCode: backup.toLowerCase() }),
    ).toBe("403 mfa_invalid"); // already used
    expect(
      await deact(c, "s-okafor", { backupCode: MOCK_BACKUP_CODES[1]! }),
    ).toBe("ok");
  });

  it("locks after five wrong codes, per admin, for a while (429 mfa_locked)", async () => {
    let t = ADMIN_NOW;
    const stepUp = createStepUp(() => t);
    const as = (email: string) =>
      createMockAdmin({
        now: () => t,
        me: async () => email,
        delayMs: 0,
        stepUp,
      });
    const d = as(DEMO_EMAILS.director);
    for (let i = 0; i < 5; i++)
      expect(await code(d.staffAction("s-bello", "deactivate", WRONG))).toBe(
        "403 mfa_invalid",
      );
    expect(await code(d.staffAction("s-bello", "deactivate", GOOD))).toBe(
      "429 mfa_locked",
    );
    expect(
      await code(
        as(DEMO_EMAILS.hospitalAdmin).staffAction(
          "s-bello",
          "deactivate",
          GOOD,
        ),
      ),
    ).toBe("ok");
    t += 16 * 60_000;
    expect(await code(d.staffAction("s-okafor", "deactivate", GOOD))).toBe(
      "ok",
    );
  });

  it("shares backup codes with sign-in, and a spent one lowers the signed-in count", async () => {
    const stepUp = createStepUp(() => ADMIN_NOW);
    const auth = createMockAuthClient({ now: () => ADMIN_NOW, stepUp });
    await auth.signIn(DEMO_EMAILS.director, "anything");
    const left = (await auth.getSession())!.user.backupCodesLeft!;
    const mk = () =>
      createMockAdmin({
        now: () => ADMIN_NOW,
        me: async () => DEMO_EMAILS.director,
        delayMs: 0,
        stepUp,
      });
    await mk().staffAction("s-bello", "deactivate", {
      backupCode: MOCK_BACKUP_CODES[0]!,
    });
    expect((await auth.getSession())!.user.backupCodesLeft).toBe(left - 1);
    stepUp.setBackupCodes(MOCK_NEW_BACKUP_CODES); // regenerated
    expect(
      await code(
        mk().staffAction("s-okafor", "deactivate", {
          backupCode: MOCK_BACKUP_CODES[1]!,
        }),
      ),
    ).toBe("403 mfa_invalid");
  });
});

describe("the Analyst role (migration 00030's rules)", () => {
  it("grants and removes Analyst with a code, logged as their own kinds", async () => {
    const a = director();
    const okafor = await row(a, "s-okafor");
    const granted = await a.updateStaff(
      "s-okafor",
      { version: okafor.version, roles: ["clinician", "analyst"] },
      GOOD,
    );
    expect((await a.listActivity({})).events[0]).toMatchObject({
      kind: "analyst_granted",
      target: { display_name: "Dr. Okafor" },
      flag: null,
    });
    await a.updateStaff(
      "s-okafor",
      { version: granted.version, roles: ["clinician"] },
      GOOD,
    );
    expect((await a.listActivity({})).events[0]).toMatchObject({
      kind: "analyst_removed",
    });
  });

  it("Analyst without Clinician is 422 not_eligible, before any code", async () => {
    const a = director();
    const okafor = await row(a, "s-okafor");
    expect(
      await code(
        a.updateStaff(
          "s-okafor",
          { version: okafor.version, roles: ["analyst"] },
          WRONG,
        ),
      ),
    ).toBe("422 not_eligible");
  });

  it("someone without two-step can't be an analyst (422 not_eligible)", async () => {
    const a = director();
    const mensah = await row(a, "s-mensah");
    expect(
      await code(
        a.updateStaff(
          "s-mensah",
          { version: mensah.version, roles: ["clinician", "analyst"] },
          GOOD,
        ),
      ),
    ).toBe("422 not_eligible");
  });

  it("refuses with Analysis off (409 analysis_off) and past the cap (409 analyst_cap)", async () => {
    const off = mockAdminAs(DEMO_EMAILS.director, { analysis: "off" });
    const o = await row(off, "s-okafor");
    expect(
      await code(
        off.updateStaff(
          "s-okafor",
          { version: o.version, roles: ["clinician", "analyst"] },
          GOOD,
        ),
      ),
    ).toBe("409 analysis_off");
    const cap = mockAdminAs(DEMO_EMAILS.director, { analystCap: 1 });
    const c = await row(cap, "s-okafor");
    expect(
      await code(
        cap.updateStaff(
          "s-okafor",
          { version: c.version, roles: ["clinician", "analyst"] },
          GOOD,
        ),
      ),
    ).toBe("409 analyst_cap");
    expect(MOCK_ANALYST_CAP).toBeGreaterThan(1);
  });

  it("removing Clinician removes Analyst", async () => {
    const a = director();
    const kemi = await row(a, "s-kemi");
    const next = await a.updateStaff(
      "s-kemi",
      { version: kemi.version, roles: ["clinician", "hospital_admin"] },
      GOOD,
    );
    expect(next.roles).toEqual(["clinician", "hospital_admin"]);
    const k2 = await a.updateStaff(
      "s-kemi",
      { version: next.version, roles: ["hospital_admin"] },
      GOOD,
    );
    expect(k2.roles).toEqual(["hospital_admin"]);
  });
});

describe("hospital settings", () => {
  it("saves a tightening edit without a code, and refuses a stale save", async () => {
    const a = director();
    const s = await a.getSettings();
    const saved = await a.updateSettings(
      { version: s.version, allow_trust_device: false },
      null,
    );
    expect(saved).toMatchObject({
      allow_trust_device: false,
      version: s.version + 1,
    });
    expect(
      await code(
        a.updateSettings({ version: s.version, idle_timeout_minutes: 5 }, null),
      ),
    ).toBe("409 conflict");
    expect(
      await code(
        a.updateSettings(
          { version: saved.version, idle_timeout_minutes: 7 },
          null,
        ),
      ),
    ).toBe("422 validation_failed");
  });

  it("needs a code for an edit that loosens sign-in", async () => {
    const a = director();
    const s = await a.getSettings();
    for (const p of [
      { require_mfa_for_clinicians: false },
      { idle_timeout_minutes: 30 },
    ])
      expect(
        await code(a.updateSettings({ version: s.version, ...p }, null)),
      ).toBe("403 mfa_required");
    expect(
      await code(
        a.updateSettings(
          { version: s.version, idle_timeout_minutes: 30 },
          WRONG,
        ),
      ),
    ).toBe("403 mfa_invalid");
    const saved = await a.updateSettings(
      { version: s.version, idle_timeout_minutes: 30 },
      GOOD,
    );
    expect(saved.idle_timeout_minutes).toBe(30);
    // Trusted devices back on (after switching them off) loosens too.
    const off = await a.updateSettings(
      { version: saved.version, allow_trust_device: false },
      null,
    );
    expect(
      await code(
        a.updateSettings(
          { version: off.version, allow_trust_device: true },
          null,
        ),
      ),
    ).toBe("403 mfa_required");
  });

  it("refuses reviewers sharing the specialty: core has no reviewing by specialty", async () => {
    const a = director();
    const s = await a.getSettings();
    expect(
      await code(
        a.updateSettings(
          { version: s.version, reviewers_share_specialty: true } as never,
          null,
        ),
      ),
    ).toBe("422 validation_failed");
  });
});

describe("usage and activity", () => {
  it("gives usage as counts that add up", async () => {
    const u = await director().getUsage("this_month");
    const c = u.confidence;
    expect(c.high + c.caution + c.review + c.failed).toBe(u.consultations);
    expect(u.by_specialty.reduce((n, s) => n + s.consultations, 0)).toBe(
      u.consultations,
    );
  });

  it("pages the activity log and filters it; core sends no device, count or flag", async () => {
    const a = director();
    const first = await a.listActivity({});
    expect(first.events).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();
    const second = await a.listActivity({ cursor: first.next_cursor! });
    expect(second.events[0]!.id).not.toBe(first.events[0]!.id);
    for (const e of first.events)
      expect(e).toMatchObject({ device: null, count: null, flag: null });
    expect((await a.listActivity({ flagged: true })).events).toEqual([]);
    const okafor = (await a.listActivity({ person: "okafor" })).events;
    expect(okafor.length).toBeGreaterThan(0);
    expect(
      okafor.every((e) =>
        `${e.actor?.display_name} ${e.target?.display_name}`.includes("Okafor"),
      ),
    ).toBe(true);
  });

  it("audit events appear in Activity, in time order", async () => {
    resetAudit();
    recordAudit({
      at: new Date(ADMIN_NOW - 60_000).toISOString(),
      type: "security",
      kind: "analysis_patients_viewed",
      actor: { display_name: "Dr. Kemi Adeyemi" },
      target: null,
      specialty: null,
      confidence: null,
      device: null,
      count: null,
      flag: null,
    });
    const { events } = await director().listActivity({});
    expect(events.some((e) => e.kind === "analysis_patients_viewed")).toBe(
      true,
    );
    const times = events.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    resetAudit();
  });

  it("lists the three alert settings changes in sample Activity", async () => {
    const { events } = await mockAdminAs(
      DEMO_EMAILS.hospitalAdmin,
    ).listActivity({
      type: "admin",
    });
    const kinds = events.map((e) => e.kind);
    for (const k of [
      "alert_units_changed",
      "alert_rules_changed",
      "alert_recipients_changed",
    ])
      expect(kinds).toContain(k);
  });

  it("oversees waiting corrections without clinical content, assignment or reminders", async () => {
    const a = director();
    const o = await a.getOversight();
    expect(o.items.map((i) => i.ref)).toEqual(["C-118", "C-117", "C-116"]);
    for (const i of o.items) {
      expect(i.assigned_to).toBeNull();
      expect(i.reminded_at).toBeNull();
    }
    // Every active clinician but the suggester.
    expect(o.items[0]!.eligible_reviewers).toBe(9);
    expect(JSON.stringify(o)).not.toMatch(
      /question|diagnosis|response|symptom/i,
    );
    const reviewers = await a.listEligibleReviewers("c-118");
    expect(reviewers.map((r) => r.display_name)).not.toContain("Dr. Reyes");
    expect(await code(a.listEligibleReviewers("c-999"))).toBe("404 not_found");
  });
});

describe("usage alerts: core's block (sample, at 16 Oct)", () => {
  const alertsOf = async (p: "this_month" | "last_month" | "last_90_days") =>
    (await director().getUsage(p)).alerts as UsageAlertsOut;

  it("splits the total by severity, category and handling, guarded", async () => {
    for (const p of ["this_month", "last_month", "last_90_days"] as const) {
      const a = await alertsOf(p);
      for (const set of [a.by_severity, a.by_category, a.by_handling]) {
        const parts = Object.values(set);
        const shownSum = parts.reduce((n, g) => n + (g.value ?? 0), 0);
        const hiddenParts = parts.filter((g) => g.suppressed).length;
        expect(
          hiddenParts === 0 ? shownSum : shownSum <= a.total.value!,
          p,
        ).toBe(hiddenParts === 0 ? a.total.value : true);
        // Never exactly one hidden part: it could be worked out.
        expect(hiddenParts, p).not.toBe(1);
      }
    }
  });

  it("never sends a small number: hidden groups come as null", async () => {
    for (const p of ["this_month", "last_month", "last_90_days"] as const) {
      const a = await alertsOf(p);
      const all = [
        a.total,
        ...Object.values(a.by_severity),
        ...Object.values(a.by_category),
        ...Object.values(a.by_route),
        ...Object.values(a.by_handling),
      ];
      for (const g of all) {
        if (g.suppressed) expect(g.value).toBeNull();
        else expect(g.value === 0 || g.value! >= SMALL_GROUP_MIN, p).toBe(true);
      }
    }
  });

  it("can have no record source, fail, or hide a set, for tests", async () => {
    expect(
      (await mockAdminWith("off").getUsage("this_month")).alerts,
    ).toBeNull();
    expect(
      (await mockAdminWith("unavailable").getUsage("this_month")).alerts,
    ).toEqual({
      unavailable: true,
    });
    const edge = (await mockAdminWith("edge").getUsage("this_month"))
      .alerts as UsageAlertsOut;
    expect(edge.by_severity.critical).toEqual({
      value: null,
      suppressed: true,
    });
    expect(edge.by_severity.urgent).toEqual({ value: null, suppressed: true });
    expect(edge.by_route.named).toEqual({ value: null, suppressed: true });
  });
});
