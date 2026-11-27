import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  CLINICAL,
  PLATFORM,
  call,
  codeFor,
  readJ,
  readJourney,
  record,
  signInJ,
  visit,
} from "./journey";

/**
 * Journey, part C (scripts/it/live-full.sh journey), after the clinical
 * part: the platform admin's view of the new hospital (its page, usage,
 * the audit log with every entry displayable, the integrity check, the
 * activity feed, jobs), then deactivating it with a step-up code (its
 * staff signed out and refused) and reactivating it.
 */

const api = (
  page: Page,
  step: string,
  method: string,
  path: string,
  data?: unknown,
) => call(page, PLATFORM, step, method, path, data);
const clinical = async (browser: Browser) =>
  (await browser.newContext({ baseURL: CLINICAL })).newPage();

test("journey 9: the platform's view of the hospital", async ({ page }) => {
  test.setTimeout(600_000);
  const step = "9-platform-view";
  const id = readJourney("hospital.id");
  await signInJ(page, step, "padmin");
  const h = await api(page, step, "GET", `/api/v1/platform/hospitals/${id}`);
  const hb = h.body as {
    status: string;
    staff_count: number;
    first_admin: { status: string } | null;
    admins: unknown[];
  };
  record(step, {
    kind: "check",
    status: hb.status,
    staff: hb.staff_count,
    first_admin: hb.first_admin?.status,
    admins: hb.admins?.length,
  });
  expect(hb.status).toBe("active");
  await visit(page, step, `/hospitals/${id}`);
  for (const p of ["/usage", "/activity", "/system/jobs", "/hospitals"])
    await visit(page, step, p);
  const an = await api(
    page,
    step,
    "GET",
    "/api/v1/platform/analytics?period=month",
  );
  record(step, { kind: "check", what: "analytics", status: an.status });
  const act = await api(
    page,
    step,
    "GET",
    `/api/v1/platform/activity?hospital=${id}`,
  );
  record(step, {
    kind: "check",
    what: "activity for the hospital",
    status: act.status,
  });
  const jobs = await api(page, step, "GET", "/api/v1/platform/jobs");
  const list =
    (jobs.body as {
      jobs?: { type: string; status: string }[];
      items?: { type: string; status: string }[];
    }) ?? {};
  const rows = list.jobs ?? list.items ?? [];
  record(step, {
    kind: "check",
    what: "jobs",
    types: rows.map((j) => `${j.type}:${j.status}`).slice(0, 20),
  });

  // The audit log: every entry of the hospital displays.
  const undisplayable: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/platform/audit/undisplayable")
      undisplayable.push(r.postData() ?? "");
  });
  const au = await api(
    page,
    step,
    "GET",
    `/api/v1/platform/audit?hospital=${id}&limit=50`,
  );
  const auRows =
    (au.body as {
      items?: { action?: string; type?: string }[];
      events?: { action?: string; type?: string }[];
    }) ?? {};
  const evs = auRows.items ?? auRows.events ?? [];
  record(step, {
    kind: "check",
    what: "audit entries for the hospital",
    count: evs.length,
    types: [...new Set(evs.map((e) => e.type ?? e.action))],
  });
  await visit(page, step, "/audit", { allow: /This entry can't be displayed/ });
  for (let i = 0; i < 10; i++) {
    const more = page.getByRole("button", { name: "Load more" });
    if (!(await more.count())) break;
    await more.click();
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
  }
  const bad = await page.getByText("This entry can't be displayed").count();
  record(step, {
    kind: "check",
    what: "audit entries that can't be displayed",
    count: bad,
    reported: undisplayable,
  });
  await page.screenshot({
    path: `${process.env.LIVE_OUT ?? "/out"}/journey-shots/9-audit-all.png`,
    fullPage: true,
  });
  expect.soft(bad).toBe(0);

  // The integrity check.
  const v = await api(page, step, "POST", "/api/v1/platform/audit/verify");
  record(step, { kind: "check", what: "verify started", status: v.status });
  let state = "";
  for (let i = 0; i < 30; i++) {
    const s = await api(
      page,
      step,
      "GET",
      "/api/v1/platform/audit/verify/status",
    );
    state = JSON.stringify(s.body).slice(0, 300);
    if (!/running|queued|pending/i.test(state)) break;
    await page.waitForTimeout(2000);
  }
  record(step, { kind: "check", what: "verify status", state });
});

