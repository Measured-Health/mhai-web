/**
 * Analysis is off in live mode until the hospital signs it off. Server only:
 * this env var is never sent to the browser. True only for exactly "true".
 */
export const analysisSignedOff = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.ANALYSIS_SIGNED_OFF === "true";

/**
 * Named drill-down (Plan 11) is off in live mode until clinical, privacy and
 * legal sign-off are all recorded. Server only, like `analysisSignedOff`;
 * true only for exactly "true". The backend switch stays the authority: this
 * key only lets the clinical server refuse everything about names.
 */
export const namedSignedOff = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.NAMED_ACCESS_SIGNED_OFF === "true";
