import { expect, test, type Page } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/**
 * The clinician's alerts, live: the synthetic source's critical potassium
 * (made by the platform spec's connection, the activated rule set and the
 * queue) shows in the bell's unread count and in the inbox, and is
 * acknowledged; another is dismissed with a reason.
 */
const bell = (page: Page) =>
  page
    .getByRole("button", { name: /^Notifications(, \d+ unread)?$/ })
    .filter({ visible: true });

test("alerts: unread count, acknowledge, dismiss", async ({ page }) => {
  test.setTimeout(1_800_000);
  await signIn(page, "clinician");
  const calls = recordApi(page);
  // The late result comes a while after the first sync, which itself may
  // wait out a back-off (the first poll after switching on can miss the
  // egress allow-list): up to 26 minutes for the count.
  await expect(async () => {
    await page.goto("/notifications");
    await expect(bell(page)).toHaveAccessibleName(/\d+ unread/, {
      timeout: 5_000,
    });
  }).toPass({ timeout: 1_560_000, intervals: [15_000] });
  await page.screenshot({
    path: test.info().outputPath("inbox.png"),
    fullPage: true,
  });
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  const first = cards.first();
  await first.getByRole("button", { name: "Acknowledge" }).click();
  await expect(first.getByText(/^Acknowledged by /)).toBeVisible();
  if (n > 1) {
    const second = page
      .getByRole("article")
      .filter({
        has: page
          .getByRole("button", { name: "Dismiss" })
          .and(page.locator(":enabled")),
      })
      .first();
    await second.getByRole("button", { name: "Dismiss" }).click();
    const dialog = page.getByRole("dialog", { name: "Dismiss this alert?" });
    await dialog.getByText("Already known", { exact: true }).click();
    await dialog.getByRole("button", { name: "Dismiss alert" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Dismissed", exact: true }).click();
    await expect(
      page
        .getByRole("article")
        .first()
        .getByText(/^Dismissed by /),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  await expect(
    page
      .getByRole("article")
      .first()
      .getByText(/^Acknowledged by /),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("handled.png"),
    fullPage: true,
  });
  expect(reportApi("alerts", calls)).toEqual([]);
});

/**
 * "Ask MHAI about it" from a live alert. Core 1.22.0's AlertOut carries no
 * patient id, so the form is filled but not linked to the patient (a core
 * gap, TODO.md). When core adds the id, this test is the one to change.
 */
test("alerts: ask from an alert fills the form, unlinked until core sends the patient id", async ({
  page,
}) => {
  await signIn(page, "clinician");
  const calls = recordApi(page);
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  const first = page.getByRole("article").first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await first.getByRole("button", { name: "Ask MHAI about it" }).click();
  await expect(page.getByText(/^Filled in from a patient alert/)).toBeVisible();
  await expect(page.getByRole("group", { name: "About patient" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: test.info().outputPath("ask-from-alert.png"),
    fullPage: true,
  });
  expect(reportApi("alerts-ask", calls)).toEqual([]);
});
