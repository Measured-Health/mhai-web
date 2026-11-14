import { expect, test, type Page } from "./csp";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  openAdmin,
  signIn,
  typeCode,
} from "./helpers";

// Patient matches and exclusions (core 1.21.0). Patient names and MRNs are
// on screen: none may reach an address, the title, the console or storage,
// and a failed test keeps no trace, screenshot, video or page snapshot.
const MRN = /SYN-\d{6}/;
const NAMES = ["Ama Synthetic-Owusu", "Ama S. Owusu", "Yaw Test-Asante"];
const CODE = "123456";

test.use({ trace: "off", screenshot: "off", video: "off" });
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const seen = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const lines: string[] = [];
  seen.set(page, lines);
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) lines.push(f.url());
  });
  page.on("request", (r) => lines.push(r.url()));
  page.on("console", (m) => lines.push(m.text()));
  page.on("pageerror", (e) => lines.push(e.message));
});

test.afterEach(async ({ page }) => {
  if (page.url() === "about:blank") return;
  try {
    await expectNoStorage(page);
    await expectNoForbiddenWords(page);
    for (const line of [...seen.get(page)!, await page.title()]) {
      let plain = line;
      try {
        plain = decodeURIComponent(line);
      } catch {
        // keep the raw text
      }
      expect(MRN.test(plain), "an MRN left the page").toBe(false);
      for (const n of NAMES)
        expect(plain.includes(n), "a patient name left the page").toBe(false);
    }
  } finally {
    await page.goto("about:blank").catch(() => {});
  }
});

async function asAdmin(
  page: Page,
  where: "Patient matches" | "Patient exclusions",
) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAdmin(page, where);
}

test("a hospital admin merges a possible match into the patient they keep", async ({
  page,
}) => {
  await asAdmin(page, "Patient matches");
  await expect(page).toHaveURL(/\/admin\/patient-matches$/);
  await expect(
    page.getByText(/Nothing is merged unless you confirm it/),
  ).toBeVisible();
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Same MRN, date of birth and sex" });
  await expect(card.getByText("Ama S. Owusu")).toBeVisible();
  await card.getByRole("button", { name: "Same patient: merge" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Merge these two patients?",
  });
  await dialog.getByRole("radio", { name: /Patient A/ }).check();
  await expect(
    dialog.getByText("Ama S. Owusu's 7 records move to Ama Synthetic-Owusu."),
  ).toBeVisible();
  await typeCode(page, CODE, dialog);
  await expect(page.getByText("Patients merged")).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("keeping two patients apart takes the code too", async ({ page }) => {
  await asAdmin(page, "Patient matches");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "A reviewed document links these two patients" });
  await card.getByRole("button", { name: "Not the same patient" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Keep these as two patients?",
  });
  await typeCode(page, "000000", dialog);
  await expect(
    dialog.getByText("That code didn't work. Try again."),
  ).toBeVisible();
  await typeCode(page, CODE, dialog);
  await expect(page.getByText("Kept as two patients")).toBeVisible();
  await expect(card).toHaveCount(0);
});

test("excluding a patient explains the deletion first, then confirms it", async ({
  page,
}) => {
  await asAdmin(page, "Patient exclusions");
  await expect(page).toHaveURL(/\/admin\/patient-exclusions$/);
  await expect(
    page.getByText(/the deletion waits until the hold is lifted/),
  ).toBeVisible();
  await page.getByLabel("The patient's MRN").fill("SYN-100231");
  await page.getByRole("radio", { name: "The patient objected" }).check();
  await page.getByRole("button", { name: "Exclude patient…" }).click();
  let dialog = page.getByRole("dialog", { name: "Exclude this patient?" });
  await typeCode(page, CODE, dialog);
  // Two patients share it: decide the match first.
  await expect(dialog.getByText("Two patients share this MRN")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("The patient's MRN").fill("SYN-400512");
  await page.getByRole("button", { name: "Exclude patient…" }).click();
  dialog = page.getByRole("dialog", { name: "Exclude this patient?" });
  await typeCode(page, CODE, dialog);
  await expect(
    page.getByText("Patient excluded and their data deleted"),
  ).toBeVisible();
  await expect(page.getByLabel("The patient's MRN")).toHaveValue("");
});
