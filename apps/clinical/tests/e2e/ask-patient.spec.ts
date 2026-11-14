import { expect, test, type Page } from "./csp";
import {
  expectNoStorage,
  isMobile,
  openNotifications,
  signIn,
} from "./helpers";

// A question linked to a patient (core 1.22.0 `patient_id`), from "Ask MHAI
// about it" on a patient alert. The name and MRN show on the form only, as
// the alert showed them; nothing about the patient (name, MRN or MHAI's id
// for them) reaches an address, the title, the console or storage.

// A failed test must not keep the sample names in a trace, screenshot or video.
test.use({ trace: "off", screenshot: "off", video: "off" });
// Turns off error-context.md (an ARIA snapshot of the page) on failure.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

/** The synthetic patients these tests link, as the sample alerts carry them. */
const PATIENTS = [
  {
    name: "Maryam Abdullahi",
    mrn: "204817",
    id: "6f1c2a01-5e1d-4c3b-9a7e-000000000001",
  },
  // Merged since his alert was raised: core answers 404 for him.
  {
    name: "Samuel Bassey",
    mrn: "640212",
    id: "6f1c2a05-5e1d-4c3b-9a7e-000000000005",
  },
];
const SECRETS = PATIENTS.flatMap((p) => [p.name, p.mrn, p.id]);

type Seen = { urls: string[]; console: string[] };
const seen = new WeakMap<Page, Seen>();

test.beforeEach(({ page }) => {
  const s: Seen = { urls: [], console: [] };
  seen.set(page, s);
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) s.urls.push(f.url());
  });
  page.on("request", (r) => s.urls.push(r.url()));
  page.on("console", (m) => s.console.push(m.text()));
  page.on("pageerror", (e) => s.console.push(e.message));
});

test.afterEach(async ({ page }) => {
  if (page.url() === "about:blank") return;
  const s = seen.get(page)!;
  try {
    await expectNoStorage(page);
    const title = await page.title();
    for (const text of [...s.urls, page.url(), title, ...s.console]) {
      let plain = text;
      try {
        plain = decodeURIComponent(text);
      } catch {
        // keep the raw text
      }
      for (const secret of SECRETS)
        expect(
          plain.includes(secret),
          "a patient detail reached an address, the title or the console",
        ).toBe(false);
    }
  } finally {
    await page.goto("about:blank").catch(() => {});
  }
});

const card = (page: Page, name: string) =>
  page.getByRole("article", { name: new RegExp(name) });
const about = (page: Page) =>
  page.getByRole("group", { name: "About patient" });

async function askAbout(page: Page, name: string) {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openNotifications(page);
  await card(page, name)
    .getByRole("button", { name: "Ask MHAI about it" })
    .click();
  await expect(page).toHaveURL(/\/$/);
}

/** Analyse (on a phone, after the form's last step). */
async function analyse(page: Page) {
  if (isMobile(page)) {
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByRole("button", { name: /Analyse/ }).click();
}

test("asked from an alert, the question is about that patient", async ({
  page,
}) => {
  await askAbout(page, "Maryam Abdullahi");
  await expect(about(page)).toContainText("Maryam Abdullahi");
  await expect(about(page)).toContainText("204817");
  await expect(
    page.getByText(/Filled in from a patient alert and linked to the patient/),
  ).toBeVisible();
  const sent: string[] = [];
  page.on("request", (r) => {
    const body = r.postData();
    if (body) sent.push(body);
  });
  await analyse(page);
  await expect(page).toHaveURL(/\/c\//);
  // Mock mode answers in the browser: nothing about the patient left it.
  for (const body of sent)
    for (const secret of SECRETS) expect(body).not.toContain(secret);
});

test("the patient can be removed before asking", async ({ page }) => {
  await askAbout(page, "Maryam Abdullahi");
  await about(page)
    .getByRole("button", { name: "Remove Maryam Abdullahi from this question" })
    .click();
  await expect(about(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Age" })).toBeFocused();
  await expect(
    page.getByText(/Filled in from a patient alert\. The patient's name/),
  ).toBeVisible();
  await analyse(page);
  await expect(page).toHaveURL(/\/c\//);
});

test("a patient who isn't available: say so, then ask without them", async ({
  page,
}) => {
  await askAbout(page, "Samuel Bassey");
  await expect(about(page)).toContainText("Samuel Bassey");
  await analyse(page);
  await expect(
    page.getByText("This patient isn't available for questions"),
  ).toBeVisible();
  await expect(page.getByText("Couldn't send your question")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  const without = page.getByRole("button", {
    name: "Ask without the patient",
  });
  await expect(without).toBeFocused();
  await without.click();
  await expect(page).toHaveURL(/\/c\//);
});
