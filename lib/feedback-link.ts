/** Page path with ids masked, plus the viewport. Never form or result content. */
export function feedbackUrl(page: string, viewport: string): string {
  const path = page.split(/[?#]/)[0] ?? "";
  const masked = path.replace(/^\/(c|print)\/[^/]+/, "/$1/[id]");
  const size = /^\d{2,5}×\d{2,5}$/.test(viewport) ? viewport : "";
  const u = new URL("https://github.com/Measured-Health/mhai-web/issues/new");
  u.searchParams.set("template", "design-feedback.yml");
  u.searchParams.set("labels", "design-feedback");
  u.searchParams.set("page", masked || "/");
  u.searchParams.set("viewport", size);
  return u.toString();
}
