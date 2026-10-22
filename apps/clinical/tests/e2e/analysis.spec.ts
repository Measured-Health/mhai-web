import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_EMAILS,
  expectNoStorage,
  isMobile,
  openAdmin,
  signIn,
} from "./helpers";

// A console and page-error check, not a header test: the clinical app sends no
// Content-Security-Policy. Console messages that mention one, and uncaught page
// errors, are collected for every test and checked after it.
const violations = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const seen: string[] = [];
  violations.set(page, seen);
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) seen.push(m.text());
  });
  page.on("pageerror", (e) => seen.push(e.message));
});

test.afterEach(async ({ page }) => {
  // A skipped test never opened the app.
  if (page.url() === "about:blank") return;
  // Nothing from the page (filters, counts, patients) in browser storage.
  await expectNoStorage(page);
  expect(violations.get(page)).toEqual([]);
});

/**
 * A client-side visit to `href`, as a typed address would be, without the
 * reload that ends the memory-only demo session (see hospital-admin.spec.ts
 * for the same helper and its caveat about `window.next.router`).
 */
async function visitInApp(page: Page, href: string) {
  const reached = page.waitForEvent("framenavigated", {
    predicate: (f) =>
      f === page.mainFrame() && new URL(f.url()).pathname === href,
    timeout: 15_000,
  });
  await page.evaluate((to) => {
    const w = window as unknown as {
      next: { router: { push(href: string): void } };
    };
    w.next.router.push(to);
  }, href);
  await reached;
}

/** The sidebar's Analysis link (from the menu on phones). */
const analysisLink = (page: Page) =>
  page.getByRole("link", { name: /^Analysis/ }).filter({ visible: true });

async function openAnalysis(page: Page) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await analysisLink(page).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(
    page.getByRole("heading", { name: "Analysis", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prevalence and trends", level: 2 }),
  ).toBeVisible();
}

async function asAnalyst(page: Page) {
  await signIn(page, DEMO_EMAILS.analyst);
  await expect(page).toHaveURL(/\/$/);
  await openAnalysis(page);
}

async function asHospitalAdmin(page: Page) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
}

/** Runs `change` with the filter controls reachable (in the sheet on phones). */
async function withFilters(page: Page, change: () => Promise<void>) {
  if (!isMobile(page)) return change();
  await page.getByRole("button", { name: /^Filters \(\d+\)$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await change();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
}

/** Opens a view: a tab on desktop, the View select on phones. */
async function openView(page: Page, title: string) {
  if (isMobile(page))
    await page
      .getByLabel("View", { exact: true })
      .selectOption({ label: title });
  else await page.getByRole("tab", { name: title }).click();
  await expect(
    page.getByRole("heading", { name: title, level: 2 }),
  ).toBeVisible();
}

/** The view's numbers as text: a table on desktop, cards on phones. */
const numbers = (page: Page, caption: string) =>
  page.getByRole(isMobile(page) ? "list" : "table", {
    name: caption,
    exact: true,
  });

async function toTable(page: Page) {
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Table", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}

/**
 * A view with nothing but hidden counts: no number 0 to 4 stands alone in it
 * (ICD codes, dates, age bands, ward names and "Type 2" are not counts, so they are
 * taken out first), no bar or column is drawn, and nothing opens a list.
 */
async function expectAllHidden(page: Page, title: string) {
  const view = page.getByRole("region", { name: title });
  await expect(view).toBeVisible();
  // Wait for the numbers (the view shows a skeleton while it loads).
  await expect(view).toContainText("Fewer than 5");
  const text = (await view.innerText())
    .replace(/Updated .*/g, "")
    .replace(/\b[A-Z]\d{2}(\.\d+)?\b/g, "")
    .replace(/\bICD-10\b/g, "")
    .replace(/Week of \d+ \w+/g, "")
    .replace(/\b\w{3} \d{4}\b/g, "")
    .replace(/\d+\s?[–-]\s?\d+/g, "")
    .replace(/Ward \d+/g, "")
    .replace(/Type 2/g, "Type");
  expect(text).toContain("Fewer than 5");
  expect(text).not.toMatch(/(^|[^\w.])[0-4](?![\w.])/);
  // BarList draws a track span; ColumnChart a column span: none has size.
  await expect(view.locator("span.bg-lilac")).toHaveCount(0);
  const heights = await view
    .locator("ol > li > span.origin-bottom")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).offsetHeight));
  expect(heights.every((h) => h === 0)).toBe(true);
  await expect(view.getByRole("button", { name: /See patients/ })).toHaveCount(
    0,
  );
}

