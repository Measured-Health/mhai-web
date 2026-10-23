import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DEMO_EMAILS,
  expectNoStorage,
  isMobile,
  openAdmin,
  signIn,
  typeCode,
} from "./helpers";

// Names in Analysis (Plan 11c). Nothing named reaches the address, the page
// title, the console or browser storage: every test is checked for that after
// it runs, with the names and record numbers it actually put on screen.
const MRN = /HH-\d{6}/;

// A failed test must not keep the sample names in a trace, screenshot or video.
test.use({ trace: "off", screenshot: "off", video: "off" });
// Playwright also writes error-context.md (an ARIA snapshot of the page, rows
// included) for every failed test. This switch, read in the worker when the
// context closes (playwright/lib/index.js, _takePageSnapshot), turns it off.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

type Seen = { urls: string[]; console: string[]; names: Set<string> };
const seen = new WeakMap<Page, Seen>();

test.beforeEach(({ page }) => {
  const s: Seen = { urls: [], console: [], names: new Set() };
  seen.set(page, s);
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) s.urls.push(f.url());
  });
  page.on("request", (r) => s.urls.push(r.url()));
  page.on("console", (m) => s.console.push(m.text()));
  page.on("pageerror", (e) => s.console.push(e.message));
});

test.afterEach(async ({ page }) => {
  // A skipped test never opened the app.
  if (page.url() === "about:blank") return;
  const s = seen.get(page)!;
  try {
    // Nothing in browser storage, and nothing in a cache.
    await expectNoStorage(page);
    const caches = await page.evaluate(async () =>
      typeof window.caches === "undefined" ? [] : await window.caches.keys(),
    );
    expect(caches).toEqual([]);
    // No name or MRN in an address or the title.
    const title = await page.title();
    for (const text of [...s.urls, page.url(), title]) {
      let plain = text;
      try {
        plain = decodeURIComponent(text);
      } catch {
        // keep the raw text
      }
      expect(MRN.test(plain), "a record number reached an address").toBe(false);
      for (const name of s.names)
        expect(plain.includes(name), "a patient name reached an address").toBe(
          false,
        );
    }
    // None in console output either.
    for (const line of s.console) {
      expect(MRN.test(line), "a record number reached the console").toBe(false);
      for (const name of s.names)
        expect(line.includes(name), "a patient name reached the console").toBe(
          false,
        );
    }
  } finally {
    // Leave no named page open when the context closes.
    await page.goto("about:blank").catch(() => {});
  }
});

const analysisLink = (page: Page) =>
  page.getByRole("link", { name: /^Analysis/ }).filter({ visible: true });

async function openAnalysis(page: Page) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await analysisLink(page).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(
    page.getByRole("heading", { name: "Analysis", level: 2 }),
  ).toBeVisible();
}

/** Opens a view: a tab on desktop, the View select on phones. */
async function openView(page: Page, title: string) {
  if (isMobile(page))
    await page
      .getByLabel("View", { exact: true })
      .selectOption({ label: title });
  else await page.getByRole("tab", { name: title }).click();
  await expect(
    page.getByRole("heading", { name: title, level: 2 }),
  ).toBeVisible();
}

/** Grace (hospital admin, covered by the active sample letter) opens Analysis. */
async function asGrace(page: Page) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAnalysis(page);
}

/** Opens the Emergency group (37 patients) as a list, de-identified. */
async function openEmergency(page: Page) {
  await openView(page, "Who is affected");
  const ward = page.getByRole("list", { name: "Patients by ward or clinic" });
  const emergency = ward
    .getByRole("listitem")
    .filter({ hasText: /^Emergency/ })
    .first();
  await expect(emergency).toContainText("37");
  await emergency.getByRole("button", { name: /^See patients/ }).click();
  const panel = page.getByRole("dialog", { name: /patients ·/ });
  await expect(
    panel.getByRole("heading", {
      name: "37 patients · Ward or clinic: Emergency",
    }),
  ).toBeVisible();
  await expect(
    panel.getByText("De-identified: no names or record numbers"),
  ).toBeVisible();
  return panel;
}

/** Show names, for a purpose. */
async function showNames(page: Page, panel: Locator, purpose: string) {
  await panel.getByRole("button", { name: "Show names" }).click();
  const ask = page.getByRole("dialog", { name: "Show names" });
  await ask.getByRole("radio", { name: purpose }).check();
  await ask.getByRole("button", { name: "Show names" }).click();
  await expect(ask).toHaveCount(0);
  await expect(panel.locator("[data-named-banner]")).toBeVisible();
}

/** Remembers the names on screen, so the checks after the test can look for them. */
async function rememberNames(page: Page, panel: Locator) {
  const s = seen.get(page)!;
  const rows = panel.locator("[data-named-view] tbody tr");
  await expect(rows.first()).toBeVisible();
  const names = await rows.locator("th").allInnerTexts();
  const mrns = await rows.locator("td").first().allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) s.names.add(n.trim());
  for (const m of mrns)
    expect(MRN.test(m.trim()), "MRN column holds a record number").toBe(true);
  return names.map((n) => n.trim());
}

const noSideScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );

