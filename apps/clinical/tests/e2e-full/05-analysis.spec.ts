import { expect, test, type Page } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/**
 * Analysis on the demo cohort, live, as the analyst: the views, a filter,
 * the not-ready state (503 `not_ready` while a period is being frozen,
 * shown as "still being prepared" with Try again), and the de-identified
 * drill-down.
 */
async function openView(page: Page, title: string) {
  await page.getByRole("tab", { name: title }).click();
  await expect(
    page.getByRole("heading", { name: title, level: 2 }),
  ).toBeVisible();
}

/**
 * Waits until the view on screen has loaded: past loading and past "still
 * being prepared" (the not-ready state, retried with Try again). Loaded is
 * the view's Download CSV switching on; it stays off, with a reason, while
 * the view loads or can't be shown. A check made before the not-ready
 * state appears (the view still loading) no longer counts as settled.
 */
async function settle(page: Page) {
  const waiting = page.getByText(
    "These numbers are still being prepared. Try again shortly.",
  );
  const csv = page.getByRole("button", { name: "Download CSV" });
  const deadline = Date.now() + 150_000;
  let annotated = false;
  while (Date.now() < deadline) {
    await page.waitForLoadState("networkidle");
    if (await csv.isEnabled()) return;
    if (await waiting.isVisible()) {
      if (!annotated)
        test.info().annotations.push({
          type: "not_ready",
          description: "shown, retried",
        });
      annotated = true;
      await page.waitForTimeout(5_000);
      const again = page.getByRole("button", { name: "Try again" }).first();
      if (await again.isVisible()) await again.click();
    } else await page.waitForTimeout(1_000);
  }
  await expect(csv, "the view never loaded").toBeEnabled({ timeout: 1 });
}

test("analysis: views, a filter, not-ready, drill-down", async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page, "analyst");
  const calls = recordApi(page);
  await page.goto("/analysis");
  await expect(
    page.getByRole("heading", { name: "Analysis", level: 2 }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await settle(page);
  await expect(
    page.getByRole("heading", { name: "Prevalence and trends", level: 2 }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("prevalence.png"),
    fullPage: true,
  });
  for (const v of [
    "Who is affected",
    "Co-occurring",
    "Findings",
    "MHAI quality",
  ]) {
    // Every view's tab must be there: a renamed one fails, never skips.
    const tab = page.getByRole("tab", { name: new RegExp(`^${v}`) });
    await expect(tab).toHaveCount(1);
    await tab.click();
    await page.waitForLoadState("networkidle");
    await settle(page);
    await page.screenshot({
      path: test.info().outputPath(`${v}.png`),
      fullPage: true,
    });
  }
  // A filter: sex.
  await openView(page, "Who is affected");
  await page.getByLabel("Sex", { exact: true }).selectOption({ index: 1 });
  await page.waitForLoadState("networkidle");
  await settle(page);
  await page.getByLabel("Sex", { exact: true }).selectOption({ index: 0 });
  await page.waitForLoadState("networkidle");
  // Back on the unfiltered view, it can be not-ready again (core computes a
  // cold context on first ask, TODO.md "Precompute at freeze").
  await settle(page);
  // The drill-down.
  const see = page
    .getByRole("button", { name: /^See patients/ })
    .and(page.locator(":enabled"))
    .first();
  await expect(see).toBeVisible();
  await see.click();
  const list = page.getByRole("dialog", { name: /patients ·/ });
  await expect(list).toBeVisible();
  const rows = list
    .getByRole("list", { name: "Patients" })
    .getByRole("listitem");
  await expect(rows.first()).toContainText(/P-[A-Z0-9]{4,12}/);
  await page.screenshot({
    path: test.info().outputPath("drill.png"),
    fullPage: true,
  });
  await list.getByRole("button", { name: "Close" }).click();
  // 503 not_ready is the state above, not a failure.
  const bad = reportApi("analysis", calls).filter((c) => c.status !== 503);
  expect(bad).toEqual([]);
});
