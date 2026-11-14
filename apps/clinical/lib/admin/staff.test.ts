import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW, makeStaff } from "@/tests/admin";
import {
  LAST_ADMIN,
  SELF_ADD,
  SIGN_IN_LABEL,
  STAFF_FILTERS,
  attentionLabel,
  filterStaff,
  guardFor,
  lastActiveLabel,
  policyBroken,
  rolesText,
  staffCounts,
  staffState,
  statusText,
} from "./staff";

const D = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("staffState", () => {
  it("reads status and problems as the three states (core has no invites)", () => {
    expect(staffState(makeStaff())).toBe("active");
    expect(staffState(makeStaff({ issues: ["mfa_not_set_up"] }))).toBe(
      "attention",
    );
    expect(
      staffState(
        makeStaff({ status: "deactivated", issues: ["mfa_not_set_up"] }),
      ),
    ).toBe("deactivated");
  });

  it("says what needs attention in words", () => {
    expect(attentionLabel(makeStaff({ issues: ["mfa_not_set_up"] }))).toBe(
      "Two-step not set up",
    );
    expect(statusText(makeStaff())).toBe("Active");
    expect(statusText(makeStaff({ status: "deactivated" }))).toBe(
      "Deactivated",
    );
  });
});

describe("filters and search", () => {
  const list = [
    makeStaff({
      id: "a",
      full_name: "Dr. Zoë Ábaro",
      specialty: "Paediatrics",
    }),
    makeStaff({
      id: "b",
      full_name: "Grace Nwosu",
      email: "admin.nwosu@x.org",
      specialty: null,
    }),
    makeStaff({
      id: "c",
      full_name: "Dr. Kofi Mensah",
      issues: ["mfa_not_set_up"],
    }),
    makeStaff({ id: "d", full_name: "Dr. James Eze", status: "deactivated" }),
  ];

  it("counts each filter", () => {
    expect(staffCounts(list)).toEqual({
      all: 4,
      active: 2,
      attention: 1,
      deactivated: 1,
    });
    expect(STAFF_FILTERS.map((f) => f.id)).not.toContain("invited");
  });

  it("filters, sorts by name without the title, and ignores accents and case", () => {
    expect(filterStaff(list, "all", "").map((s) => s.id)).toEqual([
      "b",
      "d",
      "c",
      "a",
    ]);
    expect(filterStaff(list, "active", "").map((s) => s.id)).toEqual([
      "b",
      "a",
    ]);
    expect(filterStaff(list, "all", "zoe abaro").map((s) => s.id)).toEqual([
      "a",
    ]);
    expect(filterStaff(list, "all", "PAEDI").map((s) => s.id)).toEqual(["a"]);
    expect(filterStaff(list, "all", "admin.nwosu").map((s) => s.id)).toEqual([
      "b",
    ]);
    expect(filterStaff(list, "attention", "zoe")).toEqual([]);
  });
});

describe("guardFor", () => {
  const me = makeStaff({
    id: "me",
    roles: ["clinician", "hospital_admin"],
    is_you: true,
  });
  const other = makeStaff({ id: "o", roles: ["hospital_admin"] });
  const clinician = makeStaff({ id: "c" });

  it("refuses yourself, whatever the action (Review Focus 1)", () => {
    const list = [me, other, clinician];
    expect(guardFor("deactivate", me, list)).toEqual({
      ok: false,
      reason:
        "You can't deactivate your own account. Ask another hospital admin.",
    });
    expect(guardFor("drop_admin", me, list)).toEqual({
      ok: false,
      reason:
        "You can't remove your own hospital admin role. Ask another hospital admin.",
    });
  });

  it("keeps the last active admin (Review Focus 4)", () => {
    const solo = [other, clinician];
    for (const a of ["deactivate", "drop_admin"] as const)
      expect(guardFor(a, other, solo)).toEqual({
        ok: false,
        reason: LAST_ADMIN,
      });
    // As core counts it: an admin without two-step doesn't keep it running.
    const noTwoStep = [
      other,
      makeStaff({
        id: "n",
        roles: ["hospital_admin"],
        issues: ["mfa_not_set_up"],
      }),
    ];
    expect(guardFor("deactivate", other, noTwoStep).ok).toBe(false);
    expect(guardFor("deactivate", noTwoStep[1]!, noTwoStep)).toEqual({
      ok: true,
    });
  });

  it("doesn't count a deactivated admin, and lets a non-admin go", () => {
    const gone = makeStaff({
      id: "g",
      roles: ["hospital_admin"],
      status: "deactivated",
    });
    expect(guardFor("deactivate", gone, [me, gone])).toEqual({ ok: true });
    expect(guardFor("drop_admin", clinician, [other, clinician])).toEqual({
      ok: true,
    });
    expect(guardFor("deactivate", other, [other, me])).toEqual({ ok: true });
  });

  it("allows the rest", () => {
    expect(guardFor("deactivate", other, [me, other])).toEqual({ ok: true });
    expect(guardFor("deactivate", clinician, [me, clinician])).toEqual({
      ok: true,
    });
  });

  it("explains the self rule in words", () => {
    expect(SELF_ADD).toMatch(/can't give yourself a role/);
  });
});

describe("labels", () => {
  it("shortens last active the way the table shows it", () => {
    expect(lastActiveLabel(null, NOW)).toBeNull();
    expect(lastActiveLabel("garbage", NOW)).toBeNull();
    expect(lastActiveLabel(iso(NOW - 30_000), NOW)).toBe("now");
    expect(lastActiveLabel(iso(NOW - 2 * 3_600_000), NOW)).toBe("2 h");
    expect(lastActiveLabel(iso(NOW - D), NOW)).toBe("1 d");
    expect(lastActiveLabel(iso(NOW - 21 * D), NOW)).toBe("3 w");
  });
  it("names roles in plain words", () => {
    expect(rolesText(["clinician", "hospital_admin"])).toBe(
      "Clinician · Hospital admin",
    );
  });
});

describe("sign-in labels", () => {
  it("uses two-step wording", () => {
    expect(SIGN_IN_LABEL).toEqual({
      sso: "Hospital account",
      password_mfa: "Password + two-step",
      password: "Password",
    });
  });
});

describe("policyBroken", () => {
  it("warns when 2-step is missing and the hospital requires it", () => {
    const missing = makeStaff({ issues: ["mfa_not_set_up"] });
    expect(policyBroken(missing, true)).toBe(true);
    expect(policyBroken(missing, false)).toBe(false);
    // Hospital admins always need it (spec section 10 item 7).
    expect(policyBroken({ ...missing, roles: ["hospital_admin"] }, false)).toBe(
      true,
    );
    expect(policyBroken({ ...missing, status: "deactivated" }, true)).toBe(
      false,
    );
    expect(policyBroken(makeStaff(), true)).toBe(false);
  });
});
