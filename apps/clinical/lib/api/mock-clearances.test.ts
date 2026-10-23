import { beforeEach, describe, expect, it } from "vitest";
import { NotEligibleError } from "@mhai/api-client/errors";
import { ADMIN_NOW, mockAdminAs } from "@/tests/admin";
import { DEMO_EMAILS, MOCK_CODE, createStepUp } from "@/lib/auth/mock";
import { ApiError } from "./errors";
import type { ClearanceClient } from "./clearances";
import type { ClearanceUpload } from "./clearances-contract";
import { statusLine } from "@/lib/clearances/status";
import { auditEvents, resetAudit } from "./mock-audit";
import {
  CHECK_MS,
  coverFor,
  endOfHospitalDay,
  createMockClearances,
  resetClearances,
} from "./mock-clearances";

const GOOD = { mfaCode: MOCK_CODE };
let n = 0;
const key = () => ({ idempotencyKey: `k-${n++}` });
const DAY = 86_400_000;
let clock = ADMIN_NOW;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return "ok";
};

const as = (
  email: string = DEMO_EMAILS.hospitalAdmin,
  namedAccess: "off" | "letters_only" | "on" = "on",
): ClearanceClient => {
  const admin = mockAdminAs(email);
  return createMockClearances({
    now: () => clock,
    me: async () => email,
    delayMs: 0,
    stepUp: createStepUp(() => clock),
    namedAccess,
    staff: () => admin.listStaff(),
  });
};

