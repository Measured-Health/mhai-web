import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  CODE,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
  stepUp,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** A Northgate patient's pseudonym in the demo's log (lib/api/audit-fixtures.ts). */
const PSEUDONYM = "p_ng_6dc445";
const LETTER = "cl_northgate_2026";

/** The events as a table row (desktop) or a card (phones). */
const entries = (page: Page) =>
  isMobile(page)
    ? page.getByRole("list", { name: "Audit log events" }).getByRole("listitem")
    : page
        .getByRole("table", { name: "Audit log events" })
        .getByRole("row")
        .filter({ has: page.locator("td") });

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

async function openAudit(page: Page, email: string) {
  await signIn(page, email);
  await openNav(page, "Audit log");
  await expect(entries(page).first()).toBeVisible();
  await expect(page).toHaveURL(/\/audit$/);
}

test("Amara (auditor) opens Audit log: newest first, the count, Integrity: Intact · checked …, and the footer", async ({
  page,
}) => {
  await openAudit(page, AMARA);
  await expect(
    page.getByText(/^[\d,]+ events$|^More than 10,000 events$/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Integrity: Intact · checked / }),
  ).toBeVisible();
  // Newest first.
  const times = await entries(page)
    .locator("time")
    .evaluateAll((els) =>
      els.map((e) => Date.parse(e.getAttribute("datetime")!)),
    );
  expect(times.length).toBeGreaterThan(2);
  for (let i = 1; i < times.length; i++)
    expect(times[i]!).toBeLessThanOrEqual(times[i - 1]!);
  await expect(
    page.getByText(
      /^Kept for at least 6 years\. The oldest entry is from \d{1,2} \w{3} \d{4}\. No question text, answers or patient names are recorded here\. Times on screen are local; files use UTC\.$/,
    ),
  ).toBeVisible();
  // Nothing in the address.
  expect(new URL(page.url()).search).toBe("");
});

test("Refused + Flagged only shows the locked sign-in; the URL stays /audit", async ({
  page,
}) => {
  await openAudit(page, AMARA);
  await page.getByLabel("Dates").selectOption({ label: "Last 12 months" });
  await page.getByLabel("Outcome").selectOption({ label: "Refused" });
  await page.getByLabel("Flagged only").check();
  await expect(
    entries(page).filter({ hasText: "Sign-in locked after too many tries" }),
  ).toHaveCount(1);
  await expect(page).toHaveURL(/\/audit$/);
  expect(new URL(page.url()).search).toBe("");
});

test("searching a Northgate pseudonym finds the named drill-downs; opening one, Show patient ids lists them; the Audit filter then shows the read entries", async ({
  page,
}) => {
  await openAudit(page, AMARA);
  await page
    .getByRole("searchbox", { name: "Search by exact id" })
    .fill(PSEUDONYM);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/Searching the whole log by id\./)).toBeVisible();
  const named = entries(page).filter({
    hasText: "Opened a named patient list",
  });
  await expect(named.first()).toBeVisible();
  // The list never shows a pseudonym.
  await expect(page.getByText(PSEUDONYM)).toHaveCount(0);

  await named.first().getByRole("button").first().click();
  await page.getByRole("button", { name: "Show patient ids" }).click();
  const ids = page.getByRole("list", { name: "Patient ids" });
  await expect(ids.getByText(PSEUDONYM)).toBeVisible();
  await expect(page.getByText("Shown to you and recorded.")).toBeVisible();

  // Back to the list, clear the search, and filter by Audit.
  if (isMobile(page)) await page.getByRole("button", { name: "Back" }).click();
  else await page.keyboard.press("Escape");
  await expect(ids).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: /^Action type/ }).click();
  await page.getByRole("checkbox", { name: "Audit", exact: true }).check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    entries(page)
      .filter({ hasText: "Showed patient ids for an entry" })
      .first(),
  ).toBeVisible();
  await expect(
    entries(page)
      .filter({ hasText: "Searched the audit log by patient id" })
      .first(),
  ).toBeVisible();
});

