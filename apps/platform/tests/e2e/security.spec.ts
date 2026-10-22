import { expect, test } from "@playwright/test";
import {
  ADA,
  AMARA,
  expectNoStorage,
  isMobile,
  openHospital,
  openNav,
  signIn,
  stepUp,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** Every button or link that changes something, by its words. */
const ACTIONS =
  /^(Add hospital|Edit|Save|Deactivate|Reactivate|Resend|Invite|Send invite|Test sign-in|Replace|Request removal|Approve removal|Cancel request|Invite team member|Change role.*|Remove.*)$/;

test("an auditor sees no actions anywhere", async ({ page }) => {
  await signIn(page, AMARA);
  const main = page.getByRole("main");
  await expect(main.getByText("Northgate General Hospital")).toBeVisible();
  await expect(main.getByRole("button", { name: ACTIONS })).toHaveCount(0);
  await expect(main.getByRole("link", { name: ACTIONS })).toHaveCount(0);

  // Each kind of hospital page: active, set-up incomplete, deactivated and
  // removal pending.
  for (const name of [
    "Northgate General Hospital",
    "Eastbrook Medical Centre",
    "Westfield Clinic",
    "Harbour View Hospital",
  ]) {
    await openHospital(page, name);
    await expect(
      main.getByRole("region", { name: "Recent actions" }),
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Single sign-on" }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: ACTIONS })).toHaveCount(0);
    await expect(main.getByRole("link", { name: ACTIONS })).toHaveCount(0);
    await expect(main.getByRole("textbox")).toHaveCount(0);
    await openNav(page, "Hospitals");
  }

  await openNav(page, "Team");
  await expect(main.getByText("Amara Eze")).toBeVisible();
  await expect(main.getByRole("button", { name: ACTIONS })).toHaveCount(0);
  await expect(page.getByText("Actions", { exact: true })).toHaveCount(0);

  await openNav(page, "Activity");
  await expect(main.getByRole("button", { name: ACTIONS })).toHaveCount(0);
});

// What this proves: a write sent straight to the proxy from outside the
// app's pages (devtools, a script, another site) is refused before anything
// goes upstream (Review Focus 1). In mock mode the session lives in the tab,
// not on the server, so the proxy's auditor gate can't be reached here: it is
// covered by app/api/v1/proxy.test.ts (every non-GET shape as an auditor is
// 403 and upstream is never called), and the sample API's own refusal by
// lib/api/mock.test.ts ("an auditor's write is forbidden"). A live-mode
// end-to-end run is a follow-up (spec §16).
test("a write straight to the proxy from outside the app's pages is refused (403)", async ({
  page,
}) => {
  await signIn(page, AMARA);
  const res = await page.request.post(
    "/api/v1/platform/hospitals/h_northgate/deactivate",
    {
      data: { reason: "other", note: "test", mfa_code: "123456" },
      headers: { "Idempotency-Key": "e2e-outside-write" },
    },
  );
  expect(res.status()).toBe(403);
  expect(await res.json()).toEqual({ code: "forbidden" });
});

test("every page has a CSP header with a nonce", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) violations.push(m.text());
  });
  const nonces = new Set<string>();
  const paths = [
    "/sign-in",
    "/sign-in/code",
    "/welcome",
    "/hospitals",
    "/hospitals/new",
    "/hospitals/h_northgate",
    "/analytics",
    "/team",
    "/activity",
    "/account",
    "/no-access",
    "/sign-out",
  ];
  for (const path of paths) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    const csp = res?.headers()["content-security-policy"] ?? "";
    const nonce = /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)'/.exec(csp)?.[1];
    expect(nonce, `${path}: ${csp}`).toBeTruthy();
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
    // Next put the same nonce on every script it sent with the page.
    const html = (await res?.text()) ?? "";
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, path).toContain(`nonce="${nonce}"`);
    nonces.add(nonce!);
    // Let the page settle (signed out, most go on to sign-in) before the next.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  // A fresh nonce for every response.
  expect(nonces.size).toBe(paths.length);
  expect(violations).toEqual([]);
});

test("the phone layout shows cards and the step-up as a sheet", async ({
  page,
}) => {
  test.skip(!isMobile(page), "phones only; desktop has the table and dialog");
  await signIn(page, ADA);

  // Hospitals as cards, not a table.
  await expect(page.getByRole("list", { name: "Hospitals" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  const card = page
    .getByRole("list", { name: "Hospitals" })
    .getByRole("listitem")
    .filter({ hasText: "Riverside Children's Hospital" });
  await expect(card.getByText("Active", { exact: true })).toBeVisible();

  await openHospital(page, "Riverside Children's Hospital");
  await page
    .getByRole("region", { name: "Status" })
    .getByRole("button", { name: "Deactivate" })
    .click();
  const sheet = stepUp(page, "Deactivate Riverside Children's Hospital?");
  await expect(sheet).toBeVisible();
  // A bottom sheet, not a centred <dialog>.
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // Full width and resting on the bottom edge (once it has slid up).
  const view = page.viewportSize()!;
  await expect
    .poll(async () => {
      const b = await sheet.boundingBox();
      return b && [b.x, b.width, b.y + b.height].map(Math.round);
    })
    .toEqual([0, view.width, view.height]);
  // 44 px targets.
  const cancel = await sheet
    .getByRole("button", { name: "Cancel" })
    .boundingBox();
  expect(cancel!.height).toBeGreaterThanOrEqual(44);

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  // The team as cards too.
  await openNav(page, "Team");
  await expect(page.getByRole("list", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});
