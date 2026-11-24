import { describe, expect, it } from "vitest";
import { readRecoveryReply, recoveryRefusal } from "./backup-code";
import { UpstreamError } from "./upstream";

describe("making a new backup code: what the BFF reads back from core", () => {
  it("reads core's reply as exactly one code", () => {
    expect(readRecoveryReply({ recovery_codes: ["rrrrr-sssss"] })).toBe(
      "rrrrr-sssss",
    );
    for (const bad of [
      { recovery_codes: ["rrrrr-sssss", "ttttt-uuuuu"] },
      { recovery_codes: [] },
      { recovery_codes: ["RRRRR-SSSSS"] },
      { recovery_codes: "rrrrr-sssss" },
      { recovery_codes: ["rrrrr-sssss"], extra: 1 },
      null,
    ])
      expect(readRecoveryReply(bad)).toBeNull();
  });

  it("keeps only known refusal codes", () => {
    expect(recoveryRefusal(new UpstreamError(403, "mfa_invalid"))).toEqual({
      status: 403,
      code: "mfa_invalid",
    });
    expect(recoveryRefusal(new UpstreamError(429, "mfa_locked"))).toEqual({
      status: 429,
      code: "mfa_locked",
    });
    expect(recoveryRefusal(new UpstreamError(401, "token_expired"))).toEqual({
      status: 401,
      code: "session_expired",
    });
    expect(
      recoveryRefusal(new UpstreamError(500, "internal_error: db at 10.0.0.1")),
    ).toEqual({ status: 503, code: "unavailable" });
    expect(recoveryRefusal(new Error("x"))).toEqual({
      status: 503,
      code: "unavailable",
    });
  });
});
