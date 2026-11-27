import { expect, test, type Browser, type Page } from "@playwright/test";
import { totp } from "@mhai/api-client/totp";
import { fillForm } from "../e2e/helpers";
import { saveUser } from "./live";
import {
  CLINICAL,
  acceptInvite,
  call,
  codeFor,
  markStep,
  newPassword,
  rand,
  readJ,
  readJourney,
  record,
  saveJ,
  signInJ,
  visit,
  writeJourney,
} from "./journey";

/**
 * Journey, part B (scripts/it/live-full.sh journey), in the clinical app,
 * for the hospital part A added: the first admin accepts the invite; the
 * admin changes a setting with a step-up code, invites two clinicians and
 * a third (resends one invite, removes the third); both clinicians accept;
 * clinician A asks, agrees with one answer and suggests corrections;
 * clinician B reviews them (approve, reject; A withdraws one); the admin's
 * oversight, usage and activity show it; then A's account features. The
 * answers come from the smoke stack's stub pipeline worker, not a model.
 */

const fresh = async (browser: Browser) =>
  (await browser.newContext({ baseURL: CLINICAL })).newPage();
const api = (
  page: Page,
  step: string,
  method: string,
  path: string,
  data?: unknown,
) => call(page, CLINICAL, step, method, path, data);

type Staff = {
  id: string;
  email: string;
  invited_at: string | null;
  roles: string[];
};
type Invited = { id: string; email: string; link: { url: string } | null };

test("journey 4: the first admin accepts the invite", async ({ page }) => {
  test.setTimeout(180_000);
  await acceptInvite(
    page,
    "4-first-admin-accepts",
    "jadmin",
    readJourney("invite.link"),
  );
  await visit(page, "4-first-admin-accepts", "/admin");
});

test("journey 5: settings with step-up, invites, resend, remove", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const step = "5-hospital-admin";
  await signInJ(page, step, "jadmin");
  for (const p of ["/admin", "/admin/staff", "/admin/settings"])
    await visit(page, step, p);

  // A setting that loosens sign-in (a longer idle timeout) needs the code.
  const s = await api(page, step, "GET", "/api/v1/hospital/settings");
  expect(s.status).toBe(200);
  const set = s.body as {
    version: number;
    idle_timeout_minutes: number;
    limits: { idle_timeout_minutes: number[] };
  };
  const longer = set.limits.idle_timeout_minutes.find(
    (v) => v > set.idle_timeout_minutes,
  );
  if (longer) {
    const noCode = await api(page, step, "PATCH", "/api/v1/hospital/settings", {
      version: set.version,
      idle_timeout_minutes: longer,
    });
    record(step, {
      kind: "check",
      what: "loosening without a code",
      status: noCode.status,
    });
    expect(noCode.status).toBe(403);
    const up = await api(page, step, "PATCH", "/api/v1/hospital/settings", {
      version: set.version,
      idle_timeout_minutes: longer,
      mfa_code: await codeFor(page, "jadmin"),
    });
    expect(up.status).toBe(200);
    const back = await api(page, step, "PATCH", "/api/v1/hospital/settings", {
      version: (up.body as { version: number }).version,
      idle_timeout_minutes: set.idle_timeout_minutes,
    });
    expect(back.status).toBe(200);
  }

  // Invite two clinicians and a third person.
  const domain = readJourney("domain");
  const people = ["jclina", "jclinb", "jgone"];
  for (const n of people)
    saveUser(n, { email: `${n}-${rand()}@${domain}`, password: "" });
  const inv = await api(page, step, "POST", "/api/v1/hospital/staff/invites", {
    emails: people.map((n) => readJ(n).email),
    roles: ["clinician"],
    mfa_code: await codeFor(page, "jadmin"),
  });
  expect(inv.status).toBeLessThan(300);
  const out = inv.body as { invited: Invited[]; skipped: unknown[] };
  record(step, {
    kind: "check",
    invited: out.invited.length,
    skipped: out.skipped.length,
    links: out.invited.filter((i) => i.link).length,
  });
  expect(out.invited).toHaveLength(3);
  const byName = (n: string) =>
    out.invited.find((i) => i.email === readJ(n).email)!;
  for (const n of people) {
    writeJourney(`${n}.id`, byName(n).id);
    if (byName(n).link) writeJourney(`${n}.link`, byName(n).link!.url);
  }

  // Resend A's invite: a fresh link, the old one dead.
  const resend = await api(
    page,
    step,
    "POST",
    `/api/v1/hospital/staff/${byName("jclina").id}/resend-invite`,
    {
      mfa_code: await codeFor(page, "jadmin"),
    },
  );
  expect(resend.status).toBeLessThan(300);
  const link = (resend.body as { link?: { url: string } | null }).link;
  record(step, {
    kind: "check",
    what: "resend gives a new link",
    has_link: !!link,
  });
  if (link) {
    writeJourney("jclina.oldlink", readJourney("jclina.link"));
    writeJourney("jclina.link", link.url);
  }

  // Remove the third invite.
  const del = await api(
    page,
    step,
    "DELETE",
    `/api/v1/hospital/staff/${byName("jgone").id}`,
    {
      mfa_code: await codeFor(page, "jadmin"),
    },
  );
  expect(del.status).toBe(204);
  const list = await api(page, step, "GET", "/api/v1/hospital/staff");
  const staff = list.body as Staff[];
  record(step, {
    kind: "check",
    staff: staff.length,
    gone_listed: staff.some((x) => x.id === byName("jgone").id),
  });
  await visit(page, step, "/admin/staff");
  await expect(page.getByText(readJ("jclina").email).first()).toBeVisible();
});

