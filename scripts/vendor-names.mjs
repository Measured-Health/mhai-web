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
  "athenahealth",
  "allscripts",
  "nextgen",
  "eclinicalworks",
  "dhis",
  "bahmni",
];

const WORDS = new RegExp(`\\b(?:${VENDOR_NAMES.join("|")})\\b`, "i");

/**
 * Split identifiers into their parts: camelCase boundaries, `_`, `-` and
 * digits all become spaces, so `EpicClient`, `epic_fhir` and `DHIS2` read as
 * words.
 */
export function splitIdentifiers(text) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-0-9]+/g, " ");
}

/** The first vendor name in `text` (as a whole word, any case), or null. */
export function findVendor(text) {
  return WORDS.exec(splitIdentifiers(text))?.[0] ?? null;
}
