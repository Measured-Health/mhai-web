import { expect, test } from "@playwright/test";
import { fillForm } from "../e2e/helpers";

/**
 * The public demo, live: the demo clinician signs in with the sign-in
 * page's demo helper, asks a synthetic question, gets the labelled sample
 * answer with its sources and safety checks from the backend's sample AI,
 * and opens a past consultation from the history. The consultation id is
 * core's (a UUID), not the mock's `mock-…`.
 */
const UUID =
  /\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function ask(page: import("@playwright/test").Page, question: string) {
  await page.goto("/");
  await fillForm(page, question);
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(
    page.getByRole("heading", { name: "Clinical assessment" }),
  ).toBeVisible({ timeout: 180_000 });
  await expect(page).toHaveURL(UUID);
  return new URL(page.url()).pathname;
}

test("demo clinician: sample answer with sources and safety checks, past consultation", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(
    page.getByText("Demo · sample data, not for clinical use"),
  ).toBeVisible();
  // The demo helper fills the seeded account's published demo password.
  await page
    .getByRole("button", {
      name: /^Use Clinician \(a\.reyes@demo-hospital\.example\)/,
    })
    .click();
  await expect(page.getByLabel("Work email")).toHaveValue(
    "a.reyes@demo-hospital.example",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  const first = await ask(
    page,
    "Synthetic demo question: what confirms malaria before treatment?",
  );
  expect(first).not.toContain("mock-");
  const article = page.getByRole("article");
  await expect(
    article
      .getByText(/Sample answer \(synthetic demo data, not clinical advice\)/)
      .first(),
  ).toBeVisible();
  // Safety checks and the cited sample guideline.
  await expect(page.getByText("Safety checks").first()).toBeVisible();
  const sourcesTab = page.getByRole("tab", { name: /^Sources/ });
  if (await sourcesTab.isVisible()) await sourcesTab.click();
  await expect(page.getByText(/Malaria/).first()).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("answer.png"),
    fullPage: true,
  });

  // A second question, then back to the first from the history.
  const second = await ask(
    page,
    "Synthetic demo question: when is blood pressure called hypertension?",
  );
  expect(second).not.toBe(first);
  await page
    .getByRole("navigation", { name: "Consultations" })
    .locator(`a[href="${first}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`${first}$`));
  await expect(
    page.getByRole("heading", { name: "Clinical assessment" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .getByText(/Sample answer/)
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("past.png"),
    fullPage: true,
  });
});
