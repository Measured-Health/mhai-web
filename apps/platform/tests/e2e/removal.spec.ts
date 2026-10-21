import { expect, test } from "@playwright/test";
import {
  ADA,
  CODE,
  expectNoStorage,
  openHospital,
  signIn,
  signOut,
  stepUp,
  TUNDE,
  typeCode,
} from "./helpers";

test.afterEach(async ({ page }) => expectNoStorage(page));

test("removal needs a second platform admin: Ada requests, Tunde approves", async ({
  page,
}) => {
  const name = "Westfield Clinic";
  // 1. Ada requests removal of Westfield (deactivated, retention passed).
  await signIn(page, ADA);
  await openHospital(page, name);
  await page
    .getByRole("region", { name: "Danger zone" })
    .getByRole("button", { name: "Request removal" })
    .click();
  const ask = stepUp(page, `Request removal of ${name}?`);
  await ask.getByLabel("Reason").fill("The contract ended in March.");
  await typeCode(page, CODE, ask);
  await ask.getByRole("button", { name: "Request removal" }).click();
  await expect(ask).toBeHidden();

  // 2. She can't approve her own request.
  const removal = page.getByRole("region", { name: "Removal" });
  await expect(
    removal.getByText("Waiting for a different platform admin"),
  ).toBeVisible();
  await expect(
    removal.getByRole("button", { name: "Approve removal" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Status" }).getByText("Removal pending"),
  ).toBeVisible();

  // 3. She signs out; 4. Tunde signs in, in the same tab, and approves.
  await signOut(page);
  await signIn(page, TUNDE);
  await openHospital(page, name);
  await expect(
    removal.getByText(/^Requested by Ada Bakare · .+ · The contract ended/),
  ).toBeVisible();
  await removal.getByRole("button", { name: "Approve removal" }).click();
  const approve = stepUp(page, `Approve removal of ${name}?`);
  await typeCode(page, CODE, approve);
  await approve.getByRole("button", { name: "Approve removal" }).click();
  await expect(approve).toBeHidden();

  // 5. The page shows Removal scheduled.
  await expect(
    page
      .getByRole("region", { name: "Status" })
      .getByText("Removal scheduled", { exact: true }),
  ).toBeVisible();
  await expect(
    removal.getByText(/Removal scheduled · approved by Tunde Okafor/),
  ).toBeVisible();

  // Cancelling a scheduled removal asks first; Keep leaves it scheduled.
  await removal.getByRole("button", { name: "Cancel request" }).click();
  const confirm = page.getByRole("dialog", {
    name: `Cancel the removal of ${name}?`,
  });
  await expect(
    confirm.getByText("It will need a new request and approval."),
  ).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Keep" })).toBeFocused();
  await confirm.getByRole("button", { name: "Keep" }).click();
  await expect(confirm).toBeHidden();
  await expect(
    page
      .getByRole("region", { name: "Status" })
      .getByText("Removal scheduled", { exact: true }),
  ).toBeVisible();
});

test("the legal-hold hospital can't be approved", async ({ page }) => {
  // Harbour View: requested by Tunde, held by a legal hold.
  await signIn(page, ADA);
  await openHospital(page, "Harbour View Hospital");
  const removal = page.getByRole("region", { name: "Removal" });
  await expect(removal.getByText("1 legal hold is active")).toBeVisible();
  await expect(
    removal.getByText(
      "Removal can't go ahead until the checks above are cleared.",
    ),
  ).toBeVisible();
  await expect(
    removal.getByRole("button", { name: "Approve removal" }),
  ).toBeDisabled();
});
