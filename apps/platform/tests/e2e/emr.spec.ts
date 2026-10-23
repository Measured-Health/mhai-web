import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  CODE,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
  stepUp,
  toast,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** Only opaque ids and the filter value may be in the address. */
const expectCleanUrl = (page: Page) => {
  const u = new URL(page.url());
  expect(u.pathname).toMatch(/^\/(connections(\/[A-Za-z0-9_-]+)?|activity)$/);
  for (const [k, v] of u.searchParams) {
    expect(["state", "hospital"]).toContain(k);
    expect(v).toMatch(/^[\w-]+$/);
  }
};

/** A hospital's rows: table rows on desktop, cards on phones. */
const rowsOf = (page: Page, hospital: string) =>
  (isMobile(page)
    ? page.getByRole("main").getByRole("listitem")
    : page.getByRole("main").getByRole("row")
  ).filter({ hasText: hospital });

async function openConnections(page: Page, email = ADA) {
  await signIn(page, email);
  await openNav(page, "Connections");
  await expect(page).toHaveURL(/\/connections$/);
}

/** From Connections: adds Eastbrook's Main record with the demo code. */
async function addEastbrook(page: Page, secret: string) {
  await rowsOf(page, "Eastbrook Medical Centre")
    .getByRole("link", { name: "Add a connection" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Add a connection" }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: /FHIR R4 server/ })
    .check({ force: true });
  await page.getByLabel("Name the hospital sees").fill("Main record");
  await page
    .getByLabel("Base address")
    .fill("https://records.eastbrook.example/fhir");
  await page.getByLabel("Client ID").fill("mhai-eastbrook");
  await page.getByLabel("Private key").fill(secret);
  await page.getByRole("button", { name: "Continue" }).click();
  const add = stepUp(page, "Add FHIR R4 server for Eastbrook Medical Centre?");
  await typeCode(page, CODE, add);
  await add.getByRole("button", { name: "Add connection" }).click();
  await expect(page).toHaveURL(/\/connections\/[A-Za-z0-9_-]+$/);
}

test("Connections shows Havana connected, Northgate needing attention, Riverside switched off and Eastbrook not connected", async ({
  page,
}) => {
  await openConnections(page);
  const havana = rowsOf(page, "Havana Hospital");
  await expect(havana).toHaveCount(2);
  for (const r of await havana.all())
    await expect(r).toContainText("Connected");
  await expect(rowsOf(page, "Northgate General Hospital")).toContainText(
    "Needs attention",
  );
  await expect(rowsOf(page, "Riverside Children's Hospital")).toContainText(
    "Switched off",
  );
  await expect(rowsOf(page, "Eastbrook Medical Centre")).toContainText(
    "Not connected",
  );

  // The filter lives in the address as ?state=.
  await page.getByRole("button", { name: /^Needs attention/ }).click();
  await expect(page).toHaveURL(/\/connections\?state=needs_attention$/);
  await expect(rowsOf(page, "Havana Hospital")).toHaveCount(0);
  await expect(rowsOf(page, "Northgate General Hospital")).toHaveCount(1);
  expectCleanUrl(page);
});

test("add a connection to Eastbrook with a code, test it, switch it on", async ({
  page,
}) => {
  await openConnections(page);
  await addEastbrook(page, "SECRET-eastbrook-key-1q1q");

  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByText("Not tested", { exact: true })).toBeVisible();
  // Switching on needs a passing test first.
  await expect(
    status.getByRole("button", { name: "Switch on" }),
  ).toBeDisabled();
  await expect(
    status.getByText("Test the saved settings first."),
  ).toBeVisible();

  await status.getByRole("button", { name: "Test connection" }).click();
  await expect(toast(page, "Test passed.")).toBeVisible();
  await status.getByRole("button", { name: "Switch on" }).click();
  const on = stepUp(page, "Switch on Main record?");
  await typeCode(page, CODE, on);
  await on.getByRole("button", { name: "Switch on" }).click();
  await expect(on).toBeHidden();
  await expect(status.getByText("Connected", { exact: true })).toBeVisible();
  expectCleanUrl(page);
});

test("the credential reads Set after saving and its value is nowhere in the page", async ({
  page,
}) => {
  const secret = "SECRET-eastbrook-key-9z9z";
  await openConnections(page);
  await addEastbrook(page, secret);

  const settings = page.getByRole("region", { name: "Settings" });
  await expect(settings.getByText(/^Set · /)).toBeVisible();
  await expect(settings.getByLabel("Private key")).toHaveCount(0);
  // Nowhere in the page: not in the text, the markup or any input value.
  expect(await page.content()).not.toContain(secret);
  expect(await page.locator("body").innerText()).not.toContain(secret);
  const values = await page
    .locator("input")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values.join("|")).not.toContain(secret);

  // Replace shows an empty box; the old value never returns.
  await settings.getByRole("button", { name: "Edit" }).click();
  await settings.getByRole("button", { name: "Replace" }).click();
  await expect(settings.getByLabel("Private key")).toHaveValue("");
  expect(await page.content()).not.toContain(secret);
});

test("an auditor sees the connection and no controls", async ({ page }) => {
  await openConnections(page, AMARA);
  await expect(rowsOf(page, "Havana Hospital")).toHaveCount(2);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Add a connection" }),
  ).toHaveCount(0);

  await rowsOf(page, "Northgate General Hospital")
    .getByRole("link", { name: "Patient record" })
    .click();
  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByText("Needs attention")).toBeVisible();
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible();
  for (const name of ["Test connection", "Switch on", "Switch off", "Edit"])
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  // Settings are read-only text: the secret is only ever Set or Not set.
  await expect(page.getByText(/^Set · /)).toBeVisible();
  expectCleanUrl(page);
});

test("Activity lists the connection changes", async ({ page }) => {
  await openConnections(page);
  await addEastbrook(page, "SECRET-eastbrook-key-3w3w");
  const status = page.getByRole("region", { name: "Status" });
  await status.getByRole("button", { name: "Test connection" }).click();
  await expect(toast(page, "Test passed.")).toBeVisible();
  await status.getByRole("button", { name: "Switch on" }).click();
  const on = stepUp(page, "Switch on Main record?");
  await typeCode(page, CODE, on);
  await on.getByRole("button", { name: "Switch on" }).click();
  await expect(on).toBeHidden();

  await openNav(page, "Activity");
  const main = page.getByRole("main");
  for (const words of [
    /added the record connection “Main record”/,
    /tested the record connection “Main record”/,
    /switched on the record connection “Main record”/,
  ])
    await expect(main.getByText(words).first()).toBeVisible();
  expectCleanUrl(page);
});
