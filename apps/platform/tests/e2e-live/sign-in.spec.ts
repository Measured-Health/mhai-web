import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";
import { expectNoStorage, signOut, typeCode } from "../e2e/helpers";

/**
 * Live: a fresh synthetic platform admin signs in with password and
 * two-step and out, against the backend's smoke stack, on the transport the
 * server was started with. e2e-live.sh has done the first sign-in steps
 * through core (TODO.md: the app can't yet take core's enrolment-only
 * session for a new admin). Core has no platform data routes yet, so the
 * pages after sign-in aren't checked.
 */
const user = JSON.parse(
  readFileSync(
    process.env.E2E_LIVE_USER_FILE ?? "/state/users/admin-live.json",
    "utf8",
  ),
) as { email: string; password: string; totp_secret: string };

test("a platform admin signs in with two-step and out", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  // A code is good once: wait for the next 30-second step after the one
  // e2e-live.sh used to turn two-step on.
  await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 1000);
  await typeCode(page, await totp(user.totp_secret, Date.now()));
  await expect(page).toHaveURL(/\/hospitals$/);
  await signOut(page);
  await expectNoStorage(page);
});
