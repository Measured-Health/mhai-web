import { expect, test } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

// The synthetic patient's name and MRN are on screen: keep none in a trace,
// screenshot, video or page snapshot.
test.use({ trace: "off", screenshot: "off", video: "off" });
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const LOOKUP = "/api/v1/patients/lookup";

/**
 * "Find patient by MRN", live against core 1.29.0 with EMR on: the MRN of a
 * patient the synthetic source raised an alert for (02-alerts) is a hit;
 * an MRN nobody has is 404; the 6th lookup in a minute is 429. An MRN in
 * the address or a bad one never leaves the BFF (422). Nothing names the
 * patient in an address, the title, the console or storage.
 */
test("patient lookup: a hit, a miss, and the minute's limit", async ({
  page,
  baseURL,
}) => {
  await signIn(page, "clinician");
  const calls = recordApi(page);
  const consoleText: string[] = [];
  page.on("console", (m) => consoleText.push(m.text()));

  // A patient of the hospital, as its alert shows them.
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  const card = page.getByRole("article").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const mrn = (
    await card.locator("dt", { hasText: /^MRN$/ }).locator("+ dd").innerText()
  ).trim();
  const name = (
    await card
      .locator("dt", { hasText: /^Patient$/ })
      .locator("+ dd")
      .innerText()
  ).trim();
  expect(mrn).not.toBe("Not recorded");

  // Refused in the BFF, before core (and so never counted).
  const direct = (body: unknown, query = "") =>
    page.request.post(`${LOOKUP}${query}`, {
      headers: { Origin: baseURL! },
      data: body,
    });
  for (const [body, query] of [
    [{ mrn }, "?mrn=x"],
    [{ mrn: "20%48" }, ""],
    [{ mrn, name: "x" }, ""],
  ] as const) {
    const r = await direct(body, query);
    expect(r.status()).toBe(422);
    expect(await r.json()).toEqual({ code: "validation_failed" });
  }

  // The form: a hit fills About patient.
  await page.goto("/");
  const start = page.getByRole("button", { name: /Start a consultation/ });
  if (await start.isVisible()) await start.click();
  const box = page.getByRole("textbox", { name: "Find patient by MRN" });
  const find = async (value: string) => {
    await box.fill(value);
    await page.getByRole("button", { name: "Find", exact: true }).click();
  };
  await find(mrn);
  const about = page.getByRole("group", { name: "About patient" });
  await expect(about).toContainText(mrn.replace(/ /g, "").toUpperCase());
  await expect(about).toContainText(name);

  // A miss (1 + 4 lookups so far), then the 6th in the minute is refused.
  await about.getByRole("button", { name: /^Remove / }).click();
  for (let i = 0; i < 4; i++) {
    await find("LIVE-NO-SUCH-MRN");
    await expect(
      page.getByText("No active patient with that MRN in your hospital."),
    ).toBeVisible();
  }
  await find(mrn);
  await expect(
    page.getByText(/Too many lookups for now; try again later\./),
  ).toBeVisible();

  const statuses = calls.filter((c) => c.path === LOOKUP).map((c) => c.status);
  // (The direct calls above are page.request, not the page: not recorded.)
  expect(statuses).toEqual([200, 404, 404, 404, 404, 429]);
  expect(calls.every((c) => !c.path.includes(mrn))).toBe(true);
  expect(page.url()).not.toContain(mrn);
  expect(await page.title()).not.toContain(name);
  for (const t of consoleText) {
    expect(t).not.toContain(mrn);
    expect(t).not.toContain(name);
  }
  const stored = await page.evaluate(() => [
    localStorage.length,
    sessionStorage.length,
  ]);
  expect(stored).toEqual([0, 0]);
  expect(
    reportApi(
      "patient lookup",
      calls.filter((c) => c.path !== LOOKUP),
    ),
  ).toEqual([]);
});
