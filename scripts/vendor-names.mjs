// The one list of product and vendor names that must never appear in the
// apps or packages. Shared by scripts/no-vendor-names.test.mjs and the
// clinical app's mock-analysis test. (Kept apart from the test file so
// importing the list does not run the guard.)
export const VENDOR_NAMES = [
  "epic",
  "cerner",
  "oracle",
  "openmrs",
  "meditech",
  "athena",
  "allscripts",
  "nextgen",
  "eclinicalworks",
  "dhis",
  "bahmni",
];
