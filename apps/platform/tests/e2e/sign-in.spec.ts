import { expect, test, type Page } from "@playwright/test";
import {
  CLINICIAN,
  CODE,
  expectNoStorage,
  NEW_ADMIN,
  signIn,
  submitPassword,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

const SKIP = /skip|later|not now|remind me/i;

/** No way past this first sign-in step except doing it. */
async function expectNoSkip(page: Page) {
  await expect(page.getByRole("button", { name: SKIP })).toHaveCount(0);
  await expect(page.getByRole("link", { name: SKIP })).toHaveCount(0);
  // And no "trust this device" anywhere (spec §5).
  await expect(page.getByText(/trust this device/i)).toHaveCount(0);
}

test("sign in with two-step and land on Hospitals", async ({ page }) => {
  await submitPassword(page, "ada.bakare@measured-health.example");
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await expect(
    page.getByRole("heading", { name: "Enter your code" }),
  ).toBeVisible();
  await expectNoSkip(page);
  await typeCode(page, CODE);
  await expect(page).toHaveURL(/\/hospitals$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hospitals" }),
  ).toBeVisible();
  await expect(page.getByText("Northgate General Hospital")).toBeVisible();
});

test("a wrong code is refused and the right one signs in", async ({ page }) => {
  await submitPassword(page, "tunde.okafor@measured-health.example");
  await typeCode(page, "000000");
  await expect(page.getByText("That code didn't work.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await typeCode(page, CODE);
  await expect(page).toHaveURL(/\/hospitals$/);
});

test("the new admin can't skip two-step", async ({ page }) => {
  await submitPassword(page, NEW_ADMIN);
  // No code yet: two-step isn't set up. Every first sign-in step is owed.
  await expect(page).toHaveURL(/\/welcome$/);

  await expect(page.getByText("Step 1 of 4 · Your password")).toBeVisible();
  await expectNoSkip(page);
  await page.getByLabel("New password").fill("Quiet-harbour-lantern-42");
  await page.getByLabel("Confirm password").fill("Quiet-harbour-lantern-42");
  await page.getByRole("button", { name: "Save password" }).click();

  await expect(page.getByText("Step 2 of 4 · Terms of use")).toBeVisible();
  await expectNoSkip(page);
  const go = page.getByRole("button", { name: "Continue" });
  await expect(go).toBeDisabled();
  await page.getByLabel("I understand and agree").check();
  await go.click();

  await expect(
    page.getByText("Step 3 of 4 · Protect your account"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Set up two-step verification" }),
  ).toBeVisible();
  await expectNoSkip(page);
  await expect(page).toHaveURL(/\/welcome$/);
  await typeCode(page, CODE);

  await expect(page.getByText("Step 4 of 4 · Backup codes")).toBeVisible();
  await expect(page.getByRole("list", { name: "Backup codes" })).toBeVisible();
  await expectNoSkip(page);
  const finish = page.getByRole("button", { name: "Finish setup" });
  await expect(finish).toBeDisabled();
  await page.getByLabel("I've saved these codes somewhere safe").check();
  await finish.click();

  await expect(page).toHaveURL(/\/hospitals$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hospitals" }),
  ).toBeVisible();
});

test("a clinician email can't use the platform app", async ({ page }) => {
  await submitPassword(page, CLINICIAN);
  await expect(
    page.getByText("This account can't use the platform admin app."),
  ).toBeVisible();
  // Signed out at once: no code step, no app.
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByLabel("Digit 1 of 6")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Platform" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Password")).toHaveValue("");
});

test("after 15 idle minutes the app signs out", async ({ page }) => {
  await page.clock.install();
  await signIn(page, "ada.bakare@measured-health.example");

  // The warning comes at 13 minutes...
  await page.clock.fastForward("13:00");
  const warning = page.getByRole("dialog", {
    name: "You'll be signed out in 2 minutes",
  });
  await expect(warning).toBeVisible();

  // ...and the sign-out at 15.
  await page.clock.fastForward("02:05");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByText("You were signed out after 15 minutes without activity."),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Platform" })).toHaveCount(
    0,
  );
});
