import { expect, test, type Page } from "@playwright/test";
import { FORBIDDEN_TERMS } from "../../lib/labels";

// Whole-word match. Upper-case terms (NLI, PASS, KB...) are case-sensitive so
// ordinary words such as "online" or "passed" do not trip them.
const FORBIDDEN = new RegExp(
  FORBIDDEN_TERMS.map((t) =>
    t === t.toUpperCase() ? `\\b${t}\\b` : `(?i:\\b${t}\\b)`,
  ).join("|"),
);

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function fillForm(page: Page, question: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("54");
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByRole("radio", { name: /Urgent/ }).click();
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Presenting symptoms").fill("Chest pain");
  await page.getByLabel("Presenting symptoms").press("Enter");
  await page.getByLabel("Clinical question").fill(question);
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
}

async function ask(page: Page, question: string) {
  await fillForm(page, question);
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(page.getByText("Analysing your question")).toBeVisible();
}

/** The alert that carries the result banner, not Next's route announcer. */
const resultAlert = (page: Page) =>
  page.getByRole("alert").filter({ hasText: /caution|review/i });

async function expectNoForbiddenWords(page: Page) {
  const visible = await page.locator("body").innerText();
  expect(visible).not.toMatch(FORBIDDEN);
  const names = await page.locator("body").ariaSnapshot();
  expect(names).not.toMatch(FORBIDDEN);
}

async function expectNoStorage(page: Page) {
  const state = await page.evaluate(async () => {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      idb: dbs.length,
      cookie: document.cookie,
    };
  });
  expect(state).toEqual({ local: 0, session: 0, idb: 0, cookie: "" });
}

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
  await page.goto("/");
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
