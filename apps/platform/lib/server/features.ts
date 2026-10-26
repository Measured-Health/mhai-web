// The deployment's own switches for Analysis (Plan 12). They can only keep it
// off: the server has its own switches, and this never turns on what the
// server has off. Each is on only for exactly "true".

/** The Analysis aggregates: the page and its calls. */
export const analysisSignedOff = (env: NodeJS.ProcessEnv = process.env) =>
  env.ANALYSIS_SIGNED_OFF === "true";

/** The de-identified patient lists, on top of the aggregates. Unused until 12b adds the patients path. */
export const patientViewsSignedOff = (env: NodeJS.ProcessEnv = process.env) =>
  env.ANALYSIS_PATIENT_VIEWS_SIGNED_OFF === "true";