const bytes = (head: number[], size = 64) => {
  const b = new Uint8Array(size);
  b.set(head);
  return b;
};
const PDF = [0x25, 0x50, 0x44, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const upload = (over: Partial<ClearanceUpload> = {}): ClearanceUpload => ({
  file: new File([bytes(PDF)], "letter.pdf", { type: "application/pdf" }),
  signed_by: "Dr. Funmi Ade",
  signer_title: "Chief Medical Director",
  letter_date: "2026-10-10",
  covered: ["s-obi"],
  end_date: "2027-03-12",
  ...GOOD,
  ...over,
});

beforeEach(() => {
  resetClearances();
  resetAudit();
  clock = ADMIN_NOW;
});

describe("the sample letters", () => {
  it("cover every status", async () => {
    const out = await as().listClearances();
    const by = Object.fromEntries(out.clearances.map((c) => [c.id, c]));
    expect(Object.keys(by).sort()).toEqual([
      "cl_act",
      "cl_bad",
      "cl_check",
      "cl_end",
      "cl_rej",
      "cl_rev",
      "cl_soon",
      "cl_wait",
    ]);
    expect(out.clearances.map((c) => c.status).sort()).toEqual([
      "active",
      "active",
      "checking",
      "ended",
      "refused",
      "rejected",
      "revoked",
      "waiting",
    ]);
    expect(out.today).toBe("2026-10-16");
    expect(out.max_end_date).toBe("2027-10-16");
    expect(by.cl_bad!.refused_reason).toBe("failed_safety_check");
    expect(by.cl_rej!.rejection!.reason).toBe("end_date_mismatch");
    expect(by.cl_rev!.revocation).toMatchObject({
      reason: "person_left",
      by: { display_name: "Grace Nwosu" },
    });
    expect(by.cl_rev!.covered[0]).toEqual({
      id: "s-eze",
      display_name: "Dr. Eze",
    });
    expect(by.cl_wait!.pages).toBe(3);
    expect(by.cl_wait!.covered_platform.map((p) => p.display_name)).toEqual([
      "Tunde Okafor",
    ]);
    expect(by.cl_act!.verified_by).toEqual({ display_name: "Tunde Okafor" });
    expect(by.cl_soon!.end_date).toBe("2026-10-28");
    expect(by.cl_soon!.history.some((e) => e.kind === "reminded")).toBe(true);
    expect(by.cl_end!.end_date).toBe("2026-08-17");
    for (const c of out.clearances) {
      expect(c.signed_by).toBe("Dr. Funmi Ade");
      if (c.id !== "cl_wait") expect(c.covered_platform).toEqual([]);
    }
    // newest first
    const at = out.clearances.map((c) => c.uploaded_at);
    expect([...at].sort().reverse()).toEqual(at);
  });

  it("moves letters past their end date to ended, logging it once", async () => {
    const c = as();
    await c.listClearances(); // the sample is dated from the first look
    clock = ADMIN_NOW + 13 * DAY; // cl_soon ended on 28 Oct; this is 29 Oct
    const out = await c.listClearances();
    expect(out.clearances.find((x) => x.id === "cl_soon")!.status).toBe(
      "ended",
    );
    await c.listClearances();
    expect(
      auditEvents().filter((e) => e.kind === "clearance_ended"),
    ).toHaveLength(1);
  });
});

describe("uploading", () => {
  it("is checking, then waiting after 3 seconds", async () => {
    const c = as();
    const up = await c.uploadClearance(upload(), key());
    expect(up.status).toBe("checking");
    expect(up.pages).toBe(0);
    expect(up.uploaded_by.display_name).toBe("Grace Nwosu");
    expect(up.covered).toEqual([{ id: "s-obi", display_name: "Dr. Obi" }]);
    clock += CHECK_MS - 1;
    expect((await c.getClearance(up.id)).status).toBe("checking");
    clock += 1;
    const ready = await c.getClearance(up.id);
    expect(ready.status).toBe("waiting");
    expect(ready.pages).toBeGreaterThan(0);
    expect(ready.history.map((e) => e.kind)).toEqual(["uploaded", "ready"]);
    expect(auditEvents().map((e) => [e.kind, e.type, e.flag])).toEqual([
      ["clearance_uploaded", "admin", null],
    ]);
    expect(auditEvents()[0]!.actor).toEqual({ display_name: "Grace Nwosu" });
  });

  it("checks the first bytes: a .pdf name with PNG bytes is accepted (the name doesn't count); a text file named .pdf is 415", async () => {
    const c = as();
    const png = new File([bytes(PNG)], "scan.pdf");
    expect(await code(c.uploadClearance(upload({ file: png }), key()))).toBe(
      "ok",
    );
    const jpg = new File([bytes([0xff, 0xd8, 0xff, 0xe0])], "a.jpg");
    expect(await code(c.uploadClearance(upload({ file: jpg }), key()))).toBe(
      "ok",
    );
    const text = new File(["hello, not a pdf"], "letter.pdf", {
      type: "application/pdf",
    });
    expect(await code(c.uploadClearance(upload({ file: text }), key()))).toBe(
      "415 file_type",
    );
  });

  it("refuses 11 MB with 413", async () => {
    const big = new File([bytes(PDF, 11 * 1024 * 1024)], "big.pdf");
    expect(await code(as().uploadClearance(upload({ file: big }), key()))).toBe(
      "413 file_too_large",
    );
    const ten = new File([bytes(PDF, 10 * 1024 * 1024)], "ten.pdf");
    expect(await code(as().uploadClearance(upload({ file: ten }), key()))).toBe(
      "ok",
    );
  });

  it("checks the end date against today and max_end_date", async () => {
    const c = as();
    expect(
      await code(c.uploadClearance(upload({ end_date: "2027-10-17" }), key())),
    ).toBe("422 end_date_too_late");
    expect(
      await code(c.uploadClearance(upload({ end_date: "2027-10-16" }), key())),
    ).toBe("ok");
    expect(
      await code(c.uploadClearance(upload({ end_date: "2026-10-16" }), key())),
    ).toBe("422 invalid");
    expect(
      await code(c.uploadClearance(upload({ end_date: "soon" }), key())),
    ).toBe("422 invalid");
  });

  it("checks the letter date", async () => {
    const c = as();
    expect(
      await code(
        c.uploadClearance(upload({ letter_date: "2026-10-17" }), key()),
      ),
    ).toBe("422 invalid");
    expect(
      await code(
        c.uploadClearance(
          upload({ letter_date: "2026-12-01", end_date: "2026-11-01" }),
          key(),
        ),
      ),
    ).toBe("422 invalid");
  });

  it("refuses an ineligible person (a clinician without Analyst) with their id", async () => {
    const err = await as()
      .uploadClearance(
        upload({ covered: ["s-obi", "s-reyes", "s-mensah"] }),
        key(),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotEligibleError);
    expect((err as NotEligibleError).status).toBe(422);
    expect((err as NotEligibleError).code).toBe("not_eligible");
    expect((err as NotEligibleError).ids).toEqual(["s-reyes", "s-mensah"]);
  });

  it("counts covered and covered_platform together: 21 is 422, 20 is fine", async () => {
    const c = as();
    const emails = (k: number) =>
      Array.from({ length: k }, () => "ada.bakare@measured-health.example");
    // The count is checked before who they are.
    const many = Array.from({ length: 21 }, (_, i) => `s-x${i}`);
    expect(
      await code(c.uploadClearance(upload({ covered: many }), key())),
    ).toBe("422 invalid");
    expect(
      await code(
        c.uploadClearance(
          upload({ covered: many.slice(0, 20), covered_platform: emails(1) }),
          key(),
        ),
      ),
    ).toBe("422 invalid");
    expect(await code(c.uploadClearance(upload({ covered: [] }), key()))).toBe(
      "422 invalid",
    );
    // 20 in total gets past the count and fails on who they are instead.
    expect(
      await code(
        c.uploadClearance(upload({ covered: many.slice(0, 20) }), key()),
      ),
    ).toBe("422 not_eligible");
  });

  it("refuses a renews that isn't an opaque id", async () => {
    expect(
      await code(as().uploadClearance(upload({ renews: "../x" }), key())),
    ).toBe("422 invalid");
  });

  it("may cover Tunde Okafor by email, and he comes back in covered_platform with his name", async () => {
    const out = await as().uploadClearance(
      upload({
        covered_platform: ["Tunde.Okafor@measured-health.example"],
      }),
      key(),
    );
    expect(out.covered.map((p) => p.id)).toEqual(["s-obi"]);
    expect(out.covered_platform).toEqual([
      { id: "pa_tunde", display_name: "Tunde Okafor" },
    ]);
    const only = await as().uploadClearance(
      upload({
        covered: [],
        covered_platform: ["bola.hassan@measured-health.example"],
      }),
      key(),
    );
    expect(only.covered_platform[0]!.display_name).toBe("Bola Hassan");
  });

  it("refuses an email that isn't an active platform admin with the emails", async () => {
    const err = await as()
      .uploadClearance(
        upload({
          covered_platform: [
            "ada.bakare@measured-health.example",
            "nobody@measured-health.example",
          ],
        }),
        key(),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotEligibleError);
    expect((err as NotEligibleError).code).toBe("not_eligible_platform");
    expect((err as NotEligibleError).emails).toEqual([
      "nobody@measured-health.example",
    ]);
  });

  it("refuses a wrong code with 403 mfa_invalid", async () => {
    expect(
      await code(as().uploadClearance(upload({ mfaCode: "000000" }), key())),
    ).toBe("403 mfa_invalid");
  });

  it("is idempotent by key", async () => {
    const c = as();
    const k = { idempotencyKey: "same" };
    const a = await c.uploadClearance(upload(), k);
    const b = await c.uploadClearance(upload(), k);
    expect(b.id).toBe(a.id);
    expect((await c.listClearances()).clearances).toHaveLength(9);
  });
});

describe("revoking", () => {
  it("lets any hospital admin revoke, not only the uploader", async () => {
    // cl_wait was uploaded by Grace; Dr. Obi is also a hospital admin.
    const out = await as(DEMO_EMAILS.director).revokeClearance(
      "cl_wait",
      { reason: "uploaded_in_error", note: "Wrong people", ...GOOD },
      key(),
    );
    expect(out.status).toBe("revoked");
    expect(out.revocation?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(statusLine(out, out.revocation!.day).words).toMatch(
      /^Revoked \d{1,2} \w{3} \d{4}$/,
    );
    expect(out.revocation).toMatchObject({
      by: { display_name: "Dr. Obi" },
      side: "hospital",
      reason: "uploaded_in_error",
      note: "Wrong people",
    });
    expect(out.version).toBeGreaterThan(1);
    expect(auditEvents().at(-1)).toMatchObject({
      kind: "clearance_revoked",
      type: "admin",
      flag: null,
    });
  });

  it("refuses a revoked, ended, rejected or refused letter with 409", async () => {
    const c = as();
    const body = { reason: "other" as const, ...GOOD };
    expect(await code(c.revokeClearance("cl_act", body, key()))).toBe("ok");
    for (const id of ["cl_act", "cl_rev", "cl_end", "cl_rej", "cl_bad"])
      expect(await code(c.revokeClearance(id, body, key())), id).toBe(
        "409 conflict",
      );
    expect(await code(c.revokeClearance("cl_zzz", body, key()))).toBe(
      "404 not_found",
    );
  });

  it("needs the code", async () => {
    expect(
      await code(
        as().revokeClearance(
          "cl_act",
          { reason: "other", mfaCode: "1" },
          key(),
        ),
      ),
    ).toBe("403 mfa_invalid");
  });
});

describe("narrowing", () => {
  const wait = async (c: ClearanceClient) => await c.getClearance("cl_wait");

  it("can remove a platform person", async () => {
    const c = as();
    const before = await wait(c);
    const out = await c.narrowClearance(
      "cl_wait",
      {
        remove: ["pa_tunde"],
        reason: "other",
        version: before.version,
        ...GOOD,
      },
      key(),
    );
    expect(out.covered_platform).toEqual([]);
    expect(out.covered).toHaveLength(1);
    expect(out.version).toBe(before.version + 1);
    const ev = out.history.at(-1)!;
    expect(ev.kind).toBe("narrowed");
    expect(ev.removed).toEqual([
      { id: "pa_tunde", display_name: "Tunde Okafor" },
    ]);
    expect(auditEvents().at(-1)).toMatchObject({
      kind: "clearance_narrowed",
      target: { display_name: "Tunde Okafor" },
    });
  });

  it("refuses a stale version with 409 conflict", async () => {
    const c = as();
    const v = (await wait(c)).version;
    expect(
      await code(
        c.narrowClearance(
          "cl_wait",
          { remove: ["pa_tunde"], reason: "other", version: v - 1, ...GOOD },
          key(),
        ),
      ),
    ).toBe("409 conflict");
    expect(
      await code(
        c.narrowClearance(
          "cl_wait",
          { remove: ["pa_tunde"], reason: "other", ...GOOD } as never,
          key(),
        ),
      ),
    ).toBe("409 conflict");
  });

  it("refuses narrowing to nobody with 422 would_empty", async () => {
    const c = as();
    const v = (await wait(c)).version;
    expect(
      await code(
        c.narrowClearance(
          "cl_wait",
          {
            remove: ["s-obi", "pa_tunde"],
            reason: "other",
            version: v,
            ...GOOD,
          },
          key(),
        ),
      ),
    ).toBe("422 would_empty");
  });

  it("refuses people who aren't on the letter with 422 invalid", async () => {
    const c = as();
    const v = (await wait(c)).version;
    for (const remove of [["s-nwosu"], []])
      expect(
        await code(
          c.narrowClearance(
            "cl_wait",
            { remove, reason: "other", version: v, ...GOOD },
            key(),
          ),
        ),
      ).toBe("422 invalid");
  });
});

describe("the letter's pages", () => {
  it("logs clearance_viewed on each page view", async () => {
    const c = as();
    await c.getClearancePage("cl_wait", 1);
    await c.getClearancePage("cl_wait", 2);
    const views = auditEvents().filter((e) => e.kind === "clearance_viewed");
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      type: "admin",
      flag: null,
      actor: { display_name: "Grace Nwosu" },
    });
  });

  it("is watermarked with the viewer and the time", async () => {
    const blob = await as(DEMO_EMAILS.director).getClearancePage("cl_wait", 2);
    expect(blob.type).toBe("image/svg+xml");
    const svg = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsText(blob);
    });
    expect(svg).toContain("Sample clearance letter · page 2");
    // 16 Oct 2026 10:00 UTC is 11:00 at the hospital (Africa/Lagos).
    expect(svg).toContain("Dr. Obi · 16 Oct 2026 11:00");
  });

  it("refuses pages that don't exist or aren't ready", async () => {
    const c = as();
    expect(await code(c.getClearancePage("cl_wait", 4))).toBe("404 not_found");
    expect(await code(c.getClearancePage("cl_wait", 0))).toBe("404 not_found");
    expect(await code(c.getClearancePage("cl_check", 1))).toBe("409 not_ready");
    expect(await code(c.getClearancePage("cl_nope", 1))).toBe("404 not_found");
  });
});

