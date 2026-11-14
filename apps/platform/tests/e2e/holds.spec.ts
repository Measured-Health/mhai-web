import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ADA,
  AMARA,
  CODE,
  expectNoStorage,
  isMobile,
  openHospital,
  openNav,
  signIn,
  stepUp,
  TUNDE,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

/** The holds as the table (desktop) or the cards (phones). */
const holdsList = (page: Page) =>
  isMobile(page)
    ? page.getByRole("list", { name: "Legal holds" })
    : page.getByRole("table", { name: "Legal holds" });

/** Picks a reason in the place-a-hold form by tapping its chip. */
async function chooseReason(form: Locator, reason: string) {
  await form.getByText(reason, { exact: true }).click();
  await expect(
    form.getByRole("radio", { name: reason, exact: true }),
  ).toBeChecked();
}

/** Opens one hold from the list, by its hospital's name. */
async function openHold(page: Page, hospital: string, reference: string) {
  await holdsList(page).getByRole("link", { name: hospital }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: reference }),
  ).toBeVisible();
}

test("Legal holds opens on Open holds; every hold keeps all records; Lifted has no grace period", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await expect(page.getByLabel("Status")).toHaveValue("open");
  const list = holdsList(page);
  await expect(list.getByText("HC-2026-0412")).toBeVisible();
  await expect(list.getByText("REG-2026-2291")).toBeVisible();
  await expect(list.getByText("CMP-2026-0193")).toBeVisible();
  // The command line's hold, with no reason.
  await expect(list.getByText("LH-2025-0042")).toBeVisible();
  await expect(list.getByText("Review due")).toHaveCount(2);
  await expect(list.getByText("Lift requested")).toBeVisible();
  await expect(list.getByText("All records")).toHaveCount(4);
  await expect(list.getByText(/^Records from/)).toHaveCount(0);
  await expect(list.getByText("INV-2024-77")).toHaveCount(0);

  await page.getByLabel("Status").selectOption({ label: "Lifted" });
  await expect(list.getByText("INV-2024-77")).toBeVisible();
  await expect(list.getByText(/records released on/)).toHaveCount(0);
  await expect(list.getByText(/^Lifted by Ada Bakare · /)).toHaveCount(2);
  await expect(list.getByText("HC-2026-0412")).toHaveCount(0);
});

test("the hospital pages show holds, the Hold tag and View holds", async ({
  page,
}) => {
  await signIn(page, ADA);
  // Harbour View, Northgate, Riverside and Ridgeway; not Lakeside or Havana
  // (lifted, at once).
  await expect(
    page.getByRole("main").getByText("Hold", { exact: true }),
  ).toHaveCount(4);

  await openHospital(page, "Harbour View Hospital");
  const holds = page.getByRole("region", { name: "Legal holds" });
  const link = holds.getByRole("link", { name: /HC-2026-0412/ });
  await expect(link).toContainText("Active");
  await expect(link).toHaveAttribute("href", "/legal-holds/hold_hv");
  await expect(
    holds.getByRole("button", { name: "Place a hold" }),
  ).toBeVisible();

  const removal = page.getByRole("region", { name: "Removal" });
  await expect(
    removal.getByText("1 legal hold is active · View holds"),
  ).toBeVisible();
  await removal.getByRole("link", { name: "View holds" }).click();
  await expect(page).toHaveURL(/\/legal-holds\?hospital=h_harbour&status=all$/);
  await expect(page.getByLabel("Status")).toHaveValue("all");
  await expect(holdsList(page).getByText("HC-2026-0412")).toBeVisible();
  await expect(holdsList(page).getByText("CMP-2026-0193")).toHaveCount(0);
});

test("Ada places a hold on Southpoint from its page, and its removal shows 1 legal hold is active · View holds", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openHospital(page, "Southpoint Hospital");
  const removal = page.getByRole("region", { name: "Removal" });
  await expect(removal.getByText("All checks are clear")).toBeVisible();
  await expect(
    removal.getByRole("button", { name: "Approve removal" }),
  ).toBeEnabled();

  await page
    .getByRole("region", { name: "Legal holds" })
    .getByRole("button", { name: "Place a hold" })
    .click();
  const form = page.getByRole("dialog", { name: "Place a legal hold" });
  await expect(form.getByText("Southpoint Hospital")).toBeVisible();
  await chooseReason(form, "Complaint");
  // No dates, note or name: core keeps none of them.
  await expect(form.getByLabel(/^Asked for by/)).toHaveCount(0);
  await expect(form.getByLabel(/^Note/)).toHaveCount(0);
  await form.getByLabel(/^Reference/).fill("CMP-2026-09");
  await form.getByRole("button", { name: "Continue" }).click();
  const ask = stepUp(page, "Place a legal hold on Southpoint Hospital?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Place hold" }).click();

  // It goes to the new hold; from there back to the hospital.
  await expect(
    page.getByRole("heading", { level: 1, name: "CMP-2026-09" }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Southpoint Hospital" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Southpoint Hospital" }),
  ).toBeVisible();
  await expect(
    removal.getByText("1 legal hold is active · View holds"),
  ).toBeVisible();
  await expect(
    removal.getByRole("button", { name: "Approve removal" }),
  ).toBeDisabled();
});

