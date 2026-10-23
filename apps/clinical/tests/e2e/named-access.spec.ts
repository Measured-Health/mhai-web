import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DEMO_EMAILS,
  expectNoStorage,
  isMobile,
  openAdmin,
  signIn,
  typeCode,
} from "./helpers";

// The sample letters (lib/api/clearances-fixtures.ts), by id. The ids are only
// used to find rows: they never appear in an address.
const CHECKING = "cl_check";
const REFUSED = "cl_bad";
const WAITING = "cl_wait";
const ACTIVE = "cl_act";
const ENDING = "cl_soon";
const REJECTED = "cl_rej";
const ENDED = "cl_end";
const REVOKED = "cl_rev";

const urls = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const seen: string[] = [];
  urls.set(page, seen);
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) seen.push(f.url());
  });
});

test.afterEach(async ({ page }) => {
  // A skipped test never opened the app.
  if (page.url() === "about:blank") return;
  // No letter, name or page in browser storage...
  await expectNoStorage(page);
  // ...nor in a cache (no service worker or Cache Storage use)...
  const caches = await page.evaluate(async () =>
    typeof window.caches === "undefined" ? [] : await window.caches.keys(),
  );
  expect(caches).toEqual([]);
  // ...nor in an address: no letter id and no page number.
  for (const url of [...(urls.get(page) ?? []), page.url()])
    expect(url).not.toMatch(/cl_|page/i);
});

const row = (page: Page, id: string) =>
  page.locator(`[data-letter-id="${id}"]`);

async function asHospitalAdmin(page: Page) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAdmin(page, "Named access");
  await expect(page).toHaveURL(/\/admin\/named-access$/);
  await expect(
    page.getByRole("heading", { name: "Named access", level: 2 }),
  ).toBeVisible();
  await expect(row(page, ACTIVE)).toBeVisible();
}

/** Opens a letter's details (a side panel, or a sheet on a phone). */
async function openLetter(page: Page, id: string) {
  await row(page, id).click();
  const panel = page.getByRole("dialog", { name: "Clearance letter" });
  await expect(panel.getByLabel("The letter's details")).toBeVisible();
  return panel;
}

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

