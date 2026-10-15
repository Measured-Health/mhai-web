import { expect, test } from "@playwright/test";
import {
  expectNoStorage,
  expectOutboxIndicator,
  fillForm,
  isMobile,
  signIn,
} from "./helpers";

// Offline, a client navigation to another page can't load (its server
// request fails and the browser shows its own offline page), so "Waiting to
// send" shows in place on the home page at /?waiting=local-…
test("a question asked offline waits on the device, then syncs and is analysed", async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await fillForm(page, "Central chest pain for 40 minutes. Likely diagnosis?");
  await context.setOffline(true);
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(page).toHaveURL(/\/\?waiting=local-/);
  await expect(
    page.getByRole("heading", { name: "Waiting to send" }),
  ).toBeVisible();
  await expectOutboxIndicator(page, "1 waiting to send");
  // Stored, but not as readable text.
  const raw = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open("mhai-outbox");
        open.onsuccess = () => {
          const req = open.result
            .transaction("items")
            .objectStore("items")
            .getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(
              JSON.stringify(req.result, (_k, v) =>
                v instanceof ArrayBuffer || ArrayBuffer.isView(v)
                  ? new TextDecoder().decode(v)
                  : v,
              ),
            );
          };
        };
      }),
  );
  expect(raw).toContain("idempotencyKey");
  expect(raw).not.toMatch(/chest pain|a\.reyes|likely diagnosis/i);
  await context.setOffline(false);
  await expect(page).toHaveURL(/\/c\/(?!local-)[^/?]+$/, { timeout: 30_000 });
  await expect(
    page.getByRole("status", {
      name: /High confidence|Use with caution|Needs review/,
    }),
  ).toBeVisible({ timeout: 60_000 });
  await expectNoStorage(page);
});

test("unsent work survives closing the tab, and syncs at the next sign-in", async ({
  page,
  context,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await fillForm(page, "Central chest pain for 40 minutes. Likely diagnosis?");
  await context.setOffline(true);
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting to send" }),
  ).toBeVisible();
  let asked = false;
  page.on("dialog", (d) => {
    asked = d.type() === "beforeunload";
    void d.accept();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(asked).toBe(true);
  await context.setOffline(false);
  const again = await context.newPage();
  await signIn(again);
  await expect(again).toHaveURL(/\/$/);
  // Synced: in history under its real id (on phones, history is in the menu).
  if (isMobile(again))
    await again.getByRole("button", { name: "Open menu" }).click();
  const link = again
    .getByRole("link", { name: /Chest pain, 54 M/ })
    .filter({ visible: true });
  await expect(link).toHaveAttribute("href", /^\/c\/(?!local-)/, {
    timeout: 30_000,
  });
  await expect.poll(() => expectNoStorage(again).then(() => true)).toBe(true);
});
