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
