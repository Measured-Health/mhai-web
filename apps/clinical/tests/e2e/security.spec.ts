import { expect, test, type Page } from "./csp";
import { DEMO_EMAILS, fillForm, signIn } from "./helpers";

// Every test here also fails on a Content Security Policy console message
// (the auto fixture in ./csp.ts), as does every other clinical spec.

const SCRIPT_NONCE = /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/;

test("the sign-in page loads with the CSP header and no console CSP errors", async ({
  page,
  cspViolations,
}) => {
  const response = await page.goto("/sign-in");
  expect(response?.status()).toBe(200);
  const h = response?.headers() ?? {};
  const csp = h["content-security-policy"] ?? "";
  const nonce = SCRIPT_NONCE.exec(csp)?.[1];
  expect(nonce, csp).toBeTruthy();
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("unsafe-");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("same-origin");
  expect(h["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=()",
  );
  // Never pinned to https on localhost.
  expect(h["strict-transport-security"]).toBeUndefined();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  // Let hydration and any late chunks run before checking the console.
  await page.waitForLoadState("networkidle");
  expect(cspViolations).toEqual([]);
});

test("every full page load has a fresh nonce on all its scripts", async ({
  page,
}) => {
  const nonces = new Set<string>();
  const paths = [
    "/sign-in",
    "/sign-in/code",
    "/sign-in/hospital",
    "/forgot-password",
    "/reset-password",
    "/welcome",
    "/no-access",
    "/ended",
    "/sign-out",
    "/",
    "/analysis",
    "/admin",
    // A full load of a consultation is rewritten to /ended: same headers.
    "/c/anything",
  ];
  for (const path of paths) {
    const res = await page.goto(path);
    const csp = res?.headers()["content-security-policy"] ?? "";
    const nonce = SCRIPT_NONCE.exec(csp)?.[1];
    expect(nonce, `${path}: ${csp}`).toBeTruthy();
    expect(res?.headers()["x-frame-options"], path).toBe("DENY");
    // Next put this response's nonce on every script it sent.
    const html = (await res?.text()) ?? "";
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce}"`);
    // No inline style attributes in the server's HTML: the CSP blocks them.
    expect(html, path).not.toMatch(/<[a-z][^>]*\sstyle="/i);
    nonces.add(nonce!);
    await page.waitForLoadState("networkidle");
  }
  expect(nonces.size).toBe(paths.length);
});

/**
 * A client-side visit, without the reload that ends the memory-only demo
 * session (the same `window.next.router` handle and caveat as
 * hospital-admin.spec.ts).
 */
async function visitInApp(page: Page, href: string) {
  const reached = page.waitForEvent("framenavigated", {
    predicate: (f) =>
      f === page.mainFrame() && new URL(f.url()).pathname === href,
    timeout: 15_000,
  });
  await page.evaluate((to) => {
    const w = window as unknown as {
      next: { router: { push(href: string): void } };
    };
    w.next.router.push(to);
  }, href);
  await reached;
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("the signed-in screens raise no CSP violations", async ({
  page,
  cspViolations,
}) => {
  test.setTimeout(180_000);
  // Clinician and hospital admin: the clinical screens, Analysis and admin.
  await signIn(page, DEMO_EMAILS.director);
  await expect(page).toHaveURL(/\/$/);

  // A consultation through to its result (charts, evidence, confidence).
  await fillForm(page, "Central chest pain for 40 minutes. Likely diagnosis?");
  await page
    .getByRole("button", { name: /Analyse|Next/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/c\/[^/?]+$/, { timeout: 30_000 });
  await expect(
    page.getByRole("status", {
      name: /High confidence|Use with caution|Needs review/,
    }),
  ).toBeVisible({ timeout: 60_000 });

  for (const href of [
    "/notifications",
    "/notifications/corrections",
    "/review",
    "/my-feedback",
    "/help",
    "/account",
    "/analysis",
    "/admin",
    "/admin/staff",
    "/admin/settings",
    "/admin/alerts",
    "/admin/activity",
    "/admin/activity/oversight",
    "/admin/usage",
    "/admin/named-access",
  ])
    await visitInApp(page, href);

  expect(cspViolations).toEqual([]);
});
