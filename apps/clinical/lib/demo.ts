/**
 * Whether this build is the public demo. Both flags are inlined at build
 * time (NEXT_PUBLIC_*), so in any other build the demo-only parts below
 * fold away.
 *
 * - NEXT_PUBLIC_USE_MOCK=true: the sample-data demo (no backend).
 * - NEXT_PUBLIC_DEMO=true: the public demo running live against the demo
 *   backend (synthetic data, seeded demo accounts, the sample AI).
 *
 * The demo ribbon ("Demo · sample data, not for clinical use") shows for
 * either; production sets neither.
 */
export function isMockBuild(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}

export function isLiveDemoBuild(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCK !== "true" &&
    process.env.NEXT_PUBLIC_DEMO === "true"
  );
}

export function isDemoBuild(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCK === "true" ||
    process.env.NEXT_PUBLIC_DEMO === "true"
  );
}
