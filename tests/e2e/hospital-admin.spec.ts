import { expect, test, type Page } from "@playwright/test";
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
    page.getByRole("button", { name: /^Decisions on your corrections/ }),
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

test("a new hospital admin accepts the terms, sets a password and two-step, then lands on Staff", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.newAdmin);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("I understand and agree to use MHAI this way").check();
  await page.getByRole("button", { name: "Continue" }).click();
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
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Kofi Mensah")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
});

test("invite one person", async ({ page }) => {
  await asHospitalAdmin(page);
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite staff" });
  await dialog.getByLabel("Work emails").fill("o.new@havanahospital.org");
  await dialog.getByRole("button", { name: "Send 1 invite" }).click();
  await expect(page.getByText("Invite sent", { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(manage(page, "o.new@havanahospital.org")).toBeVisible();
});

test("invite people from a pasted list", async ({ page }) => {
  await asHospitalAdmin(page);
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite staff" });
  await dialog
    .getByLabel("Work emails")
    .fill(
      "a.new@havanahospital.org, B.New@havanahospital.org\nk.mensah@havanahospital.org",
    );
  await expect(
    dialog.getByText("k.mensah@havanahospital.org — Already on the staff list"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Send 2 invites" }).click();
  await expect(page.getByText("2 invites sent")).toBeVisible();
  await expect(manage(page, "a.new@havanahospital.org")).toBeVisible();
  await expect(manage(page, "b.new@havanahospital.org")).toBeVisible();
});

test("deactivate after confirming, then reactivate", async ({ page }) => {
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
  await confirm
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(page.getByText("Account deactivated")).toBeVisible();
  await expect(p.getByText("Deactivated", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByText("Account reactivated")).toBeVisible();
  await expect(p.getByText("Active", { exact: true })).toBeVisible();
});

test("remove an account with your two-step code, after a wrong one", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. James Eze").click();
  await panel(page)
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Remove this account?" });
  await expect(confirm).toContainText(
    "Dr. James Eze (j.eze@havanahospital.org)",
  );
  await expect(
    confirm.getByRole("button", { name: "Keep account" }),
  ).toBeFocused();
  // Nothing to confirm until a full code is in.
  await expect(
    confirm.getByRole("button", { name: "Remove account" }),
  ).toBeDisabled();

  // A wrong code keeps the dialog open and the person on the list.
  await typeCode(page, "000000", confirm);
  await expect(
    confirm.getByText("That code didn't work. Try again."),
  ).toBeVisible();
  await expect(confirm).toBeVisible();
  await expect(manage(page, "Dr. James Eze")).toHaveCount(1);

  // The sixth digit of the right code submits on its own.
  await typeCode(page, "123456", confirm);
  await expect(page.getByText("Account removed")).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
  await expect(manage(page, "Dr. James Eze")).toHaveCount(0);
});

test("cancel an invite with your two-step code", async ({ page }) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. Funmi Adeyemi").click();
  await panel(page)
    .getByRole("button", { name: "Cancel invite", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Cancel this invite?" });
  await expect(
    confirm.getByRole("button", { name: "Keep invite" }),
  ).toBeFocused();
  await typeCode(page, "123456", confirm);
  await expect(page.getByText("Invite cancelled")).toBeVisible();
  await expect(manage(page, "Dr. Funmi Adeyemi")).toHaveCount(0);
});

test("can't deactivate or remove yourself", async ({ page }) => {
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
    p.getByText(
      "You can't deactivate your own account. Ask another hospital admin.",
    ),
  ).toBeVisible();
  const remove = p.getByRole("button", { name: "Remove", exact: true });
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAccessibleDescription(
    "You can't remove your own account. Ask another hospital admin.",
  );
  await expect(
    p.getByRole("checkbox", { name: "Hospital admin" }),
  ).toBeDisabled();
});

test("change and save hospital settings", async ({ page }) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Hospital settings");
  await expect(page).toHaveURL(/\/admin\/settings$/);
  const trust = page.getByRole("switch", { name: 'Allow "trust this device"' });
  await expect(trust).toBeChecked();
  await trust.click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await openAdmin(page, "Staff");
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAdmin(page, "Hospital settings");
  await expect(
    page.getByRole("switch", { name: 'Allow "trust this device"' }),
  ).not.toBeChecked();
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

test("the activity log flags security events and exports a CSV", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(
    page.getByText("5 failed sign-ins for Dr. Bello · account locked"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Flagged only" }).click();
  await expect(page.getByText("Alert", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^havana-hospital-activity-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await expect(page.getByText("Activity exported")).toBeVisible();
});

test("review oversight: remind and assign, without clinical content", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Activity");
  await page.getByRole("link", { name: /^Review oversight/ }).click();
  await expect(page).toHaveURL(/\/admin\/activity\/oversight$/);
  await page
    .getByRole("button", { name: "Remind reviewers about C-117" })
    .click();
  await expect(page.getByText("Reviewers reminded")).toBeVisible();
  await page
    .getByRole("button", { name: "Assign a reviewer to C-118" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Assign a reviewer" });
  await dialog.getByRole("radio", { name: /Dr. Udo/ }).check();
  await dialog.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Assigned to Dr. Udo")).toBeVisible();
  await expect(
    page.getByText("Only clinicians can approve or reject corrections."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Approve|Reject/ }),
  ).toHaveCount(0);
});