test("journey 5b: both clinicians accept; the removed and old links are refused", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const step = "5b-clinicians-accept";
  // The resend's old link and the removed person's link no longer work.
  for (const [what, name] of [
    ["old link", "jclina.oldlink"],
    ["removed", "jgone.link"],
  ] as const) {
    let url: string;
    try {
      url = readJourney(name);
    } catch {
      continue;
    }
    const token = new URL(url, CLINICAL).searchParams.get("token");
    const r = await api(page, step, "POST", "/api/auth/password/reset", {
      token,
      next: newPassword(),
    });
    record(step, { kind: "check", what: `${what} refused`, status: r.status });
    expect.soft(r.status).toBeGreaterThanOrEqual(400);
  }
  await acceptInvite(page, step, "jclina", readJourney("jclina.link"));
  const b = await fresh(browser);
  await acceptInvite(b, step, "jclinb", readJourney("jclinb.link"));
});

type Result = {
  decision?: string;
  diagnosis?: string | null;
  citations?: unknown[];
  [k: string]: unknown;
};

async function ask(page: Page, step: string, question: string) {
  const r = await api(page, step, "POST", "/api/v1/queries", {
    patient_data: {
      age: 47,
      sex: "female",
      symptoms: ["Fever", "Productive cough"],
    },
    clinical_question: question,
    urgency: "routine",
  });
  expect(r.status).toBeLessThan(300);
  const id = (r.body as { query_id: string }).query_id;
  const t0 = Date.now();
  let status = "";
  for (let i = 0; i < 90; i++) {
    const s = await api(page, `${step}-poll`, "GET", `/api/v1/queries/${id}`);
    status = (s.body as { status?: string })?.status ?? String(s.status);
    if (!/queued|pending|processing|running/i.test(status)) break;
    await page.waitForTimeout(2000);
  }
  record(step, {
    kind: "check",
    what: "answer ready",
    status,
    ms: Date.now() - t0,
  });
  const res = await api(page, step, "GET", `/api/v1/queries/${id}/result`);
  const out = res.body as Result;
  record(step, {
    kind: "check",
    result_status: res.status,
    decision: out?.decision ?? null,
    has_diagnosis: !!out?.diagnosis,
    citations: Array.isArray(out?.citations) ? out.citations.length : null,
  });
  return { id, result: out, status: res.status };
}

