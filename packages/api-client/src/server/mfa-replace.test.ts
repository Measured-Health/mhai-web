import { describe, expect, it } from "vitest";
import {
  readCappedJson,
  readConfirmBody,
  readIdempotencyKey,
  readOtpauthUri,
  readReplaceReply,
  readStepUpBody,
  REPLACE_BODY_MAX,
  replaceRefusal,
} from "./mfa-replace";
import { base32Encode } from "../totp";
import { UpstreamError } from "./upstream";

// Synthetic: never a real key.
const SECRET = base32Encode("synthetic-test-key-1");
const CORE_URI = `otpauth://totp/MHAI:a.reyes@pilot-hospital.example?algorithm=SHA1&digits=6&issuer=MHAI&period=30&secret=${SECRET}`;
const CANONICAL = `otpauth://totp/MHAI:a.reyes%40pilot-hospital.example?secret=${SECRET}&issuer=MHAI&algorithm=SHA1&digits=6&period=30`;

describe("readStepUpBody", () => {
  it("takes exactly a 6-digit code or a backup code", () => {
    expect(readStepUpBody({ mfa_code: "123456" })).toEqual({
      mfa_code: "123456",
    });
    expect(readStepUpBody({ backup_code: "4F7K-92QX" })).toEqual({
      backup_code: "4F7K-92QX",
    });
  });
  it.each([
    null,
    "123456",
    [],
    {},
    { mfa_code: "12345" },
    { mfa_code: "1234567" },
    { mfa_code: 123456 },
    { mfa_code: "12345a" },
    { backup_code: "4F7K-92Q" },
    { backup_code: "4F7K 92QX" },
    // Both, or anything extra, is refused.
    { mfa_code: "123456", backup_code: "4F7K-92QX" },
    { mfa_code: "123456", user_id: "u1" },
    { code: "123456" },
  ])("refuses %j", (v) => expect(readStepUpBody(v)).toBeNull());
});

describe("readConfirmBody", () => {
  it("takes exactly {code} with 6 digits", () => {
    expect(readConfirmBody({ code: "654321" })).toEqual({ code: "654321" });
  });
  it.each([
    null,
    {},
    { code: "65432" },
    { code: 654321 },
    { code: "654321", trust: true },
    { mfa_code: "654321" },
  ])("refuses %j", (v) => expect(readConfirmBody(v)).toBeNull());
});

describe("readIdempotencyKey", () => {
  it("takes the proxies' key shape only", () => {
    const h = (v?: string) => new Headers(v ? { "Idempotency-Key": v } : {});
    expect(readIdempotencyKey(h("0b6f1c2e-6a3d-4c55-9b7e-1f2a3b4c5d6e"))).toBe(
      "0b6f1c2e-6a3d-4c55-9b7e-1f2a3b4c5d6e",
    );
    expect(readIdempotencyKey(h())).toBeNull();
    expect(readIdempotencyKey(h("a b"))).toBeNull();
    expect(readIdempotencyKey(h("x".repeat(65)))).toBeNull();
    const twice = new Headers();
    twice.append("Idempotency-Key", "a");
    twice.append("Idempotency-Key", "b");
    expect(readIdempotencyKey(twice)).toBeNull();
  });
});

describe("readCappedJson", () => {
  const req = (body: string) =>
    new Request("http://x.test/", { method: "POST", body });
  it("reads a small JSON body and refuses a large or broken one", async () => {
    expect(await readCappedJson(req('{"code":"123456"}'))).toEqual({
      code: "123456",
    });
    expect(await readCappedJson(req("{"))).toBeNull();
    expect(
      await readCappedJson(req(`"${"a".repeat(REPLACE_BODY_MAX)}"`)),
    ).toBeNull();
    // A declared size over the cap is refused before the body is read.
    const declared = new Request("http://x.test/", {
      method: "POST",
      headers: { "content-length": String(REPLACE_BODY_MAX + 1) },
      body: '{"code":"123456"}',
    });
    expect(await readCappedJson(declared)).toBeNull();
    expect(declared.bodyUsed).toBe(false);
  });
});

