import { expect, type Locator, type Page } from "@playwright/test";

/** The demo's sample sign-ins (lib/api/fixtures.ts). */
export const ADA = "ada.bakare@measured-health.example";
export const TUNDE = "tunde.okafor@measured-health.example";
export const AMARA = "amara.eze@measured-health.example";
export const NEW_ADMIN = "new.admin@measured-health.example";
/** A hospital (clinician) account: not on the platform team. */
export const CLINICIAN = "a.reyes@havanahospital.org";
/** The demo's two-step code. */
export const CODE = "123456";

export const isMobile = (page: Page) =>
  (page.viewportSize()?.width ?? 1440) < 768;

/**
 * Fills the sign-in form and submits. The demo keeps the session in memory
 * only, so a page load signs out: this loads /sign-in only when the tab is
 * somewhere else, and every later step navigates by clicking.
 */
export async function submitPassword(page: Page, email: string) {
  if (new URL(page.url(), "http://x").pathname !== "/sign-in")
    await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Types a 6-digit code into the code boxes inside `scope`. */
export async function typeCode(
  page: Page,
  code: string,
  scope: Pick<Page, "getByLabel"> = page,
) {
  await scope.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(code);
}

/** Signs in with the password and the two-step code `123456`; lands on Hospitals. */
export async function signIn(page: Page, email: string) {
  await submitPassword(page, email);
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  // The sixth digit submits on its own.
  await typeCode(page, CODE);
  await expect(page).toHaveURL(/\/hospitals$/);
  await expect(page.getByRole("heading", { name: "Hospitals" })).toBeVisible();
}

/** Opens a sidebar page (from the menu on phones), without a page load. */
export async function openNav(
  page: Page,
  name:
    "Hospitals" | "Analytics" | "Legal holds" | "Team" | "Activity" | "Account",
) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Platform" })
    .getByRole("link", { name, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** From Hospitals: opens one hospital's page. */
export async function openHospital(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("link", { name: new RegExp(`^${escaped}`) }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** Signs out from the account menu (inside the drawer on phones). */
export async function signOut(page: Page) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("button", { name: /^Account menu:/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText("You've signed out.")).toBeVisible();
}

/** A toast: shown on screen and read out (a second, screen-reader copy). */
export const toast = (page: Page, text: string): Locator =>
  page.locator("b", { hasText: text });

/** The open step-up dialog (desktop) or sheet (phones) with this title. */
export const stepUp = (page: Page, title: string): Locator =>
  page.getByRole("dialog", { name: title });

/**
 * Nothing in browser storage, and no cookie readable by scripts: the
 * platform app keeps everything in memory (spec §4).
 */
export async function expectNoStorage(page: Page) {
  // A test that failed before loading any page has nothing to check.
  if (page.url() === "about:blank") return;
  const state = await page.evaluate(async () => {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      idb: dbs.length,
      cookie: document.cookie,
    };
  });
  expect(state).toEqual({ local: 0, session: 0, idb: 0, cookie: "" });
}
