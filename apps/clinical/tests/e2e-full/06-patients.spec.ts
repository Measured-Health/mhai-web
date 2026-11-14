import { expect, test } from "@playwright/test";
import { freshCode, recordApi, reportApi, signIn, typeCode } from "./live";

// The synthetic patients' names may be on screen: keep none in a trace,
// screenshot, video or page snapshot.
test.use({ trace: "off", screenshot: "off", video: "off" });
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

/** Patient matches, live: the list reads strictly (no 502), whatever it holds. */
test("patient matches: the hospital's list loads", async ({ page }) => {
  await signIn(page, "hadmin");
  const calls = recordApi(page);
  await page.goto("/admin/patient-matches");
  await expect(
    page
      .getByText("No possible matches are waiting.")
      .or(page.getByRole("list", { name: "Possible matches" })),
  ).toBeVisible();
  await expect(page.getByText("Couldn't load patient matches")).toHaveCount(0);
  expect(
    calls.some(
      (c) => c.path === "/api/v1/hospital/patient-matches" && c.status === 200,
    ),
  ).toBe(true);
  expect(reportApi("patient matches", calls)).toEqual([]);
});

/**
 * Patient exclusions, live, without excluding anyone: an MRN no patient has
 * is refused (404) before the code is checked, and says so in plain words.
 */
test("patient exclusions: an unknown MRN says no patient was found", async ({
  page,
}) => {
  await signIn(page, "hadmin");
  const calls = recordApi(page);
  await page.goto("/admin/patient-exclusions");
  await page.getByLabel("The patient's MRN").fill("LIVE-NO-SUCH-MRN");
  await page.getByRole("radio", { name: "Another reason" }).check();
  await page.getByRole("button", { name: "Exclude patient…" }).click();
  const dialog = page.getByRole("dialog", { name: "Exclude this patient?" });
  await typeCode(page, await freshCode(page, "hadmin"), dialog);
  await expect(dialog.getByText("No patient found")).toBeVisible();
  const excl = calls.filter(
    (c) => c.path === "/api/v1/hospital/patient-exclusions",
  );
  expect(excl.map((c) => c.status)).toEqual([404]);
  expect(
    reportApi("patient exclusions", calls).filter((c) => c !== excl[0]),
  ).toEqual([]);
});
