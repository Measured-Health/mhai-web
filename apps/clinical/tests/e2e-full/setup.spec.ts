import { test } from "@playwright/test";
import { enrolled, firstSignIn } from "./live";

/** Each synthetic person's first sign-in, once per stack. */
for (const name of ["clinician", "analyst", "hadmin"])
  test(`first sign-in: ${name}`, async ({ page }) => {
    test.skip(enrolled(name), "already set up");
    await firstSignIn(page, name);
  });
