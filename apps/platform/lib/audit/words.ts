// The audit log's words: lines, people, hospitals, outcomes, counts,
// filters and gaps. Built from fields only; dates use fixed English months.
import {
  PSEUDONYM_PREFIX,
  type AuditActor,
  type AuditEvent,
  type AuditFilters,
  type AuditHospital,
  type Checkpoint,
  type NamedAccessFilters,
  type Outcome,
  type RecordedFilters,
} from "@/lib/api/audit-contract";
import { MONTHS, dateLabel, dayMonthLabel, num } from "@/lib/format";
import { REASON_WORDS, ROLE_WORDS, TYPE_WORDS, kindOf } from "./kinds";

/** What happened, in plain words. Only for an entry that read. */
export const eventLine = (e: AuditEvent): string =>
  kindOf(e.kind)?.words(e) ?? "This entry can't be displayed";

export const ACTOR_KIND_WORDS: Record<AuditActor["kind"], string> = {
  platform: "Measured Health",
  staff: "Hospital staff",
  system: "System",
};

/** "Ada Bakare · Platform admin · Measured Health", or "System". */
export const whoLine = (a: AuditActor): string =>
  a.kind === "system"
    ? "System"
    : `${a.name} · ${ROLE_WORDS[a.role]} · ${ACTOR_KIND_WORDS[a.kind]}`;

export const hospitalWords = (h: AuditHospital | null): string =>
  h === null ? "Platform" : h.removed ? `${h.name} (removed)` : h.name;

export const OUTCOME_WORDS: Record<Outcome, string> = {
  succeeded: "Succeeded",
  refused: "Refused",
  failed: "Failed",
};

/** "Refused · wrong code". A success carries no reason. */
export function outcomeWords(o: Outcome, reason?: string | null): string {
  const r =
    o !== "succeeded" && reason && Object.hasOwn(REASON_WORDS, reason)
      ? REASON_WORDS[reason]
      : null;
  return r
    ? `${OUTCOME_WORDS[o]} · ${r.charAt(0).toLowerCase()}${r.slice(1)}`
    : OUTCOME_WORDS[o];
}

/** "1 event", "1,284 events" or "More than 10,000 events". */
export function countWords(total: number, capped: boolean): string {
  if (capped) return "More than 10,000 events";
  return total === 1 ? "1 event" : `${num(total)} events`;
}

/** "23 Sep–22 Oct 2026" for [from, to): `to` is the next local midnight. */
function rangeWords(from?: string, to?: string): string {
  const last = to ? new Date(Date.parse(to) - 1).toISOString() : undefined;
  if (from && last) {
    const a = dateLabel(from);
    const b = dateLabel(last);
    if (a === b) return a;
    return a.slice(-4) === b.slice(-4)
      ? `${dayMonthLabel(from)}–${b}`
      : `${a}–${b}`;
  }
  if (from) return `From ${dateLabel(from)}`;
  if (last) return `Up to ${dateLabel(last)}`;
  return "All dates";
}

export type FilterNames = {
  hospital?: string | null;
  person?: string | null;
  clearance?: string | null;
};

/**
 * "All hospitals · 23 Sep–22 Oct 2026 · Sign-in, Security · Refused ·
 * Flagged only". Ids show by their names; a search never shows what was
 * searched (it may be a patient's pseudonym).
 */
export function filtersInWords(
  f: AuditFilters | RecordedFilters | NamedAccessFilters,
  names: FilterNames,
): string {
  const parts: string[] = [];
  parts.push(
    f.hospital === undefined
      ? "All hospitals"
      : f.hospital === "platform"
        ? "Platform only"
        : (names.hospital ?? "One hospital"),
  );
  if (f.person) parts.push(names.person ?? "One person");
  if ("clearance" in f && f.clearance)
    parts.push(`Clearance letter ${names.clearance ?? f.clearance}`);
  parts.push(rangeWords(f.from, f.to));
  if ("type" in f && f.type?.length)
    parts.push(f.type.map((t) => TYPE_WORDS[t]).join(", "));
  if ("outcome" in f && f.outcome) parts.push(OUTCOME_WORDS[f.outcome]);
  if ("flagged" in f && f.flagged) parts.push("Flagged only");
  if ("q" in f && f.q)
    parts.push(
      typeof f.q === "object" || f.q.startsWith(PSEUDONYM_PREFIX)
        ? "Searched for a patient id"
        : "Searched for one id",
    );
  return parts.join(" · ");
}

/**
 * The retention gap (spec §6.1), when the range reaches back past the
 * oldest entry kept; null inside the range.
 */
export function gapLine(
  from: string | undefined,
  oldestKeptAt: string,
  cp: Checkpoint | null,
): string | null {
  if (from !== undefined && Date.parse(from) >= Date.parse(oldestKeptAt))
    return null;
  const before = dateLabel(oldestKeptAt);
  return cp?.kind === "retention"
    ? `Entries before ${before} were removed by retention on ${dateLabel(cp.at)} (checkpoint recorded).`
    : `Entries before ${before} are no longer kept.`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "22 Oct 2026 06:00 UTC": for the detail and for files. */
export function utc(iso: string): string {
  const t = new Date(iso);
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
}
