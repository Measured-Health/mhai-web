import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** Opens the phone filters sheet, runs `fn`, and closes it; on desktop just runs `fn`. */
async function withFilters(page: Page, n: number, fn: () => Promise<void>) {
  if (isMobile(page))
    await page.getByRole("button", { name: `Filters (${n})` }).click();
  await fn();
  if (isMobile(page)) await page.getByRole("button", { name: "Done" }).click();
}

/** A hospital's row in the table, or its card on a phone. */
const hospitalRow = (page: Page, name: string) =>
  isMobile(page)
    ? page
        .getByRole("list", { name: "By hospital" })
        .getByRole("listitem")
        .filter({ hasText: name })
    : page.getByRole("row", { name: new RegExp(name) });

async function pickHospital(page: Page, name: string) {
  await page.getByRole("button", { name: "One hospital" }).click();
  await page.getByRole("combobox", { name: "Hospital" }).selectOption({
    label: name,
  });
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();
}

/** Client-side navigation: a page load would drop the in-memory session. */
async function pushTo(page: Page, path: string) {
  await page.evaluate(
    (to) =>
      (
        window as unknown as { next: { router: { push(p: string): void } } }
      ).next.router.push(to),
    path,
  );
}

test("Ada opens Analysis from the sidebar: All hospitals, 10 of 12 included, Sample data, and the URL never changes while filtering", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Analysis");
  await expect(page).toHaveURL(/\/analysis$/);
  const url = page.url();
  const title = await page.title();
  await expect(page.getByText("10 of 12 hospitals included")).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Sample data").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "All hospitals" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { level: 2, name: "Prevalence and trends" }),
  ).toBeVisible();
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();

  if (isMobile(page))
    await page.getByRole("button", { name: "Filters (0)" }).click();
  await page.getByRole("combobox", { name: "Sex" }).selectOption("female");
  if (isMobile(page)) {
    await page.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("button", { name: "Filters (1)" }),
    ).toBeVisible();
  }
  await page.getByRole("combobox", { name: "Period" }).selectOption("6m");
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();
  expect(page.url()).toBe(url);
  expect(await page.title()).toBe(title);
});

test("phone: the filters sheet and the view select, with nothing scrolling sideways", async ({
  page,
}) => {
  test.skip(!isMobile(page), "phone layout");
  await signIn(page, ADA);
  await openNav(page, "Analysis");
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  // Tables become cards.
  await expect(page.getByRole("list", { name: "By hospital" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  // Nothing scrolls sideways unannounced: a scroller must say so (Task 6 M5).
  const unlabelled = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflowX !== "visible" &&
            getComputedStyle(el).overflowX !== "hidden" &&
            !/scrolls sideways/.test(el.getAttribute("aria-label") ?? ""),
        )
        .map((el) => el.tagName),
    );
  const pageFits = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  expect(await unlabelled()).toEqual([]);
  expect(await pageFits()).toBe(true);
  await page.getByRole("combobox", { name: "View" }).selectOption("findings");
  await expect(
    page.getByRole("heading", { level: 2, name: "Findings and alerts" }),
  ).toBeVisible();
  expect(await unlabelled()).toEqual([]);
  expect(await pageFits()).toBe(true);
  await page.getByRole("button", { name: "Filters (0)" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet.getByRole("combobox", { name: "Age band" })).toBeVisible();
  const box = await sheet
    .getByRole("button", { name: "Clear filters" })
    .boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("filter Sickle cell disease and read Fewer than 5 for Lakeside and Harbour View", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Analysis");
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();
  await withFilters(page, 0, async () => {
    await page.getByRole("combobox", { name: "Condition" }).fill("Sickle");
    await page.getByRole("option", { name: /Sickle cell disease/ }).click();
  });
  for (const name of ["Lakeside", "Harbour View"])
    await expect(hospitalRow(page, name)).toContainText("Fewer than 5");
});

test("pick Havana Hospital: the comparison shows the previous period, then the median of 5, then the verdict", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Analysis");
  await pickHospital(page, "Havana Hospital");
  const panel = page.getByRole("region", {
    name: "Compared with similar hospitals",
  });
  await expect(panel).toContainText("Last period");
  await expect(panel).toContainText(
    /Last period[\s\S]*Median of 5 similar hospitals[\s\S]*(Higher than|Lower than|About the same as) similar hospitals/,
  );
  await expect(panel).not.toContainText(/worse|sicker/i);
});

test("Riverside shows Not enough similar hospitals to compare", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Analysis");
  await pickHospital(page, "Riverside Children's Hospital");
  await expect(
    page
      .getByRole("region", { name: "Compared with similar hospitals" })
      .getByText("Not enough similar hospitals to compare"),
  ).toBeVisible();
});

test("Download CSV saves a file whose hidden values read Fewer than 5, and the trail shows the download", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Analysis");
  await expect(page.getByText(/^Updated \d\d:\d\d$/)).toBeVisible();
  await withFilters(page, 0, async () => {
    await page.getByRole("combobox", { name: "Condition" }).fill("Sickle");
    await page.getByRole("option", { name: /Sickle cell disease/ }).click();
  });
  await expect(hospitalRow(page, "Lakeside")).toContainText("Fewer than 5");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = readFileSync((await download.path())!, "utf8");
  expect(csv).toContain("Fewer than 5");
  expect(csv).toContain("Lakeside Community Clinic");

  await openNav(page, "Activity");
  await page.getByRole("tab", { name: "Analysis access" }).click();
  await expect(
    page
      .getByRole("list", { name: "Analysis access" })
      .getByText(/Ada Bakare downloaded .* as CSV/)
      .first(),
  ).toBeVisible();
});

test("Amara (auditor) sees no Analysis entry, /analysis lands on the access trail, and she exports it", async ({
  page,
}) => {
  await signIn(page, AMARA);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  const nav = page
    .getByRole("navigation", { name: "Platform" })
    .filter({ visible: true });
  await expect(nav.getByRole("link", { name: "Usage" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^Analysis/ })).toHaveCount(0);
  if (isMobile(page)) await page.keyboard.press("Escape");

  await pushTo(page, "/analysis");
  await expect(page).toHaveURL(/\/activity\?tab=analysis-access$/);
  await expect(
    page.getByRole("tab", { name: "Analysis access" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Who looked at Analysis.")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export for a legal request" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^mhai-analysis-access-\d{4}-\d\d-\d\d\.csv$/,
  );
});
