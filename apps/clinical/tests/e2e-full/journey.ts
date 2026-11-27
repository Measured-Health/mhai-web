import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { expect, type Page } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";
import { readUser, saveUser, typeCode, type LiveUser } from "./live";

/**
 * The whole product journey (scripts/it/live-full.sh journey): a hospital
 * added in the platform app, its first admin's invite accepted, staff
 * invited, questions asked and corrected, reviewed, the hospital
 * deactivated and reactivated. Each step is recorded in LIVE_OUT's
 * journey.jsonl (step, method, path, status, milliseconds; pages: whether
 * they rendered without an error state), for the run's report. Paths carry
 * opaque ids only; no body, link or code is ever recorded. Synthetic data
 * only; the same file sits in both apps' e2e-full folders.
 */
const STATE = process.env.LIVE_STATE ?? "/state";
const OUT = process.env.LIVE_OUT ?? "/out";
export const CLINICAL = "http://localhost:8080";
export const PLATFORM = "http://localhost:8081";

export const readJourney = (name: string) =>
  readFileSync(`${STATE}/journey/${name}`, "utf8").trim();
/** A link or code: 600. `shared`: an id the script reads too (644). */
export const writeJourney = (name: string, v: string, shared = false) =>
  writeFileSync(`${STATE}/journey/${name}`, v, {
    mode: shared ? 0o644 : 0o600,
  });
export const hasJourney = (name: string) =>
  existsSync(`${STATE}/journey/${name}`);

export type JourneyUser = LiveUser & { backup?: string };
export const readJ = (name: string) => readUser(name) as JourneyUser;
export const saveJ = (name: string, u: JourneyUser) => saveUser(name, u);

/** A random part for synthetic addresses and passwords (never a literal). */
export const rand = () =>
  `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
export const newPassword = () => `Journey-${rand()}-${rand()}`;

export function record(step: string, entry: Record<string, unknown>) {
  appendFileSync(
    `${OUT}/journey.jsonl`,
    `${JSON.stringify({ at: new Date().toISOString(), step, ...entry })}\n`,
  );
}

/** The step file the live helpers keep: the last 30-second step used. */
const stepFile = (name: string) => `${STATE}/users/${name}.step`;
export const markStep = (name: string) =>
  writeFileSync(stepFile(name), String(Math.floor(Date.now() / 30_000)), {
    mode: 0o600,
  });

/** A code nobody has used for this person, from `secret` (default: theirs). */
export async function codeFor(page: Page, name: string, secret?: string) {
  const last = existsSync(stepFile(name))
    ? Number(readFileSync(stepFile(name), "utf8"))
    : 0;
  if (Math.floor(Date.now() / 30_000) <= last)
    await page.waitForTimeout((last + 1) * 30_000 - Date.now() + 1500);
  markStep(name);
  return totp(secret ?? readJ(name).secret!, Date.now());
}

export type Reply = { status: number; body: unknown; ms: number };

/**
 * A call to the app's own BFF as the signed-in person (the page's
 * cookies), recorded. `origin` is the app's address.
 */
export async function call(
  page: Page,
  origin: string,
  step: string,
  method: string,
  path: string,
  data?: unknown,
): Promise<Reply> {
  const t0 = Date.now();
  const r = await page.request.fetch(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      "Idempotency-Key": crypto.randomUUID(),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    data: data === undefined ? undefined : JSON.stringify(data),
    failOnStatusCode: false,
  });
  const ms = Date.now() - t0;
  const text = await r.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const code =
    r.status() >= 400 && body && typeof body === "object"
      ? (body as { code?: unknown }).code
      : undefined;
  record(step, { kind: "api", method, path, status: r.status(), ms, code });
  return { status: r.status(), body, ms };
}

const ERROR_STATE =
  /Something went wrong|couldn't load|can't load|This entry can't be displayed|Application error|could not be found/i;

/**
 * Opens a page and records whether it rendered without an error state:
 * its status, time to network idle, error text on the page, console
 * errors and failed BFF calls (400 and up).
 */
export async function visit(
  page: Page,
  step: string,
  url: string,
  opts: { allow?: RegExp } = {},
) {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  };
  const onPageError = (e: Error) =>
    consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`);
  const onResponse = (r: {
    url(): string;
    status(): number;
    request(): { method(): string };
  }) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && r.status() >= 400)
      failed.push(`${r.status()} ${r.request().method()} ${u.pathname}`);
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  const t0 = Date.now();
  const res = await page.goto(url);
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  const ms = Date.now() - t0;
  const main = page.locator("main").first();
  const scope = (await main.count()) ? main : page.locator("body");
  const text = await scope.innerText().catch(() => "");
  const errorText = (text.match(new RegExp(ERROR_STATE.source, "gi")) ?? [])
    .filter((t) => !opts.allow?.test(t))
    .slice(0, 5);
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);
  const path = new URL(page.url()).pathname;
  record(step, {
    kind: "page",
    url: new URL(url, page.url()).pathname,
    landed: path,
    status: res?.status() ?? null,
    ms,
    errorText,
    consoleErrors,
    failed,
  });
  await page.screenshot({
    path: `${OUT}/journey-shots/${step.replace(/[^a-z0-9-]+/gi, "_")}-${path.replace(/[^a-z0-9]+/gi, "_")}.png`,
    fullPage: true,
  });
  expect.soft(errorText, `${url}: error text on the page`).toEqual([]);
  expect.soft(res?.status() ?? 0, `${url}: status`).toBeLessThan(400);
  return { errorText, consoleErrors, failed };
}

