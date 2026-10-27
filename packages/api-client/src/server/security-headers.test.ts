// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  HSTS,
  contentSecurityPolicy,
  newNonce,
  securityHeaders,
  wantsHsts,
} from "./security-headers";

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? "";

const base = {
  nonce: "abc123==",
  dev: false,
  hsts: false,
  referrerPolicy: "same-origin" as const,
};

describe("newNonce", () => {
  it("is 16 random bytes in base64, fresh every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(seen.size).toBe(50);
    for (const n of seen) {
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(atob(n)).toHaveLength(16);
    }
  });
});

describe("contentSecurityPolicy", () => {
  it("is the exact production policy", () => {
    expect(contentSecurityPolicy("n0nce", false)).toBe(
      "default-src 'self'; script-src 'self' 'nonce-n0nce' 'strict-dynamic'; style-src 'self' 'nonce-n0nce'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );
  });

  it("never allows unsafe-inline scripts, nor eval outside development", () => {
    const prod = contentSecurityPolicy("n", false);
    const dev = contentSecurityPolicy("n", true);
    expect(prod).not.toContain("unsafe-");
    expect(directive(dev, "script-src")).toBe(
      "script-src 'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval'",
    );
    expect(directive(dev, "style-src")).toBe(
      "style-src 'self' 'unsafe-inline'",
    );
  });

  it("names no other origin", () => {
    const csp = contentSecurityPolicy("n", false);
    expect(csp).not.toMatch(/https?:|\*|wss?:/);
  });
});

describe("securityHeaders", () => {
  it("sets the CSP and the hardening headers", () => {
    const h = securityHeaders(base);
    expect(h["Content-Security-Policy"]).toBe(
      contentSecurityPolicy("abc123==", false),
    );
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("same-origin");
    expect(h["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(h).not.toHaveProperty("Strict-Transport-Security");
  });

  it("passes the app's referrer policy through", () => {
    expect(
      securityHeaders({ ...base, referrerPolicy: "no-referrer" })[
        "Referrer-Policy"
      ],
    ).toBe("no-referrer");
  });

  it("adds HSTS only when asked", () => {
    expect(securityHeaders({ ...base, hsts: true })).toMatchObject({
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
    expect(HSTS).toBe("max-age=31536000; includeSubDomains");
  });
});

describe("wantsHsts", () => {
  it("is on in production on a real host", () => {
    expect(wantsHsts("production", "demo.measured-health.org")).toBe(true);
  });
  it("is off for localhost, whatever the environment", () => {
    for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "[::1]"])
      expect(wantsHsts("production", host)).toBe(false);
  });
  it("is off outside production", () => {
    for (const env of ["development", "test", undefined])
      expect(wantsHsts(env, "demo.measured-health.org")).toBe(false);
  });
});
