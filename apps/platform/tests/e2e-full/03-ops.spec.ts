import { expect, test } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/** System health and jobs, then Usage (analytics), live. */
test("ops and analytics: health, jobs, usage", async ({ page }) => {
  await signIn(page, "padmin");
  const calls = recordApi(page);
  const nav = page.getByRole("navigation", { name: "Platform" });
  await nav.getByRole("link", { name: "System", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "System" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: test.info().outputPath("system.png"),
    fullPage: true,
  });
  for (const tab of ["Health", "Jobs"]) {
    const t = page
      .getByRole("link", { name: tab, exact: true })
      .or(page.getByRole("tab", { name: tab, exact: true }));
    if (await t.count()) {
      await t.first().click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: test.info().outputPath(`${tab}.png`),
        fullPage: true,
      });
      await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
    }
  }
  await nav.getByRole("link", { name: "Usage", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Usage" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: test.info().outputPath("usage.png"),
    fullPage: true,
  });
  // What changed fails closed until core's first weekly evaluation
  // ({unavailable: true}) and while alerts are on (F4): by design.
  await expect(page.getByText(/couldn't load (?!what changed)/i)).toHaveCount(
    0,
  );
  expect(reportApi("ops", calls)).toEqual([]);
});