test("Tunde asked to lift Riverside's hold; Ada approves with her code and it is lifted at once, with no undo", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await openHold(page, "Riverside Children's Hospital", "CMP-2026-0193");
  await expect(
    page.getByText(/Requested by Tunde Okafor/).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve lift" }).click();
  const ask = stepUp(page, "Approve lifting CMP-2026-0193?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Approve lift" }).click();
  await expect(ask).toBeHidden();
  await expect(
    page.getByText(/^Lifted by Ada Bakare · /).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo lift" })).toHaveCount(0);
});

test("a lift's authority must be a document reference", async ({ page }) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await openHold(page, "Harbour View Hospital", "HC-2026-0412");
  await page.getByRole("button", { name: "Request lift" }).click();
  const ask = stepUp(page, "Lift legal hold HC-2026-0412?");
  await ask.getByText("The case is closed", { exact: true }).click();
  await expect(ask.getByLabel(/^Note/)).toHaveCount(0);
  const authority = ask.getByLabel(/^Authority for lifting/);
  await authority.fill("Counsel's letter");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Request lift" }).click();
  await expect(
    ask.getByText("Use a document reference, like CT-2026-0091."),
  ).toBeVisible();
  await authority.fill("CT-2026-0091");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Request lift" }).click();
  await expect(ask).toBeHidden();
  await expect(
    page.getByText("Waiting for a different platform admin to approve"),
  ).toBeVisible();
});

test("changing a hold's review date is Not available yet, calmly", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await openHold(page, "Harbour View Hospital", "HC-2026-0412");
  await page.getByRole("button", { name: "Change review date" }).click();
  const d = page.getByRole("dialog", { name: "Change the review date" });
  await d.getByLabel(/^Review date/).fill("2031-03-03");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d.getByText("Not available yet")).toBeVisible();
  await expect(d.getByRole("alert")).toHaveCount(0);
});

const CONTROLS =
  /^(Place a hold|Change review date|Request lift|Approve lift|Undo lift|Cancel request)$/;

test("the auditor sees holds without controls", async ({ page }) => {
  await signIn(page, AMARA);
  await openNav(page, "Legal holds");
  const main = page.getByRole("main");
  await expect(holdsList(page).getByText("HC-2026-0412")).toBeVisible();
  await expect(main.getByRole("button", { name: CONTROLS })).toHaveCount(0);

  await openNav(page, "Hospitals");
  await openHospital(page, "Harbour View Hospital");
  await expect(
    page
      .getByRole("region", { name: "Legal holds" })
      .getByRole("link", { name: /HC-2026-0412/ }),
  ).toBeVisible();
  await expect(main.getByRole("button", { name: CONTROLS })).toHaveCount(0);
});

test("the auditor sees a hold's history, and no controls; the command line's hold says Placed by the system", async ({
  page,
}) => {
  await signIn(page, AMARA);
  await openNav(page, "Legal holds");
  await page.getByLabel("Status").selectOption({ label: "All" });
  await openHold(page, "Havana Hospital", "BRD-2026-03");
  const main = page.getByRole("main");
  await expect(main.getByText("Ada Bakare").first()).toBeVisible();
  await expect(main.getByText("Asked for by")).toHaveCount(0);
  await expect(main.getByRole("button", { name: CONTROLS })).toHaveCount(0);

  await page.goBack();
  await openHold(page, "Ridgeway General Hospital", "LH-2025-0042");
  await expect(main.getByText(/^Placed by the system · /)).toBeVisible();
  await expect(main.getByText(/Provisioning command line/)).toHaveCount(0);
});

test("Activity shows a placed hold's reference", async ({ page }) => {
  // The narrowest phone the app supports.
  if (isMobile(page)) await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ADA);
  await openHospital(page, "Havana Hospital");
  await page
    .getByRole("region", { name: "Legal holds" })
    .getByRole("button", { name: "Place a hold" })
    .click();
  const form = page.getByRole("dialog", { name: "Place a legal hold" });
  await expect(form.getByText("Havana Hospital")).toBeVisible();
  // The form fits the screen: no sideways scroll.
  expect(
    await page.evaluate(
      () => document.scrollingElement!.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await chooseReason(form, "Complaint");
  await form.getByLabel(/^Reference/).fill("CMP-2026-0101");
  await form.getByRole("button", { name: "Continue" }).click();
  const ask = stepUp(page, "Place a legal hold on Havana Hospital?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Place hold" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "CMP-2026-0101" }),
  ).toBeVisible();

  await openNav(page, "Activity");
  const main = page.getByRole("main");
  await expect(main.getByText(/CMP-2026-0101/).first()).toBeVisible();
});

test("phone: the list as cards, open a hold, back", async ({ page }) => {
  test.skip(!isMobile(page), "phones only");
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(holdsList(page)).toBeVisible();
  await openHold(page, "Harbour View Hospital", "HC-2026-0412");
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "Legal holds" }),
  ).toBeVisible();
  await expect(holdsList(page).getByText("HC-2026-0412")).toBeVisible();
});

test("Tunde, who asked, sees Waiting for a different platform admin to approve and no Approve", async ({
  page,
}) => {
  await signIn(page, TUNDE);
  await openNav(page, "Legal holds");
  await openHold(page, "Riverside Children's Hospital", "CMP-2026-0193");
  await expect(
    page.getByText("Waiting for a different platform admin to approve"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve lift" })).toHaveCount(
    0,
  );
});
