import { expect, test } from "@playwright/test";
import {
  freshCode,
  readState,
  recordApi,
  reportApi,
  signIn,
  typeCode,
} from "./live";

/**
 * A record connection, live: the platform admin adds the synthetic FHIR
 * source to the live hospital (a private network, as an on-site record
 * system is), tests it and switches it on, each write with a fresh code.
 * The emr service then polls it; the clinical alerts spec reads the alert.
 */
test("EMR: add the synthetic source, test it, switch it on", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, "padmin");
  const calls = recordApi(page);
  await page
    .getByRole("navigation", { name: "Platform" })
    .getByRole("link", { name: "Connections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Connections" }),
  ).toBeVisible();
  const row = page
    .getByRole("main")
    .getByRole("row")
    .filter({ hasText: "Synthetic Live Hospital" });
  await expect(row.first()).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("connections.png"),
    fullPage: true,
  });
  await row.getByRole("link", { name: "Add a connection" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Add a connection" }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: /FHIR R4 server/ })
    .check({ force: true });
  const name = readState("synth.name");
  await page.getByLabel("Name the hospital sees").fill("Synthetic record");
  await page.getByLabel("Base address").fill(`https://${name}/r4`);
  await page.getByLabel("Client id").fill("synthetic-client");
  await page.getByLabel("Token address").fill(`https://${name}/token`);
  await page.getByLabel("MRN identifier system").fill("urn:synthetic:mrn");
  await page.getByLabel("Private key").fill(readState("synth-client.key"));
  // An on-site record system: a private network, declared.
  const priv = page.getByRole("checkbox", { name: /private network/i });
  if (await priv.count()) {
    await priv.check();
    await page
      .getByLabel(/Private address ranges/i)
      .fill(readState("synth.cidr"));
  } else
    test.info().annotations.push({
      type: "gap",
      description: "no private network fields",
    });
  await page.getByRole("button", { name: "Continue" }).click();
  const add = page.getByRole("dialog", { name: /^Add FHIR R4 server for / });
  await typeCode(page, await freshCode(page, "padmin"), add);
  await add.getByRole("button", { name: "Add connection" }).click();
  await expect(page).toHaveURL(/\/connections\/[A-Za-z0-9_-]+$/);
  await page.screenshot({
    path: test.info().outputPath("added.png"),
    fullPage: true,
  });

  const status = page.getByRole("region", { name: "Status" });
  await status.getByRole("button", { name: "Test connection" }).click();
  await expect(page.locator("b", { hasText: "Test passed." })).toBeVisible({
    timeout: 60_000,
  });
  await status.getByRole("button", { name: "Switch on" }).click();
  const on = page.getByRole("dialog", { name: /^Switch on / });
  await typeCode(page, await freshCode(page, "padmin"), on);
  await on.getByRole("button", { name: "Switch on" }).click();
  await expect(on).toBeHidden();
  await expect(status.getByText("Connected", { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("on.png"),
    fullPage: true,
  });
  expect(reportApi("emr", calls)).toEqual([]);
});