test("journey 6-7: clinician A asks, reads the answer, agrees and corrects", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const step = "6-ask";
  await signInJ(page, step, "jclina");
  await visit(page, step, "/");
  // One question in the app, as a person would.
  const t0 = Date.now();
  await fillForm(
    page,
    "Synthetic journey question: fever and cough for 3 days, likely cause?",
  );
  await page.getByRole("button", { name: /Analyse/ }).click();
  const result = page.getByRole("heading", { name: "Clinical assessment" });
  const failed = page.getByRole("heading", {
    name: "We couldn't complete this one",
  });
  await expect(result.or(failed)).toBeVisible({ timeout: 180_000 });
  record(step, {
    kind: "flow",
    what: "asked in the app: answer shown",
    ms: Date.now() - t0,
    failed: await failed.count(),
  });
  await expect(result).toBeVisible();
  const answerPath = new URL(page.url()).pathname;
  record(step, {
    kind: "check",
    what: "answer page address",
    path: answerPath.replace(/[0-9a-f-]{36}/, "{id}"),
  });
  await page.screenshot({
    path: `${process.env.LIVE_OUT ?? "/out"}/journey-shots/6-answer.png`,
    fullPage: true,
  });
  const citations = await page.getByText(/Source|Citation|Evidence/i).count();
  record(step, {
    kind: "check",
    what: "answer page citations text",
    count: citations,
  });
  // Agree with it (step 7).
  await page.getByRole("button", { name: /I agree/ }).click();
  await expect(page.getByText(/your agreement was recorded/)).toBeVisible();
  record("7-feedback", { kind: "flow", what: "agreed in the app" });

  // Three more, through the BFF: one each to approve, reject and withdraw.
  const ids: string[] = [];
  for (const n of [2, 3, 4]) {
    const a = await ask(
      page,
      step,
      `Synthetic journey question ${n}: shortness of breath on exertion, next step?`,
    );
    ids.push(a.id);
  }
  // History is the session's own, in memory (nothing about a patient is
  // kept in the browser): listed while the app stays open, gone after a
  // reload, by design. The one asked in the app is listed; the ones asked
  // through the BFF never are.
  await page
    .getByRole("navigation", { name: "Consultations" })
    .getByRole("link", { name: "New consultation" })
    .click();
  const history = await page
    .getByRole("navigation", { name: "Consultations" })
    .locator('a[href^="/c/"]')
    .count();
  record(step, {
    kind: "check",
    what: "history lists the questions",
    count: history,
  });
  expect.soft(history, "the question asked in the app is listed").toBe(1);

  const corrections: string[] = [];
  for (const [i, id] of ids.entries()) {
    const f = await api(page, "7-feedback", "POST", "/api/v1/feedback", {
      query_id: id,
      action: "correct",
      corrected_diagnosis: `Synthetic corrected diagnosis ${i + 2}`,
      reason: "Synthetic reason: the history points elsewhere.",
    });
    expect(f.status).toBeLessThan(300);
    const out = f.body as { status: string; correction_id?: string };
    record("7-feedback", {
      kind: "check",
      feedback_status: out.status,
      has_correction_id: !!out.correction_id,
    });
    corrections.push(out.correction_id ?? "");
  }
  writeJourney("corrections", corrections.join(","));
  const stats = await api(
    page,
    "7-feedback",
    "GET",
    "/api/v1/feedback/stats/mine",
  );
  record("7-feedback", { kind: "check", stats: stats.body });
  await visit(page, "7-feedback", "/my-feedback");
});

