import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { saveUser } from "./live";
import {
  PLATFORM,
  call,
  codeFor,
  rand,
  record,
  signInJ,
  visit,
  writeJourney,
} from "./journey";

/**
 * Journey, part A (scripts/it/live-full.sh journey): the platform admin
 * signs in, sees the dashboards, and adds a hospital in the app with a
 * step-up code. The hospital starts in set-up with its first admin
 * invited. The script then activates it (core hospitals activate: the
 * platform app has no activation yet) and hands the first admin's invite
 * link to part B, since core never shows that link (the delivery log
 * records only that it is due).
 */

const STATE = process.env.LIVE_STATE ?? "/state";

test("journey 1: the platform admin signs in and sees the dashboards", async ({
  page,
}) => {
  test.setTimeout(240_000);
  mkdirSync(`${STATE}/journey`, { recursive: true, mode: 0o700 });
  mkdirSync(`${process.env.LIVE_OUT ?? "/out"}/journey-shots`, {
    recursive: true,
  });
  await signInJ(page, "1-platform-sign-in", "padmin");
  for (const p of [
    "/hospitals",
    "/usage",
    "/system",
    "/system/health",
    "/system/jobs",
    "/activity",
    "/audit",
    "/team",
    "/legal-holds",
    "/connections",
    "/account",
  ])
    await visit(page, "1-platform-dashboards", p);
});

test("journey 2: add a hospital with a step-up code", async ({ page }) => {
  test.setTimeout(240_000);
  await signInJ(page, "2-add-hospital", "padmin");
  const code = rand()
    .slice(0, 5)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "J");
  const short = `J${code}`.slice(0, 6);
  const domain = "jny.example.test";
  const admin = `jadmin-${rand()}@${domain}`;
  saveUser("jadmin", { email: admin, password: "" });
  writeJourney("hospital.code", short, true);
  writeJourney("domain", domain);

  await visit(page, "2-add-hospital", "/hospitals/new");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Synthetic Journey Hospital");
  await page.getByLabel("Short code").fill(short);
  const country = page.getByRole("combobox", { name: "Country" });
  await country.fill("Nigeria");
  await page
    .getByRole("listbox", { name: "Countries" })
    .getByRole("option")
    .first()
    .click();
  await page.getByLabel("Time zone").selectOption("Africa/Lagos");
  await page.getByLabel("Allowed email domains").fill(domain);
  await page.getByLabel("First admin name").fill("Synthetic Journey Admin");
  await page.getByLabel("First admin email").fill(admin);
  await page.getByRole("button", { name: "Add hospital" }).click();
  const dialog = page.getByRole("dialog", { name: "Add this hospital?" });
  await expect(dialog).toBeVisible();
  const t0 = Date.now();
  const added = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/platform/hospitals" &&
      r.request().method() === "POST",
  );
  await dialog.getByLabel("Digit 1 of 6").click();
  await page.keyboard.type(await codeFor(page, "padmin"));
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const res = await added;
  record("2-add-hospital", {
    kind: "api",
    method: "POST",
    path: "/api/v1/platform/hospitals",
    status: res.status(),
    ms: Date.now() - t0,
  });
  expect(res.status()).toBe(201);
  await expect(page).toHaveURL(/\/hospitals\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  writeJourney("hospital.id", id, true);

  const h = await call(
    page,
    PLATFORM,
    "2-add-hospital",
    "GET",
    `/api/v1/platform/hospitals/${id}`,
  );
  expect(h.status).toBe(200);
  const body = h.body as {
    status: string;
    first_admin: { status: string; email: string } | null;
    email_domains: string[];
    country: string;
  };
  record("2-add-hospital", {
    kind: "check",
    hospital_status: body.status,
    first_admin_status: body.first_admin?.status ?? null,
    country: body.country,
    domains: body.email_domains.length,
  });
  expect(body.status).toBe("setup_incomplete");
  expect(body.first_admin?.status).toBe("pending");
  expect(body.first_admin?.email).toBe(admin);
  await visit(page, "2-add-hospital", `/hospitals/${id}`);
  await expect(page.getByText("Set-up incomplete").first()).toBeVisible();
  // Activation: is there anything in the app that activates it?
  const activate = await page
    .getByRole("button", { name: /^Activate|Finish set-up|Mark as set up/i })
    .count();
  record("3-activation", { kind: "check", activate_button_in_app: activate });
  await visit(page, "2-add-hospital", "/hospitals");
});
