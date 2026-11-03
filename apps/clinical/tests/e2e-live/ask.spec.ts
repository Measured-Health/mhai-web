import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";
import {
  expectNoForbiddenWords,
  expectNoStorage,
  fillForm,
  typeCode,
} from "../e2e/helpers";

/**
 * Live, against the backend's smoke stack (stub pipeline), on the transport
 * the server was started with: a fresh synthetic clinician with only a
 * temporary password does the whole first sign-in in the app (password,
 * two-step, backup codes, terms), asks a question while every call
 * refreshes the session (SESSION_REFRESH_WITHIN_S above the token's
 * lifetime), signs out, and signs in again with the code.
 */
const user = JSON.parse(
  readFileSync(
    process.env.E2E_LIVE_USER_FILE ?? "/state/users/clinician-live.json",
    "utf8",
  ),
) as { email: string; password: string };
// Unrelated to the temporary one: core refuses a new password close to it.
const NEW_PASSWORD = `Live-second-${randomBytes(12).toString("hex")}`;

async function signIn(page: Page, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The next 30-second step: a TOTP code is good once. */
const nextStep = (page: Page) =>
  page.waitForTimeout(30_000 - (Date.now() % 30_000) + 1000);

const sessionCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === "mhai_session")
    ?.value;

test("first sign-in, a question, sign out, and sign in again with the code", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page, user.password);
  await expect(page).toHaveURL(/\/welcome$/);

  // 1. The password: the temporary one again, then a new one.
  await expect(page.getByText(/Step 1 of 4 · Your password/)).toBeVisible();
  await page.getByLabel("Temporary password").fill(user.password);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Confirm password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();

  // 2. Two-step, with core's own secret.
  await expect(
    page.getByText(/Step 2 of 4 · Protect your account/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Can't scan? Show key" }).click();
  const secret = (await page.locator("p.font-mono").innerText()).replace(
    /\s+/g,
    "",
  );
  await typeCode(page, await totp(secret, Date.now()));
  await expect(page.getByRole("list", { name: "Backup codes" })).toBeVisible();
  await page.getByLabel("I've saved these codes somewhere safe").check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  // 3. The terms, which core takes only from the full session the BFF
  // refreshed to after two-step.
  await expect(page.getByText(/Step 4 of 4 · Terms of use/)).toBeVisible();
  await page.getByLabel("I understand and agree to use MHAI this way").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toBeVisible();

  // A question: every call refreshes the session, so the sealed cookie
  // changes as core rotates the refresh token.
  const before = await sessionCookie(page);
  await fillForm(
    page,
    "Synthetic live question: chest pain 40 minutes, what to rule out?",
  );
  await page.getByRole("button", { name: /Analyse/ }).click();
  const result = page.getByRole("heading", { name: "Clinical assessment" });
  const failed = page.getByRole("heading", {
    name: "We couldn't complete this one",
  });
  await expect(result.or(failed)).toBeVisible({ timeout: 120_000 });
  await expect(result).toBeVisible();
  await expectNoForbiddenWords(page);
  expect(await sessionCookie(page)).not.toBe(before);

  // Sign out: nothing left in browser storage.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expectNoStorage(page);

  // Again, now with two-step on: the code page, then home.
  await signIn(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await nextStep(page);
  await typeCode(page, await totp(secret, Date.now()));
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toBeVisible();
});