describe("readOtpauthUri", () => {
  it("takes core's URI in any parameter order and rebuilds it", () => {
    expect(readOtpauthUri(CORE_URI)).toEqual({
      otpauthUri: CANONICAL,
      secret: SECRET,
    });
    // The contract's order, with the @ already escaped.
    expect(readOtpauthUri(CANONICAL)).toEqual({
      otpauthUri: CANONICAL,
      secret: SECRET,
    });
  });
  const swap = (from: string, to: string) => CORE_URI.replace(from, to);
  it.each([
    ["another scheme", swap("otpauth://", "https://")],
    ["hotp", swap("//totp/", "//hotp/")],
    ["a user part", swap("//totp/", "//x@totp/")],
    ["a port", swap("//totp/", "//totp:1/")],
    ["a fragment", `${CORE_URI}#x`],
    ["another issuer in the label", swap("/MHAI:", "/Other:")],
    ["no account", swap("MHAI:a.reyes@pilot-hospital.example", "MHAI:")],
    ["a space in the account", swap("a.reyes", "a%20reyes")],
    ["a control character", swap("a.reyes", "a%0Areyes")],
    ["a bidi override", swap("a.reyes", "a%E2%80%AEreyes")],
    ["bad escaping", swap("a.reyes", "a%E0%A4reyes")],
    ["another issuer", swap("issuer=MHAI", "issuer=Evil")],
    ["SHA256", swap("algorithm=SHA1", "algorithm=SHA256")],
    ["8 digits", swap("digits=6", "digits=8")],
    ["60 seconds", swap("period=30", "period=60")],
    ["a lower-case secret", swap(SECRET, SECRET.toLowerCase())],
    ["a padded secret", swap(SECRET, `${SECRET}====`)],
    ["a short secret", swap(SECRET, "JBSWY3DP")],
    ["a non-base32 secret", swap(SECRET, `${SECRET.slice(1)}1`)],
    ["no secret", swap(`&secret=${SECRET}`, "")],
    ["a repeated secret", `${CORE_URI}&secret=${SECRET}`],
    ["an extra parameter", `${CORE_URI}&image=https://evil.example/x.png`],
    ["a missing fixed parameter", swap("&period=30", "")],
    ["too long", `${CORE_URI}${"&".repeat(2100)}`],
  ])("refuses %s", (_, uri) => expect(readOtpauthUri(uri)).toBeNull());
});

describe("readReplaceReply", () => {
  it("takes exactly {otpauth_uri}", () => {
    expect(readReplaceReply({ otpauth_uri: CORE_URI })).toEqual({
      otpauthUri: CANONICAL,
      secret: SECRET,
    });
  });
  it.each([
    null,
    "x",
    {},
    { otpauth_uri: 1 },
    { otpauth_uri: CORE_URI, recovery_codes: ["AAAA-1111"] },
    { otpauth_uri: CORE_URI, secret: SECRET },
    { otpauth_uri: "otpauth://totp/MHAI:x?secret=A" },
  ])("refuses %j", (v) => expect(readReplaceReply(v)).toBeNull());
});

describe("replaceRefusal", () => {
  const up = (status: number, code: string) => new UpstreamError(status, code);
  it.each([
    [up(403, "mfa_required"), "start", 403, "mfa_required"],
    [up(403, "mfa_invalid"), "start", 403, "mfa_invalid"],
    [up(429, "mfa_locked"), "start", 429, "mfa_locked"],
    [up(409, "conflict"), "start", 403, "mfa_required"],
    [up(409, "conflict"), "confirm", 409, "conflict"],
    [up(403, "mfa_invalid"), "confirm", 403, "mfa_invalid"],
    [up(429, "mfa_locked"), "confirm", 429, "mfa_locked"],
    [up(422, "validation_failed"), "start", 422, "invalid"],
    [up(422, "invalid"), "confirm", 422, "invalid"],
    [up(401, "unauthenticated"), "start", 401, "session_expired"],
    [up(401, "token_expired"), "confirm", 401, "session_expired"],
    [up(401, "error"), "confirm", 401, "session_expired"],
    [up(429, "rate_limited"), "start", 429, "rate_limited"],
    [up(503, "not_ready"), "start", 503, "unavailable"],
    [up(500, "internal_error"), "confirm", 503, "unavailable"],
    [up(403, "forbidden"), "start", 503, "unavailable"],
    [new Error("boom"), "start", 503, "unavailable"],
  ] as const)("%o at %s is %i %s", (e, step, status, code) =>
    expect(replaceRefusal(e, step)).toEqual({ status, code }),
  );
});
