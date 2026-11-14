import { expect, test } from "@playwright/test";
import { fillForm } from "../e2e/helpers";
import { recordApi, reportApi, signIn } from "./live";

/** A clinician asks a question, sees the answer and who drafted it, and agrees with it. */
test("ask: the answer, its drafted-by label, and feedback", async ({
  page,
}) => {
  await signIn(page, "clinician");
  const calls = recordApi(page);
  await fillForm(
    page,
    "Synthetic live question: chest pain 40 minutes, what to rule out?",
  );
  await page.getByRole("button", { name: /Analyse/ }).click();
  const result = page.getByRole("heading", { name: "Clinical assessment" });
  const failed = page.getByRole("heading", {
    name: "We couldn't complete this one",
  });
  await expect(result.or(failed)).toBeVisible({ timeout: 180_000 });
  await page.screenshot({
    path: test.info().outputPath("result.png"),
    fullPage: true,
  });
  await expect(result).toBeVisible();
  await expect(
    page.getByRole("article").getByText(/^Drafted by /),
  ).toBeVisible();
  // Feedback: agree with the answer.
  await page.getByRole("button", { name: /I agree/ }).click();
  await expect(page.getByText(/your agreement was recorded/)).toBeVisible();
  // It is listed under My feedback.
  await page.goto("/my-feedback");
  await page.waitForLoadState("networkidle");
  expect(reportApi("ask", calls)).toEqual([]);
});

/**
 * A question's linked patient against core 1.22.0 with EMR on: a patient id
 * that names no active patient of the hospital is core's 404 `not_found`
 * (the same answer for unknown, another hospital's, excluded or merged);
 * a malformed one never leaves the BFF (422). Synthetic ids only.
 */
test("ask: a linked patient core doesn't know is 404; a malformed one 422", async ({
  page,
  baseURL,
}) => {
  await signIn(page, "clinician");
  const ask = (patient_id: unknown) =>
    page.request.post("/api/v1/queries", {
      headers: {
        Origin: baseURL!,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: {
        patient_data: { age: 54, sex: "male", symptoms: ["Chest pain"] },
        clinical_question: "Synthetic live question: linked patient check.",
        urgency: "routine",
        patient_id,
      },
    });
  const unknown = await ask(crypto.randomUUID());
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toEqual({ code: "not_found" });
  for (const bad of ["SYN-0001", crypto.randomUUID().toUpperCase()]) {
    const r = await ask(bad);
    expect(r.status()).toBe(422);
    expect(await r.json()).toEqual({ code: "validation_failed" });
  }
});
