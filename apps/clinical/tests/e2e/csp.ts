import { test as base } from "@playwright/test";

export { expect, type Locator, type Page } from "@playwright/test";

/**
 * Every clinical spec imports `test` from here: it fails any test whose page
 * logged a Content Security Policy violation, so the whole suite checks that
 * the policy in proxy.ts blocks nothing the app needs.
 */
export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const seen: string[] = [];
      page.on("console", (m) => {
        if (m.text().includes("Content Security Policy")) seen.push(m.text());
      });
      await use(seen);
      base.expect(seen, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
