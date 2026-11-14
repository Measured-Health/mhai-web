import { test } from "@playwright/test";
import { signIn } from "./live";

/** LIVE_DEBUG=1 only: prints a few of core's replies (no patient data). */
test("debug: replies", async ({ page }) => {
  test.skip(process.env.LIVE_DEBUG !== "1", "debug only");
  await signIn(page, "padmin");
  for (const p of (
    process.env.LIVE_DEBUG_PATHS ?? "/api/v1/platform/health"
  ).split(",")) {
    const r = await page.request.get(p);
    console.log(`DEBUG ${p} ${r.status()} ${(await r.text()).slice(0, 4000)}`);
  }
});
