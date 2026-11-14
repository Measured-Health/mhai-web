import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  CODE,
  expectNoStorage,
  toast,
  isMobile,
  openNav,
  signIn,
  stepUp,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

const OWN_ROW_NOTE =
  "You can't change your own role or remove yourself. Another platform admin can.";

/** One member's row (a table row on desktop, a card on phones). */
const member = (page: Page, name: string) =>
  page.getByRole(isMobile(page) ? "listitem" : "row").filter({ hasText: name });

test("team: invites aren't available yet; change role and remove need a code; your own row can't be changed", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Team");
  await expect(page.getByText("6 team members shown")).toBeAttached();

  // Your own row: read-only, with the reason.
  const you = member(page, "Ada Bakare");
  await expect(you.getByText("(you)")).toBeVisible();
  await expect(you.getByText(OWN_ROW_NOTE)).toBeVisible();
  await expect(you.getByRole("button")).toHaveCount(0);

  // Invite: core keeps no invites yet, so a calm Not available yet.
  await page.getByRole("button", { name: "Invite team member" }).click();
  const invite = page.getByRole("dialog", { name: "Invite a team member" });
  await invite.getByLabel("Name").fill("Femi Ojo");
  await invite.getByLabel("Email").fill("femi.ojo@measured-health.example");
  await invite.getByRole("button", { name: "Send invite" }).click();
  await expect(invite.getByText("Not available yet")).toBeVisible();
  await expect(invite.getByRole("alert")).toHaveCount(0);
  await invite.getByRole("button", { name: "Cancel" }).click();
  await expect(invite).toBeHidden();
  await expect(member(page, "Femi Ojo")).toHaveCount(0);
  // Everyone is active: no invites.
  await expect(page.getByText("Invite pending")).toHaveCount(0);

  // Change role: with your own code; their sessions end.
  await page
    .getByRole("button", { name: "Change role for Tunde Okafor" })
    .click();
  const role = page.getByRole("dialog", {
    name: "Change role for Tunde Okafor",
  });
  await role.getByText("Auditor", { exact: true }).click();
  await expect(
    role.getByText(
      "Their sessions end at once: they sign in again with the new role.",
    ),
  ).toBeVisible();
  await role.getByRole("button", { name: "Continue" }).click();
  const confirmRole = stepUp(page, "Make Tunde Okafor an auditor?");
  await typeCode(page, CODE, confirmRole);
  await confirmRole.getByRole("button", { name: "Change role" }).click();
  await expect(confirmRole).toBeHidden();
  await expect(toast(page, "Role changed")).toBeVisible();
  await expect(
    page
      .getByText("Tunde Okafor is now an auditor. They sign in again.")
      .first(),
  ).toBeVisible();
  await expect(
    member(page, "Tunde Okafor").getByText("Auditor", { exact: true }),
  ).toBeVisible();

  // Remove, with your own code.
  await page.getByRole("button", { name: "Remove Kemi Lawal" }).click();
  const remove = stepUp(page, "Remove Kemi Lawal?");
  await expect(
    remove.getByText("Kemi Lawal loses platform access at once."),
  ).toBeVisible();
  await typeCode(page, CODE, remove);
  await remove.getByRole("button", { name: "Remove" }).click();
  await expect(remove).toBeHidden();
  await expect(
    page.getByText("Kemi Lawal no longer has platform access.").first(),
  ).toBeVisible();
  await expect(toast(page, "Team member removed")).toBeVisible();
  await expect(member(page, "Kemi Lawal")).toHaveCount(0);
  await expect(page.getByText("5 team members shown")).toBeAttached();

  // Still no way to change your own row.
  await expect(
    page.getByRole("button", { name: "Change role for Ada Bakare" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove Ada Bakare" }),
  ).toHaveCount(0);
});
