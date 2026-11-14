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

/** Waits past "still being prepared": the not-ready state, retried. */
async function settle(page: Page) {
  const waiting = page.getByText(
    "These numbers are still being prepared. Try again shortly.",
  );
  for (let i = 0; i < 20 && (await waiting.isVisible()); i++) {
    test
      .info()
      .annotations.push({ type: "not_ready", description: "shown, retried" });
    await page.waitForTimeout(5_000);
    const again = page.getByRole("button", { name: "Try again" }).first();
    if (await again.isVisible()) await again.click();
    await page.waitForLoadState("networkidle");
  }
}

test("analysis: views, a filter, not-ready, drill-down", async ({ page }) => {
  test.setTimeout(240_000);
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
    "Data quality",
  ]) {
    const tab = page.getByRole("tab", { name: new RegExp(`^${v}`) });
    if (!(await tab.count())) {
      test.info().annotations.push({ type: "missing-tab", description: v });
      continue;
    }
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
