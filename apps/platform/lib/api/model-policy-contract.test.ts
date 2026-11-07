import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { AGREEMENT_REF, readModelPolicy } from "./model-policy-contract";

const GOOD = {
  hospital_id: "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
  cloud_provider: "anthropic",
  agreement_ref: "DEMO-SYNTHETIC",
  monthly_token_budget: 2_000_000,
  updated_at: "2026-11-05T09:00:00Z",
  usage: { month: "2026-11", used: 1_240_000, reserved: 12_000 },
};
const OFF = {
  ...GOOD,
  cloud_provider: null,
  agreement_ref: null,
  updated_at: null,
  usage: { month: "2026-11", used: 0, reserved: 0 },
};

const ID = GOOD.hospital_id;
/** The refusal for a reply (read for hospital ID), or for a read itself. */
const refused = (v: unknown) => {
  try {
    if (typeof v === "function") v();
    else readModelPolicy(v, ID);
  } catch (e) {
    return e instanceof ApiError ? `${e.status} ${e.code}` : "other";
  }
  return "read";
};

describe("readModelPolicy", () => {
  it("reads a policy on a provider, and one that is off", () => {
    expect(readModelPolicy(GOOD, ID)).toEqual(GOOD);
    expect(readModelPolicy(OFF, ID)).toEqual(OFF);
  });

  it.each([
    ["an unknown provider", { ...GOOD, cloud_provider: "gemini" }],
    ["a provider with no reference", { ...GOOD, agreement_ref: null }],
    ["a reference of the wrong shape", { ...GOOD, agreement_ref: "Dr Obi" }],
    ["a lower-case reference", { ...GOOD, agreement_ref: "agr-2026-0042" }],
    ["a zero limit", { ...GOOD, monthly_token_budget: 0 }],
    ["a fractional limit", { ...GOOD, monthly_token_budget: 1.5 }],
    ["a limit over the maximum", { ...GOOD, monthly_token_budget: 1e9 + 1 }],
    ["a negative use", { ...GOOD, usage: { ...GOOD.usage, used: -1 } }],
    ["a text count", { ...GOOD, usage: { ...GOOD.usage, reserved: "5" } }],
    ["a bad month", { ...GOOD, usage: { ...GOOD.usage, month: "2026-13" } }],
    ["an extra key", { ...GOOD, api_key: "x" }],
    ["an extra usage key", { ...GOOD, usage: { ...GOOD.usage, cost: 1 } }],
    ["a missing key", { ...GOOD, updated_at: undefined }],
    ["a bad date", { ...GOOD, updated_at: "yesterday" }],
    ["no usage", { ...GOOD, usage: null }],
    ["not an object", []],
    ["nothing", null],
  ])("fails closed on %s", (_name, v) => {
    expect(refused(v)).toBe("502 bad_gateway");
  });

  it("fails closed on another hospital's policy", () => {
    expect(readModelPolicy(GOOD, ID)).toEqual(GOOD);
    expect(
      refused(() =>
        readModelPolicy(GOOD, "0b8e7c1d-2f3a-4b5c-9d6e-7f8091a2b3c4"),
      ),
    ).toBe("502 bad_gateway");
  });

  it("the reference pattern is core's", () => {
    for (const ok of [
      "DEMO-SYNTHETIC",
      "AGR-2026-0042",
      "DPA-2026-12",
      "AGR-2026-12345678",
    ])
      expect(AGREEMENT_REF.test(ok)).toBe(true);
    for (const no of [
      "AGR-26-0042",
      "AGR-2026-1",
      "AGR-2026-123456789",
      "DEMO",
      "MOU-2026-0042",
      " AGR-2026-0042",
    ])
      expect(AGREEMENT_REF.test(no)).toBe(false);
  });
});
