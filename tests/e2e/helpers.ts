import { expect, type Page } from "@playwright/test";
import { FORBIDDEN_TERMS } from "../../lib/labels";

// Whole-word match. Upper-case terms (NLI, PASS, KB...) are case-sensitive so
// ordinary words such as "online" or "passed" do not trip them.
export const FORBIDDEN = new RegExp(
  FORBIDDEN_TERMS.map((t) =>
    t === t.toUpperCase() ? `\\b${t}\\b` : `(?i:\\b${t}\\b)`,
  ).join("|"),
);

export const isMobile = (page: Page) =>
  (page.viewportSize()?.width ?? 1440) < 768;
export const isDesktop = (page: Page) =>
  (page.viewportSize()?.width ?? 0) >= 1024;

/** Fills the sign-in form and submits. Callers wait for "/" themselves. */
export async function signIn(page: Page, email = "a.reyes@havanahospital.org") {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** On the signed-in home page: opens the form and fills it. */
export async function fillForm(page: Page, question: string) {
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("54");
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByRole("radio", { name: /Urgent/ }).click();
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Presenting symptoms").fill("Chest pain");
  await page.getByLabel("Presenting symptoms").press("Enter");
  await page.getByLabel("Clinical question").fill(question);
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
}

export async function expectNoForbiddenWords(page: Page) {
  const visible = await page.locator("body").innerText();
  expect(visible).not.toMatch(FORBIDDEN);
  const names = await page.locator("body").ariaSnapshot();
  expect(names).not.toMatch(FORBIDDEN);
}

/**
 * Nothing in browser storage. The one exception (CONTRIBUTING) is the offline
 * outbox database, `mhai-outbox`, and only while its `items` store is empty.
 */
export async function expectNoStorage(page: Page) {
  const state = await page.evaluate(async () => {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    const others = dbs.filter((d) => d.name !== "mhai-outbox").length;
    const outboxItems = dbs.some((d) => d.name === "mhai-outbox")
      ? await new Promise<number>((resolve, reject) => {
          const open = indexedDB.open("mhai-outbox");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction("items").objectStore("items").count();
            req.onsuccess = () => {
              db.close();
              resolve(req.result);
            };
            req.onerror = () => reject(req.error);
          };
        })
      : 0;
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      idb: others,
      outboxItems,
      cookie: document.cookie,
    };
  });
  expect(state).toEqual({
    local: 0,
    session: 0,
    idb: 0,
    outboxItems: 0,
    cookie: "",
  });
}

/** The sidebar's "N waiting to send" row, visible (opens the menu on phones). */
export async function expectOutboxIndicator(page: Page, text: string) {
  if (isMobile(page)) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Menu" }).getByRole("status"),
    ).toHaveText(text);
    await page.keyboard.press("Escape");
  } else {
    await expect(page.getByText(text).filter({ visible: true })).toBeVisible();
  }
}