describe("named access off", () => {
  it("makes every call 403 named_access_off, and reads as Off", async () => {
    const c = as(DEMO_EMAILS.hospitalAdmin, "off");
    const key1 = key();
    expect(await code(c.listClearances())).toBe("403 named_access_off");
    expect(await code(c.getClearance("cl_act"))).toBe("403 named_access_off");
    expect(await code(c.uploadClearance(upload(), key1))).toBe(
      "403 named_access_off",
    );
    expect(
      await code(
        c.revokeClearance("cl_act", { reason: "other", ...GOOD }, key1),
      ),
    ).toBe("403 named_access_off");
    expect(
      await code(
        c.narrowClearance(
          "cl_act",
          { remove: ["s-nwosu"], reason: "other", version: 1, ...GOOD },
          key1,
        ),
      ),
    ).toBe("403 named_access_off");
    expect(await code(c.getClearancePage("cl_act", 1))).toBe(
      "403 named_access_off",
    );
    expect(await c.getNamedAccess()).toEqual({ position: "off", since: null });
  });

  it("reads the position when on", async () => {
    expect((await as().getNamedAccess()).position).toBe("on");
    expect(
      (await as(DEMO_EMAILS.hospitalAdmin, "letters_only").getNamedAccess())
        .position,
    ).toBe("letters_only");
  });
});

