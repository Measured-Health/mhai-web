import { readFileSync } from "node:fs";
import { expect, test, type Page } from "./csp";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  isMobile,
  openAccountMenu,
  openAdmin,
  signIn,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => {
  // No staff names, emails or activity in browser storage, and no codes on screen.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

const manage = (page: Page, name: string) =>
  page.getByRole("button", { name: `Manage ${name}`, exact: true });
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "Staff member" });

async function asHospitalAdmin(page: Page) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Kofi Mensah")).toBeVisible();
}

/**
 * A client-side visit to `href`, as a typed address would be, without the
 * reload that ends the memory-only demo session. It calls
 * `window.next.router`, a Next.js-internal handle (set "for debugging" in
 * next/dist/client/components/app-router-instance.js), not a public API: if
 * a Next.js upgrade removes it, `push` is undefined and this throws, so the
 * test fails loudly rather than passing without visiting anything.
 *
 * Resolves once the browser has actually been at `href` (the router
 * committed it, however briefly), so a gate that then sends the person
 * elsewhere is a navigation attempted and refused, never one that didn't
 * happen.
 */
async function visitInApp(page: Page, href: string) {
  const reached = page.waitForEvent("framenavigated", {
    predicate: (f) =>
      f === page.mainFrame() && new URL(f.url()).pathname === href,
    timeout: 15_000,
  });
  await page.evaluate((to) => {
    const w = window as unknown as {
      next: { router: { push(href: string): void } };
    };
    w.next.router.push(to);
  }, href);
  await reached;
}

/** Nothing from the clinical side is on screen. */
async function expectNoClinicalScreen(page: Page) {
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Review corrections" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "My feedback & corrections" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Notifications/ }),
  ).toHaveCount(0);
}

test("a hospital admin signs in straight to Staff, with nothing clinical", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await expect(
    page.getByRole("heading", { name: "Staff", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("Two-step not set up").first()).toBeVisible();
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page
      .getByRole("link", { name: "Staff", exact: true })
      .filter({ visible: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: /New consultation/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Review corrections/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Search consultations/ }),
  ).toHaveCount(0);
});

test("an admin who isn't a clinician can't reach clinical screens", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: /My feedback/ })).toHaveCount(
    0,
  );
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("region", { name: "My feedback" })).toHaveCount(
    0,
  );
  // Close goes back to their own side, not the clinical home.
  await page.getByRole("link", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Kofi Mensah")).toBeVisible();

  // A direct visit to a clinical screen is sent back to Staff. Each one
  // starts on another admin page (reached by a visit, which proves the
  // visits work), so landing on Staff is a real redirect.
  for (const clinical of ["/review", "/", "/my-feedback"]) {
    await visitInApp(page, "/admin/settings");
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Hospital settings", level: 2 }),
    ).toBeVisible();
    await visitInApp(page, clinical);
    await expect(page).toHaveURL(/\/admin\/staff$/);
    await expect(
      page.getByRole("heading", { name: "Staff", level: 2 }),
    ).toBeVisible();
    await expect(manage(page, "Dr. Kofi Mensah")).toBeVisible();
    await expectNoClinicalScreen(page);
  }
});

test("a new hospital admin sets a password and two-step, accepts the terms, then lands on Staff", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.newAdmin);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Temporary password").fill("demo-password");
  await page.getByLabel("New password").fill("tram-lantern-okra");
  await page.getByLabel("Confirm password").fill("tram-lantern-okra");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  // Two-step can't be skipped by a hospital admin: a visit to Staff (which
  // the browser does reach, see visitInApp) is sent back to the setup step.
  await visitInApp(page, "/admin/staff");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(manage(page, "Dr. Kofi Mensah")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Staff", level: 2 }),
  ).toHaveCount(0);
  await typeCode(page, "123456");
  await expect(page.getByRole("list", { name: "Backup codes" })).toBeVisible();
  await page.getByLabel("I've saved these codes somewhere safe").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.getByLabel("I understand and agree to use MHAI this way").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Kofi Mensah")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
});

