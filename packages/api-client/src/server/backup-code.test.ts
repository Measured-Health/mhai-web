import { describe, expect, it } from "vitest";
import {
  readRecoveryReply,
  readRecoveryStepUp,
  readRequestKey,
  readSmallJson,
  recoveryRefusal,
} from "./backup-code";
import { UpstreamError } from "./upstream";

describe("making a new backup code: what the BFF reads", () => {
  it("takes exactly one step-up code in its shape", () => {
    expect(readRecoveryStepUp({ mfa_code: "123456" })).toEqual({
      mfa_code: "123456",
    });
    expect(readRecoveryStepUp({ backup_code: "ppppp-qqqqq" })).toEqual({
      backup_code: "ppppp-qqqqq",
    });
    for (const bad of [
      null,
      [],
      {},
      { mfa_code: "12345" },
      { mfa_code: 123456 },
      { backup_code: "PPPPP-QQQQQ" },
      { backup_code: "ABCD-2345" },
      { mfa_code: "123456", backup_code: "ppppp-qqqqq" },
      { mfa_code: "123456", user_id: "u2" },
      { code: "123456", backup: false },
    ])
      expect(readRecoveryStepUp(bad)).toBeNull();
  });

  it("takes one well-formed Idempotency-Key", () => {
    expect(readRequestKey(new Headers({ "Idempotency-Key": "k-1" }))).toBe(
      "k-1",
    );
    const twice = new Headers();
    twice.append("Idempotency-Key", "a");
    twice.append("Idempotency-Key", "b");
    for (const h of [
      new Headers(),
      twice,
      new Headers({ "Idempotency-Key": "a/b" }),
      new Headers({ "Idempotency-Key": "x".repeat(65) }),
    ])
      expect(readRequestKey(h)).toBeNull();
  });

  it("reads a small JSON body only", async () => {
    const req = (body: string) =>
      new Request("http://x.test/", { method: "POST", body });
    expect(await readSmallJson(req('{"mfa_code":"123456"}'))).toEqual({
      mfa_code: "123456",
    });
    expect(await readSmallJson(req("not json"))).toBeNull();
    expect(await readSmallJson(req(`"${"x".repeat(2000)}"`))).toBeNull();
  });

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
