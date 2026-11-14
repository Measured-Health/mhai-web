/**
 * A test drill key: a readable token made into core's shape (43 characters
 * of base64url), so fixtures can still say which row a key is for.
 */
export const drillKey = (token: string): string =>
  (token.replace(/[^A-Za-z0-9_-]/g, "_") + "_".repeat(43)).slice(0, 43);
