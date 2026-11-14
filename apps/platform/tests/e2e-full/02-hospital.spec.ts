import { expect, test } from "@playwright/test";
import { readState, recordApi, reportApi, signIn } from "./live";

/** Hospitals and one hospital's page with its AI model policy, live. */
test("hospitals: the list, the live hospital, its model policy", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, "padmin");
  const calls = recordApi(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hospitals" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: test.info().outputPath("hospitals.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: /^Synthetic Live Hospital/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Synthetic Live Hospital" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/AI model/i).first()).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("hospital.png"),
    fullPage: true,
  });
  expect(reportApi("hospitals", calls)).toEqual([]);
});

/**
 * The model policy through the BFF, live: its screen is on the hospital's
 * page, which core can't serve yet (no GET /platform/hospitals/{id}), so
 * the call the section makes is made directly, as the signed-in admin.
 */
test("model policy: the hospital's policy through the BFF", async ({ page }) => {
  await signIn(page, "padmin");
  const id = readState("hospital.id");
  const r = await page.request.get(`/api/v1/platform/hospitals/${id}/model-policy`);
  expect(r.status()).toBe(200);
  const p = (await r.json()) as Record<string, unknown>;
  expect(Object.keys(p).sort()).toEqual(
    [
      "agreement_ref",
      "cloud_provider",
      "hospital_id",
      "monthly_token_budget",
      "provider_code",
      "updated_at",
      "usage",
    ].sort(),
  );
  expect(p.hospital_id).toBe(id);
});
