import { test } from "@playwright/test";
import { enrolled, firstSignIn } from "./live";

/** The synthetic platform admin's and auditor's first sign-ins, once per stack. */
for (const name of ["padmin", "auditor"])
  test(`first sign-in: ${name}`, async ({ page }) => {
    test.skip(enrolled(name), "already set up");
    await firstSignIn(page, name);
  });
