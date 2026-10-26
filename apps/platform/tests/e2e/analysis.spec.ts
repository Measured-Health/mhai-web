import { expect, test } from "@playwright/test";
import {
  ADA,
  AMARA,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

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
  await page.getByRole("combobox", { name: "View" }).selectOption("findings");
  await expect(
    page.getByRole("heading", { level: 2, name: "Findings and alerts" }),
  ).toBeVisible();
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].some(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).overflowX !== "visible" &&
        getComputedStyle(el).overflowX !== "hidden",
    ),
  );
  expect(wide).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Filters (0)" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet.getByRole("combobox", { name: "Age band" })).toBeVisible();
  const box = await sheet
    .getByRole("button", { name: "Clear filters" })
    .boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("Amara (auditor) sees no Analysis entry", async ({ page }) => {
  await signIn(page, AMARA);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  const nav = page
    .getByRole("navigation", { name: "Platform" })
    .filter({ visible: true });
  await expect(nav.getByRole("link", { name: "Usage" })).toBeVisible();
  await expect(nav.getByRole("link", { name: /^Analysis/ })).toHaveCount(0);
});
