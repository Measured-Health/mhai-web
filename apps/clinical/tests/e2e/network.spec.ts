import { expect, test } from "./csp";
import { fillForm, signIn } from "./helpers";

test.setTimeout(240_000);

test("the whole flow works on a slow 3G connection", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  // About "Slow 3G": 400 kbit/s each way and 400 ms latency.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: 50 * 1024,
    uploadThroughput: 50 * 1024,
  });
  await signIn(page);
  await expect(page).toHaveURL(/\/$/, { timeout: 90_000 });
  await fillForm(page, "Central chest pain for 40 minutes. Likely diagnosis?");
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(
    page.getByRole("status", { name: /High confidence/ }),
  ).toBeVisible({
    timeout: 120_000,
  });
});
