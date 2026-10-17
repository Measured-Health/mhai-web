import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW, makeStaff } from "@/tests/admin";
import {
  LAST_ADMIN,
  SIGN_IN_LABEL,
  attentionLabel,
  filterStaff,
  guardFor,
  inviteNote,
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
  it("reads status and problems as the four states", () => {
    expect(staffState(makeStaff(), NOW)).toBe("active");
    expect(staffState(makeStaff({ issues: ["mfa_not_set_up"] }), NOW)).toBe(
      "attention",
    );
    expect(
      staffState(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW + D) }),
        NOW,
      ),
    ).toBe("invited");
    expect(
      staffState(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW - 1) }),
        NOW,
      ),
    ).toBe("attention");
    expect(
      staffState(
        makeStaff({ status: "invited", issues: ["invite_expired"] }),
        NOW,
      ),
    ).toBe("attention");
    expect(
      staffState(
        makeStaff({ status: "deactivated", issues: ["mfa_not_set_up"] }),
        NOW,
      ),
    ).toBe("deactivated");
  });

  it("says what needs attention in words", () => {
    expect(attentionLabel(makeStaff({ issues: ["mfa_not_set_up"] }), NOW)).toBe(
      "Two-step not set up",
    );
    expect(
      statusText(
        makeStaff({ status: "invited", issues: ["invite_expired"] }),
        NOW,
      ),
    ).toBe("Invite expired");
    expect(statusText(makeStaff(), NOW)).toBe("Active");
    expect(statusText(makeStaff({ status: "deactivated" }), NOW)).toBe(
      "Deactivated",
    );
  });

  it("explains an invite's state", () => {
    expect(
      inviteNote(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW + 5 * D) }),
        NOW,
      ),
    ).toBe("Invite expires in 5 days");
    expect(
      inviteNote(
        makeStaff({
          status: "invited",
          invite_expires_at: iso(NOW + 3_600_000),
        }),
        NOW,
      ),
    ).toBe("Invite expires in 1 day");
    expect(
      inviteNote(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW - D) }),
        NOW,
      ),
    ).toBe("Invite expired. Send a new one.");
    expect(inviteNote(makeStaff({ status: "invited" }), NOW)).toBe(
      "Waiting for their first sign-in with their hospital account",
    );
    expect(inviteNote(makeStaff(), NOW)).toBeNull();
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
    makeStaff({
      id: "e",
      full_name: "Dr. Funmi Adeyemi",
      status: "invited",
      invite_expires_at: iso(NOW + D),
    }),
  ];

  it("counts each filter", () => {
    expect(staffCounts(list, NOW)).toEqual({
      all: 5,
      active: 2,
      invited: 1,
      attention: 1,
      deactivated: 1,
    });
  });

  it("filters, sorts by name without the title, and ignores accents and case", () => {
    expect(filterStaff(list, "all", "", NOW).map((s) => s.id)).toEqual([
      "e",
      "b",
      "d",
      "c",
      "a",
    ]);
    expect(filterStaff(list, "active", "", NOW).map((s) => s.id)).toEqual([
      "b",
      "a",
    ]);
    expect(filterStaff(list, "all", "zoe abaro", NOW).map((s) => s.id)).toEqual(
      ["a"],
    );
    expect(filterStaff(list, "all", "PAEDI", NOW).map((s) => s.id)).toEqual([
      "a",
    ]);
    expect(
      filterStaff(list, "all", "admin.nwosu", NOW).map((s) => s.id),
    ).toEqual(["b"]);
    expect(filterStaff(list, "attention", "zoe", NOW)).toEqual([]);
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
    expect(guardFor("remove", me, list)).toEqual({
      ok: false,
      reason: "You can't remove your own account. Ask another hospital admin.",
    });
    expect(guardFor("drop_admin", me, list)).toEqual({
      ok: false,
      reason:
        "You can't remove your own hospital admin role. Ask another hospital admin.",
    });
  });

  it("keeps the last active admin (Review Focus 4)", () => {
    const solo = [other, clinician];
    for (const a of ["deactivate", "remove", "drop_admin"] as const)
      expect(guardFor(a, other, solo)).toEqual({
        ok: false,
        reason: LAST_ADMIN,
      });
    // An invited or deactivated admin doesn't count as the one keeping it running.
    const withInvite = [
      other,
      makeStaff({ id: "i", roles: ["hospital_admin"], status: "invited" }),
    ];
    expect(guardFor("deactivate", other, withInvite).ok).toBe(false);
  });

  it("doesn't count a deactivated admin, and lets a non-admin go", () => {
    const gone = makeStaff({
      id: "g",
      roles: ["hospital_admin"],
      status: "deactivated",
    });
    expect(guardFor("remove", gone, [me, gone])).toEqual({ ok: true });
    expect(guardFor("drop_admin", clinician, [other, clinician])).toEqual({
      ok: true,
    });
    expect(guardFor("deactivate", other, [other, me])).toEqual({ ok: true });
  });

  it("allows the rest", () => {
    expect(guardFor("deactivate", other, [me, other])).toEqual({ ok: true });
    expect(guardFor("remove", clinician, [me, clinician])).toEqual({
      ok: true,
    });
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
