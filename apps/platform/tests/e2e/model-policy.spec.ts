import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  CODE,
  expectNoStorage,
  openHospital,
  signIn,
  stepUp,
  toast,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

const model = (page: Page) =>
  page.getByRole("region", { name: "AI model", exact: true });

async function confirmWithCode(page: Page) {
  const d = stepUp(page, "Change the AI model?");
  await typeCode(page, CODE, d);
  await d.getByRole("button", { name: "Save" }).click();
  return d;
}

test("Ada switches Northgate to Anthropic, then back to MHAI's own model", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openHospital(page, "Northgate General Hospital");
  const r = model(page);
  await expect(r.getByText("MHAI's own model", { exact: true })).toBeVisible();

  await r.getByRole("button", { name: "Change" }).click();
  await r.getByLabel("Anthropic (cloud)").check();
  await r.getByLabel("Agreement reference").fill("AGR-2026-0042");
  await r.getByRole("button", { name: "Save" }).click();
  const d = await confirmWithCode(page);
  await expect(d).toBeHidden();
  await expect(toast(page, "AI model saved")).toBeVisible();
  await expect(r.getByText("Anthropic (cloud)", { exact: true })).toBeVisible();
  await expect(r.getByText("AGR-2026-0042")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Recent actions" })
      .getByText(/set the AI model to Anthropic \(cloud\)/),
  ).toBeVisible();

  await r.getByRole("button", { name: "Change" }).click();
  await r.getByLabel(/^MHAI's own model/).check();
  await r.getByRole("button", { name: "Save" }).click();
  await confirmWithCode(page);
  await expect(r.getByText("MHAI's own model", { exact: true })).toBeVisible();
  await expect(r.getByText("Agreement reference")).toBeHidden();
});

test("a provider this deployment hasn't switched on is refused, and nothing changes", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openHospital(page, "Northgate General Hospital");
  const r = model(page);
  await r.getByRole("button", { name: "Change" }).click();
  await r.getByLabel("OpenAI (cloud)").check();
  await r.getByLabel("Agreement reference").fill("dpa-2026-1234");
  await r.getByRole("button", { name: "Save" }).click();
  const d = await confirmWithCode(page);
  await expect(d).toBeHidden();
  await expect(
    r.getByText("This provider isn't switched on for this deployment."),
  ).toBeVisible();
  await expect(r.getByLabel("OpenAI (cloud)")).toBeFocused();
  await r.getByRole("button", { name: "Cancel" }).click();
  await expect(r.getByText("MHAI's own model", { exact: true })).toBeVisible();
});

test("a bad agreement reference is caught before the code", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openHospital(page, "Northgate General Hospital");
  const r = model(page);
  await r.getByRole("button", { name: "Change" }).click();
  await r.getByLabel("Anthropic (cloud)").check();
  await r.getByLabel("Agreement reference").fill("Signed by Dr Obi");
  await r.getByRole("button", { name: "Save" }).click();
  await expect(
    r.getByText("Use AGR-YYYY-NNNN, DPA-YYYY-NNNN or DEMO-SYNTHETIC."),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("an auditor sees Havana's AI model and its use, and can't change it", async ({
  page,
}) => {
  await signIn(page, AMARA);
  await openHospital(page, "Havana Hospital");
  const r = model(page);
  await expect(r.getByText("Anthropic (cloud)", { exact: true })).toBeVisible();
  await expect(r.getByText("DEMO-SYNTHETIC")).toBeVisible();
  await expect(
    r.getByText("1,240,000 tokens (62% of the limit)"),
  ).toBeVisible();
  await expect(r.getByRole("button", { name: "Change" })).toHaveCount(0);
});

test("Lakeside is on Google Gemini: never shown as off, and the form opens on it", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openHospital(page, "Lakeside Community Clinic");
  const r = model(page);
  await expect(
    r.getByText("Google Gemini (cloud)", { exact: true }),
  ).toBeVisible();
  await expect(r.getByText("DPA-2026-0107")).toBeVisible();
  await expect(r.getByText("MHAI's own model", { exact: true })).toHaveCount(0);
  await r.getByRole("button", { name: "Change" }).click();
  await expect(r.getByLabel("Google Gemini (cloud)")).toBeChecked();
  await expect(r.getByLabel(/^MHAI's own model/)).not.toBeChecked();
  await r.getByRole("button", { name: "Cancel" }).click();
});

test("Ada switches Northgate to Google Gemini", async ({ page }) => {
  await signIn(page, ADA);
  await openHospital(page, "Northgate General Hospital");
  const r = model(page);
  await r.getByRole("button", { name: "Change" }).click();
  await r.getByLabel("Google Gemini (cloud)").check();
  await r.getByLabel("Agreement reference").fill("DPA-2026-0107");
  await r.getByRole("button", { name: "Save" }).click();
  const d = await confirmWithCode(page);
  await expect(d).toBeHidden();
  await expect(toast(page, "AI model saved")).toBeVisible();
  await expect(
    r.getByText("Google Gemini (cloud)", { exact: true }),
  ).toBeVisible();
  await expect(r.getByText("MHAI's own model", { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Recent actions" })
      .getByText(/set the AI model to Google Gemini \(cloud\)/),
  ).toBeVisible();
});
