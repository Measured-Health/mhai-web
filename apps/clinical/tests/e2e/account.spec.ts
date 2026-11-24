import { expect, test } from "./csp";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  openAccountMenu,
  signIn,
  typeCode,
} from "./helpers";
import { MOCK_BACKUP_CODES } from "../../lib/auth/mock";

test.afterEach(async ({ page }) => {
  // No account details, codes or tokens in browser storage, ever.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

test("clinical pages need sign-in", async ({ page }) => {
  await page.goto("/help");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo sign-in")).toBeVisible();
});

test("sign in, see your name, sign out from the account menu", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/welcome, dr\. reyes/i)).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText("You've signed out")).toBeVisible();
});

test("a second sign-in in the same tab can sign out too", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  // Sign in again without reloading: the sign-out page stays kept alive.
  await page
    .getByLabel("Work email")
    .fill("admin.nwosu@pilot-hospital.example");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText("You've signed out")).toBeVisible();
});

test("two-step code, including a wrong one first", async ({ page }) => {
  await signIn(page, "mfa.okafor@pilot-hospital.example");
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByLabel("Digit 1 of 6").click();
  // The sixth digit submits on its own: no button press.
  await page.keyboard.type("000000");
  await expect(
    page.getByRole("alert").filter({ hasText: "That code didn't work." }),
  ).toBeVisible();
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type("123456");
  await expect(page).toHaveURL(/\/$/);
});

test("a deep link to the code step with nothing pending goes to sign-in", async ({
  page,
}) => {
  await page.goto("/sign-in/code");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("first sign-in: password, two-step, backup code, then terms", async ({
  page,
}) => {
  await signIn(page, "new.bello@pilot-hospital.example");
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Temporary password").fill("demo-password");
  await page.getByLabel("New password").fill("tram-lantern-okra");
  await page.getByLabel("Confirm password").fill("tram-lantern-okra");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type("123456");
  await expect(
    page.getByRole("group", { name: "Your backup code" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByLabel("I understand and agree to use MHAI this way").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a platform admin account sees the 403 page, never the clinical app", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.platformAdmin);
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access" }),
  ).toBeVisible();
  await expect(page.getByText("Error 403")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("wrong passwords count down, and the message never confirms the account", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("x@pilot-hospital.example");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "That email and password don't match." });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("4 attempts left before a 15-minute lock.");
});

test("forgot password sends the same reply for any email", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  // The sign-in page stays mounted but hidden; target the visible field.
  await page
    .getByRole("textbox", { name: "Work email" })
    .fill("anyone@anywhere.org");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/anyone/);
});

test("profile and security, then sign out everywhere", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByText("Attending physician", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("This device")).toBeVisible();
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page
    .getByRole("dialog", { name: "Sign out everywhere?" })
    .getByRole("button", { name: "Sign out everywhere" })
    .click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("signing out mid-draft asks first", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("54");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  const dialog = page.getByRole("dialog", { name: "Discard this draft?" });
  await expect(dialog).toContainText(/lost/);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Age")).toHaveValue("54");
});

test("a sample account fills the form in one tap", async ({ page }) => {
  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: /Use Clinician with two-step/ })
    .click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\/code$/);
});

test("hospital sign-on in the demo", async ({ page }) => {
  await page.goto("/sign-in");
  await page
    .getByRole("button", { name: "Continue with hospital account" })
    .click();
  await expect(page).toHaveURL(/\/$/);
});

test("a new backup code from the account page, confirmed with your code", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  await page.getByRole("button", { name: "Make a new backup code" }).click();
  const dialog = page.getByRole("dialog", { name: "New backup code" });
  // The sixth digit confirms; the new code shows in its place.
  await typeCode(page, "123456", dialog);
  await expect(
    dialog.getByRole("group", { name: "Your backup code" }),
  ).toContainText(MOCK_BACKUP_CODES[1]);
  const go = dialog.getByRole("button", { name: "Continue" });
  await expect(go).toBeDisabled();
  // Works after the 3-second wait (the click waits for it).
  await go.click();
  await expect(page.getByText(MOCK_BACKUP_CODES[1])).toHaveCount(0);
});

test("sign in with the backup code: the new one shows once before going on", async ({
  page,
}) => {
  await signIn(page, "mfa.okafor@pilot-hospital.example");
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await page.getByRole("button", { name: "Use a backup code" }).click();
  await page
    .getByLabel("Backup code", { exact: true })
    .fill(MOCK_BACKUP_CODES[0]);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(
    page.getByRole("heading", { name: "Save your new backup code" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Your backup code" }),
  ).toContainText(MOCK_BACKUP_CODES[1]);
  await expect(
    page.getByRole("button", { name: "Copy backup code" }),
  ).toBeVisible();
  expect(page.url()).not.toContain(MOCK_BACKUP_CODES[1]);
  const go = page.getByRole("button", { name: "Continue" });
  await expect(go).toBeDisabled();
  await go.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(MOCK_BACKUP_CODES[1])).toHaveCount(0);
});
