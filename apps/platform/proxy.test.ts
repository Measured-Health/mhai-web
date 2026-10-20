// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const request = () => new NextRequest("http://localhost:3001/sign-in");

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? "";

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sets a CSP with a fresh nonce on each request", () => {
    const a = proxy(request()).headers.get("content-security-policy") ?? "";
    const b = proxy(request()).headers.get("content-security-policy") ?? "";
    const na = nonceOf(a);
    const nb = nonceOf(b);
    expect(na).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(nb).toBeTruthy();
    expect(na).not.toBe(nb);
    expect(directive(a, "script-src")).toContain(`'nonce-${na}'`);
    expect(directive(b, "script-src")).toContain(`'nonce-${nb}'`);
    expect(directive(a, "script-src")).toContain("'strict-dynamic'");
  });

  it("passes the nonce to rendering in the request headers", () => {
    const res = proxy(request());
    const nonce = nonceOf(res.headers.get("content-security-policy") ?? "");
    // NextResponse.next({ request: { headers } }) forwards these.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      res.headers.get("x-middleware-request-content-security-policy"),
    ).toContain(`'nonce-${nonce}'`);
  });

  it("never allows unsafe-inline scripts", () => {
    for (const env of ["production", "development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      const csp = proxy(request()).headers.get("content-security-policy");
      expect(csp).not.toContain("unsafe-inline");
      const script = directive(csp ?? "", "script-src");
      if (env === "development") expect(script).toContain("'unsafe-eval'");
      else expect(script).not.toContain("unsafe-eval");
    }
  });

  it("sets the exact production policy", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = proxy(request()).headers.get("content-security-policy") ?? "";
    const n = nonceOf(csp);
    expect(csp).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${n}' 'strict-dynamic'; style-src 'self' 'nonce-${n}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`,
    );
  });

  it("sets frame-ancestors 'none' and the other headers", () => {
    const h = proxy(request()).headers;
    expect(
      directive(h.get("content-security-policy") ?? "", "frame-ancestors"),
    ).toBe("frame-ancestors 'none'");
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("referrer-policy")).toBe("no-referrer");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });
});
