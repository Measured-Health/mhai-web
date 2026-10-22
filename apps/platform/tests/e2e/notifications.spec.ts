import { expect, test } from "@playwright/test";
import { ADA, AMARA, expectNoStorage, openNav, signIn } from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

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
});

test.fixme("an auditor has the bell (enable once the bell is merged)", async ({
  page,
}) => {
  await signIn(page, AMARA);
  await expect(
    page.getByRole("button", { name: /^Notifications/ }).filter({
      visible: true,
    }),
  ).toBeVisible();
});