test("Ada exports with Legal request and code 123456: the export id and checksum show, the download is a CSV whose first line says Demo, the Exports tab lists it, and Download file is then spent", async ({
  page,
}) => {
  await openAudit(page, ADA);
  await page.getByRole("button", { name: "Export CSV" }).click();
  const form = stepUp(page, "Export the audit log");
  await expect(form).toBeVisible();
  await form.getByLabel("Legal request").check({ force: true });
  await typeCode(page, CODE, form);
  await form.getByRole("button", { name: "Make export" }).click();

  const ready = page.getByRole("dialog", { name: /^Export exp_\w+ is ready$/ });
  await expect(ready).toBeVisible();
  const id = /exp_\w+/.exec(
    (await ready.getByRole("heading").first().textContent()) ?? "",
  )?.[0];
  expect(id).toBeTruthy();
  await expect(ready.getByText("Checksum (SHA-256)")).toBeVisible();
  await expect(ready.locator("code").first()).toHaveText(/^[0-9a-f]{64}$/);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    ready.getByRole("button", { name: "Download file" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^audit-events-${id}-\\d{8}-\\d{4}Z\\.csv$`),
  );
  const csv = readFileSync((await download.path())!, "utf8").replace(/^﻿/, "");
  expect(csv.split(/\r?\n/)[0]).toMatch(/^"?Demo"?,/);
  await expect(ready.getByText("Downloaded.")).toBeVisible();
  // The file is spent: there is no second download.
  await expect(
    ready.getByRole("button", { name: "Download file" }),
  ).toBeDisabled();
  await ready
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await expect(ready).toBeHidden();

  await tab(page, "Exports").click();
  const row = page
    .getByRole(isMobile(page) ? "listitem" : "row")
    .filter({ hasText: id! });
  await expect(row).toBeVisible();
  await expect(row.getByText("Not downloaded")).toHaveCount(0);
});

test("Run check now ends Intact with the range", async ({ page }) => {
  await openAudit(page, ADA);
  await tab(page, "Integrity").click();
  const status = page.getByRole("status", { name: "Integrity status" });
  await expect(status).toContainText("Intact");
  const before = await status.innerText();
  await page.getByRole("button", { name: "Run check now" }).click();
  await expect(status).not.toHaveText(before);
  await expect(status).toContainText("Intact");
  await expect(status).toContainText(
    /No changes found\. Checked [\d,]+ entries, from .+ to entry [\d,]+ \(.+ UTC\)\./,
  );
});

test("Named access: grouped by letter; export for a legal request downloads a .zip", async ({
  page,
}) => {
  await openAudit(page, ADA);
  await tab(page, "Named access").click();
  await expect(
    page.getByText(/^Names and MRNs are never recorded here\./),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: new RegExp(LETTER) }),
  ).toBeVisible();

  await page
    .getByRole("combobox", { name: "Hospital" })
    .selectOption("h_northgate");
  const exportBtn = page.getByRole("button", {
    name: "Export for a legal request",
  });
  await expect(exportBtn).toBeEnabled();
  await exportBtn.click();
  const form = stepUp(page, "Export named access for a legal request");
  await form.getByLabel("Legal request").check({ force: true });
  await typeCode(page, CODE, form);
  await form.getByRole("button", { name: "Make export" }).click();
  const ready = page.getByRole("dialog", { name: /^Export exp_\w+ is ready$/ });
  await expect(ready).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    ready.getByRole("button", { name: "Download file" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^audit-named-access-exp_\w+-\d{8}-\d{4}Z\.zip$/,
  );
});

test("phone: cards, then the detail as a page with Back", async ({ page }) => {
  test.skip(!isMobile(page), "phones only; desktop has the table and panel");
  await openAudit(page, AMARA);
  await expect(
    page.getByRole("list", { name: "Audit log events" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await entries(page).first().getByRole("button").first().click();
  const detail = page.getByRole("region", { name: /^Entry #\d+$/ });
  await expect(detail).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Audit log events" }),
  ).toBeHidden();
  await detail.getByRole("button", { name: "Back" }).click();
  await expect(detail).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Audit log events" }),
  ).toBeVisible();
});
