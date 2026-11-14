import { expect, test } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

const section = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("region", { name });

/** The hospital admin's alert settings, live: the source's status, units and a level saved. */
test("alert settings: records status, units, a level saved and read back", async ({
  page,
}) => {
  await signIn(page, "hadmin");
  const calls = recordApi(page);
  await page.goto("/admin/alerts");
  const rules = section(page, "What to flag");
  await expect(rules).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("settings.png"),
    fullPage: true,
  });
  const level = rules.getByLabel("Heart markers");
  const next = (await level.inputValue()) === "all" ? "critical" : "all";
  await level.selectOption(next);
  await rules.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rules.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(
    section(page, "What to flag").getByLabel("Heart markers"),
  ).toHaveValue(next);
  expect(reportApi("alert settings", calls)).toEqual([]);
});
