import { expect, test } from "@playwright/test";

test("the sign-in page loads with the CSP header and no console CSP errors", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (m) => messages.push(m.text()));
  page.on("pageerror", (e) => messages.push(e.message));

  const response = await page.goto("/sign-in");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("'nonce-");
  await expect(
    page.getByRole("heading", { name: "Sign in to MHAI Platform" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="mhai-app"]')).toHaveAttribute(
    "content",
    "mhai-platform-app",
  );
  // Let hydration and any late chunks run before checking the console.
  await page.waitForLoadState("networkidle");

  expect(messages.filter((m) => m.includes("Content Security Policy"))).toEqual(
    [],
  );
});