test("journey 11: deactivate (staff refused), then reactivate", async ({
  page,
  browser,
}) => {
  test.setTimeout(600_000);
  const step = "11-deactivate";
  const id = readJourney("hospital.id");
  // A clinician of the hospital signed in before.
  const c = await clinical(browser);
  await signInJ(c, step, "jclinb");
  const before = await call(c, CLINICAL, step, "GET", "/api/auth/session");
  expect(before.status).toBe(200);

  await signInJ(page, step, "padmin");
  await visit(page, step, `/hospitals/${id}`);
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: /^Deactivate / });
  await expect(dlg).toBeVisible();
  // The first reason (contract ended): the radio sits under its label.
  await dlg.getByRole("radio").first().check({ force: true });
  const t0 = Date.now();
  const done = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/deactivate"),
  );
  await dlg.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(await codeFor(page, "padmin"));
  const submit = dlg.getByRole("button", { name: "Deactivate", exact: true });
  if (await submit.isEnabled().catch(() => false))
    await submit.click().catch(() => {});
  const res = await done;
  record(step, {
    kind: "api",
    method: "POST",
    path: `/api/v1/platform/hospitals/${id}/deactivate`,
    status: res.status(),
    ms: Date.now() - t0,
  });
  expect(res.status()).toBe(200);
  await visit(page, step, `/hospitals/${id}`);
  await expect(page.getByText(/Deactivated/).first()).toBeVisible();

  // The clinician's session ends; signing in is refused.
  const after = await call(c, CLINICAL, step, "GET", "/api/auth/session");
  const read = await call(
    c,
    CLINICAL,
    step,
    "GET",
    "/api/v1/feedback/stats/mine",
  );
  record(step, {
    kind: "check",
    what: "staff after deactivation",
    session: after.status,
    read: read.status,
  });
  expect.soft(read.status).toBe(401);
  const u = readJ("jclinb");
  const again = await clinical(browser);
  const login = await call(again, CLINICAL, step, "POST", "/api/auth/login", {
    login: u.email,
    password: u.password,
  });
  record(step, {
    kind: "check",
    what: "sign-in while deactivated",
    status: login.status,
    code: (login.body as { code?: string })?.code,
  });
  expect.soft(login.status).toBeGreaterThanOrEqual(400);

  // Reactivate.
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  const rd = page.getByRole("dialog", { name: /^Reactivate / });
  await expect(rd).toBeVisible();
  await rd
    .getByRole("textbox")
    .first()
    .fill("Synthetic journey: contract renewed.");
  const t1 = Date.now();
  const back = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/reactivate"),
  );
  await rd.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(await codeFor(page, "padmin"));
  const rsubmit = rd.getByRole("button", { name: "Reactivate", exact: true });
  if (await rsubmit.isEnabled().catch(() => false))
    await rsubmit.click().catch(() => {});
  const rres = await back;
  record(step, {
    kind: "api",
    method: "POST",
    path: `/api/v1/platform/hospitals/${id}/reactivate`,
    status: rres.status(),
    ms: Date.now() - t1,
  });
  expect(rres.status()).toBe(200);
  const h = await api(page, step, "GET", `/api/v1/platform/hospitals/${id}`);
  record(step, {
    kind: "check",
    what: "after reactivate",
    status: (h.body as { status: string }).status,
  });
  await visit(page, step, `/hospitals/${id}`);
  const fresh = await clinical(browser);
  await signInJ(fresh, step, "jclinb");
  await visit(fresh, step, "/");
  await visit(page, step, "/audit", { allow: /This entry can't be displayed/ });
  const bad = await page.getByText("This entry can't be displayed").count();
  record(step, {
    kind: "check",
    what: "audit after deactivation: undisplayable",
    count: bad,
  });
  expect.soft(bad).toBe(0);
  await visit(page, step, "/activity");
});
