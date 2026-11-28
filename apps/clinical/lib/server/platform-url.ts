import "server-only";

/**
 * The platform admin app's sign-in page, from PLATFORM_APP_URL (its
 * address, e.g. https://platforms.example.org): https only, or http in
 * development; no credentials, query or fragment. Unset or not valid: null,
 * and the page says where to sign in without a link.
 */
export function platformSignInUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.PLATFORM_APP_URL?.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const dev = env.MHAI_DEPLOY_ENV === "development";
  if (u.protocol !== "https:" && !(dev && u.protocol === "http:")) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== "/" && u.pathname !== "") return null;
  return `${u.origin}/sign-in`;
}
