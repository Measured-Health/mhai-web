import { expect, test } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/** The audit log, live: entries listed and one opened. */
test("audit: the log and one entry", async ({ page }) => {
  await signIn(page, "padmin");
  const calls = recordApi(page);
  await page
    .getByRole("navigation", { name: "Platform" })
    .getByRole("link", { name: "Audit log", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit log" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: test.info().outputPath("audit.png"),
    fullPage: true,
  });
  const entry = page
    .getByRole("main")
    .getByRole("row")
    .nth(1)
    .getByRole("button")
    .first();
  await entry.click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: test.info().outputPath("entry.png"),
    fullPage: true,
  });
  await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  expect(reportApi("audit", calls)).toEqual([]);
});
