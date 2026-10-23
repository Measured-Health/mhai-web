import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  TUNDE,
  expectNoStorage,
  isMobile,
  openNav,
  signIn,
  signOut,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** The bell button (visible one: the shell has a single bell). */
const bell = (page: Page) =>
  page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true });
const UNSEEN = /^Notifications, \d+ new$/;
const list = (page: Page) =>
  page.getByRole("dialog", { name: "Notifications" });

const HELP_START = "Critical-type changes are sent straight away";

test("a platform admin chooses Critical and weekly digest, and it stays after reload of the page data", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Account");
  const group = page.getByRole("radiogroup", { name: "Analytics email" });
  await expect(group.getByRole("radio", { name: "Off" })).toBeChecked();
  await expect(page.getByText(HELP_START)).toBeVisible();
  await group
    .getByRole("radio", { name: "Critical and weekly digest" })
    .check({ force: true });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Email setting saved").first()).toBeVisible();

  // Away and back: the page's data loads again (no page load, which would sign out).
  await openNav(page, "Hospitals");
  await openNav(page, "Account");
  await expect(
    page
      .getByRole("radiogroup", { name: "Analytics email" })
      .getByRole("radio", { name: "Critical and weekly digest" }),
  ).toBeChecked();
});

test("an auditor has the bell but no email setting", async ({ page }) => {
  await signIn(page, AMARA);
  await openNav(page, "Account");
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
  await expect(page.getByText("Analytics email")).toHaveCount(0);
  // The auditor still has the bell.
  await expect(bell(page)).toBeVisible();
});

test("the bell counts new changes, the list opens, and they're marked seen", async ({
  page,
}) => {
  await signIn(page, ADA);
  await expect(bell(page)).toHaveAccessibleName(UNSEEN);
  await bell(page).click();
  await expect(list(page)).toBeVisible();
  const items = list(page).getByRole("list", { name: "New usage changes" });
  await expect(items.getByRole("listitem").first()).toContainText("New");
  await expect(
    list(page).getByRole("button", { name: "Mark all seen" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list(page)).toBeHidden();
  await expect(bell(page)).toBeFocused();
  // Opening the list marked them seen.
  await expect(bell(page)).toHaveAccessibleName("Notifications");
});

test("Ada's seen doesn't clear Tunde's bell", async ({ page }) => {
  await signIn(page, ADA);
  // The count has loaded before the list opens.
  await expect(bell(page)).toHaveAccessibleName(UNSEEN);
  await bell(page).click();
  await expect(list(page)).toBeVisible();
  await page.keyboard.press("Escape");
  // Seen is saved (the count is gone) before Ada signs out.
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  await signOut(page);
  await signIn(page, TUNDE);
  await expect(bell(page)).toHaveAccessibleName(UNSEEN);
});

test("an item opens Usage on that change", async ({ page }) => {
  await signIn(page, ADA);
  await expect(bell(page)).toHaveAccessibleName(UNSEEN);
  await bell(page).click();
  await list(page)
    .getByRole("button", { name: /Critical alerts acknowledged 2× slower/ })
    .click();
  await expect(page).toHaveURL(/\/usage\?change=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Usage" }),
  ).toBeVisible();
  const words = /Critical alerts acknowledged 2× slower/;
  if (isMobile(page)) {
    // Phones open the change's detail alone.
    await expect(
      page.getByRole("heading", { level: 2, name: words }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("list", { name: "Changes" }).getByRole("button", {
        name: words,
      }),
    ).toHaveAttribute("aria-current", "true");
  }
});
