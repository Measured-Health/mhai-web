import { expect, test, type Page } from "@playwright/test";
import {
  expectNoForbiddenWords,
  expectNoStorage,
  fillForm,
  isMobile,
  openAccountMenu,
  openReview,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;
  // Corrections and decisions are clinical content: never in storage.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

async function start(page: Page) {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openReview(page);
}
const row = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Waiting corrections" })
    .getByRole("button", { name: new RegExp(title) });
const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 2, name });
const undoNotice = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Correction approved" });
/** On phones the list and the detail are separate screens. */
const backToQueue = async (page: Page) => {
  if (isMobile(page))
    await page.getByRole("button", { name: "Back to the queue" }).click();
};
/**
 * Stops the page's clock (after `page.clock.install()`), so a 10-second undo
 * window can't run out while the test acts in it. `page.clock.resume()` lets
 * time flow again.
 */
const holdClock = async (page: Page) =>
  page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
const openSidebarOnPhones = async (page: Page) => {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
};

test("the sidebar counts what's waiting for you", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openSidebarOnPhones(page);
  await expect(
    page
      .getByRole("link", { name: "Review corrections, 3 waiting" })
      .filter({ visible: true }),
  ).toBeVisible();
});

test("approve, undo, approve again: sent after 10 seconds", async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await row(page, "Acute asthma, moderate").click();
  await expect(title(page, "Acute asthma, moderate")).toBeVisible();
  await page.getByRole("button", { name: "Approve correction" }).click();
  // The notice takes the detail's place for the 10 seconds.
  await expect(undoNotice(page)).toBeVisible();
  await holdClock(page);
  await expect(
    page.getByRole("button", { name: "Undo approval" }),
  ).toBeFocused();
  await expect(title(page, "Acute asthma, moderate")).toBeHidden();
  await page.getByRole("button", { name: "Undo approval" }).click();
  await expect(undoNotice(page)).toBeHidden();
  await expect(title(page, "Acute asthma, moderate")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve correction" }),
  ).toBeFocused();
  await page.clock.resume();

  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(undoNotice(page)).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(undoNotice(page)).toBeHidden();
  // The next one opens once the window ends.
  await expect(
    page.getByRole("button", { name: "Approve correction" }),
  ).toBeVisible();
  await expect(title(page, "Acute asthma, moderate")).toHaveCount(0);
  await backToQueue(page);
  await expect(row(page, "Acute asthma, moderate")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Your recent decisions" }),
  ).toContainText("Acute asthma, moderate");
});

test("Next correction on the notice sends the approval at once", async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await row(page, "Hypokalaemia, cause unclear").click();
  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(undoNotice(page)).toBeVisible();
  await page.getByRole("button", { name: "Next correction" }).click();
  await expect(undoNotice(page)).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Approve correction" }),
  ).toBeVisible();
  await backToQueue(page);
  await expect(row(page, "Hypokalaemia, cause unclear")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Your recent decisions" }),
  ).toContainText("Hypokalaemia, cause unclear");
});

test("leaving during the undo window sends the approval at once", async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await row(page, "Dengue fever, likely").click();
  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(undoNotice(page)).toBeVisible();
  // The 10 seconds can't run out: only leaving can send it.
  await holdClock(page);
  await openSidebarOnPhones(page);
  await page
    .getByRole("link", { name: "Help" })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await page.clock.resume();
  await openReview(page);
  // The page keeps its place, so phones come back to the next one's detail.
  await backToQueue(page);
  await expect(row(page, "Dengue fever, likely")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Your recent decisions" }),
  ).toContainText("Dengue fever, likely");
});

