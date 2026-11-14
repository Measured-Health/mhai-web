import { expect, test } from "@playwright/test";
import { freshCode, recordApi, reportApi, signIn, typeCode } from "./live";

/**
 * The Analyst role from Staff, live (core 1.24.0, `PATCH
 * /hospital/staff/{id}` with step-up, migration 00030's rules): the
 * hospital admin removes the synthetic analyst's role and gives it back,
 * each with a fresh two-step code. Runs after the Analysis spec, and leaves
 * the analyst as it found them.
 */
test("analyst role: remove and give back, each with a fresh code", async ({
  page,
}) => {
  await signIn(page, "hadmin");
  const calls = recordApi(page);
  await page.goto("/admin/staff");
  await page
    .getByRole("button", { name: "Manage Synthetic analyst", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Staff member" });
  const analyst = panel.getByRole("checkbox", { name: "Analyst" });
  await expect(analyst).toBeEnabled();
  const had = await analyst.isChecked();

  const save = async (expectText: RegExp) => {
    await panel.getByRole("button", { name: "Save changes" }).click();
    const dialog = page.getByRole("dialog", { name: /access\?$/ });
    await expect(dialog).toContainText(expectText);
    await typeCode(page, await freshCode(page, "hadmin"), dialog);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Changes saved").first()).toBeVisible();
  };

  if (had) {
    await analyst.uncheck();
    await save(/Analysis access ends at once/);
    await expect(analyst).not.toBeChecked();
  }
  await analyst.check();
  await save(/will see Analysis for this hospital/);
  await expect(analyst).toBeChecked();
  if (!had) {
    await analyst.uncheck();
    await save(/Analysis access ends at once/);
  }

  await page.goto("/admin/activity");
  await expect(page.getByText(/Analyst access/).first()).toBeVisible();
  expect(reportApi("analyst role", calls)).toEqual([]);
});
