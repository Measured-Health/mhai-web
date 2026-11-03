import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";
import { expectNoStorage, signOut, typeCode } from "../e2e/helpers";

/**
 * Live, against the backend's smoke stack, on the transport the server was
 * started with: a fresh synthetic platform admin with only a temporary
 * password signs in (core's enrolment-only session: mfa_enrolled false),
 * does the whole first sign-in in the app (password, two-step, backup
 * codes, terms), signs out, and signs in again with the code. Core has no
 * platform data routes yet, so the pages after sign-in aren't checked.
 */
const user = JSON.parse(
  readFileSync(
    process.env.E2E_LIVE_USER_FILE ?? "/state/users/admin-live.json",
    "utf8",
  ),
) as { email: string; password: string };
const NEW_PASSWORD = `Live-second-${randomBytes(12).toString("hex")}`;

async function submitPassword(page: Page, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a new platform admin's first sign-in, then sign in again with the code", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await submitPassword(page, user.password);
  await expect(page).toHaveURL(/\/welcome$/);

  await expect(page.getByText("Step 1 of 4 · Your password")).toBeVisible();
  await page.getByLabel("Temporary password").fill(user.password);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Confirm password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();

  await expect(
    page.getByText("Step 2 of 4 · Protect your account"),
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

  await expect(page.getByText("Step 4 of 4 · Terms of use")).toBeVisible();
  await page.getByLabel("I understand and agree").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/hospitals$/);
  await signOut(page);
  await expectNoStorage(page);

  await submitPassword(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  // A code is good once: the next 30-second step after the setup's.
  await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 1000);
  await typeCode(page, await totp(secret, Date.now()));
  await expect(page).toHaveURL(/\/hospitals$/);
  await signOut(page);
  await expectNoStorage(page);
});
