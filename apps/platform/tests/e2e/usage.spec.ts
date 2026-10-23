import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  TUNDE,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
  signOut,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

const NGH_CRITICAL = /Critical alerts acknowledged 2× slower/;
const RIVERSIDE_NOTE = /Called Musa Danjuma/;

/** Signs in and opens Usage by clicking (a page load would sign out). */
async function openUsage(page: Page, email: string) {
  await signIn(page, email);
  await openNav(page, "Usage");
  await expect(
    page.getByRole("heading", { level: 2, name: "What changed" }),
  ).toBeVisible();
}

/** One row of the What changed list. */
const row = (page: Page, text: string | RegExp) =>
  page.getByRole("list", { name: "Changes" }).getByRole("button", {
    name: text,
  });

/** The selected change's detail (it shows beside the list on desktop). */
const detail = (page: Page) =>
  page.getByRole("heading", { level: 2, name: NGH_CRITICAL });

test("Usage opens on What changed with Northgate's Critical change selected", async ({
  page,
}) => {
  await openUsage(page, ADA);
  const first = row(page, NGH_CRITICAL);
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("aria-current", "true");
  // The sign always has words with it.
  await expect(first).toContainText("⚠");
  // The top 5 show; the followed-up change waits behind Show all.
  await expect(row(page, /Havana Hospital/)).toBeVisible();
  await page.getByRole("button", { name: /^Show all \(\d+\)$/ }).click();
  await expect(row(page, /Riverside Children's Hospital/)).toBeVisible();

  if (isMobile(page)) {
    // Phones show the list alone until a row is tapped.
    await expect(detail(page)).toHaveCount(0);
  } else {
    await expect(detail(page)).toBeVisible();
    await expect(page.getByText("Not followed up yet.")).toBeVisible();
    // The hospital's size always shows.
    await expect(
      page.getByText(/ staff · .* questions this period/),
    ).toBeVisible();
  }
});

test("mark followed up with a note as Ada, then sign in as Tunde in the same tab and see it", async ({
  page,
}) => {
  await openUsage(page, ADA);
  await row(page, NGH_CRITICAL).click();
  await expect(detail(page)).toBeVisible();
  await page
    .getByLabel("Note (optional)")
    .fill("Rang the ward lead; staffing was short on nights.");
  await page.getByRole("button", { name: "Mark followed up" }).click();
  await expect(
    page.getByText("Followed up by Ada Bakare").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Rang the ward lead; staffing was short on nights."),
  ).toBeVisible();

  // Same tab: sign out and sign in as Tunde; the follow-up is still there.
  await signOut(page);
  await openUsage(page, TUNDE);
  const followed = row(page, /Critical alerts acknowledged 2× slower/);
  await expect(followed).toContainText("Followed up by Ada Bakare");
  await followed.click();
  await expect(detail(page)).toBeVisible();
  await expect(
    page.getByText("Rang the ward lead; staffing was short on nights."),
  ).toBeVisible();
});

test("the auditor sees follow-ups but no controls", async ({ page }) => {
  await openUsage(page, AMARA);
  await page.getByRole("button", { name: /^Show all \(\d+\)$/ }).click();
  const riverside = row(page, /Riverside Children's Hospital/);
  await expect(riverside).toContainText("Followed up by Tunde Okafor");
  await riverside.click();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: /Riverside Children's Hospital/,
    }),
  ).toBeVisible();
  await expect(page.getByText(RIVERSIDE_NOTE)).toBeVisible();
  for (const name of [
    "Mark followed up",
    "Undo",
    "Add a note",
    "Edit note",
    "Save note",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(page.getByLabel("Note (optional)")).toHaveCount(0);

  // A change nobody followed up on shows no way to mark it either.
  if (isMobile(page)) await page.getByRole("button", { name: "Back" }).click();
  await row(page, NGH_CRITICAL).click();
  await expect(page.getByText("Not followed up yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark followed up" }),
  ).toHaveCount(0);
});

test("Download CSV saves a file whose hidden values read Fewer than 5", async ({
  page,
}) => {
  await openUsage(page, ADA);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^analytics-last-30-days-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const csv = readFileSync((await file.path())!, "utf8");
  // Lakeside's line in the Use section: its counts are 1-4, so hidden.
  const lines = csv.split(/\r?\n/);
  const use = lines.findIndex((l) =>
    l.startsWith("Hospital,Questions,Active clinicians,"),
  );
  expect(use).toBeGreaterThanOrEqual(0);
  const lakeside = lines
    .slice(use + 1)
    .find((l) => l.includes("Lakeside Community Clinic"));
  expect(lakeside).toBeDefined();
  expect(lakeside).toContain("Fewer than 5");
  expect(lakeside).not.toMatch(/,[1-4](,|$)/);
  // Counts only: no follow-up notes.
  expect(csv).not.toContain("Musa Danjuma");
});

test("phone: tap a change, see the detail, Back", async ({ page }) => {
  test.skip(!isMobile(page), "phones only; desktop shows both side by side");
  await openUsage(page, ADA);
  const northgate = row(page, NGH_CRITICAL);
  await expect(detail(page)).toHaveCount(0);

  await northgate.click();
  await expect(detail(page)).toBeVisible();
  await expect(page.getByRole("list", { name: "Changes" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("list", { name: "Changes" })).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  // Focus returns to the row the person came from.
  await expect(row(page, NGH_CRITICAL)).toBeFocused();
});

test("the Hospitals tab compares Riverside with the rest", async ({ page }) => {
  await openUsage(page, ADA);
  await page.getByRole("tab", { name: "Hospitals" }).click();
  const riverside = page.getByRole("button", {
    name: "Riverside Children's Hospital",
    exact: true,
  });
  await expect(riverside).toBeVisible();
  // Small hospitals show "Fewer than 5", never a rate worked out from it.
  const lakeside = page.getByRole("row", { name: /Lakeside Community Clinic/ });
  await expect(lakeside).toContainText("Fewer than 5");
  await expect(lakeside).not.toContainText(/\d+%/);

  await riverside.click();
  const heading = page.getByRole("heading", {
    level: 2,
    name: "Riverside Children's Hospital compared with the others",
  });
  await expect(heading).toBeVisible();
  await expect(
    page.getByText(/ staff · .* questions this period/),
  ).toBeVisible();

  if (isMobile(page)) {
    // On a phone the comparison opens as the detail, with Back.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(heading).toHaveCount(0);
    await expect(riverside).toBeVisible();
    await expect(riverside).toBeFocused();
  }
});
