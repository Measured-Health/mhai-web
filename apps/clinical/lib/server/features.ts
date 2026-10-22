/**
 * Analysis is off in live mode until the hospital signs it off. Server only:
 * this env var is never sent to the browser. True only for exactly "true".
 */
export const analysisSignedOff = (
  env: Record<string, string | undefined> = process.env,
): boolean => env.ANALYSIS_SIGNED_OFF === "true";
