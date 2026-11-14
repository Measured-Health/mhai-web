import { expect, test } from "@playwright/test";
import { freshCode, readState, recordApi, reportApi, signIn } from "./live";

/**
 * The hospital's patient alerts switch, live: the seed activates rule set
 * 0-synthetic for the hospital, so its page shows it on. Writing the same
 * rule set back (as the signed-in admin, with a fresh code, through the
 * BFF) leaves the alerts on and checks the PUT's shape and step-up.
 */
test("patient alerts: the hospital's rule set, read and written back", async ({
  page,
}) => {
  await signIn(page, "padmin");
  const calls = recordApi(page);
  const id = readState("hospital.id");
  await page.goto(`/hospitals/${id}`);
  const r = page.getByRole("region", { name: "Patient alerts", exact: true });
  await expect(r.getByText("0-synthetic")).toBeVisible();
  await expect(
    r.getByText(/MHAI sends patient alerts to .*clinicians/),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("rule-set.png"),
    fullPage: true,
  });

  const got = await page.request.get(
    `/api/v1/platform/hospitals/${id}/emr-rule-set`,
  );
  expect(got.status()).toBe(200);
  const set = (await got.json()) as Record<string, unknown>;
  expect(Object.keys(set).sort()).toEqual(
    ["activated_at", "hospital_id", "sha256", "version"].sort(),
  );
  const code = await freshCode(page, "padmin");
  const put = await page.evaluate(
    async ({ id, version, sha256, code }) => {
      const res = await fetch(`/api/v1/platform/hospitals/${id}/emr-rule-set`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ version, sha256, mfa_code: code }),
      });
      return { status: res.status, body: await res.json() };
    },
    { id, version: set.version, sha256: set.sha256, code },
  );
  expect(put.status).toBe(200);
  expect(put.body).toMatchObject({
    version: "0-synthetic",
    sha256: set.sha256,
  });
  expect(reportApi("rule set", calls)).toEqual([]);
});
