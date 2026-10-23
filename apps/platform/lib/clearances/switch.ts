// The named-access switch's wording and choices (Plan 11b). Pure rules; the
// server sends the positions and `today`.
import { dayLabel, POSITION_LABEL, POSITION_ORDER } from "@mhai/ui/clearances";
import type {
  NamedPosition,
  Signoffs,
  SwitchRequest,
  SwitchState,
} from "@/lib/api/clearances-contract";
import { SIGNOFF_KINDS } from "@/lib/api/clearances-contract";

/** The longest any one sign-off entry may be. */
export const SIGNOFF_MAX = 200;

/**
 * An instant as the viewer's own calendar day, "3 Feb 2027" (display only:
 * no access decision depends on it), or "" if it isn't a time.
 */
function instantDay(iso: string | null): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return dayLabel(
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
  );
}

/** Where a switch stands, and how it got there. */
export function positionLine(s: SwitchState): string {
  const last = s.history[0];
  if (!last) return POSITION_LABEL[s.position];
  const day = instantDay(s.since ?? last.at);
  const head = `${POSITION_LABEL[s.position]}${day ? ` since ${day}` : ""}`;
  if (last.lowered_by)
    return `${head} · turned down by ${last.lowered_by.name}${
      last.reason ? `: ${last.reason}` : ""
    }`;
  const by = [
    last.requested_by && `requested by ${last.requested_by.name}`,
    last.approved_by && `approved by ${last.approved_by.name}`,
  ].filter(Boolean);
  return by.length ? `${head} · ${by.join(", ")}` : head;
}

const rank = (p: NamedPosition) => POSITION_ORDER.indexOf(p);

/** Positions above `current` up to `ceiling`: the global position for a hospital, On for the global switch. */
export function raiseOptions(
  current: NamedPosition,
  ceiling: NamedPosition,
): NamedPosition[] {
  return POSITION_ORDER.filter(
    (p) => rank(p) > rank(current) && rank(p) <= rank(ceiling),
  );
}

/** Positions below `current`, lowest first. */
export function lowerOptions(current: NamedPosition): NamedPosition[] {
  return POSITION_ORDER.filter((p) => rank(p) < rank(current));
}

export function requestLine(r: SwitchRequest): string {
  const day = instantDay(r.requested_at);
  const line = `${r.requested_by.name} asked to turn it ${POSITION_LABEL[r.position]}${
    day ? ` · ${day}` : ""
  }`;
  return r.requested_by_you
    ? `${line} · Waiting for a different platform admin to approve`
    : line;
}

const FILL_IN =
  "Fill in who signed, when, and the document for clinical, privacy and legal";

/**
 * What stops a raise being asked for, or null. `today` is the server's day;
 * a sign-off dated after it is refused. A bad `today` throws.
 */
export function signoffProblem(
  s: Partial<Signoffs>,
  today: string,
): string | null {
  dayLabel(today);
  let tooLong = false;
  let future = false;
  for (const kind of SIGNOFF_KINDS) {
    const o = s[kind];
    const by = o?.by?.trim() ?? "";
    const at = o?.at?.trim() ?? "";
    const ref = o?.ref?.trim() ?? "";
    if (!by || !at || !ref) return FILL_IN;
    try {
      dayLabel(at);
    } catch {
      return FILL_IN;
    }
    if (by.length > SIGNOFF_MAX || ref.length > SIGNOFF_MAX) tooLong = true;
    if (at > today) future = true;
  }
  if (tooLong) return "Keep each sign-off entry to 200 characters or fewer";
  if (future) return "A sign-off date can't be in the future";
  return null;
}
