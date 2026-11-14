import { expect, test } from "@playwright/test";
import { readState, recordApi, reportApi, signIn } from "./live";

/**
 * The auditor reveal, live, after the clinical analysis spec opened a
 * de-identified list: its audit entry, found by id (core sends it as the
 * bare entry until its facts are agreed, so the Analysis type filter
 * doesn't find it yet), then Reveal patients, recorded. Only an auditor
 * reveals (the app's rule; core also lets a platform admin).
 */
test("audit: reveal a drill-down's patients", async ({ page }) => {
  const id = readState("drill.audit-id");
  test.skip(!/^[1-9]\d*$/.test(id), "no drill-down was opened");
  await signIn(page, "auditor");
  const calls = recordApi(page);
  await page
    .getByRole("navigation", { name: "Platform" })
    .getByRole("link", { name: "Audit log", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Audit log" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search by exact id" }).fill(id);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const row = page.getByRole("main").getByRole("row").nth(1);
  await expect(row).toBeVisible();
  await row.getByRole("button").first().click();
  await expect(page.getByText(/^Patients: \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Reveal patients" }).click();
  await page
    .getByRole("dialog", { name: "Reveal these patients?" })
    .getByRole("button", { name: "Reveal patients" })
    .click();
  const ids = page.getByRole("list", { name: "Patient ids" });
  await expect(ids.getByRole("listitem").first()).toHaveText(
    /^P-[A-Z0-9]{4,12}$/,
  );
  await expect(page.getByText("Shown to you and recorded.")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("reveal.png"),
    fullPage: true,
  });
  expect(reportApi("reveal", calls)).toEqual([]);
});
