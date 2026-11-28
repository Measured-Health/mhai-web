import { expect, test, type Locator, type Page } from "@playwright/test";
import { freshCode, readUser, signIn, typeCode } from "./live";

/**
 * The platform admin's backup code, end to end in a real browser (the
 * owner's report of 28 Nov: a backup-code sign-in left no working code).
 * Each use of the one backup code gives a new one, shown once: at sign-in
 * on the code page, and after a step-up on top of the page. The codes live
 * in this test's memory only, never in a file or the run's log.
 */
const CODE = /^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/;

/** The code on a save screen, after checking it has Copy and the wait. */
async function savedCode(scope: Page | Locator): Promise<string> {
  const group = scope.getByRole("group", { name: "Your backup code" });
  await expect(group).toBeVisible();
  const code = (await group.locator("span.font-mono").innerText()).trim();
  expect(code).toMatch(CODE);
  await expect(
    group.getByRole("button", { name: "Copy backup code" }),
  ).toBeVisible();
  const go = scope.getByRole("button", { name: "Continue", exact: true });
  // Continue waits 3 s so the code is seen before it can go.
  await expect(go).toHaveAttribute("aria-disabled", "true");
  await expect(go).not.toHaveAttribute("aria-disabled", { timeout: 6_000 });
  return code;
}

/** Sign out from the account menu, as a person would. */
async function signOut(page: Page) {
  await page.getByRole("button", { name: /^Account menu: / }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** Password, then a backup code on the code page; Verify. */
async function backupSignIn(page: Page, code: string) {
  const u = readUser("padmin");
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByRole("button", { name: "Use a backup code instead" }).click();
  await page.getByRole("textbox", { name: "Backup code" }).fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

/** A new backup code from Account, confirmed with the authenticator. */
async function makeCode(page: Page): Promise<string> {
  await page.goto("/account");
  await page.getByRole("button", { name: "Make a new backup code" }).click();
  const dlg = page.getByRole("dialog", { name: "New backup code" });
  await typeCode(page, await freshCode(page, "padmin"), dlg);
  await dlg.getByRole("button", { name: "Make a new backup code" }).click();
  const code = await savedCode(dlg);
  await dlg.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dlg).toBeHidden();
  return code;
}

test.describe.configure({ mode: "serial" });
let current = "";

test("a backup-code sign-in shows the new code; only the new one works", async ({
  page,
}) => {
  await signIn(page, "padmin");
  const first = await makeCode(page);
  await signOut(page);

  await backupSignIn(page, first);
  await expect(
    page.getByRole("heading", { name: "Save your new backup code" }),
  ).toBeVisible();
  const second = await savedCode(page);
  expect(second).not.toBe(first);
  // Still on the code page until Continue.
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/hospitals$/);
  await signOut(page);

  // The spent code is refused; the new one signs in and is renewed again.
  await backupSignIn(page, first);
  await expect(page.getByText("That backup code didn't work.")).toBeVisible();
  await page.getByRole("textbox", { name: "Backup code" }).fill(second);
  await page.getByRole("button", { name: "Verify" }).click();
  const third = await savedCode(page);
  expect(third).not.toBe(second);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/hospitals$/);
  current = third;
});

test("a backup-code step-up (moving to a new app) shows the new code", async ({
  page,
}) => {
  test.skip(!current, "needs the code the sign-in test left");
  await backupSignIn(page, current);
  const fromSignIn = await savedCode(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/hospitals$/);

  await page.goto("/account");
  await page.getByRole("button", { name: "Move to a new app" }).click();
  const move = page.getByRole("dialog", {
    name: "Move to a new authenticator app",
  });
  await move.getByRole("button", { name: "Use a backup code" }).click();
  await move.getByRole("textbox", { name: "Backup code" }).fill(fromSignIn);
  await move.getByRole("button", { name: /^Continue|^Next|^Confirm/ }).click();
  // Core spent the code and made a new one: shown once, on top.
  const shown = page.getByRole("dialog", { name: "Save your new backup code" });
  const renewed = await savedCode(shown);
  expect(renewed).not.toBe(fromSignIn);
  await shown.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(shown).toBeHidden();
  await move.getByRole("button", { name: "Cancel" }).click();
  await signOut(page);

  // The renewed code is the one that works now.
  await backupSignIn(page, fromSignIn);
  await expect(page.getByText("That backup code didn't work.")).toBeVisible();
  await page.getByRole("textbox", { name: "Backup code" }).fill(renewed);
  await page.getByRole("button", { name: "Verify" }).click();
  await savedCode(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/hospitals$/);
});
