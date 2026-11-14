import { expect, test, type Page } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/**
 * Every page of the platform app, live: the page renders and no call to
 * the BFF fails. The session is in memory, so the pages are opened by
 * clicking, never by loading an address.
 */
const NAV = [
  "Connections",
  "Hospitals",
  "Usage",
  "Analysis",
  "Clearances",
  "Legal holds",
  "System",
  "Settings",
  "Team",
  "Activity",
  "Audit log",
  "Account",
];

let page: Page;
let calls: ReturnType<typeof recordApi>;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signIn(page, "padmin");
  calls = recordApi(page);
});
test.afterAll(async () => page?.close());

for (const name of NAV)
  test(`platform ${name}`, async () => {
    test.setTimeout(90_000);
    const from = 0;
    calls.length = 0;
    const link = page
      .getByRole("navigation", { name: "Platform" })
      .getByRole("link", {
        name: name === "Analysis" ? /^Analysis/ : name,
        exact: true,
      })
      .filter({ visible: true });
    // Off in live mode until signed off (Analysis across hospitals).
    test.skip((await link.count()) === 0, `${name} isn't in the menu`);
    await link.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: test.info().outputPath("page.png"),
      fullPage: true,
    });
    const bad = reportApi(`platform ${name}`, calls.slice(from));
    // Usage's What changed fails closed until core's first weekly
    // evaluation ({unavailable: true}): by design, as in 03-ops.
    await expect(
      page.getByText(
        /Something went wrong|couldn't load (?!what changed)|can't load/i,
      ),
    ).toHaveCount(0);
    expect(bad, JSON.stringify(bad)).toEqual([]);
  });
