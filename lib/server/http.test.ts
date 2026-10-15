import { describe, expect, it } from "vitest";
import { UpstreamError } from "./api";
import { authCode, json, sameOrigin } from "./http";

const req = (h: Record<string, string>) =>
  new Request("http://demo.test/api/auth/login", {
    method: "POST",
    headers: h,
  });

describe("sameOrigin", () => {
  it("accepts a matching Origin and rejects others or none", () => {
    expect(
      sameOrigin(req({ origin: "https://demo.test", host: "demo.test" })),
    ).toBe(true);
    expect(
      sameOrigin(
        req({
          origin: "https://demo.test",
          host: "127.0.0.1:8080",
          "x-forwarded-host": "demo.test",
        }),
      ),
    ).toBe(true);
    expect(
      sameOrigin(req({ origin: "https://evil.test", host: "demo.test" })),
    ).toBe(false);
    expect(sameOrigin(req({ host: "demo.test" }))).toBe(false);
  });
});

describe("authCode", () => {
  const up = (code: string, status = 401) => new UpstreamError(status, code);
  it.each([
    [up("login_locked", 429), "login", 429, "locked"],
    [up("rate_limited", 429), "login", 429, "rate_limited"],
    [up("unauthenticated"), "login", 401, "invalid_credentials"],
    [up("unauthenticated"), "mfa", 401, "mfa_expired"],
    [up("mfa_invalid"), "mfa", 401, "mfa_invalid"],
    [up("unauthenticated"), "current", 401, "wrong_password"],
    [up("token_expired"), "current", 401, "session_expired"],
    [up("validation_failed", 422), "other", 422, "weak_password"],
    [up("internal", 500), "login", 503, "unavailable"],
    [new TypeError("x"), "login", 503, "unavailable"],
  ] as const)("%o in %s → %i %s", (e, ctx, status, code) => {
    expect(authCode(e, ctx)).toEqual({ status, code });
  });
});

describe("json", () => {
  it("never lets responses be cached", () => {
    expect(json(200, { a: 1 }).headers.get("Cache-Control")).toBe("no-store");
    expect(json(204).status).toBe(204);
  });
});
