import type {
  AlertLocationOut,
  AlertOut,
  AlertSeverity,
  AlertStatus,
  CauseConfidence,
  DismissReason,
  FindingOut,
  LikelyCauseOut,
} from "../api/alerts-contract";
import { RESULT_LABEL } from "../labels";
import { eventClock } from "../time";

/**
 * Severity as a word; the icon is in components/notifications/chips.tsx.
 * `rank` orders pop-ups: most severe first.
 */
export const SEVERITY: Record<
  AlertSeverity,
  { label: string; tone: "bad" | "warn" | "muted"; rank: number }
> = {
  critical: { label: "Critical", tone: "bad", rank: 0 },
  urgent: { label: "Urgent", tone: "warn", rank: 1 },
  info: { label: "Info", tone: "muted", rank: 2 },
};

/** An unknown severity reads Urgent: never quietly downgraded to Info (R9). */
export const severityOf = (s: string): AlertSeverity =>
  Object.hasOwn(SEVERITY, s) ? (s as AlertSeverity) : "urgent";

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  new: "New",
  handled: "Handled",
  dismissed: "Dismissed",
};

export const NOT_STANDARDISED = "Not standardised";
export const LOCATION_NOT_RECORDED = "Location not recorded";
/** Likely causes shown at most (spec §3). */
export const CAUSE_MAX = 3;
/** The longest dismiss note the API takes (spec §10 item 20). */
export const DISMISS_NOTE_MAX = 500;

export const DISMISS_REASONS: readonly {
  code: DismissReason;
  label: string;
}[] = [
  { code: "not_relevant", label: "Not clinically relevant" },
  { code: "already_known", label: "Already known" },
  { code: "wrong_patient", label: "Wrong patient" },
  { code: "other", label: "Other" },
];

export const dismissReasonLabel = (r: DismissReason | null): string | null =>
  DISMISS_REASONS.find((x) => x.code === r)?.label ?? null;

const FLAG_WORD: Record<string, string> = {
  low: "low",
  high: "high",
  abnormal: "abnormal",
};

/** A finding's direction in words. An unknown flag is still a flag: it reads "abnormal", never as normal (F4). */
export const flagWord = (flag: string | null | undefined): string | null =>
  flag
    ? Object.hasOwn(FLAG_WORD, flag)
      ? FLAG_WORD[flag]
      : FLAG_WORD.abnormal
    : null;

/**
 * "Potassium 2.9 mmol/L (low; normal 3.5–5.1)". The range is the source's,
 * as given. Missing parts are left out, never guessed (R9).
 */
export function findingLine(f: FindingOut): string {
  const name = f.name?.trim() || "Result";
  const value = f.value?.trim() || null;
  const unit = value ? f.unit?.trim() || null : null;
  const head = [name, value, unit].filter(Boolean).join(" ");
  const flag = flagWord(f.flag);
  const range = f.reference_range?.trim()
    ? `normal ${f.reference_range.trim()}`
    : null;
  const extra = [flag, range].filter(Boolean).join("; ");
  return extra ? `${head} (${extra})` : head;
}

/** When it was recorded: "08:42" today, "16 Oct 08:42" before; null when missing or unreadable. */
export function recordedLabel(
  f: Pick<FindingOut, "recorded_at">,
  now: number,
): string | null {
  return f.recorded_at ? eventClock(f.recorded_at, now) || null : null;
}

/** "Ward 3 · Bed 12", "Outpatient · Cardiology clinic", "Emergency department" or "Location not recorded". */
export function locationLabel(l: AlertLocationOut | null | undefined): string {
  if (!l) return LOCATION_NOT_RECORDED;
  switch (l.kind) {
    case "admitted":
      return (
        [l.ward?.trim(), l.bed?.trim()].filter(Boolean).join(" · ") ||
        "Admitted"
      );
    case "outpatient":
      return l.clinic?.trim()
        ? `Outpatient · ${l.clinic.trim()}`
        : "Outpatient";
    case "emergency":
      return "Emergency department";
    default:
      return LOCATION_NOT_RECORDED;
  }
}

const LEVELS = new Set<string>(["high", "caution", "review"]);

export interface CauseView {
  label: string;
  level: CauseConfidence;
  /** The result label (spec §6). */
  word: string;
  /** "Label · value · time", at most EVIDENCE_MAX. */
  evidence: string[];
}

/** Evidence lines shown under a cause, at most. */
export const EVIDENCE_MAX = 3;

/** Label, value and time, joined by " · "; blank labels dropped; at most three. */
export function evidenceOf(c: LikelyCauseOut, now: number): string[] {
  return (c.evidence ?? [])
    .filter((e) => e.label?.trim())
    .slice(0, EVIDENCE_MAX)
    .map((e) =>
      [
        e.label.trim(),
        e.value?.trim() || null,
        e.recorded_at ? eventClock(e.recorded_at, now) || null : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
}

/** Missing routing reads as sent to you (today's behaviour). */
export function routingOf(a: Pick<AlertOut, "routing">): {
  to_you: boolean;
  queue: boolean;
} {
  return a.routing
    ? { to_you: !!a.routing.to_you, queue: !!a.routing.queue }
    : { to_you: true, queue: false };
}

export const ROUTE_LABEL = { you: "For you", queue: "Hospital queue" };

/** At most three, with the result labels' words; an unknown level reads "Needs review" (R9). */
export function likelyCauses(
  a: Pick<AlertOut, "likely_causes">,
  now: number,
): CauseView[] {
  return (a.likely_causes ?? [])
    .filter((c) => c.label?.trim())
    .slice(0, CAUSE_MAX)
    .map((c) => {
      const level: CauseConfidence = LEVELS.has(c.confidence)
        ? c.confidence
        : "review";
      return {
        label: c.label.trim(),
        level,
        word: RESULT_LABEL[level],
        evidence: evidenceOf(c, now),
      };
    });
}

/**
 * "Acknowledged by Dr. Reyes · 09:12";
 * "Dismissed by Nurse Bello · 16 Oct 04:20 · Already known"; null while new.
 */
export function handledLine(
  a: Pick<AlertOut, "status" | "handled_by" | "handled_at" | "dismiss_reason">,
  now: number,
): string | null {
  if (a.status === "new") return null;
  const verb = a.status === "dismissed" ? "Dismissed" : "Acknowledged";
  const name = a.handled_by?.display_name?.trim();
  return [
    name ? `${verb} by ${name}` : verb,
    a.handled_at ? eventClock(a.handled_at, now) || null : null,
    a.status === "dismissed" ? dismissReasonLabel(a.dismiss_reason) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The record link only when the API gave an https one; the UI never builds one (R8). */
export function recordLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The source label and filter only matter with more than one connected system (R10). */
export const showSources = (sources: readonly string[] | undefined) =>
  (sources?.length ?? 0) > 1;
