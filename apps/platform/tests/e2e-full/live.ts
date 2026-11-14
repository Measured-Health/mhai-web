import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";

/**
 * Helpers for the full live check (scripts/it/live-full.sh). The users are
 * synthetic, made by the script with a temporary password; the setup spec
 * does each first sign-in in the app and keeps the new password and the
 * two-step secret in the state folder (mode 600, on the build server only).
 */
const STATE = process.env.LIVE_STATE ?? "/state";

export type LiveUser = { email: string; password: string; secret?: string };

const file = (name: string) => `${STATE}/users/${name}.json`;
export const readUser = (name: string): LiveUser =>
  JSON.parse(readFileSync(file(name), "utf8")) as LiveUser;
export const saveUser = (name: string, u: LiveUser) =>
  writeFileSync(file(name), JSON.stringify(u), { mode: 0o600 });
export const enrolled = (name: string) =>
  existsSync(file(name)) && !!readUser(name).secret;
export const readState = (name: string) =>
  readFileSync(`${STATE}/${name}`, "utf8").trim();

/**
 * A two-step code nobody has used: one per 30-second step per person,
 * across tests (core refuses a code used before).
 */
export async function freshCode(page: Page, name: string): Promise<string> {
  const u = readUser(name);
  const stepFile = `${STATE}/users/${name}.step`;
  const last = existsSync(stepFile)
    ? Number(readFileSync(stepFile, "utf8"))
    : 0;
  const step = () => Math.floor(Date.now() / 30_000);
  if (step() <= last)
    await page.waitForTimeout((last + 1) * 30_000 - Date.now() + 1500);
  writeFileSync(stepFile, String(step()), { mode: 0o600 });
  return totp(u.secret!, Date.now());
}

/** Types a 6-digit code into the code boxes inside `scope`. */
export async function typeCode(
  page: Page,
  code: string,
  scope: Pick<Page, "getByLabel"> = page,
) {
  await scope.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(code);
}

async function submitPassword(page: Page, u: LiveUser, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(u.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The whole first sign-in: password, two-step, backup codes, terms. */
export async function firstSignIn(page: Page, name: string) {
  const u = readUser(name);
  const next = `Live-second-${Math.random().toString(36).slice(2)}${Date.now()}`;
  await submitPassword(page, u, u.password);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel("Temporary password").fill(u.password);
  await page.getByLabel("New password").fill(next);
  await page.getByLabel("Confirm password").fill(next);
  await page.getByRole("button", { name: "Save password" }).click();
  saveUser(name, { email: u.email, password: next });
  await expect(page.getByText(/Protect your account/)).toBeVisible();
  await page.getByRole("button", { name: "Can't scan? Show key" }).click();
  const secret = (await page.locator("p.font-mono").innerText()).replace(
    /\s+/g,
    "",
  );
  saveUser(name, { email: u.email, password: next, secret });
  writeFileSync(
    `${STATE}/users/${name}.step`,
    String(Math.floor(Date.now() / 30_000)),
    { mode: 0o600 },
  );
  await typeCode(page, await totp(secret, Date.now()));
  await expect(page.getByRole("list", { name: "Backup codes" })).toBeVisible();
  await page.getByLabel("I've saved these codes somewhere safe").check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText(/Terms of use/)).toBeVisible();
  await page.getByLabel(/I understand and agree/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).not.toHaveURL(/\/welcome$/);
}

/** Signs in with the saved password and a fresh two-step code. */
export async function signIn(page: Page, name: string) {
  const u = readUser(name);
  await submitPassword(page, u, u.password);
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await typeCode(page, await freshCode(page, name));
  await expect(page).not.toHaveURL(/\/sign-in/);
}

export type ApiCall = { method: string; path: string; status: number };

/**
 * Every call the page makes to its own BFF (/api/...), with its status:
 * the evidence for a contract mismatch (a 404 shape, a 422, a 502 from a
 * strict reader). Paths hold opaque ids and filters only.
 */
export function recordApi(page: Page): ApiCall[] {
  const calls: ApiCall[] = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    calls.push({
      method: r.request().method(),
      path: u.pathname + u.search,
      status: r.status(),
    });
  });
  return calls;
}

/**
 * Calls core doesn't serve yet, made by a part of the page that isn't the
 * path under test: printed as GAP, never a failure of the path. A route
 * core registers but doesn't do yet answers 501 `not_implemented` (core
 * 1.26.0), which the app shows as a calm Not available yet. Each is listed
 * in docs/live-e2e.md.
 */
const KNOWN_GAPS: readonly RegExp[] = [
  // The platform bell (501 in core 1.26.0).
  /^\/api\/v1\/platform\/notifications$/,
  // Platform settings (501 in core 1.26.0).
  /^\/api\/v1\/platform\/settings$/,
  // Named access (501 in core 1.26.0).
  /^\/api\/v1\/platform\/named-access$/,
  // The sidebar's Analysis across hospitals status: core serves it (1.25.0),
  // but this app's BFF answers 404 while Analysis isn't signed off
  // (ANALYSIS_SIGNED_OFF), as live-full.sh runs it.
  /^\/api\/v1\/platform\/analysis\/status$/,
];

/** Prints the failed calls (status 400 and up), for the run's log; returns those that count. */
export function reportApi(title: string, calls: ApiCall[]) {
  const bad = calls.filter((c) => c.status >= 400);
  const gap = (c: ApiCall) =>
    (c.status === 404 || c.status === 501) &&
    KNOWN_GAPS.some((r) => r.test(c.path));
  for (const c of bad)
    console.log(
      `${gap(c) ? "GAP" : "API"} ${title}: ${c.status} ${c.method} ${c.path}`,
    );
  return bad.filter((c) => !gap(c));
}
