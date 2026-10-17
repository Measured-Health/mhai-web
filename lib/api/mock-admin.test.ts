import { describe, expect, it } from "vitest";
import {
  DEMO_EMAILS,
  MOCK_BACKUP_CODES,
  MOCK_CODE,
  MOCK_TOTP_SECRET,
} from "@/lib/auth/mock";
import { totp } from "@/lib/auth/totp";
import { ADMIN_NOW, mockAdminAs } from "@/tests/admin";
import { ApiError } from "./errors";

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
const KEY = { idempotencyKey: "k-1" };
const director = () => mockAdminAs(DEMO_EMAILS.director);
const row = async (a: ReturnType<typeof director>, id: string) =>
  (await a.listStaff()).find((s) => s.id === id)!;

describe("the sample hospital", () => {
  it("lists 13 synthetic staff and marks who you are", async () => {
    const a = director();
    const staff = await a.listStaff();
    expect(staff).toHaveLength(13);
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

  it("has the states the screens need", async () => {
    const staff = await director().listStaff();
    const by = (id: string) => staff.find((s) => s.id === id)!;
    expect(by("s-mensah").issues).toEqual(["mfa_not_set_up"]);
    expect(by("s-adeyemi")).toMatchObject({ status: "invited" });
    expect(Date.parse(by("s-adeyemi").invite_expires_at!)).toBeGreaterThan(
      ADMIN_NOW,
    );
    expect(by("s-sani").issues).toEqual(["invite_expired"]);
    expect(by("s-eze").status).toBe("deactivated");
    expect(by("s-nwosu").roles).toEqual(["hospital_admin"]);
    expect(by("s-obi").roles).toEqual(["clinician", "hospital_admin"]);
  });

  it("returns copies, so a caller can't change the hospital by accident", async () => {
    const a = director();
    (await a.listStaff())[0]!.full_name = "changed";
    expect((await a.listStaff())[0]!.full_name).not.toBe("changed");
  });

  it("refuses changes to your own access (403 self_change)", async () => {
    const a = director();
    const me = await row(a, "s-obi");
    expect(await code(a.staffAction("s-obi", "deactivate"))).toBe(
      "403 self_change",
    );
    expect(await code(a.removeStaff("s-obi", GOOD, KEY))).toBe(
      "403 self_change",
    );
    expect(
      await code(
        a.updateStaff("s-obi", { version: me.version, roles: ["clinician"] }),
      ),
    ).toBe("403 self_change");
    // Your specialty is still yours to change.
    expect(
      await code(
        a.updateStaff("s-obi", { version: me.version, specialty: "Surgery" }),
      ),
    ).toBe("ok");
  });

  it("keeps at least one active hospital admin (409 last_admin)", async () => {
    // An admin who isn't on the list, so "yourself" never applies here.
    const a = mockAdminAs(null);
    await a.staffAction("s-nwosu", "deactivate");
    // Dr. Obi is now the only active hospital admin.
    expect(await code(a.staffAction("s-obi", "deactivate"))).toBe(
      "409 last_admin",
    );
    expect(await code(a.removeStaff("s-obi", GOOD, KEY))).toBe(
      "409 last_admin",
    );
    const obi = await row(a, "s-obi");
    expect(
      await code(
        a.updateStaff("s-obi", { version: obi.version, roles: ["clinician"] }),
      ),
    ).toBe("409 last_admin");
    expect(await code(a.staffAction("s-nwosu", "reactivate"))).toBe("ok");
    expect(await code(a.staffAction("s-obi", "deactivate"))).toBe("ok");
  });

  it("a stale version is refused (409 conflict), and an unknown id is 404", async () => {
    const a = director();
    const before = await row(a, "s-bello");
    await a.updateStaff("s-bello", {
      version: before.version,
      specialty: "Cardiology",
    });
    expect(
      await code(
        a.updateStaff("s-bello", {
          version: before.version,
          specialty: "Surgery",
        }),
      ),
    ).toBe("409 conflict");
    expect(await code(a.staffAction("nobody", "deactivate"))).toBe(
      "404 not_found",
    );
    expect(await code(a.removeStaff("nobody", GOOD, KEY))).toBe(
      "404 not_found",
    );
  });

  it("deactivates, reactivates and removes, each recorded in the log", async () => {
    const a = director();
    expect((await a.staffAction("s-bello", "deactivate")).status).toBe(
      "deactivated",
    );
    expect(await code(a.staffAction("s-bello", "deactivate"))).toBe(
      "409 conflict",
    );
    expect((await a.staffAction("s-bello", "reactivate")).status).toBe(
      "active",
    );
    await a.removeStaff("s-eze", GOOD, KEY);
    expect((await a.listStaff()).some((s) => s.id === "s-eze")).toBe(false);
    const log = (await a.listActivity({ type: "admin" })).events.map(
      (e) => e.kind,
    );
    expect(log.slice(0, 3)).toEqual(["removed", "reactivated", "deactivated"]);
  });

  it("resets two-step, reminds, and resends an expired invite for 7 days", async () => {
    const a = director();
    expect((await a.staffAction("s-bello", "reset-mfa")).issues).toContain(
      "mfa_not_set_up",
    );
    expect(await code(a.staffAction("s-okafor", "reset-mfa"))).toBe(
      "409 conflict",
    ); // hospital account
    expect(await code(a.staffAction("s-mensah", "remind"))).toBe("ok");
    expect(await code(a.staffAction("s-okafor", "remind"))).toBe(
      "409 conflict",
    );
    const sani = await a.staffAction("s-sani", "resend-invite");
    expect(sani.issues).toEqual([]);
    expect(Date.parse(sani.invite_expires_at!)).toBe(
      ADMIN_NOW + 7 * 86_400_000,
    );
  });

  it("invites new people and skips what it can't invite", async () => {
    const a = director();
    const r = await a.inviteStaff({
      emails: [
        "n.ade@havanahospital.org",
        "N.Ade@havanahospital.org",
        "k.mensah@havanahospital.org",
        "j.eze@havanahospital.org",
        "someone@gmail.com",
        "not-an-email",
      ],
      roles: ["clinician"],
      specialty: "Paediatrics",
    });
    expect(r.invited.map((s) => s.email)).toEqual(["n.ade@havanahospital.org"]);
    expect(r.invited[0]).toMatchObject({
      status: "invited",
      specialty: "Paediatrics",
    });
    expect(r.skipped).toEqual([
      { email: "n.ade@havanahospital.org", reason: "duplicate" },
      { email: "k.mensah@havanahospital.org", reason: "already_staff" },
      { email: "j.eze@havanahospital.org", reason: "already_staff" },
      { email: "someone@gmail.com", reason: "domain_not_allowed" },
      { email: "not-an-email", reason: "invalid_email" },
    ]);
  });

  it("saves settings within the limits, and refuses a stale save", async () => {
    const a = director();
    const s = await a.getSettings();
    expect(s.sso).toEqual({
      status: "connected",
      domain: "havanahospital.org",
    });
    const saved = await a.updateSettings({
      version: s.version,
      allow_trust_device: false,
    });
    expect(saved).toMatchObject({
      allow_trust_device: false,
      version: s.version + 1,
    });
    expect(
      await code(
        a.updateSettings({ version: s.version, idle_timeout_minutes: 5 }),
      ),
    ).toBe("409 conflict");
    expect(
      await code(
        a.updateSettings({ version: saved.version, idle_timeout_minutes: 7 }),
      ),
    ).toBe("422 invalid");
  });

  it("gives usage as counts that add up", async () => {
    const u = await director().getUsage("this_month");
    const c = u.confidence;
    expect(c.high + c.caution + c.review + c.failed).toBe(u.consultations);
    expect(u.by_specialty.reduce((n, s) => n + s.consultations, 0)).toBe(
      u.consultations,
    );
  });

  it("pages the activity log and filters it", async () => {
    const a = director();
    const first = await a.listActivity({});
    expect(first.events).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();
    const second = await a.listActivity({ cursor: first.next_cursor! });
    expect(second.events[0]!.id).not.toBe(first.events[0]!.id);
    const flagged = (await a.listActivity({ flagged: true })).events;
    expect(flagged.map((e) => e.flag).sort()).toEqual(["alert", "policy"]);
    const okafor = (await a.listActivity({ person: "okafor" })).events;
    expect(okafor.length).toBeGreaterThan(0);
    expect(
      okafor.every((e) =>
        `${e.actor?.display_name} ${e.target?.display_name}`.includes("Okafor"),
      ),
    ).toBe(true);
  });

  it("oversees waiting corrections without clinical content", async () => {
    const a = director();
    const o = await a.getOversight();
    expect(
      o.items.map((i) => [i.ref, i.specialty, i.eligible_reviewers]),
    ).toEqual([
      ["C-118", "Paediatrics", 1],
      ["C-117", "Internal Medicine", 3],
      ["C-116", "Infectious disease", 2],
    ]);
    expect(JSON.stringify(o)).not.toMatch(
      /question|diagnosis|response|symptom/i,
    );
    const reviewers = await a.listEligibleReviewers("c-118");
    expect(reviewers.map((r) => r.display_name)).toEqual(["Dr. Udo"]);
    expect(await code(a.assignReviewer("c-118", "s-bello"))).toBe(
      "422 not_eligible",
    );
    await a.assignReviewer("c-118", "s-udo");
    await a.remindReviewers("c-117");
    const after = await a.getOversight();
    expect(after.items[0]!.assigned_to).toEqual({ display_name: "Dr. Udo" });
    expect(after.items[1]!.reminded_at).not.toBeNull();
    expect(await code(a.remindReviewers("c-999"))).toBe("404 not_found");
  });
});

describe("removing staff needs a two-step code", () => {
  const rm = (
    a: ReturnType<typeof director>,
    c: Parameters<typeof a.removeStaff>[1],
  ) => code(a.removeStaff("s-eze", c, KEY));

  it("refuses a wrong code and keeps the person (403 mfa_invalid)", async () => {
    const a = director();
    expect(await rm(a, { mfaCode: "000000" })).toBe("403 mfa_invalid");
    expect(await rm(a, { backupCode: "NOPE-0000" })).toBe("403 mfa_invalid");
    expect((await a.listStaff()).some((s) => s.id === "s-eze")).toBe(true);
  });

  it("accepts the demo code, a real authenticator code and a backup code once", async () => {
    const a = director();
    expect(await rm(a, { mfaCode: MOCK_CODE })).toBe("ok");
    const b = director();
    const real = await totp(MOCK_TOTP_SECRET, ADMIN_NOW);
    expect(await code(b.removeStaff("s-eze", { mfaCode: real }, KEY))).toBe(
      "ok",
    );
    const c = director();
    const backup = MOCK_BACKUP_CODES[0]!;
    expect(
      await code(c.removeStaff("s-eze", { backupCode: backup }, KEY)),
    ).toBe("ok");
    expect(
      await code(
        c.removeStaff("s-okafor", { backupCode: backup.toLowerCase() }, KEY),
      ),
    ).toBe("403 mfa_invalid"); // already used
    expect(
      await code(
        c.removeStaff("s-okafor", { backupCode: MOCK_BACKUP_CODES[1]! }, KEY),
      ),
    ).toBe("ok");
  });

  it("locks after five wrong codes (429 mfa_locked)", async () => {
    const a = director();
    for (let i = 0; i < 5; i++)
      expect(await rm(a, { mfaCode: "000000" })).toBe("403 mfa_invalid");
    expect(await rm(a, GOOD)).toBe("429 mfa_locked");
    expect((await a.listStaff()).some((s) => s.id === "s-eze")).toBe(true);
  });

  it("needs two-step turned on (403 mfa_required)", async () => {
    const a = mockAdminAs(DEMO_EMAILS.newAdmin);
    expect(await rm(a, GOOD)).toBe("403 mfa_required");
    expect((await a.listStaff()).some((s) => s.id === "s-eze")).toBe(true);
  });

  it("cancelling an invite uses the same rule", async () => {
    const a = director();
    expect(
      await code(a.removeStaff("s-adeyemi", { mfaCode: "111111" }, KEY)),
    ).toBe("403 mfa_invalid");
    expect(await code(a.removeStaff("s-adeyemi", GOOD, KEY))).toBe("ok");
    const log = (await a.listActivity({ type: "admin" })).events;
    expect(log[0]!.kind).toBe("invite_cancelled");
  });

  it("works for the hospital admin too", async () => {
    const a = mockAdminAs(DEMO_EMAILS.hospitalAdmin);
    expect(await rm(a, GOOD)).toBe("ok");
  });
});
