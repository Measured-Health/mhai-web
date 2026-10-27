import { expect, test, type Page } from "./csp";
import { readFile } from "node:fs/promises";
import { FEEDBACK_LOG } from "../../playwright.config";
import {
  expectNoForbiddenWords,
  expectNoStorage,
  fillForm,
  isDesktop,
  isMobile,
  signIn,
} from "./helpers";

async function ask(page: Page, question: string) {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await fillForm(page, question);
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(page.getByText("Analysing your question")).toBeVisible();
}

/** The alert that carries the result banner, not Next's route announcer. */
const resultAlert = (page: Page) =>
  page.getByRole("alert").filter({ hasText: /caution|review/i });

test.afterEach(async ({ page }) => {
  // No patient data in browser storage, ever.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

test("high confidence result with evidence and agreement", async ({ page }) => {
  await ask(
    page,
    "Central chest pain 40 min radiating to the left arm. Diagnosis?",
  );
  // The top bar repeats the title in an h1; the result card holds the h2.
  await expect(
    page.getByRole("article").getByRole("heading", { name: "Unstable angina" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: /High confidence/ }),
  ).toBeVisible();
  if (isDesktop(page)) {
    await expect(
      page.getByRole("complementary", { name: "Evidence and safety" }),
    ).toContainText("4 of 4 claims verified");
  } else {
    await page.getByRole("button", { name: /Evidence & safety/ }).click();
    const dialog = page.getByRole("dialog", { name: "Evidence and safety" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("4 of 4 claims verified");
    await expectNoForbiddenWords(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  await page.getByRole("button", { name: /I agree/ }).click();
  await expect(page.getByText(/your agreement was recorded/)).toBeVisible();
});

test("use with caution shows the amber banner and accepts a correction", async ({
  page,
}) => {
  await ask(page, "Fever 3 days and rash, dengue area. Admit?");
  await expect(resultAlert(page)).toContainText("Use with caution");
  await page.getByRole("button", { name: /Suggest correction/ }).click();
  await page
    .getByLabel(/What should the diagnosis/)
    .fill("Admit on warning signs");
  await page.getByLabel(/Why\?/).fill("WHO 2024 section 3.2");
  await page.getByRole("button", { name: "Submit correction" }).click();
  await expect(page.getByText(/sent for review/)).toBeVisible();
});

test("needs review: red banner, no confidence level", async ({ page }) => {
  await ask(page, "Potassium 2.9 on routine bloods. Plan?");
  await expect(resultAlert(page)).toContainText("needs clinician review");
  await expect(page.getByRole("status", { name: /confidence/i })).toHaveCount(
    0,
  );
  await expect(page.getByText(/why this confidence/i)).toHaveCount(0);
  await expect(page.getByText(/reduced-accuracy mode/)).toBeVisible();
});

test("couldn't complete keeps the question for editing", async ({ page }) => {
  await ask(page, "Please fail this request for testing.");
  await expect(
    page.getByRole("heading", { name: "We couldn't complete this one" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit question" }).click();
  await expect(page.getByLabel("Clinical question")).toHaveValue(
    "Please fail this request for testing.",
  );
});

test("form errors are explained and nothing is lost", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("154");
  await page
    .getByRole("button", { name: /Analyse|Next/ })
    .last()
    .click();
  if (!isMobile(page)) {
    await expect(
      page.getByRole("alert").filter({ hasText: /needs? fixing/ }),
    ).toBeVisible();
    await expect(page.locator("#f-age")).toContainText("Must be 0–120");
  }
  await expect(page.getByLabel("Age")).toHaveValue("154");
});

test("storage stays empty after a full flow and a reload", async ({ page }) => {
  await ask(page, "Fever 3 days and rash, dengue area. Admit?");
  await expect(resultAlert(page)).toContainText("Use with caution");
  await expectNoStorage(page);
  await page.reload();
  await expectNoStorage(page);
});

test("missing pages answer 404 and say what was missing", async ({ page }) => {
  for (const path of ["/c/not-a-real-id", "/print/not-a-real-id"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(
      page.getByText(/This consultation doesn.t exist/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to home" }),
    ).toBeVisible();
  }
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByText(/This page doesn.t exist/)).toBeVisible();
});

test("in-app navigation still reaches the printout", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await ask(page, "Fever 3 days and rash, dengue area. Admit?");
  await expect(resultAlert(page)).toContainText("Use with caution");
  await page.getByRole("button", { name: "More export options" }).click();
  // Keyboard, as the menu supports it: focus starts on "Copy as text".
  const printItem = page.getByRole("menuitem", {
    name: /Print or save as PDF/,
  });
  await page.keyboard.press("ArrowDown");
  await expect(printItem).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: /Back to result/ }),
  ).toBeVisible();
});

test("demo feedback is saved on the server, with the page masked", async ({
  page,
}, info) => {
  const marker = `Feedback e2e ${info.project.name} ${Date.now()}`;
  await ask(page, "Fever 3 days and rash, dengue area. Admit?");
  await expect(resultAlert(page)).toContainText("Use with caution");
  await page.getByRole("button", { name: /Give feedback/ }).click();
  await page.getByLabel("Your feedback").fill(marker);
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks, the team has it")).toBeVisible();
  const lines = (await readFile(FEEDBACK_LOG, "utf8")).trim().split("\n");
  const saved = lines
    .map((l) => JSON.parse(l))
    .find((e) => e.message === marker);
  expect(saved?.page).toBe("/c/[id]");
});
