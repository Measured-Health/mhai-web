import { describe, expect, it } from "vitest";
import { createStepUp, MOCK_CODE } from "../auth/mock";
import { ApiError } from "./errors";
import { createMockPatients } from "./mock-patients";
import { EXCLUSION_SCHEMA, PATIENT_MATCHES_SCHEMA } from "./patients-schema";

const NOW = Date.parse("2026-11-14T09:00:00Z");
const make = (held = false) => {
  const step = createStepUp(() => NOW);
  return createMockPatients({
    now: () => NOW,
    delayMs: 0,
    held,
    stepUp: () => step,
    me: async () => "admin@demo.test",
  });
};
const ok = { mfaCode: MOCK_CODE };
const bad = { mfaCode: "000000" };
let n = 0;
const key = () => ({ idempotencyKey: `k-${++n}` });
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: ApiError) => `${e.status} ${e.code}`,
  );

describe("mock patient matches and exclusions", () => {
  it("lists synthetic matches in core's exact shape", async () => {
    const r = await make().listMatches();
    expect(PATIENT_MATCHES_SCHEMA.safeParse(r).success).toBe(true);
    expect(r.matches.length).toBeGreaterThan(0);
  });

  it("checks the match before the code, so a refused request spends none", async () => {
    const c = make();
    expect(await code(c.rejectMatch("nope", bad, key()))).toBe("404 not_found");
    const [m] = (await c.listMatches()).matches;
    expect(await code(c.rejectMatch(m!.id, bad, key()))).toBe(
      "403 mfa_invalid",
    );
  });

  it("merges into the kept patient: the other's records move, and its matches go", async () => {
    const c = make();
    const [m] = (await c.listMatches()).matches;
    await c.confirmMatch(m!.id, "a", ok, key());
    const left = (await c.listMatches()).matches;
    expect(left.find((x) => x.id === m!.id)).toBeUndefined();
    expect(left.some((x) => x.a.id === m!.b.id || x.b.id === m!.b.id)).toBe(
      false,
    );
    // Decided once: a second decision is 404.
    expect(await code(c.confirmMatch(m!.id, "a", ok, key()))).toBe(
      "404 not_found",
    );
  });

  it("replays one key's answer", async () => {
    const c = make();
    const [m] = (await c.listMatches()).matches;
    const k = key();
    await c.rejectMatch(m!.id, ok, k);
    expect(await code(c.rejectMatch(m!.id, ok, k))).toBe("ok");
  });

  it("excludes by MRN, deleting at once without a hold", async () => {
    const r = await make().excludePatient(
      { mrn: "SYN-400512", reason: "objection" },
      ok,
      key(),
    );
    expect(EXCLUSION_SCHEMA.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({
      purge_held: false,
      purge_by: new Date(NOW).toISOString(),
    });
  });

  it("holds the deletion under a legal hold", async () => {
    const r = await make(true).excludePatient(
      { mrn: "SYN-400512", reason: "hospital_policy" },
      ok,
      key(),
    );
    expect(r.purge_held).toBe(true);
  });

  it("refuses an unknown MRN (404) and a shared one (409) before the code", async () => {
    const c = make();
    expect(
      await code(
        c.excludePatient({ mrn: "SYN-NONE", reason: "other" }, bad, key()),
      ),
    ).toBe("404 not_found");
    expect(
      await code(
        c.excludePatient({ mrn: "SYN-100231", reason: "other" }, bad, key()),
      ),
    ).toBe("409 conflict");
    expect(
      await code(
        c.excludePatient({ mrn: "SYN-400512", reason: "other" }, bad, key()),
      ),
    ).toBe("403 mfa_invalid");
  });

  it("drops an excluded patient's matches and refuses them again", async () => {
    const c = make();
    const [m] = (await c.listMatches()).matches;
    await c.excludePatient({ patient_id: m!.a.id, reason: "other" }, ok, key());
    expect((await c.listMatches()).matches.some((x) => x.id === m!.id)).toBe(
      false,
    );
    expect(
      await code(
        c.excludePatient({ patient_id: m!.a.id, reason: "other" }, ok, key()),
      ),
    ).toBe("404 not_found");
  });

  it("refuses a bad body with 422", async () => {
    expect(
      await code(
        make().excludePatient(
          { mrn: "SYN-400512", reason: "dislike" as "other" },
          ok,
          key(),
        ),
      ),
    ).toBe("422 validation_failed");
  });
});
