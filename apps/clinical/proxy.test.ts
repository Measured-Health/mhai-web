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

describe("proxy: never rewrites", () => {
  // Next strips the RSC headers before a proxy sees the request, so a
  // rewrite here would also catch in-app navigation (next.config.ts does it).
  it("passes consultations and printouts through, with the headers", () => {
    for (const path of ["/c/abc", "/print/abc", "/", "/ended"]) {
      const res = proxy(request(path));
      expect(rewrittenTo(res), path).toBeNull();
      expect(nonceOf(cspOf(res)), path).toBeTruthy();
    }
  });
});

describe("next.config: ended consultations", () => {
  it("sends only a full load of /c/:id or /print/:id to /ended", async () => {
    const config = (await import("./next.config")).default;
    const rewrites = await config.rewrites!();
    expect(Array.isArray(rewrites)).toBe(false);
    const { beforeFiles } = rewrites as { beforeFiles: unknown[] };
    const missing = [
      { type: "header", key: "rsc" },
      { type: "header", key: "next-router-prefetch" },
    ];
    expect(beforeFiles).toEqual([
      { source: "/c/:id", missing, destination: "/ended" },
      { source: "/print/:id", missing, destination: "/ended" },
    ]);
  });
});
