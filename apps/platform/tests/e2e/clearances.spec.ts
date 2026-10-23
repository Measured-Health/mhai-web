import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  BOLA,
  CODE,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
  signOut,
  stepUp,
  toast,
  TUNDE,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

const RIVER = "Riverside Children's Hospital";

/** The page's address holds no letter id and no page number. */
function expectCleanUrl(page: Page) {
  const url = new URL(page.url());
  expect(url.pathname).toBe("/clearances");
  expect(url.search).toBe("");
  expect(url.hash).toBe("");
  expect(page.url()).not.toMatch(/cl_|page/i);
}

/** Signs in and opens Clearances. */
async function openClearances(page: Page, email: string) {
  await signIn(page, email);
  await openNav(page, "Clearances");
  await expect(
    page.getByRole("list", { name: "Letters" }).first(),
  ).toBeVisible();
  expectCleanUrl(page);
}

/** The open letter (beside the queue, or in its place on a phone). */
const detail = (page: Page) =>
  page.getByRole("region", { name: "Clearance letter" });

/** Opens a letter from the queue by its hospital's name. */
async function openLetter(page: Page, hospital: string) {
  await page
    .getByRole("list", { name: "Letters" })
    .getByRole("button", { name: new RegExp(`^${hospital}`) })
    .click();
  await expect(
    detail(page).getByRole("heading", { level: 2, name: hospital }),
  ).toBeVisible();
  expectCleanUrl(page);
}

/** A switch scope: "Every hospital" or one hospital's name. */
const scope = (page: Page, name: string) =>
  page.getByRole("region", { name: "Named access" }).getByRole("group", {
    name,
    exact: true,
  });

/** The words after a fact's label ("Own switch", "In effect"). */
const fact = (el: Locator, term: string) =>
  el.locator(`dt:text-is("${term}") + dd`);

/** Taps a chip or radio by its words. */
async function choose(scoped: Locator, label: string) {
  await scoped.getByText(label, { exact: true }).click();
  await expect(
    scoped.getByRole("radio", { name: label, exact: true }),
  ).toBeChecked();
}

