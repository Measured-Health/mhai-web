// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const request = (
  path = "/sign-in",
  headers: Record<string, string> = {},
  origin = "http://localhost:3000",
) => new NextRequest(`${origin}${path}`, { headers });

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];
const cspOf = (res: Response) =>
  res.headers.get("content-security-policy") ?? "";
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");

describe("proxy: security headers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sets a CSP with a fresh nonce on each request", () => {
    const a = nonceOf(cspOf(proxy(request())));
    const b = nonceOf(cspOf(proxy(request())));
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(b);
  });

  it("passes the nonce to rendering, overwriting the client's", () => {
    const res = proxy(
      request("/", {
        "x-nonce": "attacker",
        "content-security-policy": "script-src *",
      }),
    );
    const nonce = nonceOf(cspOf(res));
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      res.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(cspOf(res));
  });

  it("sets the exact production policy and headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = proxy(request());
    const n = nonceOf(cspOf(res));
    expect(cspOf(res)).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${n}' 'strict-dynamic'; style-src 'self' 'nonce-${n}'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`,
    );
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("same-origin");
    expect(res.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    // localhost: no HSTS, even in production.
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });

  it("sends HSTS in production on the real host only", () => {
    const demo = "https://demo.measured-health.org";
    vi.stubEnv("NODE_ENV", "production");
    expect(
      proxy(request("/sign-in", {}, demo)).headers.get(
        "strict-transport-security",
      ),
    ).toBe("max-age=31536000; includeSubDomains");
    vi.stubEnv("NODE_ENV", "development");
    expect(
      proxy(request("/sign-in", {}, demo)).headers.get(
        "strict-transport-security",
      ),
    ).toBeNull();
  });

  it("allows eval and inline styles in development only", () => {
    vi.stubEnv("NODE_ENV", "development");
    const csp = cspOf(proxy(request()));
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    vi.stubEnv("NODE_ENV", "production");
    expect(cspOf(proxy(request()))).not.toContain("unsafe-");
  });
});

describe("proxy: ended consultations", () => {
  it("sends a full load of a consultation or printout to /ended, with the headers", () => {
    for (const path of ["/c/abc", "/print/abc"]) {
      const res = proxy(request(path));
      expect(rewrittenTo(res), path).toBe("http://localhost:3000/ended");
      expect(nonceOf(cspOf(res))).toBeTruthy();
      expect(res.headers.get("x-middleware-request-x-nonce")).toBe(
        nonceOf(cspOf(res)),
      );
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("lets in-app navigation and prefetches through", () => {
    const navigations: Record<string, string>[] = [
      { rsc: "1" },
      { "next-router-prefetch": "1" },
    ];
    for (const h of navigations) {
      const res = proxy(request("/c/abc", h));
      expect(rewrittenTo(res)).toBeNull();
      expect(nonceOf(cspOf(res))).toBeTruthy();
    }
  });

  it("leaves every other page alone", () => {
    for (const path of ["/", "/c", "/c/abc/x", "/analysis", "/ended"])
      expect(rewrittenTo(proxy(request(path))), path).toBeNull();
  });
});
