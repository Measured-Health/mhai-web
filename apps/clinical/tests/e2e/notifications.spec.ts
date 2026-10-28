import { expect, test, type Page } from "./csp";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  isMobile,
  openAccountMenu,
  openNotifications,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;
  // Patient names and MRNs live in memory only, and no codes reach the screen.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

const bell = (page: Page) =>
  page
    .getByRole("button", { name: /^Notifications(, \d+ unread)?$/ })
    .filter({ visible: true });
const card = (page: Page, name: string) =>
  page.getByRole("article", { name: new RegExp(name) });
// Pop-up text is matched exactly: the hidden live regions hold the same words
// with more around them.

/** The clinician sample, on a clock the test can move (a new alert every 2 minutes). */
async function asClinician(page: Page) {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 6 unread");
  // The kept-alive copies of the sign-in page are out of the accessibility tree.
  await expect(page.getByRole("main")).toHaveCount(1);
}

test("a new alert pops up, opens from View, and is acknowledged", async ({
  page,
}) => {
  await asClinician(page);
  // The alerts already there at sign-in never pop up.
  await expect(
    page.getByText(/^(Critical|Urgent|Info) patient alert$/),
  ).toHaveCount(0);
  // Focus stays where it was when a pop-up shows.
  const start = page.getByRole("button", { name: /Start a consultation/ });
  await start.focus();
  await expect(start).toBeFocused();
  await page.clock.fastForward("02:30"); // the Urgent sample arrives
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toBeVisible();
  // The seeded Criticals never pop up as a baseline.
  await expect(
    page.getByText("Critical patient alert", { exact: true }),
  ).toHaveCount(0);
  await expect(start).toBeFocused();
  await expect(
    page.getByText("Emeka Nnamdi · Platelets 62 ×10⁹/L (low; normal 150–400)", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName("Notifications, 7 unread");
  await page
    .getByRole("button", { name: "View alert for Emeka Nnamdi" })
    .click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page).toHaveTitle("Notifications · MHAI");
  expect(await page.title()).not.toMatch(/Emeka|Nnamdi|318552/);
  const c = card(page, "Emeka Nnamdi");
  await expect(c).toBeFocused();
  await c.getByRole("button", { name: "Acknowledge" }).click();
  await expect(
    c.getByText(/^Acknowledged by Dr\. Reyes · \d\d:\d\d$/),
  ).toBeVisible();
  await expect(c.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
  await expect(bell(page)).toHaveAccessibleName("Notifications, 6 unread");
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  await expect(card(page, "Emeka Nnamdi")).toBeVisible();
  await expect(card(page, "Kemi Afolabi")).toBeVisible();
  // Nothing about the patient in the address bar.
  expect(page.url()).not.toMatch(/Emeka|Nnamdi|318552/);
});

test("dismissing needs a reason, and the alert moves to Dismissed", async ({
  page,
}) => {
  await asClinician(page);
  await openNotifications(page);
  const c = card(page, "Samuel Bassey");
  await c.getByRole("button", { name: "Dismiss" }).click();
  const dialog = page.getByRole("dialog", { name: "Dismiss this alert?" });
  await dialog.getByRole("button", { name: "Dismiss alert" }).click();
  await expect(dialog.getByText("✕ Choose a reason.")).toBeVisible();
  await dialog.getByText("Already known", { exact: true }).click();
  await dialog.getByLabel("Note (optional)").fill("Known kidney disease.");
  await dialog.getByRole("button", { name: "Dismiss alert" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    c.getByText(/^Dismissed by Dr\. Reyes · \d\d:\d\d · Already known$/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismissed", exact: true }).click();
  await expect(card(page, "Samuel Bassey")).toBeVisible();
  await expect(card(page, "Peter Ogbu")).toBeVisible();
});

test("Ask MHAI about it fills a consultation without the name or MRN", async ({
  page,
}) => {
  await asClinician(page);
  await openNotifications(page);
  await card(page, "Maryam Abdullahi")
    .getByRole("button", { name: "Ask MHAI about it" })
    .click();
  await expect(page.getByText(/Filled in from a patient alert/)).toBeVisible();
  // The prefill key is removed from the address once it has been used.
  await expect(page).not.toHaveURL(/prefill/);
  await expect(page.getByLabel("Age")).toHaveValue("67");
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
  const question = page.getByLabel("Clinical question");
  await expect(question).toHaveValue(
    /^Potassium 2\.9 mmol\/L \(low; normal 3\.5–5\.1\), recorded (\d{1,2} \w{3} )?\d\d:\d\d\. /,
  );
  expect(await question.inputValue()).not.toMatch(
    /Maryam|Abdullahi|204817|Ward 3/,
  );
  const form = await page.locator("body").innerText();
  expect(form).not.toMatch(/Maryam|Abdullahi|204817/);
  expect(page.url()).not.toMatch(/Maryam|204817/);
});

test("with alert pop-ups off, Urgent stays quiet but Critical still pops up", async ({
  page,
}) => {
  await asClinician(page);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  const alertsSwitch = page.getByRole("switch", {
    name: "Pop-ups for patient alerts",
  });
  await alertsSwitch.click();
  await expect(alertsSwitch).not.toBeChecked();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Critical alerts will still pop up.", { exact: true }),
  ).toBeVisible();

  await page.clock.fastForward("02:30"); // the Urgent sample arrives
  await expect(bell(page)).toHaveAccessibleName("Notifications, 7 unread");
  await bell(page).click();
  await expect(
    page.getByRole("region", { name: "Recent notifications" }),
  ).toContainText("Emeka Nnamdi");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toHaveCount(0);

  await page.clock.fastForward("02:00"); // the Critical sample arrives
  await expect(
    page.getByText("Critical patient alert", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Halima Garba · Potassium 6\.7/)).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName("Notifications, 8 unread");
});

test("the Corrections tab still shows decisions on your corrections", async ({
  page,
}) => {
  await asClinician(page);
  await openNotifications(page);
  await page.getByRole("link", { name: /^Corrections/ }).click();
  await expect(page).toHaveURL(/\/notifications\/corrections$/);
  const list = page.getByRole("list", {
    name: "Decisions on your corrections",
  });
  await expect(list).toContainText("Unstable angina");
  await expect(list).toContainText("Approved");
  await expect(list).toContainText("Hypokalaemia, cause unclear");
  await expect(list).toContainText("Rejected");
  await page.getByRole("link", { name: /My feedback & corrections/ }).click();
  await expect(page).toHaveURL(/\/my-feedback$/);
});

test("signing out while a Critical pop-up shows clears it and keeps nothing", async ({
  page,
}) => {
  await asClinician(page);
  await page.clock.fastForward("04:30"); // the Urgent and Critical samples arrive
  await expect(
    page.getByText("Critical patient alert", { exact: true }),
  ).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText(/patient alert/)).toHaveCount(0);
  await expect(page.getByText(/Halima Garba|Emeka Nnamdi/)).toHaveCount(0);
});

test("a hospital admin who isn't a clinician gets no bell", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(
    page.getByRole("heading", { name: "Staff", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Notifications/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Notifications/ })).toHaveCount(
    0,
  );
});
