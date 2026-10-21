import { describe, expect, it } from "vitest";
import { totp, verifyTotp } from "./totp";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890".
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("totp", () => {
  it.each(VECTORS)("matches the RFC 6238 vector at T=%i", async (t, want) => {
    expect(await totp(SECRET, t * 1000, { digits: 8 })).toBe(want);
  });

  it("makes 6 digits by default", async () => {
    expect(await totp(SECRET, 59_000)).toBe("287082");
  });

  it("accepts the previous and next step but nothing further", async () => {
    const now = 1_111_111_109_000;
    for (const off of [-30_000, 0, 30_000])
      expect(await verifyTotp(SECRET, await totp(SECRET, now + off), now)).toBe(
        true,
      );
    for (const off of [-60_000, 60_000])
      expect(await verifyTotp(SECRET, await totp(SECRET, now + off), now)).toBe(
        false,
      );
  });

  it("rejects malformed codes", async () => {
    expect(await verifyTotp(SECRET, "abc", 0)).toBe(false);
    expect(await verifyTotp(SECRET, "", 0)).toBe(false);
  });
});