async function submitPassword(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/**
 * After an invite's link set the password: the first sign-in's two-step
 * setup, the backup code (kept) and the terms, in the app.
 */
export async function enrolAfterInvite(page: Page, name: string) {
  const u = readJ(name);
  await submitPassword(page, u.email, u.password);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText(/Protect your account/)).toBeVisible();
  await page.getByRole("button", { name: "Can't scan? Show key" }).click();
  const secret = (await page.locator("p.font-mono").innerText()).replace(
    /\s+/g,
    "",
  );
  saveJ(name, { ...u, secret });
  markStep(name);
  await typeCode(page, await totp(secret, Date.now()));
  const group = page.getByRole("group", { name: "Your backup code" });
  await expect(group).toBeVisible();
  const backup = (await group.locator("span.font-mono").innerText()).trim();
  saveJ(name, { ...u, secret, backup });
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText(/Terms of use/)).toBeVisible();
  await page.getByLabel(/I understand and agree/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).not.toHaveURL(/\/welcome$/);
}

/** Opens an invite's link and chooses a password, in the clinical app. */
export async function acceptInvite(
  page: Page,
  step: string,
  name: string,
  link: string,
) {
  const u = readJ(name);
  const next = newPassword();
  const t0 = Date.now();
  await page.goto(new URL(link, CLINICAL).toString());
  await expect(
    page.getByRole("heading", { name: "Choose your password" }),
  ).toBeVisible();
  await page.getByLabel("New password").fill(next);
  await page.getByLabel("Confirm password").fill(next);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password saved" }),
  ).toBeVisible();
  saveJ(name, { ...u, password: next });
  record(step, {
    kind: "flow",
    what: "invite link: password chosen",
    ms: Date.now() - t0,
  });
  const t1 = Date.now();
  await enrolAfterInvite(page, name);
  record(step, {
    kind: "flow",
    what: "first sign-in: two-step, backup code, terms",
    ms: Date.now() - t1,
  });
}

/** Signs in with the saved password and a fresh code; records the time. */
export async function signInJ(page: Page, step: string, name: string) {
  const u = readJ(name);
  const t0 = Date.now();
  await submitPassword(page, u.email, u.password);
  await expect(page).toHaveURL(/\/sign-in\/code$/);
  await typeCode(page, await codeFor(page, name));
  await expect(page).not.toHaveURL(/\/sign-in/);
  record(step, { kind: "flow", what: `sign in: ${name}`, ms: Date.now() - t0 });
}
