// The integrity rules (spec §8). Intact shows only with proof; a result goes
// stale after 26 hours; a failure keeps the banner up until the server
// clears it. Every state is words, never colour alone.
import type { VerifyRun } from "@/lib/api/audit-contract";
import { dateLabel, dayMonthLabel, num } from "@/lib/format";
import type { ReadRun, ReadStatus } from "./read";
import { utc } from "./words";

export type Shown = "intact" | "broken" | "couldnt_check" | "checking";

/** A check older than this is stale: never Intact in the header. */
export const STALE_MS = 26 * 3_600_000;

type Run = ReadRun | VerifyRun;

/** How far ahead of this clock a finish may be (clock skew). */
export const SKEW_MS = 5 * 60_000;

/**
 * The proof: a valid reply that names its whole range, with the last entry
 * no later than the finish and the finish no later than now plus the skew,
 * and nothing that contradicts it. The range may be fixed when the run
 * starts, so the last entry may come before the start.
 */
function proven(r: Run, now: number): boolean {
  if (
    r.state !== "intact" ||
    r.entries_checked === null ||
    r.entries_checked <= 0 ||
    (r.from_checkpoint === null && r.from_first !== true) ||
    r.to_seq === null ||
    r.to_at === null ||
    r.finished_at === null ||
    r.error_code !== null ||
    r.first_broken_seq !== null ||
    r.first_broken_id !== null ||
    r.first_broken_at !== null
  )
    return false;
  const last = Date.parse(r.to_at);
  const end = Date.parse(r.finished_at);
  return last <= end && end <= now + SKEW_MS;
}

export type Staleness =
  /** The check finished more than 26 h ago. */
  | { kind: "age"; finished: string }
  /** The check began long after the end of the range it covered. */
  | { kind: "range"; to_at: string };

/**
 * The one staleness rule, for a run that is proven: null while fresh. It is
 * stale when its finish is older than 26 h, or when it began more than 26 h
 * after the end of the range it checked (a quiet log is fine: the range end
 * is measured against the check's own start, not against now).
 */
export function staleness(
  run: Run,
  now: number,
  ageFrom: number = now,
): Staleness | null {
  if (!proven(run, now)) return null;
  const finished = run.finished_at!;
  if (ageFrom - Date.parse(finished) > STALE_MS)
    return { kind: "age", finished };
  if (
    run.started_at !== null &&
    Date.parse(run.started_at) - Date.parse(run.to_at!) > STALE_MS
  )
    return { kind: "range", to_at: run.to_at! };
  return null;
}

const staleWords = (s: Staleness) =>
  s.kind === "age"
    ? `Not checked since ${dateLabel(s.finished)}`
    : `Last check covered entries up to ${dateLabel(s.to_at)}`;

/**
 * `now` is the shared clock (`useNow`): a finish in the future isn't proof,
 * and a stale run is never Intact. `ageFrom` is the moment age is judged
 * against (default `now`); a history row passes the run's own `finished_at`,
 * and `now` stays the real clock, so a future finish never reads Intact.
 */
export function integrityOf(
  run: Run,
  now: number,
  ageFrom: number = now,
): Shown {
  if (run.state === "running") return "checking";
  if (run.state === "broken") return "broken";
  return proven(run, now) && !staleness(run, now, ageFrom)
    ? "intact"
    : "couldnt_check";
}

/** A check is running only when the server says so in a run that reads. */
export const isRunning = (s: ReadStatus | undefined) =>
  s?.running?.state === "running";

const pad = (n: number) => String(n).padStart(2, "0");
/** "06:00 today" or "21 Oct, 06:00", in local time. */
function checkedAt(iso: string, now: number): string {
  const t = new Date(iso);
  const n = new Date(now);
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const today =
    t.getFullYear() === n.getFullYear() &&
    t.getMonth() === n.getMonth() &&
    t.getDate() === n.getDate();
  return today ? `${hm} today` : `${dayMonthLabel(iso)}, ${hm}`;
}
/** When a run failed or ended: its finish, else its start. */
const endOf = (r: Run) => r.finished_at ?? r.started_at;

export type Tone = "ok" | "warn" | "bad";

/** The header's one line, in order of precedence. */
export function headerLine(
  s: ReadStatus,
  now: number,
): { tone: Tone; words: string } {
  const failed =
    s.open_failure ?? (s.latest?.state === "broken" ? s.latest : null);
  if (failed) {
    const at = endOf(failed);
    return {
      tone: "bad",
      words: at
        ? `Integrity: Broken · failed ${dateLabel(at)}`
        : "Integrity: Broken",
    };
  }
  if (isRunning(s)) return { tone: "ok", words: "Integrity: Checking…" };
  const r = s.latest;
  if (!r) return { tone: "warn", words: "Integrity: Not checked yet" };
  if (!proven(r, now)) {
    const at = endOf(r);
    return {
      tone: "warn",
      words: at
        ? `Integrity: Couldn't check · ${checkedAt(at, now)}`
        : "Integrity: Couldn't check",
    };
  }
  const stale = staleness(r, now);
  if (stale) return { tone: "warn", words: `Integrity: ${staleWords(stale)}` };
  const finished = r.finished_at!;
  return {
    tone: "ok",
    words: `Integrity: Intact · checked ${checkedAt(finished, now)}`,
  };
}