test("inviting staff says it isn't available yet (core 501)", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await expect(page.getByRole("button", { name: "Invite staff" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(/Inviting staff: Not available yet/),
  ).toBeVisible();
  await expect(
    page.getByText("Measured Health creates staff accounts for now."),
  ).toBeVisible();
});

test("deactivate and reactivate, each with your two-step code", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. Tunde Bello").click();
  const p = panel(page);
  await p.getByRole("button", { name: "Deactivate", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Deactivate this account?",
  });
  await expect(
    confirm.getByRole("button", { name: "Keep account" }),
  ).toBeFocused();
  // Nothing to confirm until a full code is in.
  await expect(
    confirm.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeDisabled();
  // A wrong code keeps the dialog open and the person active.
  await typeCode(page, "000000", confirm);
  await expect(
    confirm.getByText("That code didn't work. Try again."),
  ).toBeVisible();
  // The sixth digit of the right code submits on its own.
  await typeCode(page, "123456", confirm);
  await expect(page.getByText("Account deactivated")).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(p.getByText("Deactivated", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Reactivate", exact: true }).click();
  const again = page.getByRole("dialog", { name: "Reactivate this account?" });
  await typeCode(page, "123456", again);
  await expect(page.getByText("Account reactivated")).toBeVisible();
  await expect(p.getByText("Active", { exact: true })).toBeVisible();
});

test("change someone's specialty with your two-step code", async ({ page }) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. Tunde Bello").click();
  const p = panel(page);
  await p.getByLabel("Specialty").selectOption("Cardiology");
  await p.getByRole("button", { name: "Save changes" }).click();
  const confirm = page.getByRole("dialog", {
    name: "Save Dr. Bello's access?",
  });
  await expect(confirm).toContainText("Specialty: Cardiology.");
  await typeCode(page, "123456", confirm);
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(confirm).toHaveCount(0);
});

test("removing, resets and reminders say they aren't available yet (core 501)", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. Tunde Bello").click();
  const p = panel(page);
  const account = p.getByRole("region", { name: "Account" });
  await expect(account.getByText("Not available yet")).toHaveCount(3);
  await expect(account.getByText(/Deactivate it instead/)).toBeVisible();
  for (const name of ["Remove", "Send password reset", "Reset two-step"])
    await expect(
      account.getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
});

test("you can't deactivate yourself or give yourself a role", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await manage(page, "Grace Nwosu").click();
  const p = panel(page);
  const deactivate = p.getByRole("button", {
    name: "Deactivate",
    exact: true,
  });
  await expect(deactivate).toBeDisabled();
  await expect(deactivate).toHaveAccessibleDescription(
    "You can't deactivate your own account. Ask another hospital admin.",
  );
  await expect(
    p.getByRole("checkbox", { name: "Hospital admin" }),
  ).toBeDisabled();
  // Core refuses any role an admin adds to themselves (403 self_change).
  const clinician = p.getByRole("checkbox", { name: "Clinician" });
  await expect(clinician).toBeDisabled();
  await expect(clinician).not.toBeChecked();
  await expect(p.getByText(/You can't give yourself a role/)).toBeVisible();
});

test("change and save hospital settings; loosening sign-in asks for your code", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Hospital settings");
  await expect(page).toHaveURL(/\/admin\/settings$/);
  const trust = page.getByRole("switch", { name: 'Allow "trust this device"' });
  await expect(trust).toBeChecked();
  // Tightening saves at once.
  await trust.click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await openAdmin(page, "Staff");
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAdmin(page, "Hospital settings");
  await expect(
    page.getByRole("switch", { name: 'Allow "trust this device"' }),
  ).not.toBeChecked();
  // Loosening needs the code.
  await page.getByRole("switch", { name: 'Allow "trust this device"' }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  const confirm = page.getByRole("dialog", {
    name: "Save settings that loosen sign-in?",
  });
  await typeCode(page, "123456", confirm);
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: 'Allow "trust this device"' }),
  ).toBeChecked();
});