test("journey 8: review by B, the admin's oversight, decisions", async ({
  page,
  browser,
}) => {
  test.setTimeout(600_000);
  const step = "8-review";
  const [approve, reject, withdraw] = readJourney("corrections").split(",");
  await signInJ(page, step, "jclinb");
  const q = await api(page, step, "GET", "/api/v1/corrections?status=pending");
  const pending = (q.body as { id: string }[]) ?? [];
  record(step, {
    kind: "check",
    what: "B's queue has A's corrections",
    found: [approve, reject, withdraw].filter((c) =>
      pending.some((p) => p.id === c),
    ).length,
  });
  expect(pending.some((p) => p.id === approve)).toBe(true);
  await visit(page, step, "/review");

  // A can't review their own.
  const a = await fresh(browser);
  await signInJ(a, step, "jclina");
  const own = await api(
    a,
    step,
    "POST",
    `/api/v1/corrections/${approve}/approve`,
  );
  record(step, {
    kind: "check",
    what: "submitter approving own",
    status: own.status,
  });
  expect(own.status).toBeGreaterThanOrEqual(400);

  // The admin's oversight: listed, eligible reviewers, assign B, remind.
  const adm = await fresh(browser);
  await signInJ(adm, step, "jadmin");
  const ov = await api(adm, step, "GET", "/api/v1/hospital/review-oversight");
  const items = (ov.body as { items: { id: string }[] }).items ?? [];
  record(step, {
    kind: "check",
    what: "oversight lists them",
    found: [approve, reject, withdraw].filter((c) =>
      items.some((p) => p.id === c),
    ).length,
  });
  const el = await api(
    adm,
    step,
    "GET",
    `/api/v1/hospital/corrections/${approve}/eligible-reviewers`,
  );
  record(step, {
    kind: "check",
    what: "eligible reviewers",
    body_kind: Array.isArray(el.body) ? "array" : typeof el.body,
  });
  const bId = readJourney("jclinb.id");
  const asg = await api(
    adm,
    step,
    "POST",
    `/api/v1/hospital/corrections/${approve}/assign`,
    { staff_id: bId },
  );
  expect.soft(asg.status).toBeLessThan(300);
  const rem = await api(
    adm,
    step,
    "POST",
    `/api/v1/hospital/corrections/${reject}/remind`,
    {},
  );
  expect.soft(rem.status).toBeLessThan(300);
  await visit(adm, step, "/admin/activity/oversight");

  // Decisions.
  const ap = await api(
    page,
    step,
    "POST",
    `/api/v1/corrections/${approve}/approve`,
  );
  expect.soft(ap.status).toBeLessThan(300);
  const rj = await api(
    page,
    step,
    "POST",
    `/api/v1/corrections/${reject}/reject`,
    {
      reason_code: "not_supported",
      note: "Synthetic note.",
    },
  );
  expect.soft(rj.status).toBeLessThan(300);
  const wd = await api(
    a,
    step,
    "POST",
    `/api/v1/corrections/${withdraw}/withdraw`,
  );
  expect.soft(wd.status).toBeLessThan(300);
  const again = await api(
    page,
    step,
    "POST",
    `/api/v1/corrections/${approve}/approve`,
  );
  record(step, {
    kind: "check",
    what: "approving twice",
    status: again.status,
  });

  const stats = await api(a, step, "GET", "/api/v1/feedback/stats/mine");
  record(step, { kind: "check", what: "A's stats after", stats: stats.body });
  const mine = await api(a, step, "GET", "/api/v1/corrections/mine");
  record(step, {
    kind: "check",
    what: "A's corrections",
    statuses: ((mine.body as { id: string; status: string }[]) ?? [])
      .filter((c) => [approve, reject, withdraw].includes(c.id))
      .map((c) => c.status),
  });
  const rev = await api(page, step, "GET", "/api/v1/corrections/reviewed");
  record(step, {
    kind: "check",
    what: "B's reviewed",
    count: Array.isArray(rev.body) ? rev.body.length : null,
  });
  await visit(a, step, "/my-feedback");
  await visit(a, step, "/notifications/corrections");
  await visit(a, step, "/notifications");
  await visit(page, step, "/review");
});

test("journey 9: the admin's usage and activity", async ({ page }) => {
  test.setTimeout(240_000);
  const step = "9-admin-usage-activity";
  await signInJ(page, step, "jadmin");
  for (const p of [
    "/admin/usage",
    "/admin/activity",
    "/admin/activity/oversight",
    "/admin/staff",
    "/account",
  ])
    await visit(page, step, p);
  const act = await api(
    page,
    step,
    "GET",
    "/api/v1/hospital/activity?limit=100",
  );
  const events = (
    (act.body as { events?: { type?: string; kind?: string }[] })?.events ?? []
  ).map((e) => e.type ?? e.kind);
  record(step, {
    kind: "check",
    what: "activity types",
    types: [...new Set(events)],
  });
});

