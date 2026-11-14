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
  test.setTimeout(900_000);
  await signIn(page, "clinician");
  const calls = recordApi(page);
  // The source is polled every minute or two: wait for the count.
  await expect(async () => {
    await page.goto("/notifications");
    await expect(bell(page)).toHaveAccessibleName(/\d+ unread/, {
      timeout: 5_000,
    });
  }).toPass({ timeout: 780_000, intervals: [15_000] });
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
