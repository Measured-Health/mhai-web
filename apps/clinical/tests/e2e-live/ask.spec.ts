import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";
import {
  expectNoForbiddenWords,
  expectNoStorage,
  fillForm,
} from "../e2e/helpers";

/**
 * Live: sign in, ask, see the result and sign out, against the backend's
 * smoke stack (stub pipeline), on the transport the server was started
 * with. A fresh synthetic clinician per run (scripts/it/e2e-live.sh).
 */
const user = JSON.parse(
  readFileSync(
    process.env.E2E_LIVE_USER_FILE ?? "/state/users/clinician-live.json",
    "utf8",
  ),
) as { email: string; password: string };

async function signIn(page: Page, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * The first sign-in steps still owed: e2e-live.sh has already changed the
 * temporary password and accepted the terms through core (the welcome
 * flow's password step can't do it against core yet, TODO.md), so this is
 * normally two-step setup only. Any step is done if shown.
 */
async function firstSteps(page: Page) {
  const terms = page.getByLabel("I understand and agree to use MHAI this way");
  const showKey = page.getByRole("button", { name: "Can't scan? Show key" });
  const home = page.getByRole("button", { name: /Start a consultation/ });
  for (let i = 0; i < 4; i++) {
    await expect(terms.or(showKey).or(home)).toBeVisible();
    if (await home.isVisible()) return;
    if (await terms.isVisible()) {
      await terms.check();
      await page.getByRole("button", { name: "Continue" }).click();
      continue;
    }
    await showKey.click();
    const secret = (await page.locator("p.font-mono").innerText()).replace(
      /\s+/g,
      "",
    );
    await page.getByLabel("Digit 1 of 6").click();
    await page.keyboard.type(await totp(secret, Date.now()));
    await expect(
      page.getByRole("list", { name: "Backup codes" }),
    ).toBeVisible();
    await page.getByLabel("I've saved these codes somewhere safe").check();
    await page.getByRole("button", { name: "Finish setup" }).click();
  }
  await expect(home).toBeVisible();
}

test("sign in, ask a question, see the result, sign out", async ({ page }) => {
  await signIn(page, user.password);
  await firstSteps(page);
  await expect(page).toHaveURL(/\/$/);

  await fillForm(
    page,
    "Synthetic live question: chest pain 40 minutes, what to rule out?",
  );
  await page.getByRole("button", { name: /Analyse/ }).click();

  // The stub pipeline answers within seconds, often before "Analysing"
  // has painted: a result, or the failed view.
  const result = page.getByRole("heading", { name: "Clinical assessment" });
  const failed = page.getByRole("heading", {
    name: "We couldn't complete this one",
  });
  await expect(result.or(failed)).toBeVisible({ timeout: 120_000 });
  await expectNoForbiddenWords(page);
  if (await result.isVisible()) {
    // The safety rule holds whatever the transport: a needs-review result
    // shows the banner and no confidence level.
    const banner = page
      .getByRole("alert")
      .filter({ hasText: /needs clinician review/ });
    if (await banner.isVisible())
      await expect(
        page.getByRole("status", { name: /confidence/i }),
      ).toHaveCount(0);
  }

  // Sign out: nothing left in browser storage.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expectNoStorage(page);
});
