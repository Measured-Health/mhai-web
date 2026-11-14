import { expect, test } from "@playwright/test";
import { openAccountMenu } from "../e2e/helpers";
import { recordApi, reportApi, signIn } from "./live";

/** The clinician's pop-up switch is saved in core and read back after a reload. */
test("notification settings: switch alert pop-ups off and on", async ({
  page,
}) => {
  await signIn(page, "clinician");
  const calls = recordApi(page);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  const sw = page.getByRole("switch", { name: "Pop-ups for patient alerts" });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Pop-ups for patient alerts" }),
  ).not.toBeChecked();
  await page
    .getByRole("switch", { name: "Pop-ups for patient alerts" })
    .click();
  await expect(
    page.getByRole("switch", { name: "Pop-ups for patient alerts" }),
  ).toBeChecked();
  expect(reportApi("notification settings", calls)).toEqual([]);
});
