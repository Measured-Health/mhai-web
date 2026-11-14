import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { MOCK_MERGED_PATIENT_ID } from "./mock-alerts";
import { createMockLookup, MOCK_SHARED_MRN } from "./mock-lookup";

const clock = () => {
  let t = Date.UTC(2026, 10, 14, 9, 0, 0);
  return { now: () => t, tick: (ms: number) => void (t += ms) };
};
const refusal = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: (e as ApiError).code };
};

describe("mock patient lookup (core 1.29.0 rules)", () => {
  it("finds one active patient by the exact MRN, normalised", async () => {
    const m = createMockLookup({ delayMs: 0 });
    expect(await m.lookupPatient(" 204817 ")).toEqual({
      id: "6f1c2a01-5e1d-4c3b-9a7e-000000000001",
      full_name: "Maryam Abdullahi",
      mrn: "204817",
      age: 67,
      sex: "female",
    });
  });

  it("is 404 for a miss, part of an MRN, and a merged patient", async () => {
    const m = createMockLookup({ delayMs: 0 });
    for (const mrn of ["000000", "2048", "20481"])
      expect(await refusal(m.lookupPatient(mrn))).toEqual({
        status: 404,
        code: "not_found",
      });
    // Samuel Bassey, merged since his alert.
    expect(MOCK_MERGED_PATIENT_ID).toBeTruthy();
    expect(await refusal(m.lookupPatient("640212"))).toEqual({
      status: 404,
      code: "not_found",
    });
  });

  it("is 409 when two patients share the MRN", async () => {
    const m = createMockLookup({ delayMs: 0 });
    expect(await refusal(m.lookupPatient(MOCK_SHARED_MRN))).toEqual({
      status: 409,
      code: "conflict",
    });
  });

  it("is 422 for a malformed MRN, which doesn't count", async () => {
    const c = clock();
    const m = createMockLookup({ delayMs: 0, now: c.now });
    for (let i = 0; i < 6; i++)
      expect((await refusal(m.lookupPatient("20%48"))).status).toBe(422);
    await expect(m.lookupPatient("204817")).resolves.toBeTruthy();
  });

  it("refuses the 6th lookup in a minute, misses included, then allows again", async () => {
    const c = clock();
    const m = createMockLookup({ delayMs: 0, now: c.now });
    await m.lookupPatient("204817");
    for (let i = 0; i < 4; i++) await refusal(m.lookupPatient("000000"));
    expect(await refusal(m.lookupPatient("204817"))).toEqual({
      status: 429,
      code: "rate_limited",
    });
    c.tick(60_000);
    await expect(m.lookupPatient("204817")).resolves.toBeTruthy();
  });

  it("refuses the 51st lookup in a day, and starts again the next day", async () => {
    const c = clock();
    const m = createMockLookup({ delayMs: 0, now: c.now });
    for (let i = 0; i < 50; i++) {
      await m.lookupPatient("204817");
      c.tick(13_000);
    }
    c.tick(60_000);
    expect((await refusal(m.lookupPatient("204817"))).status).toBe(429);
    c.tick(24 * 3_600_000);
    await expect(m.lookupPatient("204817")).resolves.toBeTruthy();
  });
});
