import { expect, test } from "@playwright/test";

/**
 * The public demo, live: the demo clinician signs in with the sign-in
 * page's demo helper, asks a synthetic question, gets the labelled sample
 * answer with its sources and safety checks from the backend's sample AI,
 * and opens a past consultation from the history. The consultation id is
 * core's (a UUID), not the mock's `mock-…`.
 */
const UUID =
  /\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The consultation form, with a synthetic patient and no red flags. */
async function ask(
  page: import("@playwright/test").Page,
  symptom: string,
  question: string,
) {
  // In the app, never a full page load: the history lives in this session.
  await page
    .getByRole("navigation", { name: "Consultations" })
    .getByRole("link", { name: /New consultation/ })
    .click();
  const age = page.getByRole("textbox", { name: "Age", exact: true });
  const start = page.getByRole("button", { name: /Start a consultation/ });
  await expect(age.or(start)).toBeVisible();
  if (await start.isVisible()) await start.click();
  await age.fill("34");
  await page.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByRole("radio", { name: /Routine/ }).click();
  await page.getByLabel("Presenting symptoms").fill(symptom);
  await page.getByLabel("Presenting symptoms").press("Enter");
  await page.getByLabel("Clinical question").fill(question);
  const before = page.url();
  await page.getByRole("button", { name: /Analyse/ }).click();
  // The new consultation's own page: core's id and the labelled answer.
  await expect(page).not.toHaveURL(before);
  await expect(page).toHaveURL(UUID, { timeout: 180_000 });
  await expect(
    page
      .getByRole("article")
      .getByText(/^Sample answer \(synthetic demo data, not clinical advice\)/),
  ).toBeVisible({ timeout: 180_000 });
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
  // Two-step (the app asks it of everyone): the demo helper shows the
  // current code, made in the browser from the published demo secret.
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  const hint = page.getByRole("complementary", { name: "Demo two-step code" });
  await expect(hint.locator("code")).toHaveText(/^\d{6}$/);
  const code = (await hint.locator("code").innerText()).trim();
  await page.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(code);
  await expect(page).not.toHaveURL(/\/sign-in/);

  const first = await ask(
    page,
    "Fever",
    "Synthetic demo question: what confirms malaria before treatment?",
  );
  expect(first).not.toContain("mock-");
  const article = page.getByRole("article");
  await expect(
    article.getByText("Drafted by the demo's sample answers"),
  ).toBeVisible();
  await expect(article).not.toContainText("KB#");
  // Safety checks and the cited sample guideline, by its title.
  await expect(page.getByText("Safety checks").first()).toBeVisible();
  await expect(
    page.getByText("Malaria: confirmation and severe features").first(),
  ).toBeVisible();
  await page.waitForTimeout(1500); // let the result settle for the screenshot
  await page.screenshot({
    path: test.info().outputPath("answer.png"),
    fullPage: true,
  });

  // A second question, then back to the first from the history.
  const second = await ask(
    page,
    "Headache",
    "Synthetic demo question: which readings define hypertension?",
  );
  expect(second).not.toBe(first);
  await expect(
    page.getByRole("article").getByText(/systolic >= 140/),
  ).toBeVisible();
  // The history lists this session's consultations: open the first one
  // again (core serves it by its id).
  await page
    .getByRole("navigation", { name: "Consultations" })
    .locator(`a[href="${first}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`${first}$`));
  await expect(
    page.getByRole("article").getByText(/microscopy or RDT/),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: test.info().outputPath("past.png"),
    fullPage: true,
  });
});
