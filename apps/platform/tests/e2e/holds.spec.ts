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

/**
 * Picks a reason in the place-a-hold form. On a phone the form is taller than
 * the screen and the sticky header covers the radio whichever way Playwright
 * scrolls it, so the radio itself gets the click event.
 */
async function chooseReason(form: Locator, reason: string) {
  await form
    .getByRole("radio", { name: reason, exact: true })
    .dispatchEvent("click");
}

/** Opens one hold from the list, by its hospital's name. */
async function openHold(page: Page, hospital: string, reference: string) {
  await holdsList(page).getByRole("link", { name: hospital }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: reference }),
  ).toBeVisible();
}

test("Legal holds opens on Open holds; Lifted shows the grace period", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await expect(page.getByLabel("Status")).toHaveValue("open");
  const list = holdsList(page);
  await expect(list.getByText("HC/2026/0412")).toBeVisible();
  await expect(list.getByText("REG-INSP-2291")).toBeVisible();
  await expect(list.getByText("CMP-0193")).toBeVisible();
  await expect(list.getByText("Review due")).toBeVisible();
  await expect(list.getByText("Lift requested")).toBeVisible();
  await expect(list.getByText("INV-77")).toHaveCount(0);

  await page.getByLabel("Status").selectOption({ label: "Lifted" });
  await expect(list.getByText("INV-77")).toBeVisible();
  await expect(
    list.getByText(/^Lifted · records released on \d+ \w+ \d{4}$/),
  ).toBeVisible();
  await expect(list.getByText(/^Lifted by Ada Bakare · /)).toBeVisible();
  await expect(list.getByText("HC/2026/0412")).toHaveCount(0);
});

test("the hospital pages show holds, the Hold tag and View holds", async ({
  page,
}) => {
  await signIn(page, ADA);
  // Harbour View, Northgate, Riverside and Lakeside; not Havana (released).
  await expect(
    page.getByRole("main").getByText("Hold", { exact: true }),
  ).toHaveCount(4);

  await openHospital(page, "Harbour View Hospital");
  const holds = page.getByRole("region", { name: "Legal holds" });
  const link = holds.getByRole("link", { name: /HC\/2026\/0412/ });
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
  await expect(holdsList(page).getByText("HC/2026/0412")).toBeVisible();
  await expect(holdsList(page).getByText("CMP-0193")).toHaveCount(0);
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
  await form.getByLabel(/^Reference/).fill("CMP-2026-9");
  await form.getByLabel(/^Asked for by/).fill("The complaints office");
  await form.getByRole("button", { name: "Continue" }).click();
  const ask = stepUp(page, "Place a legal hold on Southpoint Hospital?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Place hold" }).click();

  // It goes to the new hold; from there back to the hospital.
  await expect(
    page.getByRole("heading", { level: 1, name: "CMP-2026-9" }),
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

test("Tunde asked to lift Riverside's hold; Ada approves with her code and sees Lifted · records released on …", async ({
  page,
}) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await openHold(page, "Riverside Children's Hospital", "CMP-0193");
  await expect(
    page.getByText(/Requested by Tunde Okafor/).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve lift" }).click();
  const ask = stepUp(page, "Approve lifting CMP-0193?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Approve lift" }).click();
  await expect(ask).toBeHidden();
  await expect(
    page.getByText(/Lifted · records released on \d+ \w+ \d{4}/).first(),
  ).toBeVisible();
});

test("Ada undoes Lakeside's lift", async ({ page }) => {
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await page.getByLabel("Status").selectOption({ label: "Lifted" });
  await openHold(page, "Lakeside Community Clinic", "INV-77");
  await expect(
    page.getByText(/Lifted · records released on/).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo lift" }).click();
  const ask = stepUp(page, "Put the hold back?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Undo lift" }).click();
  await expect(ask).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: "Details" })
      .getByText(/^(Active|Review due)/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo lift" })).toHaveCount(0);
});

const CONTROLS =
  /^(Place a hold|Edit|Request lift|Approve lift|Undo lift|Cancel request)$/;

test("the auditor sees holds without controls", async ({ page }) => {
  await signIn(page, AMARA);
  await openNav(page, "Legal holds");
  const main = page.getByRole("main");
  await expect(holdsList(page).getByText("HC/2026/0412")).toBeVisible();
  await expect(main.getByRole("button", { name: CONTROLS })).toHaveCount(0);

  await openNav(page, "Hospitals");
  await openHospital(page, "Harbour View Hospital");
  await expect(
    page
      .getByRole("region", { name: "Legal holds" })
      .getByRole("link", { name: /HC\/2026\/0412/ }),
  ).toBeVisible();
  await expect(main.getByRole("button", { name: CONTROLS })).toHaveCount(0);
});

test("the auditor sees a hold's note and history, and no controls", async ({
  page,
}) => {
  await signIn(page, AMARA);
  await openNav(page, "Legal holds");
  await page.getByLabel("Status").selectOption({ label: "All" });
  await openHold(page, "Havana Hospital", "BRD-2026-03");
  const main = page.getByRole("main");
  await expect(
    main.getByText("Board request pending legal review"),
  ).toBeVisible();
  await expect(main.getByText("Ada Bakare").first()).toBeVisible();
  await expect(main.getByRole("button", { name: CONTROLS })).toHaveCount(0);
});

test("Activity shows the reference but not the note", async ({ page }) => {
  const note = "Counsel says do not release anything";
  await signIn(page, ADA);
  await openHospital(page, "Havana Hospital");
  await page
    .getByRole("region", { name: "Legal holds" })
    .getByRole("button", { name: "Place a hold" })
    .click();
  const form = page.getByRole("dialog", { name: "Place a legal hold" });
  await expect(form.getByText("Havana Hospital")).toBeVisible();
  await chooseReason(form, "Complaint");
  await form.getByLabel(/^Reference/).fill("CMP-NOTE-1");
  await form.getByLabel(/^Asked for by/).fill("The complaints office");
  await form.getByLabel(/^Note/).fill(note);
  await form.getByRole("button", { name: "Continue" }).click();
  const ask = stepUp(page, "Place a legal hold on Havana Hospital?");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Place hold" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "CMP-NOTE-1" }),
  ).toBeVisible();

  await openNav(page, "Activity");
  const main = page.getByRole("main");
  await expect(main.getByText(/CMP-NOTE-1/).first()).toBeVisible();
  await expect(main.getByText(note)).toHaveCount(0);
});

test("phone: the list as cards, open a hold, back", async ({ page }) => {
  test.skip(!isMobile(page), "phones only");
  await signIn(page, ADA);
  await openNav(page, "Legal holds");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(holdsList(page)).toBeVisible();
  await openHold(page, "Harbour View Hospital", "HC/2026/0412");
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "Legal holds" }),
  ).toBeVisible();
  await expect(holdsList(page).getByText("HC/2026/0412")).toBeVisible();
});

test("a different admin sees the Riverside request as waiting for approval", async ({
  page,
}) => {
  await signIn(page, TUNDE);
  await openNav(page, "Legal holds");
  await openHold(page, "Riverside Children's Hospital", "CMP-0193");
  await expect(
    page.getByText("Waiting for a different platform admin to approve"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve lift" })).toHaveCount(
    0,
  );
});
