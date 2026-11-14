import { expect, test } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/**
 * Every main page of the clinical app, per person, live: the page renders
 * and no call to the BFF fails. A failed call is printed (API ...) as the
 * evidence of a mismatch with core.
 */
const PAGES: Record<string, string[]> = {
  clinician: ["/", "/notifications", "/account", "/my-feedback", "/review"],
  analyst: ["/analysis"],
  hadmin: [
    "/admin",
    "/admin/alerts",
    "/admin/staff",
    "/admin/settings",
    "/admin/activity",
    "/admin/usage",
  ],
};

for (const [who, paths] of Object.entries(PAGES))
  test.describe(`tour: ${who}`, () => {
    for (const path of paths)
      test(`${who} ${path}`, async ({ page }) => {
        await signIn(page, who);
        const calls = recordApi(page);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: test.info().outputPath("page.png"),
          fullPage: true,
        });
        // 503 not_ready on an Analysis view is its "still being prepared"
        // state (the period is being frozen), shown with Try again.
        const bad = reportApi(`${who} ${path}`, calls).filter(
          (c) => !(c.status === 503 && c.path.startsWith("/api/v1/analysis/")),
        );
        await expect(
          page.getByText(
            /Something went wrong|couldn't load|can't load|Couldn't load/i,
          ),
        ).toHaveCount(0);
        expect(bad, JSON.stringify(bad)).toEqual([]);
      });
  });