const TINY = async (page: Page) =>
  withFilters(page, async () => {
    await page.getByLabel("Age band").selectOption({ label: "80 and over" });
    await page.getByLabel("Sex").selectOption({ label: "Female" });
    await page
      .getByLabel("Ward or clinic")
      .selectOption({ label: "Ward 4 (Medical)" });
  });

test("the analyst signs in and opens Analysis from the sidebar", async ({
  page,
}) => {
  await asAnalyst(page);
  await expect(
    page.getByText("Havana Hospital").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Counts only; groups of fewer than 5 are hidden."),
  ).toBeVisible();
  await expect(page.getByText(/^Updated /).first()).toBeVisible();
  // Not a hospital admin: no admin side.
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page
      .getByRole("link", { name: "Review corrections", exact: false })
      .filter({
        visible: true,
      }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Staff", exact: true }),
  ).toHaveCount(0);
});

test("the hospital admin opens Analysis from the Hospital admin group", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  const link = analysisLink(page);
  await expect(link).toHaveCount(1);
  await expect(link).toContainText("Conditions and trends");
  await link.click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(
    page.getByRole("heading", { name: "Prevalence and trends", level: 2 }),
  ).toBeVisible();
});

test("a clinician without Analyst sees no Analysis, and /analysis sends them home", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page.getByRole("link", { name: /^Review corrections/ }).filter({
      visible: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Analysis/ })).toHaveCount(0);
  if (isMobile(page)) await page.keyboard.press("Escape");
  await visitInApp(page, "/analysis");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Analysis", level: 2 }),
  ).toHaveCount(0);
});

test("filter to Type 2 diabetes, switch to Table and read the numbers", async ({
  page,
}) => {
  await asAnalyst(page);
  await withFilters(page, async () => {
    const box = page.getByRole("combobox", { name: "Condition" });
    await box.fill("Type 2");
    await page.getByRole("option", { name: /Type 2 diabetes/ }).click();
    await expect(box).toHaveValue(/Type 2 diabetes/);
  });
  await toTable(page);
  const cases = numbers(page, "Cases by condition");
  await expect(cases).toContainText("Type 2 diabetes");
  await expect(cases).toContainText("E11");
  await expect(cases).not.toContainText("Hypertension");
  // The Cases cell is a number of 5 or more (not the ICD code beside it).
  const row = isMobile(page)
    ? cases.getByRole("listitem").filter({ hasText: "Type 2 diabetes" })
    : cases.getByRole("row", { name: /Type 2 diabetes/ });
  const count = isMobile(page)
    ? row.locator("dt:text-is('Cases') + dd")
    : row.getByRole("cell").nth(1);
  await expect(count).toHaveText(/^([5-9]|[\d,]{2,})$/);
  await expect(cases).not.toContainText("Fewer than 5");
  // The week-by-week table is there, with real numbers in it.
  const weeks = numbers(page, "Cases over time");
  await expect(weeks).toBeVisible();
  await expect(
    weeks
      .locator(isMobile(page) ? "dd" : "td")
      .filter({ hasText: /^\d+$/ })
      .first(),
  ).toBeVisible();
});

test("narrow to a tiny group and see Fewer than 5 everywhere", async ({
  page,
}) => {
  await asAnalyst(page);
  await TINY(page);
  await expect(
    page.getByText("Fewer than 5 patients match these filters"),
  ).toBeVisible();
  const bars = page.getByRole("list", { name: "Cases by condition" });
  const items = bars.getByRole("listitem");
  await expect(items.first()).toBeVisible();
  for (const text of await items.allTextContents())
    expect(text).toMatch(/Fewer than 5$/);
  await expectAllHidden(page, "Prevalence and trends");
  await toTable(page);
  await expect(numbers(page, "Cases by condition")).toContainText(
    "Fewer than 5",
  );
  await expectAllHidden(page, "Prevalence and trends");

  await openView(page, "Who is affected");
  await expect(page.getByText("Fewer than 5").first()).toBeVisible();
  await expectAllHidden(page, "Who is affected");
  await toTable(page);
  await expect(numbers(page, "Patients by age band")).toContainText(
    "Fewer than 5",
  );
  await expectAllHidden(page, "Who is affected");
});