/** Where a check starts: "the checkpoint of 4 Jan 2027", or the first entry. */
function startWords(r: Run): string | null {
  const cp = r.from_checkpoint;
  if (cp)
    return cp.kind === "re_anchor"
      ? `the re-anchor of ${dateLabel(cp.at)}`
      : `the checkpoint of ${dateLabel(cp.at)}`;
  return r.from_first ? "the first entry" : null;
}

const UNKNOWN = "The check didn't finish, so the log's integrity is unknown.";

/** The state block's sentence (spec §8.1, word for word). */
export function runSentence(
  run: Run,
  now: number,
  ageFrom: number = now,
): string {
  const stale = staleness(run, now, ageFrom);
  if (stale)
    return stale.kind === "age"
      ? `${staleWords(stale)}.`
      : `Last check covered entries up to ${utc(stale.to_at)}.`;
  switch (integrityOf(run, now, ageFrom)) {
    case "intact":
      return `No changes found. Checked ${num(run.entries_checked!)} entries, from ${startWords(run)} to entry ${num(run.to_seq!)} (${utc(run.to_at!)}).`;
    case "broken": {
      const seq = run.first_broken_seq;
      if (seq === null)
        return "The log has been altered or damaged. Its entries can't be trusted until this is investigated.";
      const at = run.first_broken_at ? ` (${utc(run.first_broken_at)})` : "";
      return `The log has been altered or damaged. The first entry that doesn't match is ${num(seq)}${at}. Entries from there on can't be trusted until this is investigated.`;
    }
    case "checking": {
      const from = startWords(run);
      const n = run.entries_checked;
      if (n === null) return "Checking…";
      return `Checking… ${num(n)} entries checked so far${from ? `, from ${from}` : ""}.`;
    }
    case "couldnt_check":
      return `${UNKNOWN} ${errorWords(run.state === "error" ? run.error_code : null)}`;
  }
}

/** What the check covers: retention before the checkpoint, or a re-anchor. */
export function coverageLine(run: Run): string | null {
  const cp = run.from_checkpoint;
  if (!cp) return null;
  if (cp.kind === "re_anchor")
    return `Entries are checked from the re-anchor of ${dateLabel(cp.at)}${
      cp.incident_ref ? ` after incident ${cp.incident_ref}` : ""
    }.`;
  return `Entries before ${dateLabel(cp.before)} were removed by retention (${num(cp.purged_count)} entries, checkpoint of ${dateLabel(cp.at)}).`;
}

export function errorWords(code: VerifyRun["error_code"]): string {
  switch (code) {
    case "timed_out":
      return "It timed out.";
    case "unreachable":
      return "The log couldn't be reached.";
    default:
      return "The reply wasn't what was expected.";
  }
}

/** The failure banner: on while the server keeps a failure open. */
export function bannerOn(s: ReadStatus | undefined): {
  on: boolean;
  date: string | null;
} {
  const failed =
    s?.open_failure ?? (s?.latest?.state === "broken" ? s.latest : null);
  if (!failed) return { on: false, date: null };
  const at = endOf(failed);
  return { on: true, date: at ? dateLabel(at) : null };
}

/** Each state in words: shown beside its icon, never colour alone. */
export const SHOWN_WORDS: Record<Shown, string> = {
  intact: "Intact",
  broken: "Broken",
  couldnt_check: "Couldn't check",
  checking: "Checking…",
};

/**
 * A run's range for the history: "From the checkpoint of 4 Jan 2027 to entry
 * 9,881,204", with the first broken entry when there is one.
 */
export function rangeWords(run: Run): string {
  const from = startWords(run);
  const to = run.to_seq !== null ? `entry ${num(run.to_seq)}` : null;
  const span =
    from && to
      ? `From ${from} to ${to}`
      : from
        ? `From ${from}`
        : to
          ? `Up to ${to}`
          : "Range not recorded";
  return run.state === "broken" && run.first_broken_seq !== null
    ? `${span} · first broken entry ${num(run.first_broken_seq)}`
    : span;
}

/** A local calendar day, "YYYY-MM-DD". */
export type LocalDay = string;

const dayOf = (t: Date): LocalDay =>
  `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

/**
 * The days to export around a break, as whole local days (like a custom
 * range): from the day before the first broken entry's day, through today.
 */
export function breakRange(
  run: Run,
  now: number,
): { from: LocalDay; to: LocalDay } | null {
  if (run.first_broken_at === null) return null;
  const before = new Date(run.first_broken_at);
  before.setDate(before.getDate() - 1);
  return { from: dayOf(before), to: dayOf(new Date(now)) };
}