test("Grace opens a group, shows names for Quality improvement, and sees the banner and watermark", async ({
  page,
}) => {
  await asGrace(page);
  await expect(
    page.getByText(/^Named access until \d+ \w{3} \d{4}.* · letter on file/),
  ).toBeVisible();
  const panel = await openEmergency(page);
  await showNames(page, panel, "Quality improvement");

  await expect(panel.locator("[data-named-banner]")).toHaveText(
    /^Named view · letter until \d+ \w{3} \d{4} · this view is recorded$/,
  );
  // Name and MRN lead the table, and the viewer and the time are marked across it.
  const headers = await panel
    .locator("[data-named-view] thead th")
    .allInnerTexts();
  expect(headers.slice(0, 2)).toEqual(["Name", "MRN"]);
  await expect(panel.locator("[data-watermark]")).toHaveAttribute(
    "data-watermark",
    /^Grace Nwosu · \d{2}:\d{2}$/,
  );
  await rememberNames(page, panel);
  // The purpose and the names are not in the address.
  expect(page.url()).toMatch(/\/analysis$/);
  expect(
    /quality|purpose|name|HH-/i.test(page.url()),
    "purpose or name in the address",
  ).toBe(false);
  // No copy, export, download or print control.
  await expect(
    panel.getByRole("button", { name: /copy|export|download|print|save/i }),
  ).toHaveCount(0);
});

test("Activity shows 'viewed 37 patients by name in Analysis', flagged", async ({
  page,
}) => {
  await asGrace(page);
  const panel = await openEmergency(page);
  await showNames(page, panel, "Quality improvement");
  await rememberNames(page, panel);
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  const line = page
    .getByText(/viewed 37 patients by name in Analysis/)
    .filter({ visible: true })
    .first();
  await expect(line).toBeVisible();
  await expect(line).toContainText("Grace Nwosu");
  // Flagged as an alert; the purpose and the names are not part of the line.
  await expect(line.locator("xpath=..")).toContainText("Alert");
  await expect(page.getByText(/HH-\d{6}/)).toHaveCount(0);
});

test("Grace revokes cl_act on Named access; back in Analysis the needs-a-letter line shows", async ({
  page,
}) => {
  // The clock runs on its own, and can be moved on by the test.
  await page.clock.install();
  await asGrace(page);
  const panel = await openEmergency(page);
  await showNames(page, panel, "Quality improvement");
  await rememberNames(page, panel);
  // 30 seconds with nothing changed: the check keeps the names.
  await page.clock.runFor(31_000);
  await page.clock.resume();
  await expect(panel.locator("[data-named-banner]")).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  // Revoke the active letter, in this tab (the demo's sign-in lives in memory).
  await openAdmin(page, "Named access");
  await expect(page).toHaveURL(/\/admin\/named-access$/);
  await page.locator('[data-letter-id="cl_act"]').click();
  const letter = page.getByRole("dialog", { name: "Clearance letter" });
  await letter.getByRole("button", { name: "Revoke", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Revoke this letter?" });
  await confirm.getByRole("radio", { name: "No longer needed" }).check();
  await typeCode(page, "123456", confirm);
  await confirm.getByRole("button", { name: "Revoke letter" }).click();
  await expect(page.getByText("Letter revoked")).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await letter.getByRole("button", { name: "Close" }).click();

  await openAnalysis(page);
  await expect(page.getByText("No named access")).toBeVisible();
  const again = await openEmergency(page);
  await expect(
    again.getByText(
      "Named access needs a clearance letter. Ask your hospital admin.",
    ),
  ).toBeVisible();
  await expect(again.getByRole("button", { name: "Show names" })).toHaveCount(
    0,
  );
});

test("a clinician-analyst without a letter sees the needs-a-letter line", async ({
  page,
}) => {
  // Dr. Obi has a letter only in the waiting state.
  await signIn(page, DEMO_EMAILS.director);
  await expect(page).toHaveURL(/\/$/);
  await openAnalysis(page);
  await expect(page.getByText("No named access")).toBeVisible();
  const panel = await openEmergency(page);
  await expect(
    panel.getByText(
      "Named access needs a clearance letter. Ask your hospital admin.",
    ),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Show names" })).toHaveCount(
    0,
  );
  await expect(panel.locator("[data-named-view]")).toHaveCount(0);
});

test("print emulation hides the named list", async ({ page }) => {
  await asGrace(page);
  const panel = await openEmergency(page);
  await showNames(page, panel, "Quality improvement");
  await rememberNames(page, panel);
  const view = panel.locator("[data-named-view]");
  await expect(view).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(view).toBeHidden();
  await expect(panel).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(view).toBeVisible();
});

test("phone: the named list as a sheet with the banner", async ({ page }) => {
  test.skip(!isMobile(page), "phone only");
  await asGrace(page);
  const panel = await openEmergency(page);
  await showNames(page, panel, "Quality improvement");
  await rememberNames(page, panel);
  await expect(panel.locator("[data-named-banner]")).toBeVisible();
  // A sheet: not a native <dialog>, full width, on the bottom edge.
  expect(await panel.evaluate((el) => el.tagName)).not.toBe("DIALOG");
  const box = (await panel.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(view.width - 1);
  expect(Math.abs(box.y + box.height - view.height)).toBeLessThanOrEqual(1);
  // The list scrolls inside its own area, not the page.
  expect(await noSideScroll(page)).toBe(true);
  const show = panel.locator("[data-named-banner]");
  expect((await show.boundingBox())!.width).toBeLessThanOrEqual(view.width);
});
