import { expect, test, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  CODE,
  expectNoStorage,
  openNav,
  signIn,
  signOut,
  stepUp,
  toast,
  TUNDE,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** Signs in and opens Settings by clicking (a page load would sign out). */
async function openSettings(page: Page, email: string) {
  await signIn(page, email);
  await openNav(page, "Settings");
}

const section = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

test("Ada lengthens Documents to 7 years at once", async ({ page }) => {
  await openSettings(page, ADA);
  const retention = section(page, "Records retention");
  await retention.getByRole("button", { name: "Change Documents" }).click();

  const choose = page.getByRole("dialog", {
    name: "How long to keep Documents",
  });
  await choose.getByLabel("Keep for").selectOption({ label: "7 years" });
  await choose.getByRole("button", { name: "Continue" }).click();

  const ask = stepUp(page, "Keep Documents for 7 years?");
  await ask.getByLabel(/^Reason/).fill("Longer cover for audits");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Keep for 7 years" }).click();
  await expect(ask).toBeHidden();
  await expect(toast(page, "Documents: kept for 7 years")).toBeVisible();
  // It applied at once: no request is waiting.
  await expect(
    retention.getByText("7 years", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    section(page, "Changes waiting for approval").getByText(
      "No changes waiting for approval.",
    ),
  ).toBeVisible();
});

test("Ada asks to shorten Questions and answers to 3 years with the preview; as Tunde, the fresh preview, then approve", async ({
  page,
}) => {
  await openSettings(page, ADA);
  const retention = section(page, "Records retention");
  await retention
    .getByRole("button", { name: "Change Questions and answers" })
    .click();
  const choose = page.getByRole("dialog", {
    name: "How long to keep Questions and answers",
  });
  await choose.getByLabel("Keep for").selectOption({ label: "3 years" });
  await choose.getByRole("button", { name: "Continue" }).click();

  const ask = stepUp(page, "Shorten Questions and answers to 3 years?");
  await expect(
    ask.getByText(/about [\d,]+ records would be deleted in the next clean-up/),
  ).toBeVisible();
  await expect(
    ask.getByText(
      "A different platform admin must approve this before it applies.",
    ),
  ).toBeVisible();
  await ask.getByLabel(/^Reason/).fill("Policy review");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Ask to shorten" }).click();
  await expect(ask).toBeHidden();
  await expect(
    toast(page, "Waiting for a different platform admin to approve"),
  ).toBeVisible();

  const pending = section(page, "Changes waiting for approval");
  await expect(
    pending.getByText("Questions and answers to 3 years"),
  ).toBeVisible();
  // Ada asked, so she cannot approve.
  await expect(pending.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(
    pending.getByText("Waiting for a different platform admin to approve"),
  ).toBeVisible();

  await signOut(page);
  await signIn(page, TUNDE);
  await openNav(page, "Settings");
  const mine = section(page, "Changes waiting for approval");
  await expect(mine.getByText("Requested by Ada Bakare")).toBeVisible();
  await mine.getByRole("button", { name: "Approve", exact: true }).click();
  const approve = stepUp(page, "Approve Questions and answers to 3 years?");
  await expect(
    approve.getByText(/about [\d,]+ records would be deleted/),
  ).toBeVisible();
  await typeCode(page, CODE, approve);
  await approve.getByRole("button", { name: "Approve change" }).click();
  await expect(approve).toBeHidden();
  await expect(toast(page, "Change approved")).toBeVisible();
  await expect(
    section(page, "Changes waiting for approval").getByText(
      "No changes waiting for approval.",
    ),
  ).toBeVisible();
  await expect(
    section(page, "Records retention")
      .getByText("3 years", { exact: true })
      .first(),
  ).toBeVisible();
});

test("Tunde asks to switch triage on with a sign-off; Ada approves", async ({
  page,
}) => {
  await openSettings(page, TUNDE);
  const triage = section(page, "Triage");
  await expect(triage.getByText("Triage: Off")).toBeVisible();
  await triage.getByRole("button", { name: "Ask to switch on" }).click();
  const ask = stepUp(page, "Ask to switch triage on?");
  await ask.getByLabel(/^Reason/).fill("Validation signed off");
  await ask.getByLabel(/^Clinical sign-off/).fill("Dr Ifeoma Nwosu, memo 12");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Ask to switch on" }).click();
  await expect(ask).toBeHidden();
  await expect(
    triage.getByText("Waiting for a different platform admin to approve"),
  ).toBeVisible();

  await signOut(page);
  await signIn(page, ADA);
  await openNav(page, "Settings");
  const pending = section(page, "Changes waiting for approval");
  await expect(
    pending.getByText("Clinical sign-off: Dr Ifeoma Nwosu, memo 12"),
  ).toBeVisible();
  await pending.getByRole("button", { name: "Approve", exact: true }).click();
  const approve = stepUp(page, "Approve Triage on?");
  await typeCode(page, CODE, approve);
  await approve.getByRole("button", { name: "Approve change" }).click();
  await expect(approve).toBeHidden();
  await expect(section(page, "Triage").getByText("Triage: On")).toBeVisible();
});

test("Ada clears the learning data and sees Cleared 37 items", async ({
  page,
}) => {
  await openSettings(page, ADA);
  const learning = section(page, "Clear unapproved learning data");
  await expect(learning.getByText("37 items waiting")).toBeVisible();
  await learning.getByRole("button", { name: "Clear", exact: true }).click();
  const ask = stepUp(page, "Clear 37 items?");
  await ask.getByLabel(/^Reason/).fill("Training data");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Clear 37 items" }).click();
  await expect(ask).toBeHidden();
  await expect(learning.getByText(/^Cleared 37 items · /)).toBeVisible();
  await expect(learning.getByText("0 items waiting")).toBeVisible();
});

test("the auditor sees every setting and no controls", async ({ page }) => {
  await openSettings(page, AMARA);
  const main = page.getByRole("main");
  for (const name of [
    "Changes waiting for approval",
    "Records retention",
    "Triage",
    "Clear unapproved learning data",
  ])
    await expect(section(page, name)).toBeVisible();
  await expect(main.getByText("37 items waiting")).toBeVisible();
  await expect(main.getByText("Triage: Off")).toBeVisible();
  await expect(
    main.getByRole("button", {
      name: /^(Change|Ask to|Switch|Clear|Pause|Resume|Approve|Cancel request)/,
    }),
  ).toHaveCount(0);
});

test("pause shows on Health", async ({ page }) => {
  await openSettings(page, ADA);
  await section(page, "Records retention")
    .getByRole("button", { name: "Pause clean-up" })
    .click();
  const ask = stepUp(page, "Pause the records clean-up?");
  await ask.getByLabel(/^Reason/).fill("Audit in progress");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Pause clean-up" }).click();
  await expect(ask).toBeHidden();
  await expect(
    page.getByText(/^Records clean-up paused by Ada Bakare since /).first(),
  ).toBeVisible();

  await openNav(page, "System");
  await expect(
    page.getByText(/^Records clean-up paused by Ada Bakare since /).first(),
  ).toBeVisible();
});
