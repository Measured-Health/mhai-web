import { expect, test, type Page } from "./csp";
import { expectNoStorage, isMobile, openAccountMenu, signIn } from "./helpers";

// "Find patient by MRN" on the question form (core 1.29.0
// `POST /patients/lookup`), on the demo's synthetic patients. The MRN typed
// and the patient found stay in memory: nothing about them reaches an
// address, the title, the console or storage.

// A failed test must not keep the sample names in a trace, screenshot or video.
test.use({ trace: "off", screenshot: "off", video: "off" });
// Turns off error-context.md (an ARIA snapshot of the page) on failure.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const HIT = {
  name: "Maryam Abdullahi",
  mrn: "204817",
  id: "6f1c2a01-5e1d-4c3b-9a7e-000000000001",
};
const MISS = "731905";
const SHARED = "990417"; // two synthetic records share it
const SECRETS = [HIT.name, HIT.mrn, HIT.id, MISS, SHARED];

type Seen = { urls: string[]; console: string[]; bodies: string[] };
const seen = new WeakMap<Page, Seen>();

test.beforeEach(({ page }) => {
  const s: Seen = { urls: [], console: [], bodies: [] };
  seen.set(page, s);
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) s.urls.push(f.url());
  });
  page.on("request", (r) => {
    s.urls.push(r.url());
    const body = r.postData();
    if (body) s.bodies.push(body);
  });
  page.on("console", (m) => s.console.push(m.text()));
  page.on("pageerror", (e) => s.console.push(e.message));
});

test.afterEach(async ({ page }) => {
  if (page.url() === "about:blank") return;
  const s = seen.get(page)!;
  try {
    await expectNoStorage(page);
    const title = await page.title();
    // Mock mode answers in the browser: no body may carry them either.
    for (const text of [
      ...s.urls,
      page.url(),
      title,
      ...s.console,
      ...s.bodies,
    ]) {
      let plain = text;
      try {
        plain = decodeURIComponent(text);
      } catch {
        // keep the raw text
      }
      for (const secret of SECRETS)
        expect(
          plain.includes(secret),
          "a patient detail reached an address, the title, the console or a request",
        ).toBe(false);
    }
  } finally {
    await page.goto("about:blank").catch(() => {});
  }
});

const box = (page: Page) =>
  page.getByRole("textbox", { name: "Find patient by MRN" });
const about = (page: Page) =>
  page.getByRole("group", { name: "About patient" });

async function openForm(page: Page) {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: /Start a consultation/ }).click();
}

async function find(page: Page, mrn: string) {
  await box(page).fill(mrn);
  await page.getByRole("button", { name: "Find", exact: true }).click();
}

test("a hit fills About patient, and the question goes linked", async ({
  page,
}) => {
  await openForm(page);
  await expect(box(page)).toHaveAttribute("autocomplete", "off");
  await find(page, HIT.mrn);
  await expect(about(page)).toContainText(HIT.name);
  await expect(about(page)).toContainText(HIT.mrn);
  await expect(
    about(page).getByRole("button", {
      name: `Remove ${HIT.name} from this question`,
    }),
  ).toBeFocused();
  await expect(box(page)).toHaveCount(0);
  await page.getByRole("textbox", { name: "Age", exact: true }).fill("67");
  await page.getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByRole("radio", { name: /Routine/ }).click();
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Presenting symptoms").fill("Weakness");
  await page.getByLabel("Presenting symptoms").press("Enter");
  await page
    .getByLabel("Clinical question")
    .fill("Synthetic: low potassium, next steps?");
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(page).toHaveURL(/\/c\//);
});

test("a miss says no active patient has that MRN here", async ({ page }) => {
  await openForm(page);
  await find(page, MISS);
  await expect(
    page.getByText("No active patient with that MRN in your hospital."),
  ).toBeVisible();
  await expect(box(page)).toBeFocused();
  await expect(about(page)).toHaveCount(0);
});

test("an MRN two patients share is refused (409)", async ({ page }) => {
  await openForm(page);
  await find(page, SHARED);
  await expect(
    page.getByText(
      "More than one patient has that MRN; ask your records team.",
    ),
  ).toBeVisible();
  await expect(about(page)).toHaveCount(0);
});

test("the 6th lookup in a minute is refused, and the limits explained", async ({
  page,
}) => {
  await openForm(page);
  for (let i = 0; i < 5; i++) {
    await find(page, MISS);
    await expect(
      page.getByText("No active patient with that MRN in your hospital."),
    ).toBeVisible();
  }
  await find(page, HIT.mrn);
  await expect(
    page.getByText(/Too many lookups for now; try again later\./),
  ).toBeVisible();
  await expect(
    page.getByText(/5 times a minute and 50 times a day/),
  ).toBeVisible();
  await expect(about(page)).toHaveCount(0);
});

test("signing out forgets the patient found", async ({ page }) => {
  await openForm(page);
  await find(page, HIT.mrn);
  await expect(about(page)).toContainText(HIT.name);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText(HIT.name)).toHaveCount(0);
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(HIT.name)).toHaveCount(0);
});