describe("coverFor", () => {
  it("returns cl_act for Grace Nwosu, and not covered after it is revoked", async () => {
    expect(coverFor("s-nwosu", ADMIN_NOW)).toMatchObject({
      covered: true,
      clearance_id: "cl_act",
      // 2 Mar 2027, end of the hospital's day (23:59:59.999 at UTC+1)
      until: "2027-03-02T22:59:59.999Z",
    });
    await as().revokeClearance("cl_act", { reason: "other", ...GOOD }, key());
    expect(coverFor("s-nwosu", ADMIN_NOW).covered).toBe(false);
  });

  it("covers Kemi by cl_soon, and Dr. Obi by nothing (his letter is waiting)", () => {
    expect(coverFor("s-kemi", ADMIN_NOW)).toMatchObject({
      covered: true,
      clearance_id: "cl_soon",
      until: "2026-10-28T22:59:59.999Z",
    });
    expect(coverFor("s-obi", ADMIN_NOW)).toEqual({
      covered: false,
      reason: "not_cleared",
    });
    // Revoked 20 days ago: long gone.
    expect(coverFor("s-eze", ADMIN_NOW)).toEqual({
      covered: false,
      reason: "not_cleared",
    });
  });

  it("stops the instant the hospital's day ends, not the UTC day", () => {
    coverFor("s-kemi", ADMIN_NOW); // the sample is dated from the first look
    const end = Date.parse("2026-10-28T22:59:59.999Z");
    expect(coverFor("s-kemi", end).covered).toBe(true);
    expect(coverFor("s-kemi", end + 1)).toEqual({
      covered: false,
      reason: "ended",
    });
  });

  it("says ended for 24 hours after a letter ends, then not_cleared", () => {
    coverFor("s-kemi", ADMIN_NOW);
    const end = Date.parse("2026-10-28T22:59:59.999Z");
    expect(coverFor("s-kemi", end + DAY)).toMatchObject({ reason: "ended" });
    expect(coverFor("s-kemi", end + DAY + 2)).toMatchObject({
      reason: "not_cleared",
    });
  });

  it("says ended for 24 hours after a revoke, then not_cleared", async () => {
    await as().revokeClearance("cl_act", { reason: "other", ...GOOD }, key());
    expect(coverFor("s-nwosu", ADMIN_NOW + 23 * 3_600_000)).toEqual({
      covered: false,
      reason: "ended",
    });
    expect(coverFor("s-nwosu", ADMIN_NOW + 25 * 3_600_000)).toEqual({
      covered: false,
      reason: "not_cleared",
    });
  });
});

describe("endOfHospitalDay", () => {
  it("is the last millisecond of that day at the hospital, at a month end too", () => {
    expect(endOfHospitalDay("2026-10-31")).toBe("2026-10-31T22:59:59.999Z");
    expect(endOfHospitalDay("2026-12-31")).toBe("2026-12-31T22:59:59.999Z");
    expect(endOfHospitalDay("2028-02-29")).toBe("2028-02-29T22:59:59.999Z");
  });
});
