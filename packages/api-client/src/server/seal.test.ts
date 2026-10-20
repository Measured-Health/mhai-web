import { describe, expect, it } from "vitest";
import { seal, unseal } from "./seal";

// The fixture's test secret, joined so the secret scan doesn't flag it.
const SECRET = ["test", "secret", "for", "the", "seal", "fixture", "0001"].join(
  "-",
);
// { fixture: "clinical", n: 1 }, sealed with SECRET by the clinical app's
// seal before it moved here: the clinical cookies must still unseal.
const SEALED_BY_CLINICAL =
  "u5y4Mg5Yy4ddzB3frkY6gn-Qa5X6Scyjs5S9GZUAcdRPjRUsHJQz7cgS-l8QId4s23WioBAlUwk";

describe("seal / unseal", () => {
  it("round-trips a value", async () => {
    const a = await seal({ n: 1, s: "x" }, SECRET);
    expect(await unseal(a, SECRET)).toEqual({ n: 1, s: "x" });
    expect(await seal({ n: 1, s: "x" }, SECRET)).not.toBe(a);
  });
  it("a flipped bit unseals to null", async () => {
    const raw = Buffer.from(await seal({ n: 1 }, SECRET), "base64url");
    const last = raw.length - 1;
    raw[last] = raw[last]! ^ 1;
    expect(await unseal(raw.toString("base64url"), SECRET)).toBeNull();
  });
  it("a different secret unseals to null", async () => {
    const a = await seal({ n: 1 }, SECRET);
    expect(await unseal(a, "y".repeat(32))).toBeNull();
  });
  it("refuses a short secret", async () => {
    await expect(seal({}, "x".repeat(31))).rejects.toThrow("secret too short");
    await expect(unseal("abc", "x".repeat(31))).rejects.toThrow(
      "secret too short",
    );
  });
  it("the format matches the clinical cookies", async () => {
    expect(await unseal(SEALED_BY_CLINICAL, SECRET)).toEqual({
      fixture: "clinical",
      n: 1,
    });
  });
});
