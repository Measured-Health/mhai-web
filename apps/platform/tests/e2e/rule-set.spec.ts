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

const alerts = (page: Page) =>
  page.getByRole("region", { name: "Patient alerts", exact: true });
const SHA = "5a1e".repeat(16);

test("Ada switches Northgate's patient alerts on, after the warning, then off", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openHospital(page, "Northgate General Hospital");
  const r = alerts(page);
  await expect(r.getByText(/No alert is sent to anyone/)).toBeVisible();

  await r.getByRole("button", { name: "Switch on alerts" }).click();
  await r.getByLabel("On: send patient alerts to clinicians").check();
  await expect(
    r.getByText(
      "This sends patient alerts to Northgate General Hospital's clinicians",
      { exact: true },
    ),
  ).toBeVisible();
  await r.getByLabel("Rule set version").fill("0-synthetic");
  await r.getByLabel("Fingerprint (SHA-256)").fill(SHA);
  await r.getByRole("button", { name: "Save" }).click();
  // Not until they say they understand.
  await expect(
    r.getByText("Confirm that you understand this sends alerts."),
  ).toBeVisible();
  await r.getByRole("checkbox").check();
  await r.getByRole("button", { name: "Save" }).click();
  let d = stepUp(page, "Send patient alerts to clinicians?");
  await typeCode(page, CODE, d);
  await d.getByRole("button", { name: "Send alerts" }).click();
  await expect(d).toBeHidden();
  await expect(toast(page, "Patient alerts switched on")).toBeVisible();
  await expect(r.getByText("0-synthetic")).toBeVisible();
  await expect(r.getByText(/MHAI sends patient alerts to/)).toBeVisible();

  await r.getByRole("button", { name: "Change" }).click();
  await r.getByLabel("Off: trial run, no alerts are sent").check();
  await r.getByRole("button", { name: "Save" }).click();
  d = stepUp(page, "Stop sending patient alerts?");
  await typeCode(page, CODE, d);
  await d.getByRole("button", { name: "Switch off alerts" }).click();
  await expect(d).toBeHidden();
  await expect(r.getByText(/No alert is sent to anyone/)).toBeVisible();
});

test("an auditor sees Havana's rule set and can't switch it", async ({
  page,
}) => {
  await signIn(page, AMARA);
  await openHospital(page, "Havana Hospital");
  const r = alerts(page);
  await expect(r.getByText("0-synthetic")).toBeVisible();
  await expect(r.getByRole("button")).toHaveCount(0);
});
