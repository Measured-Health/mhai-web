import { expect, test } from "@playwright/test";
import {
  ADA,
  CODE,
  expectNoStorage,
  toast,
  openHospital,
  signIn,
  stepUp,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

test("add a hospital, then it shows Set-up incomplete with a pending invite", async ({
  page,
}) => {
  await signIn(page, ADA);
  await page.getByRole("link", { name: "Add hospital" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Add hospital" }),
  ).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("Lakeside Hospital");
  await page.getByLabel("Short code", { exact: true }).fill("lkh");
  // Pasted with spaces and capitals: the form tidies them.
  await page
    .getByLabel("Allowed email domains")
    .fill(" Lakeside.example ,\nlakeside.example");
  await page.getByLabel("First admin name").fill("Ngozi Ade");
  await page.getByLabel("First admin email").fill("ngozi.ade@lakeside.example");
  await page.getByRole("button", { name: "Add hospital" }).click();

  await expect(
    toast(page, "Hospital added. Invite sent to ngozi.ade@lakeside.example."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/hospitals\/[A-Za-z0-9_-]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Lakeside Hospital" }),
  ).toBeVisible();

  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByText("Set-up incomplete")).toBeVisible();
  const admin = page.getByRole("region", { name: "First hospital admin" });
  await expect(admin.getByText("ngozi.ade@lakeside.example")).toBeVisible();
  await expect(admin.getByText("Pending", { exact: true })).toBeVisible();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details.getByText("LKH", { exact: true })).toBeVisible();
  await expect(
    details.getByText("lakeside.example", { exact: true }),
  ).toBeVisible();
});

test("edit details", async ({ page }) => {
  await signIn(page, ADA);
  await openHospital(page, "Riverside Children's Hospital");
  const details = page.getByRole("region", { name: "Details" });
  await details.getByRole("button", { name: "Edit" }).click();
  await details
    .getByLabel("Allowed email domains")
    .fill("riverside-children.example, RCH.example");
  await details.getByRole("button", { name: "Save" }).click();

  await expect(toast(page, "Details saved")).toBeVisible();
  await expect(details.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(
    details.getByText("riverside-children.example, rch.example"),
  ).toBeVisible();
});

test("deactivate with a wrong code, then the right one; then reactivate", async ({
  page,
}) => {
  await signIn(page, ADA);
  const name = "Riverside Children's Hospital";
  await openHospital(page, name);
  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByText("Active", { exact: true })).toBeVisible();

  await status.getByRole("button", { name: "Deactivate" }).click();
  const off = stepUp(page, `Deactivate ${name}?`);
  await expect(off).toBeVisible();
  await off.getByText("Contract ended", { exact: true }).click();
  await typeCode(page, "000000", off);
  await off.getByRole("button", { name: "Deactivate" }).click();
  await expect(
    off.getByText("That code didn't work. Try again."),
  ).toBeVisible();
  // The wrong code is cleared for the next try; nothing changed.
  await expect(off.getByLabel("Digit 1 of 6")).toHaveValue("");

  await typeCode(page, CODE, off);
  await off.getByRole("button", { name: "Deactivate" }).click();
  await expect(off).toBeHidden();
  await expect(status.getByText("Deactivated", { exact: true })).toBeVisible();
  await expect(
    status.getByText(/^Deactivated by Ada Bakare · .+ · Contract ended$/),
  ).toBeVisible();

  await status.getByRole("button", { name: "Reactivate" }).click();
  const on = stepUp(page, `Reactivate ${name}?`);
  await expect(on).toBeVisible();
  await on.getByLabel("Reason").fill("The contract was renewed.");
  await typeCode(page, CODE, on);
  await on.getByRole("button", { name: "Reactivate" }).click();
  await expect(on).toBeHidden();
  await expect(status.getByText("Active", { exact: true })).toBeVisible();
  await expect(
    status.getByRole("button", { name: "Deactivate" }),
  ).toBeVisible();
});