test("Download CSV saves a file whose hidden values read Fewer than 5 and which has no patient IDs", async ({
  page,
}) => {
  await asAnalyst(page);
  await TINY(page);
  await expect(
    page.getByText("Fewer than 5 patients match these filters"),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^mhai-analysis-prevalence-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const csv = readFileSync((await file.path())!, "utf8");
  expect(csv).toContain("Fewer than 5");
  // Aggregates only: no pseudonymous IDs, no drill keys, no identifiers.
  expect(csv).not.toMatch(/\bP-[A-Z0-9]{5}\b/);
  expect(csv).not.toMatch(/drill|MRN|@/i);
  // No bare number stands in for a hidden count.
  const start = csv.indexOf("Totals");
  expect(start).toBeGreaterThan(-1);
  const totals = csv.slice(start);
  expect(totals.split("\r\n")[2]).toMatch(/^Fewer than 5(,|$)/);
  expect(totals).not.toMatch(/(^|,)[1-4](,|\r\n)/m);
});

test("See patients opens the de-identified list; Activity shows the event", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await analysisLink(page).click();
  await expect(page).toHaveURL(/\/analysis$/);
  const see = page.getByRole("button", { name: /^See patients/ }).first();
  await expect(see).toBeVisible();
  await see.click();
  const list = page.getByRole("dialog", { name: /patients ·/ });
  await expect(list).toBeVisible();
  await expect(
    list.getByText("De-identified: no names or record numbers"),
  ).toBeVisible();
  const rows = list
    .getByRole("list", { name: "Patients" })
    .getByRole("listitem");
  await expect(rows.first()).toContainText(/P-[A-Z0-9]{5}/);
  const text = (await rows.first().innerText()).replace(/\s+/g, " ");
  expect(text).toMatch(/Age /);
  expect(text).not.toMatch(/MRN|@|born|DOB/i);
  await list.getByRole("button", { name: "Close" }).click();
  await expect(list).toHaveCount(0);
  await expect(see).toBeFocused();

  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(
    page.getByText(/opened \d+ de-identified patients in Analysis/).first(),
  ).toBeVisible();
});

test("the admin grants Analyst to a clinician and Activity shows it", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await page
    .getByRole("button", { name: "Manage Dr. Tunde Bello", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Staff member" });
  const analyst = panel.getByRole("checkbox", { name: "Analyst" });
  await expect(analyst).toBeEnabled();
  await expect(analyst).not.toBeChecked();
  await analyst.check();
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(analyst).toBeChecked();
  await panel.getByRole("button", { name: "Close" }).click();

  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(
    page.getByText(/gave .*Bello.* Analyst access/).first(),
  ).toBeVisible();
});

test("phone: filters in a sheet, the view select, the patient list as a sheet", async ({
  page,
}) => {
  test.skip(!isMobile(page), "phones only; desktop has the inline filters");
  await asAnalyst(page);
  // Filters sit behind one button, with the count of those in use.
  const filters = page.getByRole("button", { name: "Filters (0)" });
  await expect(filters).toBeVisible();
  await expect(page.getByLabel("Sex")).toHaveCount(0);
  await filters.click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet.getByLabel("Period")).toBeVisible();
  await sheet.getByLabel("Sex").selectOption({ label: "Female" });
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();

  // The views are a select, not tabs; the numbers are cards, not a table.
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await openView(page, "Who is affected");
  await toTable(page);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Patients by age" }),
  ).toBeVisible();

  // The patient list opens as a sheet over the page.
  const see = page.getByRole("button", { name: /^See patients/ }).first();
  await see.click();
  const list = page.getByRole("dialog", { name: /patients ·/ });
  await expect(list).toBeVisible();
  // It fits the screen (a 440 px side panel would not).
  const box = await list.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(
    list.getByRole("list", { name: "Patients" }).getByRole("listitem").first(),
  ).toContainText(/P-[A-Z0-9]{5}/);
  await list.getByRole("button", { name: "Close" }).click();
  await expect(list).toHaveCount(0);

  // No sideways scroll on the page.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