test("on a phone, each person is a card with a Manage button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asHospitalAdmin(page);
  const cards = page.getByRole("list", { name: "Staff at the hospital" });
  await expect(page.getByRole("table")).toHaveCount(0);
  const card = cards
    .getByRole("listitem")
    .filter({ hasText: "Dr. Kofi Mensah" });
  await expect(card).toContainText("k.mensah@havanahospital.org");
  await expect(card).toContainText("Two-step not set up");
  // The card itself isn't a control: tapping it opens nothing.
  await card.getByText("Dr. Kofi Mensah", { exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(card.getByRole("button")).toHaveCount(1);
  await card.getByRole("button", { name: "Manage Dr. Kofi Mensah" }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Dr. Kofi Mensah");
});

test("a medical director sees both sides in one sidebar", async ({ page }) => {
  await signIn(page, DEMO_EMAILS.director);
  await expect(page).toHaveURL(/\/$/);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  const nav = page
    .getByRole("navigation", { name: "Consultations" })
    .filter({ visible: true });
  await expect(
    nav.getByRole("link", { name: "New consultation" }),
  ).toBeVisible();
  await expect(
    nav.getByRole("region", { name: "Hospital admin" }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Ngozi Obi")).toBeVisible();
  await expect(page.getByText("(you)")).toBeVisible();
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("link", { name: "New consultation" })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toBeVisible();
});

test("the activity log shows core's events and exports a CSV", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(
    page.getByText("Too many failed sign-ins for Dr. Bello · account locked"),
  ).toBeVisible();
  // Core flags nothing today.
  await page.getByRole("button", { name: "Flagged only" }).click();
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Flagged only" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^havana-hospital-activity-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await expect(page.getByText("Activity exported")).toBeVisible();
});

test("review oversight without clinical content; reminding and assigning aren't available yet", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Activity");
  await page.getByRole("link", { name: /^Review oversight/ }).click();
  await expect(page).toHaveURL(/\/admin\/activity\/oversight$/);
  await expect(page.getByText("#C-117")).toBeVisible();
  await expect(
    page.getByText(/Reminding or assigning reviewers: not available yet/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Remind reviewers|Assign a reviewer/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Only clinicians can approve or reject corrections."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Approve|Reject/ }),
  ).toHaveCount(0);
});

/**
 * The sample's alert numbers are written for this moment (R12). It repeats
 * ADMIN_NOW in tests/admin.ts, which Playwright can't import without pulling
 * in the mock client: change them together.
 */
const SAMPLE_DAY = new Date("2026-10-16T10:00:00Z");

async function openUsageOnSampleDay(page: Page) {
  await page.clock.install({ time: SAMPLE_DAY });
  await asHospitalAdmin(page);
  await openAdmin(page, "Usage");
  await expect(page).toHaveURL(/\/admin\/usage$/);
  const group = page.getByRole("region", { name: "Patient alerts" });
  await expect(group).toBeVisible();
  return group;
}

test("usage shows core's patient alert counts, with small groups hidden", async ({
  page,
}) => {
  const group = await openUsageOnSampleDay(page);
  await expect(
    group
      .getByRole("region", { name: "What happened to them" })
      .getByRole("listitem"),
  ).toHaveText([
    "Not handled yet9",
    "Acknowledged98",
    "Dismissed15",
    "Withdrawn before anyone handled it6",
  ]);
  await expect(
    group
      .getByRole("region", { name: "By kind of result" })
      .getByRole("listitem")
      .filter({ hasText: "Blood gases and lactate" }),
  ).toHaveText("Blood gases and lactateFewer than 5");
  await expect(
    group.getByRole("region", { name: "Who received them" }),
  ).toContainText("Hospital queue97");
  await page.getByLabel("Period").selectOption("last_90_days");
  await expect(
    group.getByRole("region", { name: "Who received them" }),
  ).toContainText("Hospital queue402");
});

test("the usage CSV carries the alert numbers, with small groups hidden", async ({
  page,
}) => {
  await openUsageOnSampleDay(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = readFileSync((await (await download).path())!, "utf8");
  expect(csv).toContain("Alerts: total,128\r\n");
  expect(csv).toContain("Alerts: Hospital queue,97\r\n");
  expect(csv).toContain("Alerts: Blood gases and lactate,Fewer than 5\r\n");
  expect(csv).not.toMatch(/MRN|@|\bBed\b/);
  expect(csv).not.toMatch(/patient/i);
  await expect(page.getByText("Usage exported")).toBeVisible();
});

test("give and remove the Analyst role, each with your two-step code", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. Chidi Okafor").click();
  const p = panel(page);
  const analyst = p.getByRole("checkbox", { name: "Analyst" });
  await expect(analyst).toHaveAccessibleDescription(
    /Needs the Clinician role, an active account and two-step verification/,
  );
  await analyst.check();
  await p.getByRole("button", { name: "Save changes" }).click();
  const grant = page.getByRole("dialog", { name: "Save Dr. Okafor's access?" });
  await expect(grant).toContainText(
    "Dr. Okafor will see Analysis for this hospital",
  );
  await typeCode(page, "123456", grant);
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(
    p.getByText(/gave Dr. Okafor Analyst access/).first(),
  ).toBeVisible();

  await analyst.uncheck();
  await p.getByRole("button", { name: "Save changes" }).click();
  const remove = page.getByRole("dialog", {
    name: "Save Dr. Okafor's access?",
  });
  await expect(remove).toContainText("Analysis access ends at once");
  await typeCode(page, "123456", remove);
  await expect(
    p.getByText(/removed Analyst access from Dr. Okafor/).first(),
  ).toBeVisible();

  // Someone without two-step can't be given it; the box says why.
  await p.getByRole("button", { name: "Close" }).click();
  await manage(page, "Dr. Kofi Mensah").click();
  const mensah = panel(page).getByRole("checkbox", { name: "Analyst" });
  await expect(mensah).toBeDisabled();
  await expect(mensah).toHaveAccessibleDescription(
    /need two-step verification turned on/,
  );
});