/** A day as `yyyy-mm-dd`, whole days from today. */
function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Fills the upload form (after the people), then confirms and types the code. */
async function fillLetter(page: Page, dialog: Locator, signer: boolean) {
  await dialog.getByLabel("The letter", { exact: true }).setInputFiles({
    name: "signed-letter.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(dialog.getByText(/^signed-letter\.png · \d+ B$/)).toBeVisible();
  if (signer) {
    await dialog.getByLabel("Signed by", { exact: true }).fill("Dr. Funmi Ade");
    await dialog
      .getByLabel("Job title", { exact: true })
      .fill("Chief Medical Director");
  }
  await dialog.getByLabel("Letter date").fill(day(-2));
  await dialog.getByLabel("End date").fill(day(90));
}

async function confirmAndSend(page: Page, dialog: Locator) {
  await dialog
    .getByRole("checkbox", {
      name: "This letter is signed by hospital leadership and names these people.",
    })
    .check();
  await typeCode(page, "123456", dialog);
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
}

test("the hospital admin opens Named access and sees every sample status", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  // The newest sample is still being checked; it may already be waiting.
  await expect(row(page, CHECKING)).toContainText(
    /Checking the file|Waiting for Measured Health/,
  );
  await expect(row(page, REFUSED)).toContainText("Couldn't accept the file");
  await expect(row(page, WAITING)).toContainText("Waiting for Measured Health");
  await expect(row(page, ACTIVE)).toContainText(/Active until \d+ \w{3} \d{4}/);
  await expect(row(page, ENDING)).toContainText("Ends in 12 days");
  await expect(row(page, REJECTED)).toContainText("Rejected");
  await expect(row(page, ENDED)).toContainText(/Ended \d+ \w{3} \d{4}/);
  await expect(row(page, REVOKED)).toContainText(/Revoked \d+ \w{3} \d{4}/);
  // The list is a table on a wide screen and cards on a phone.
  if (isMobile(page))
    await expect(
      page.getByRole("list", { name: "Clearance letters" }),
    ).toBeVisible();
  else await expect(page.getByRole("table")).toBeVisible();
});

test("upload a PNG letter for Kemi Adeyemi; it shows Checking the file, then Waiting for Measured Health", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await page.getByRole("button", { name: "Upload a letter" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a letter" });
  await fillLetter(page, dialog, true);
  await dialog.getByRole("checkbox", { name: "Dr. Kemi Adeyemi" }).check();
  // Only the file's name and size show: never a preview.
  await expect(dialog.locator("img, iframe, object, embed")).toHaveCount(0);
  await confirmAndSend(page, dialog);
  await expect(page.getByText("Letter uploaded")).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // The newest letter is first.
  const newest = page.locator("[data-letter-id]").first();
  await expect(newest).toContainText("Dr. Kemi Adeyemi");
  await expect(newest).toContainText("Checking the file");
  await expect(newest).toContainText("Waiting for Measured Health");
  // The file's name was never on the page.
  await expect(page.getByText("signed-letter.png")).toHaveCount(0);
});

test("view a letter page by page; no download or print control exists", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  const panel = await openLetter(page, ACTIVE);
  await panel.getByRole("button", { name: "View letter" }).click();
  const viewer = page.getByRole("dialog", { name: "The letter" });
  await expect(viewer.getByText("Page 1 of 2")).toBeVisible();
  const image = viewer.getByRole("img", { name: "Page 1 of 2" });
  await expect(image).toBeVisible();
  // A page is an object URL: never an address the server could serve again.
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect(viewer.getByRole("button", { name: "Previous" })).toBeDisabled();
  await viewer.getByRole("button", { name: "Next" }).click();
  await expect(viewer.getByRole("img", { name: "Page 2 of 2" })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Next" })).toBeDisabled();
  await viewer.getByRole("button", { name: "Previous" }).click();
  await expect(viewer.getByRole("img", { name: "Page 1 of 2" })).toBeVisible();

  // No download, save or print anywhere in the viewer.
  await expect(
    viewer.getByRole("button", { name: /download|save|print|open in/i }),
  ).toHaveCount(0);
  await expect(
    viewer.getByRole("link", { name: /download|save|print/i }),
  ).toHaveCount(0);
  await expect(page.locator("a[download]")).toHaveCount(0);
  // And it doesn't print.
  await page.emulateMedia({ media: "print" });
  await expect(viewer).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
});

test("revoke a waiting letter with a code", async ({ page }) => {
  await asHospitalAdmin(page);
  const panel = await openLetter(page, WAITING);
  await panel.getByRole("button", { name: "Revoke", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Revoke this letter?" });
  await expect(
    confirm.getByRole("button", { name: "Revoke letter" }),
  ).toBeDisabled();
  await confirm.getByRole("radio", { name: "No longer needed" }).check();
  // A wrong code keeps the letter.
  await typeCode(page, "000000", confirm);
  await confirm.getByRole("button", { name: "Revoke letter" }).click();
  await expect(
    confirm.getByText("That code didn't work. Try again."),
  ).toBeVisible();
  await expect(row(page, WAITING)).toContainText("Waiting for Measured Health");

  await typeCode(page, "123456", confirm);
  await confirm.getByRole("button", { name: "Revoke letter" }).click();
  await expect(page.getByText("Letter revoked")).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(row(page, WAITING)).toContainText(/Revoked \d+ \w{3} \d{4}/);
  await expect(row(page, WAITING)).not.toContainText(
    "Waiting for Measured Health",
  );
});

test("renew the letter ending in 12 days", async ({ page }) => {
  await asHospitalAdmin(page);
  const panel = await openLetter(page, ENDING);
  await expect(panel.getByText("Ends in 12 days")).toBeVisible();
  await panel.getByRole("button", { name: "Renew" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a letter" });
  // The old letter's signer and people are carried over.
  await expect(dialog.getByLabel("Signed by", { exact: true })).toHaveValue(
    "Dr. Funmi Ade",
  );
  await expect(
    dialog.getByRole("checkbox", { name: "Dr. Kemi Adeyemi" }),
  ).toBeChecked();
  await fillLetter(page, dialog, false);
  await confirmAndSend(page, dialog);
  await expect(page.getByText("Letter uploaded")).toBeVisible();
  await expect(dialog).toHaveCount(0);

  const newest = page.locator("[data-letter-id]").first();
  await expect(newest).toContainText("Dr. Kemi Adeyemi");
  await expect(newest).toContainText(/Checking the file|Waiting for Measured/);
  // The old letter stays as it was until the new one is verified.
  await expect(row(page, ENDING)).toContainText("Ends in 12 days");
});

test("an analyst who isn't an admin has no Named access entry", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.analyst);
  await expect(page).toHaveURL(/\/$/);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  // The menu is there (Analysis is), but not Named access.
  await expect(
    page.getByRole("link", { name: /^Analysis/ }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Named access" })).toHaveCount(0);
  await expect(page.getByText("Clearance letters")).toHaveCount(0);
});

test("phone: the list as cards and Upload as a sheet", async ({ page }) => {
  test.skip(!isMobile(page), "phone only");
  await asHospitalAdmin(page);
  await expect(page.getByRole("table")).toHaveCount(0);
  const cards = page.getByRole("list", { name: "Clearance letters" });
  await expect(cards).toBeVisible();
  // Targets are 44 px tall, and the page doesn't scroll sideways.
  const card = row(page, ACTIVE);
  expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const noSideScroll = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
  expect(await noSideScroll()).toBe(true);

  const upload = page.getByRole("button", { name: "Upload a letter" });
  expect((await upload.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await upload.click();
  const sheet = page.getByRole("dialog", { name: "Upload a letter" });
  await expect(sheet).toBeVisible();
  // A sheet: not a native <dialog>, full width, sitting on the bottom edge.
  expect(await sheet.evaluate((el) => el.tagName)).not.toBe("DIALOG");
  const box = (await sheet.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(view.width - 1);
  expect(Math.abs(box.y + box.height - view.height)).toBeLessThanOrEqual(1);
  expect(await noSideScroll()).toBe(true);
});
