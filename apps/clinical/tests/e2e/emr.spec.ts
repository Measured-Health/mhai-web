import { expect, test, type Page } from "./csp";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  openAdmin,
  openNotifications,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;
  // Nothing in storage, and no codes or technical words on screen.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

const bell = (page: Page) =>
  page
    .getByRole("button", { name: /^Notifications(, \d+ unread)?$/ })
    .filter({ visible: true });
const card = (page: Page, name: string) =>
  page.getByRole("article", { name: new RegExp(name) });
const section = (page: Page, name: string) =>
  page.getByRole("region", { name });

async function asHospitalAdmin(page: Page) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAdmin(page, "Alert settings");
  await expect(page).toHaveURL(/\/admin\/alerts$/);
  await expect(section(page, "Units covered")).toBeVisible();
}

test("a hospital admin covers Ward 7, sets Vital signs to Critical and urgent, and saves; Activity lists all three", async ({
  page,
}) => {
  await asHospitalAdmin(page);

  const units = section(page, "Units covered");
  await units.getByRole("checkbox", { name: /^Ward 7/ }).check();
  await units.getByRole("button", { name: "Save", exact: true }).click();
  await expect(units.getByRole("status")).toHaveText("Saved");

  const rules = section(page, "What to flag");
  await rules
    .getByLabel("Vital signs")
    .selectOption({ label: "Critical and urgent" });
  await rules.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rules.getByRole("status")).toHaveText("Saved");

  const who = section(page, "Who gets alerts");
  await who.getByRole("combobox", { name: "Add clinician" }).fill("Adeyemi");
  await page.getByRole("option", { name: /Adeyemi/ }).click();
  await who.getByRole("button", { name: "Save", exact: true }).click();
  await expect(who.getByRole("status")).toHaveText("Saved");

  // The saved choices are what the page now shows.
  await expect(units.getByRole("checkbox", { name: /^Ward 7/ })).toBeChecked();
  await expect(rules.getByLabel("Vital signs")).toHaveValue("critical_urgent");

  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  for (const words of [
    "Changed which units alerts cover",
    "Changed what alerts flag",
    "Changed who gets alerts",
  ])
    await expect(page.getByText(words).first()).toBeVisible();
});

test("Who gets alerts can't be saved empty", async ({ page }) => {
  await asHospitalAdmin(page);
  const who = section(page, "Who gets alerts");
  await who.getByRole("switch", { name: "Hospital queue" }).click();
  // Take away everyone who was named, too.
  await who
    .getByRole("button", { name: /^Remove / })
    .first()
    .click();
  await who
    .getByRole("button", { name: /^Remove / })
    .first()
    .click();
  await expect(who.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(
    who.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(
    who.getByText(
      "Choose the hospital queue, at least one clinician, or both.",
    ),
  ).toBeVisible();
  // Turning the queue back on makes it savable again.
  await who.getByRole("switch", { name: "Hospital queue" }).click();
  await expect(
    who.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
});

test("a clinician sees evidence under a likely cause, the For you tag, and filters to the hospital queue", async ({
  page,
}) => {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openNotifications(page);

  const mine = card(page, "Maryam Abdullahi");
  await expect(mine.getByText("For you", { exact: true })).toBeVisible();
  await expect(
    mine.getByRole("list", { name: "Evidence for Diuretic treatment" }),
  ).toContainText("Furosemide 40 mg daily");
  // No address bar leak.
  expect(page.url()).not.toMatch(/Maryam|204817/);

  const sentTo = page.getByRole("group", { name: "Sent to" });
  await sentTo.getByRole("button", { name: "Hospital queue" }).click();
  await expect(card(page, "Ibrahim Danladi")).toBeVisible();
  await expect(
    card(page, "Ibrahim Danladi").getByText("Hospital queue", { exact: true }),
  ).toBeVisible();
  await expect(card(page, "Maryam Abdullahi")).toHaveCount(0);
});

test("a queue-only Urgent arrival counts on the bell without a pop-up", async ({
  page,
}) => {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 6 unread");

  // Arrivals alternate: for you, then queue-only. The fourth is a
  // queue-only Urgent one. Let the first three come and their pop-ups go.
  await page.clock.fastForward("02:30");
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward("02:00");
  await expect(
    page.getByText("Critical patient alert", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward("02:00");
  await expect(bell(page)).toHaveAccessibleName("Notifications, 9 unread");
  // Pop-ups last 12 seconds (Critical ones stay), so move on past them.
  await page.clock.fastForward("00:20");
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toHaveCount(0);

  await page.clock.fastForward("02:00"); // the queue-only Urgent one
  await expect(bell(page)).toHaveAccessibleName("Notifications, 10 unread");
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toHaveCount(0);
  // It is on the bell's list, marked as the hospital queue.
  await bell(page).click();
  await expect(
    page.getByRole("region", { name: "Recent notifications" }),
  ).toContainText("Hospital queue");
  await page.keyboard.press("Escape");
});