test("journey 10: account features", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const step = "10-account";
  const name = "jclina";
  // Sign in with the backup code: one code, renewed.
  const u = readJ(name);
  const login = await api(page, step, "POST", "/api/auth/login", {
    login: u.email,
    password: u.password,
  });
  expect(login.status).toBe(200);
  const mfa = await api(page, step, "POST", "/api/auth/mfa", {
    code: u.backup,
    backup: true,
    trustDevice: false,
  });
  expect(mfa.status).toBe(200);
  const renewed = (mfa.body as { newBackupCode?: string }).newBackupCode;
  record(step, {
    kind: "check",
    what: "backup sign-in returns a new code",
    renewed: !!renewed,
    differs: renewed !== u.backup,
  });
  expect(renewed).toBeTruthy();
  saveJ(name, { ...u, backup: renewed });
  // The spent code no longer works.
  const second = await fresh(browser);
  const l2 = await api(second, step, "POST", "/api/auth/login", {
    login: u.email,
    password: u.password,
  });
  const reuse = await api(second, step, "POST", "/api/auth/mfa", {
    code: u.backup,
    backup: true,
    trustDevice: false,
  });
  record(step, {
    kind: "check",
    what: "the spent backup code again",
    login: l2.status,
    status: reuse.status,
  });
  expect.soft(reuse.status).toBeGreaterThanOrEqual(400);
  await visit(page, step, "/account");

  // A new backup code (step-up with the app's code).
  const nb = await api(page, step, "POST", "/api/auth/mfa/recovery-codes", {
    mfa_code: await codeFor(page, name),
  });
  expect(nb.status).toBe(200);
  const nbCode = (nb.body as { backupCode?: string }).backupCode;
  record(step, { kind: "check", what: "new backup code", has: !!nbCode });
  saveJ(name, { ...readJ(name), backup: nbCode });

  // Move to a new authenticator.
  const rp = await api(page, step, "POST", "/api/auth/mfa/replace", {
    mfa_code: await codeFor(page, name),
  });
  expect(rp.status).toBe(200);
  const secret = (rp.body as { secret: string }).secret;
  // A code from the new app, in a step after the last one used.
  await codeFor(page, name, secret);
  const cf = await api(page, step, "POST", "/api/auth/mfa/replace/confirm", {
    code: await totp(secret, Date.now()),
  });
  expect(cf.status).toBe(204);
  saveJ(name, { ...readJ(name), secret });
  markStep(name);

  // Password change.
  const next = newPassword();
  const pw = await api(page, step, "POST", "/api/auth/password", {
    current: readJ(name).password,
    next,
  });
  expect(pw.status).toBe(204);
  saveJ(name, { ...readJ(name), password: next });

  // Sign in on a second device with the new password and the new app.
  const other = await fresh(browser);
  await signInJ(other, step, name);
  const dv = await api(page, step, "GET", "/api/auth/devices");
  record(step, {
    kind: "check",
    what: "sessions listed",
    count: Array.isArray(dv.body)
      ? dv.body.length
      : ((dv.body as { sessions?: unknown[] })?.sessions?.length ?? null),
  });
  expect(dv.status).toBe(200);
  await visit(page, step, "/account");

  // Sign out everywhere: the other device's session ends.
  const so = await api(page, step, "POST", "/api/auth/devices/sign-out-all");
  expect(so.status).toBe(204);
  // The other device's next call to core is refused (core denylists its
  // token); its cookie alone still reads until then.
  const otherSession = await api(other, step, "GET", "/api/auth/session");
  const otherCall = await api(
    other,
    step,
    "GET",
    "/api/v1/feedback/stats/mine",
  );
  const ownSession = await api(page, step, "GET", "/api/auth/session");
  record(step, {
    kind: "check",
    what: "after sign out everywhere",
    other_cookie: otherSession.status,
    other_call: otherCall.status,
    own: ownSession.status,
  });
  expect.soft(otherCall.status).toBe(401);
  expect.soft(ownSession.status).toBe(401);
  await visit(other, step, "/");
});