/** A day shortly before today, as the date field takes it. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

test("Ada opens Clearances, views Northgate's letter and verifies it", async ({
  page,
}) => {
  await openClearances(page, ADA);
  await expect(
    page.getByRole("tab", { name: "To verify", selected: true }),
  ).toBeVisible();
  await openLetter(page, "Northgate General Hospital");
  const d = detail(page);
  await expect(d.getByText("Waiting for Measured Health")).toBeVisible();
  await expect(d.getByText("Dr. Tayo Bankole")).toBeVisible();
  await expect(
    d.getByRole("list", { name: "People covered" }).getByText("Emeka Udoh"),
  ).toBeVisible();

  // The letter, as page images only: no download, no print.
  await d.getByRole("button", { name: "View letter" }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByText("Page 1 of 2")).toBeVisible();
  const img = viewer.getByRole("img", { name: "Page 1 of 2" });
  await expect(img).toBeVisible();
  expect(await img.getAttribute("src")).toMatch(/^blob:/);
  await expect(
    viewer.getByRole("button", { name: /download|print/i }),
  ).toHaveCount(0);
  await expect(viewer.getByRole("link")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Next" }).click();
  await expect(viewer.getByRole("img", { name: "Page 2 of 2" })).toBeVisible();
  expectCleanUrl(page);
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toBeHidden();

  // Verify, with the two-step code. Northgate's switch is Off.
  await d.getByRole("button", { name: "Verify", exact: true }).click();
  const ask = stepUp(page, "Verify this letter?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(ask).toBeHidden();
  await expect(
    toast(
      page,
      "Verified. Names stay hidden until named access is switched on",
    ),
  ).toBeVisible();
  await expect(d.getByText(/^Active until \d{1,2} \w{3} \d{4}$/)).toBeVisible();
  await expect(d.getByText("Verified by", { exact: true })).toBeVisible();
  expectCleanUrl(page);
});

test("Ada rejects a letter with Can't read it", async ({ page }) => {
  await openClearances(page, ADA);
  await openLetter(page, "Northgate General Hospital");
  const d = detail(page);
  await d.getByRole("button", { name: "Reject", exact: true }).click();
  const ask = stepUp(page, "Reject this letter?");
  await choose(ask, "Can't read it");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(ask).toBeHidden();
  await expect(toast(page, "Letter rejected")).toBeVisible();
  await expect(d.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(d.getByText("Can't read it", { exact: true })).toBeVisible();
  await expect(
    d.getByRole("button", { name: "Verify", exact: true }),
  ).toHaveCount(0);
  expectCleanUrl(page);
});

test("Bola sees the same-side line on Havana's waiting letter", async ({
  page,
}) => {
  await openClearances(page, BOLA);
  await openLetter(page, "Havana Hospital");
  const d = detail(page);
  await expect(
    d.getByText("You can't verify letters from a hospital you're linked to"),
  ).toBeVisible();
  await expect(d.getByRole("button", { name: "Verify" })).toHaveCount(0);
  await expect(d.getByRole("button", { name: "Reject" })).toHaveCount(0);
  // A letter from a hospital he isn't linked to can be verified.
  if (isMobile(page)) await page.getByRole("button", { name: "Back" }).click();
  await openLetter(page, "Northgate General Hospital");
  await expect(d.getByRole("button", { name: "Verify" })).toBeVisible();
});

test("Tunde sees You can't verify a letter that covers you on cl_wait", async ({
  page,
}) => {
  await openClearances(page, TUNDE);
  await openLetter(page, "Havana Hospital");
  const d = detail(page);
  await expect(d.getByText("Measured Health staff")).toBeVisible();
  await expect(d.getByText("Tunde Okafor").first()).toBeVisible();
  await expect(
    d.getByText("You can't verify a letter that covers you"),
  ).toBeVisible();
  await expect(d.getByRole("button", { name: "Verify" })).toHaveCount(0);
  await expect(d.getByRole("button", { name: "Reject" })).toHaveCount(0);
});

test("the auditor views a letter and has no controls", async ({ page }) => {
  await openClearances(page, AMARA);
  await openLetter(page, "Northgate General Hospital");
  const d = detail(page);
  await d.getByRole("button", { name: "View letter" }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByRole("img", { name: "Page 1 of 2" })).toBeVisible();
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toBeHidden();

  const main = page.getByRole("main");
  await expect(main.getByText("Named access").first()).toBeVisible();
  await expect(
    main.getByRole("button", {
      name: /^(Verify|Reject|Revoke|Turn up|Turn down|Approve|Cancel request)$/,
    }),
  ).toHaveCount(0);
  await expect(main.getByRole("textbox")).toHaveCount(0);
});

test("Ada asks to turn Riverside to Letters only; Tunde, signed in in the same tab, approves", async ({
  page,
}) => {
  await openClearances(page, ADA);
  const river = scope(page, RIVER);
  await expect(fact(river, "Own switch")).toHaveText("Off");
  await river.getByRole("button", { name: "Turn up" }).click();

  // Step one: the position and the three sign-offs.
  const form = page.getByRole("dialog", {
    name: `Turn up named access for ${RIVER}`,
  });
  await expect(
    form.getByText(
      "A different platform admin must approve before this takes effect.",
    ),
  ).toBeVisible();
  await choose(form, "Letters only");
  const signoffs = [
    ["Clinical", "Dr. A. Musa, Clinical lead", daysAgo(3), "CS-030"],
    ["Privacy", "N. Eke, Data protection", daysAgo(2), "PR-019"],
    ["Legal", "B. Adeyemi, Legal counsel", daysAgo(2), "LG-044"],
  ] as const;
  for (const [group, by, at, ref] of signoffs) {
    const g = form.getByRole("group", { name: group });
    await g.getByLabel("Signed by (name and role)").fill(by);
    await g.getByLabel("Date").fill(at);
    await g.getByLabel("Document reference").fill(ref);
  }
  await form.getByRole("button", { name: "Continue" }).click();

  // Step two: the code.
  const ask = stepUp(
    page,
    `Ask to turn named access for ${RIVER} Letters only?`,
  );
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Ask for approval" }).click();
  await expect(ask).toBeHidden();
  await expect(
    river.getByText(/^Ada Bakare asked to turn it Letters only/),
  ).toBeVisible();
  await expect(
    river.getByText("Waiting for a different platform admin to approve"),
  ).toBeVisible();
  await expect(fact(river, "Own switch")).toHaveText("Off");
  // She can't approve her own request.
  await expect(river.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(river.getByRole("button", { name: "Turn up" })).toHaveCount(0);

  // Tunde signs in, in the same tab, and approves.
  await signOut(page);
  await openClearances(page, TUNDE);
  const same = scope(page, RIVER);
  await expect(
    same.getByText(/^Ada Bakare asked to turn it Letters only/),
  ).toBeVisible();
  await same.getByRole("button", { name: "Approve" }).click();
  const approve = stepUp(
    page,
    `Approve named access for ${RIVER}: Letters only?`,
  );
  for (const ref of ["CS-030", "PR-019", "LG-044"])
    await expect(approve.getByText(new RegExp(ref))).toBeVisible();
  await typeCode(page, CODE, approve);
  await approve.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(approve).toBeHidden();
  await expect(fact(same, "Own switch")).toHaveText("Letters only");
  await expect(fact(same, "In effect")).toHaveText("Letters only");
  await expect(
    page
      .getByRole("region", { name: "Named access" })
      .getByRole("status")
      .filter({ hasText: `Named access for ${RIVER} is now Letters only` }),
  ).toBeVisible();
  expectCleanUrl(page);
});

test("Ada turns global down to Letters only at once", async ({ page }) => {
  await openClearances(page, ADA);
  const global = scope(page, "Every hospital");
  await expect(global.getByText("On", { exact: true })).toBeVisible();
  const havana = scope(page, "Havana Hospital");
  await expect(fact(havana, "In effect")).toHaveText("On");

  await global.getByRole("button", { name: "Turn down" }).click();
  const form = page.getByRole("dialog", {
    name: "Turn down named access for every hospital",
  });
  await choose(form, "Letters only");
  await form.getByRole("button", { name: "Continue" }).click();
  const ask = stepUp(
    page,
    "Turn named access for every hospital down to Letters only?",
  );
  await ask.getByLabel(/^Reason/).fill("Pilot only");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Turn down", exact: true }).click();
  await expect(ask).toBeHidden();

  // At once, with one admin: Havana's own switch is On, but global limits it.
  await expect(global.getByText(/^Letters only since/)).toBeVisible();
  await expect(
    global.getByText(/turned down by Ada Bakare: Pilot only$/),
  ).toBeVisible();
  await expect(fact(havana, "In effect")).toHaveText("Letters only");
  await expect(havana.getByText("Limited by the global switch")).toBeVisible();
  expectCleanUrl(page);
});

test("phone: tap a letter, see the detail, Back", async ({ page }) => {
  test.skip(!isMobile(page), "phones only; desktop shows both side by side");
  await openClearances(page, ADA);
  const list = page.getByRole("list", { name: "Letters" });
  await expect(list).toBeVisible();

  await openLetter(page, "Northgate General Hospital");
  // The detail takes the queue's place, with Back.
  await expect(list).toBeHidden();
  const back = page.getByRole("button", { name: "Back" });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const view = await detail(page)
    .getByRole("button", { name: "View letter" })
    .boundingBox();
  expect(view!.height).toBeGreaterThanOrEqual(44);

  // The step-up is a sheet, full width.
  await detail(page)
    .getByRole("button", { name: "Verify", exact: true })
    .click();
  const sheet = stepUp(page, "Verify this letter?");
  await expect(sheet).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const size = page.viewportSize()!;
  await expect
    .poll(async () => {
      const b = await sheet.boundingBox();
      return b && [b.x, b.width].map(Math.round);
    })
    .toEqual([0, size.width]);
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  // No sideways scroll.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await back.click();
  await expect(list).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  expectCleanUrl(page);
});

test("the Clearances page has a CSP with a nonce and blob: images", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) violations.push(m.text());
  });
  const res = await page.goto("/clearances");
  expect(res?.status()).toBe(200);
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).toContain("img-src 'self' data: blob:");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  expect(violations).toEqual([]);
});
