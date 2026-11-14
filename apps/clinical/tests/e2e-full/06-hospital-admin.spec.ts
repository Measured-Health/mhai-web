import { expect, test } from "@playwright/test";
import { freshCode, recordApi, reportApi, signIn, typeCode } from "./live";

/**
 * The hospital admin pages on core's routes (OpenAPI 1.24.0), live: every
 * reply passes the strict readers (a mismatch would be a 502), the staff
 * list and its panel open, and a settings edit that loosens sign-in goes
 * through with a fresh two-step code (step-up), then is put back.
 */
test("hospital admin: staff, settings with step-up, usage and activity", async ({
  page,
}) => {
  await signIn(page, "hadmin");
  const calls = recordApi(page);

  await page.goto("/admin/staff");
  const manage = page.getByRole("button", { name: /^Manage Synthetic / });
  await expect(manage.first()).toBeVisible();
  await expect(
    page.getByText(/Inviting staff: Not available yet/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage Synthetic clinician", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Staff member" });
  await expect(panel.getByRole("region", { name: "Account" })).toBeVisible();
  await expect(
    panel.getByText("Reviews corrections in every specialty."),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();

  await page.goto("/admin/settings");
  const idle = page.getByLabel("Sign out after inactivity");
  await expect(idle).toBeVisible();
  const before = await idle.inputValue();
  const options = await idle
    .locator("option")
    .evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
  const longer = options.find((v) => Number(v) > Number(before));
  const shorter = [...options]
    .reverse()
    .find((v) => Number(v) < Number(before));
  test.skip(!longer && !shorter, "only one idle timeout is allowed");
  if (longer) {
    // A longer timeout loosens sign-in: core asks for the code.
    await idle.selectOption(longer);
    await page.getByRole("button", { name: "Save changes" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Save settings that loosen sign-in?",
    });
    await typeCode(page, await freshCode(page, "hadmin"), confirm);
    await expect(page.getByText("Settings saved")).toBeVisible();
    await expect(confirm).toHaveCount(0);
    // Back again: tightening needs no code.
    await idle.selectOption(before);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved").first()).toBeVisible();
  } else {
    await idle.selectOption(shorter!);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    await idle.selectOption(before);
    await page.getByRole("button", { name: "Save changes" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Save settings that loosen sign-in?",
    });
    await typeCode(page, await freshCode(page, "hadmin"), confirm);
    await expect(confirm).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByLabel("Sign out after inactivity")).toHaveValue(
    before,
  );

  await page.goto("/admin/usage");
  await expect(page.getByText("Consultations", { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("usage.png"),
    fullPage: true,
  });

  await page.goto("/admin/activity");
  await expect(
    page.getByText("Changed hospital settings").first(),
  ).toBeVisible();

  await page.goto("/admin/activity/oversight");
  await expect(
    page.getByText(/Reminding or assigning reviewers: not available yet/),
  ).toBeVisible();

  await expect(
    page.getByText(/Something went wrong|couldn't load|Couldn't load/i),
  ).toHaveCount(0);
  expect(reportApi("hospital admin", calls)).toEqual([]);
});
