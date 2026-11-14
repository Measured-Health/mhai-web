import { expect, test, type Page } from "@playwright/test";
import { recordApi, reportApi, signIn } from "./live";

/**
 * The platform admin screens on core's contract (openapi 1.26.0,
 * mhai-multiagent #165), live: the team, activity and legal holds read
 * strictly, and what core doesn't do yet (invites, notifications,
 * settings) is a calm Not available yet, never an error. Nothing here
 * places a hold or changes a role: a hold would stop the clinical run's
 * purges, and a role change ends the auditor's sessions.
 */
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Platform" })
    .getByRole("link", { name, exact: true })
    .filter({ visible: true })
    .click();
const noErrors = (page: Page) =>
  expect(
    page.getByText(/Something went wrong|couldn't load|can't load/i),
  ).toHaveCount(0);

test("team: everyone active, your own row read-only, invites Not available yet", async ({
  page,
}) => {
  await signIn(page, "padmin");
  const calls = recordApi(page);
  await nav(page, "Team");
  await expect(
    page.getByRole("heading", { level: 1, name: "Team" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await noErrors(page);
  await expect(page.getByText("Invite pending")).toHaveCount(0);
  await expect(
    page.getByText(
      "You can't change your own role or remove yourself. Another platform admin can.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Invite team member" }).click();
  const invite = page.getByRole("dialog", { name: "Invite a team member" });
  await invite.getByLabel("Name").fill("Synthetic Invitee");
  await invite.getByLabel("Email").fill("invitee@liv.example.test");
  await invite.getByRole("button", { name: "Send invite" }).click();
  await expect(invite.getByText("Not available yet")).toBeVisible();
  await expect(invite.getByRole("alert")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("team-invite.png"),
    fullPage: true,
  });
  await invite.getByRole("button", { name: "Cancel" }).click();
  const bad = reportApi("team", calls).filter(
    // The invite itself answers 501: that is the calm state under test.
    (c) => !(c.status === 501 && c.path === "/api/v1/platform/team/invites"),
  );
  expect(bad).toEqual([]);
});

test("activity: only actions a person took, read strictly", async ({
  page,
}) => {
  await signIn(page, "padmin");
  const calls = recordApi(page);
  await nav(page, "Activity");
  await expect(
    page.getByRole("heading", { level: 1, name: "Activity" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await noErrors(page);
  await page.screenshot({
    path: test.info().outputPath("activity.png"),
    fullPage: true,
  });
  expect(reportApi("activity", calls)).toEqual([]);
});

test("legal holds: the list reads, and placing one asks for no dates, note or name", async ({
  page,
}) => {
  await signIn(page, "padmin");
  const calls = recordApi(page);
  await nav(page, "Legal holds");
  await expect(
    page.getByRole("heading", { level: 1, name: "Legal holds" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await noErrors(page);
  await page.getByLabel("Status").selectOption({ label: "All" });
  await page.waitForLoadState("networkidle");
  await noErrors(page);
  await page.getByRole("button", { name: "Place a hold" }).click();
  const form = page.getByRole("dialog", { name: "Place a legal hold" });
  await expect(form.getByText("All records")).toBeVisible();
  for (const gone of [/^From/, /^Note/, /^Asked for by/])
    await expect(form.getByLabel(gone)).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("place-hold.png"),
    fullPage: true,
  });
  await form.getByRole("button", { name: "Cancel" }).click();
  expect(reportApi("holds", calls)).toEqual([]);
});

test("notifications and settings: Not available yet, calmly", async ({
  page,
}) => {
  await signIn(page, "padmin");
  await page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  const bell = page.getByRole("dialog", { name: "Notifications" });
  await expect(bell.getByText("Not available yet")).toBeVisible();
  await expect(bell.getByText(/couldn't load/i)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav(page, "Settings");
  await expect(page.getByText("Not available yet")).toBeVisible();
  await noErrors(page);
  await page.screenshot({
    path: test.info().outputPath("settings.png"),
    fullPage: true,
  });
});

test("an auditor reads the team and holds, with no controls and no Mark all seen", async ({
  page,
}) => {
  await signIn(page, "auditor");
  const calls = recordApi(page);
  await nav(page, "Team");
  await page.waitForLoadState("networkidle");
  await noErrors(page);
  await expect(
    page.getByRole("button", { name: /Change role|^Remove/ }),
  ).toHaveCount(0);
  await nav(page, "Legal holds");
  await page.waitForLoadState("networkidle");
  await noErrors(page);
  await expect(page.getByRole("button", { name: "Place a hold" })).toHaveCount(
    0,
  );
  expect(reportApi("auditor", calls)).toEqual([]);
});
