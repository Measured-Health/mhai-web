import { test } from "@playwright/test";
import { signIn } from "./live";

/** LIVE_DEBUG=1 only: prints a few of core's replies (synthetic data only). */
test("debug: replies", async ({ page }) => {
  test.skip(process.env.LIVE_DEBUG !== "1", "debug only");
  await signIn(page, process.env.LIVE_DEBUG_USER ?? "analyst");
  for (const p of (process.env.LIVE_DEBUG_PATHS ?? "")
    .split(",")
    .filter(Boolean)) {
    const r = await page.request.get(p);
    console.log(`DEBUG ${p} ${r.status()} ${(await r.text()).slice(0, 6000)}`);
  }
});
