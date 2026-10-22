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
  toast,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** Signs in and opens System by clicking (a page load would sign out). */
async function openSystem(page: Page, email: string) {
  await signIn(page, email);
  await openNav(page, "System");
  await expect(page).toHaveURL(/\/system\/health$/);
}

/** From Health: opens the Failed jobs tab. */
async function openJobs(page: Page) {
  await page
    .getByRole("navigation", { name: "System" })
    .getByRole("link", { name: "Failed jobs" })
    .click();
  await expect(page).toHaveURL(/\/system\/jobs$/);
  await expect(
    page.getByRole("list", { name: "Jobs" }).or(page.getByRole("table")),
  ).toBeVisible();
}

const choose = (page: Page, id: string) =>
  page.getByRole("checkbox", { name: new RegExp(id) });

test("System opens on Health: Working normally, the parts, times and errors", async ({
  page,
}) => {
  await openSystem(page, ADA);
  const tabs = page.getByRole("navigation", { name: "System" });
  await expect(tabs.getByRole("link", { name: "Health" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const overall = page.getByRole("region", { name: "Overall" });
  await expect(overall.getByText("Working normally")).toBeVisible();

  const parts = page.getByRole("region", { name: "Parts of the system" });
  await expect(
    parts.getByText("Answering questions · Working normally"),
  ).toBeVisible();
  await expect(parts.getByText("Triage · Off")).toBeVisible();

  const times = page.getByRole("region", { name: "Answer times" });
  await expect(
    times.getByText("Half within 2.4 s · 95 in 100 within 6.1 s").first(),
  ).toBeVisible();

  const errors = page.getByRole("region", { name: "Recent errors" });
  await expect(errors.getByText("Took too long")).toBeVisible();
  await expect(page.getByRole("region", { name: "Failed jobs" })).toContainText(
    "Failed jobs: 8",
  );
});

test("the demo switch to Problems shows Having problems", async ({ page }) => {
  await openSystem(page, ADA);
  const overall = page.getByRole("region", { name: "Overall" });
  await expect(overall.getByText("Working normally")).toBeVisible();
  await page.getByLabel("Problems", { exact: true }).check();
  await expect(overall.getByText("Having problems")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Parts of the system" })
      .getByText("Reading documents · Having problems"),
  ).toBeVisible();
});

test("View failed jobs opens the Failed jobs tab", async ({ page }) => {
  await openSystem(page, ADA);
  await page.getByRole("link", { name: "View failed jobs" }).click();
  await expect(page).toHaveURL(/\/system\/jobs$/);
  await expect(
    page
      .getByRole("navigation", { name: "System" })
      .getByRole("link", { name: "Failed jobs" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(choose(page, "job_question_old")).toBeVisible();
});

test("Ada retries the old question after the warning", async ({ page }) => {
  await openSystem(page, ADA);
  await openJobs(page);
  await choose(page, "job_question_old").check();
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  const d = page.getByRole("dialog", { name: "Retry 1 job?" });
  await expect(
    d.getByText(
      "1 of these questions was asked more than a day ago. The clinicians may have asked again or no longer need the answer.",
    ),
  ).toBeVisible();
  // The safe choice has the focus.
  await expect(d.getByRole("button", { name: "Don't retry" })).toBeFocused();
  await d.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(toast(page, "Retried 1 job")).toBeVisible();
  await expect(d).toBeHidden();
  // It is no longer failed.
  await expect(choose(page, "job_question_old")).toHaveCount(0);
});

test("Ada cancels a job with a reason and her code; it shows Cancelled by Ada Bakare", async ({
  page,
}) => {
  await openSystem(page, ADA);
  await openJobs(page);
  await choose(page, "job_search_1").check();
  await page.getByRole("button", { name: "Cancel jobs" }).click();

  const d = stepUp(page, "Cancel 1 job?");
  await expect(d).toBeVisible();
  await expect(d.getByRole("button", { name: "Keep" })).toBeVisible();
  await d.getByText("No longer needed", { exact: true }).click();
  await typeCode(page, CODE, d);
  await d.getByRole("button", { name: "Cancel jobs" }).click();

  await expect(toast(page, "Cancelled 1 job")).toBeVisible();
  await expect(d).toBeHidden();
  await expect(choose(page, "job_search_1")).toHaveCount(0);

  await page.getByLabel("Status").selectOption({ label: "Cancelled" });
  await expect(
    page.getByText(/^Cancelled by Ada Bakare/).first(),
  ).toBeVisible();
});

test("the auditor sees both tabs and no actions", async ({ page }) => {
  await openSystem(page, AMARA);
  const tabs = page.getByRole("navigation", { name: "System" });
  await expect(tabs.getByRole("link", { name: "Health" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Overall" })).toContainText(
    "Working normally",
  );
  await openJobs(page);
  await expect(page.getByText("job_question_old").first()).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  for (const name of ["Select all shown", "Retry", "Cancel jobs"])
    await expect(page.getByRole("button", { name })).toHaveCount(0);
});

test("phone: jobs as cards with 44 px controls", async ({ page }) => {
  test.skip(!isMobile(page), "phones only");
  await openSystem(page, ADA);
  await openJobs(page);
  await expect(page.getByRole("table")).toHaveCount(0);
  const cards = page.getByRole("list", { name: "Jobs" });
  await expect(cards.getByRole("listitem").first()).toBeVisible();

  const copy = await cards
    .getByRole("button", { name: "Copy reference job_search_1" })
    .boundingBox();
  expect(copy!.height).toBeGreaterThanOrEqual(44);
  // The checkbox sits in a 44 px label.
  const label = await cards
    .locator("label")
    .filter({ has: choose(page, "job_search_1") })
    .boundingBox();
  expect(label!.width).toBeGreaterThanOrEqual(44);
  expect(label!.height).toBeGreaterThanOrEqual(44);
  const tab = page.getByRole("link", { name: "Health" });
  expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