test("reject needs a reason, and the suggester will see it", async ({
  page,
}) => {
  await start(page);
  await row(page, "Dengue fever, likely").click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  // A dialog on desktop, a bottom sheet on phones.
  const dialog = page.getByRole("dialog", { name: /reject/i });
  await dialog.getByRole("button", { name: "Reject with reason" }).click();
  await expect(dialog.getByText("Choose a reason.")).toBeVisible();
  await dialog.getByText("Partly right, needs rewording").click();
  await dialog
    .getByLabel("Note (optional)")
    .fill("Keep the platelet trigger as well (WHO §3.4). ñ 🙂");
  await expect(
    dialog.getByText("Dr. Okafor will see your reason."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Reject with reason" }).click();
  await expect(
    page.getByText("Correction rejected", { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  await backToQueue(page);
  await expect(row(page, "Dengue fever, likely")).toHaveCount(0);
});

test("your own correction can't be approved; you can withdraw it", async ({
  page,
}) => {
  await start(page);
  await row(page, "Febrile seizure, simple").click();
  await expect(
    page.getByText("You can't review your own correction."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve correction" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reject", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("a");
  await expect(undoNotice(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Withdraw my correction" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Withdraw this correction?",
  });
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await dialog.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(
    page.getByText("Correction withdrawn", { exact: true }),
  ).toBeVisible();
  await backToQueue(page);
  await expect(row(page, "Febrile seizure, simple")).toHaveCount(0);
});

test("A and R work in review and are listed under ?", async ({ page }) => {
  test.skip(isMobile(page), "keyboard shortcuts are for keyboards");
  await page.clock.install();
  await start(page);
  await row(page, "Hypokalaemia, cause unclear").click();
  await page.keyboard.press("r");
  const dialog = page.getByRole("dialog", {
    name: "Why are you rejecting this?",
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("a");
  await expect(undoNotice(page)).toBeVisible();
  await holdClock(page);
  // While the notice is up, A and R do nothing.
  await page.keyboard.press("r");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Undo approval" }).click();
  await expect(title(page, "Hypokalaemia, cause unclear")).toBeVisible();
  await page.clock.resume();
  await page.keyboard.press("?");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toContainText("Approve correction (in review)");
});

test("my feedback & corrections: statuses, the reviewer's reason, withdraw", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openAccountMenu(page);
  await page
    .getByRole("menuitem", { name: "My feedback & corrections" })
    .click();
  await expect(page).toHaveURL(/\/my-feedback$/);
  await expect(page.getByRole("button", { name: "All · 3" })).toBeVisible();
  const list = page.getByRole("list", { name: "Your corrections" });
  await expect(list).toContainText("Approved by Dr. Okafor");
  await expect(list).toContainText("Rejected by Nurse Bello");
  await expect(list).toContainText(
    'Partly right, needs rewording: Keep "cause unclear"',
  );
  await list
    .getByRole("button", { name: /^Withdraw ?: Febrile seizure, simple$/ })
    .click();
  await page
    .getByRole("dialog", { name: "Withdraw this correction?" })
    .getByRole("button", { name: "Withdraw", exact: true })
    .click();
  await expect(
    page.getByText("Correction withdrawn", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdrawn · 1" }),
  ).toBeVisible();
});

test("a reviewer's decision arrives as a toast and stays in the bell", async ({
  page,
}) => {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await fillForm(page, "Fever 3 days and rash, dengue area. Admit?");
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(page.getByText("Analysing your question")).toBeVisible();
  // The demo result takes about 9 seconds: skip them.
  await page.clock.fastForward(10_000);
  await page.getByRole("button", { name: /Suggest correction/ }).click();
  await page
    .getByLabel(/What should the diagnosis/)
    .fill("Dengue fever with warning signs: admit");
  await page.getByLabel(/Why\?/).fill("Persistent vomiting is a warning sign.");
  await page.getByRole("button", { name: "Submit correction" }).click();
  await expect(page.getByText(/sent for review/)).toBeVisible();
  // The demo reviewer decides two minutes later; polling picks it up.
  await page.clock.fastForward("02:30");
  await expect(page.getByText("Your correction was approved")).toBeVisible();
  await page
    .getByRole("button", { name: "Decisions on your corrections, 1 new" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Decisions this session" }),
  ).toContainText("Dengue fever, likely");
});
