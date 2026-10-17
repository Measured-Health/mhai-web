import type { InviteSkipReason } from "../api/admin-contract";
import { EMAIL_RE } from "../email";

/** At most this many people in one send (R8). */
export const INVITE_MAX = 200;
/** An emailed invite's life without hospital sign-on (spec §5.6). */
export const INVITE_DAYS = 7;

export type InviteLineStatus =
  "ok" | "invalid" | "duplicate" | "already_staff" | "domain_not_allowed";

export interface InviteLine {
  /** Lower-cased address, or the text as typed when it isn't one. */
  email: string;
  status: InviteLineStatus;
}

export const INVITE_PROBLEM: Record<Exclude<InviteLineStatus, "ok">, string> = {
  invalid: "Not an email address",
  duplicate: "Listed twice",
  already_staff: "Already on the staff list",
  domain_not_allowed: "Not a hospital email address",
};

/** The API's own reasons, in the same words. */
export const SKIP_REASON: Record<InviteSkipReason, string> = {
  invalid_email: INVITE_PROBLEM.invalid,
  duplicate: INVITE_PROBLEM.duplicate,
  already_staff: INVITE_PROBLEM.already_staff,
  domain_not_allowed: INVITE_PROBLEM.domain_not_allowed,
};

const ANGLE = /<([^<>]*)>/;

/** "a@x.org b@x.org": addresses separated only by spaces each get a line. */
function splitWords(chunk: string): string[] {
  if (/[<"]/.test(chunk)) return [chunk];
  const words = chunk.split(/\s+/);
  return words.filter((w) => w.includes("@")).length >= 2
    ? words.filter((w) => w.includes("@"))
    : [chunk];
}

function extract(chunk: string): string {
  const angle = ANGLE.exec(chunk);
  let t = (angle ? angle[1]! : chunk).trim();
  if (!angle && /\s/.test(t))
    t = t.split(/\s+/).find((w) => w.includes("@")) ?? t;
  return t
    .replace(/^mailto:/i, "")
    .replace(/^["']+|["']+$/g, "")
    .toLowerCase();
}

/**
 * Reads a typed or pasted list (R8): commas, semicolons, new lines and tabs
 * separate; `Name <email>` and `mailto:` work. A name part before a comma
 * ("Obi, Ngozi <n.obi@…>") belongs to the address after it.
 */
export function parseInviteList(
  text: string,
  ctx: { existing: readonly string[]; domains: readonly string[] },
): InviteLine[] {
  const existing = new Set(ctx.existing.map((e) => e.toLowerCase()));
  const domains = ctx.domains.map((d) => d.toLowerCase());
  const seen = new Set<string>();
  const chunks = text
    .split(/[,;\n\r\t\uFF0C\uFF1B\u3001]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap(splitWords);
  const out: InviteLine[] = [];
  chunks.forEach((chunk, i) => {
    const next = chunks[i + 1];
    // Only the opening half of a quoted name ("Obi, Ngozi" <…>) joins the
    // address after it; any other stray text stays as its own invalid line.
    if (/^"[^"]*$/.test(chunk) && next && /<[^<>]*@[^<>]*>/.test(next)) return;
    const email = extract(chunk);
    let status: InviteLineStatus = "ok";
    if (!EMAIL_RE.test(email)) status = "invalid";
    else if (seen.has(email)) status = "duplicate";
    else if (existing.has(email)) status = "already_staff";
    else if (domains.length && !domains.includes(email.split("@")[1]!))
      status = "domain_not_allowed";
    if (status !== "invalid") seen.add(email);
    out.push({ email: status === "invalid" ? chunk : email, status });
  });
  return out;
}

export const okEmails = (lines: InviteLine[]) =>
  lines.filter((l) => l.status === "ok").map((l) => l.email);
