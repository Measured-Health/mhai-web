// The demo's legal holds (Plan 8a), built on the mock core. Memory only. It
// refuses what core refuses (openapi 1.26.0), with the same codes: a hold
// keeps every record, carries no note and no name, a lift's authority is a
// document reference, a lift lands at once on approval, and editing a hold
// or undoing a lift is 501 `not_implemented`.
import { ApiError } from "@mhai/api-client/errors";
import type { Hospital, Person, TeamMember } from "./contract";
import type { HospitalRecord } from "./fixtures";
import {
  DOCUMENT_REFERENCE,
  HOLD_REASONS,
  HOLD_STATUSES,
  LAPSE_DAYS,
  LIFT_REASONS,
  keepsRecords,
  shortHold,
  type HoldEvent,
  type HoldReason,
  type HoldShort,
  type HoldStatus,
  type HoldsClient,
  type LegalHold,
  type LegalHoldDetail,
  type LiftReason,
} from "./holds-contract";
import { HOLD_REASON_WORDS, LIFT_REASON_WORDS, dateIn } from "./holds-fixtures";
import type { MockCore } from "./mock";

const D = 24 * 3_600_000;
const PAGE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN: readonly HoldStatus[] = ["active", "review_due", "lift_requested"];
/** A review date at most this many years ahead. */
const REVIEW_MAX_YEARS = 5;

const iso = (ms: number) => new Date(ms).toISOString();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });

/** A document reference (`LH-2026-0042`), else 422. */
function reference(v: unknown): string {
  return typeof v === "string" && DOCUMENT_REFERENCE.test(v) ? v : invalid();
}
/** No free text and no names: only absent, null or "" pass, else 422. */
function nothing(v: unknown) {
  if (v !== undefined && v !== null && v !== "") invalid();
}
/** The words Activity's detail carries for a hold's reason (none for the CLI's). */
const reasonWords = (r: HoldReason | null) =>
  r === null ? "" : HOLD_REASON_WORDS[r];
/** A real calendar date, YYYY-MM-DD, else 422. */
function day(v: unknown): string {
  if (typeof v !== "string" || !DATE.test(v)) return invalid();
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(v)
    ? v
    : invalid();
}
/** The hold's version the person saw, which every change sends; else 422. */
function versionOf(body: unknown): number {
  const v = (body as { version?: unknown } | null)?.version;
  return typeof v === "number" ? v : invalid();
}

/** Today in the hospital's time zone. */
const today = (r: HospitalRecord, now: number) =>
  dateIn(now, r.hospital.time_zone);
/** Where a hold goes back to when a lift ends without lifting it. */
const openStatus = (r: HospitalRecord, h: LegalHold, now: number) =>
  today(r, now) >= h.review_on ? "review_due" : "active";
/** A list item: the hold without its history. */
function withoutHistory(h: LegalHoldDetail): LegalHold {
  const out: Partial<LegalHoldDetail> = { ...h };
  delete out.history;
  return out as LegalHold;
}
const hospitalRef = (h: Hospital): Person => ({ id: h.id, name: h.name });

/**
 * The holds whose lift request lapsed: core ends it with no history line
 * and no Activity (no person did it), and an approval after it is 409
 * `expired`.
 */
const lapsed = new WeakSet<LegalHoldDetail>();

/**
 * Time-driven changes to a hospital's holds: a review date reached, a lift
 * request lapsed. Run with every read of the hospital (the hospitals part's
 * settle). Neither is a person's action, so neither is in Activity.
 */
export function settleHolds(r: HospitalRecord, now: number) {
  for (const h of r.holds) {
    const lift = h.lift;
    if (h.status === "lift_requested" && lift) {
      if (now >= Date.parse(lift.expires_at)) {
        h.status = openStatus(r, h, now);
        h.lift = null;
        h.version++;
        lapsed.add(h);
      }
    }
    if (h.status === "active" && today(r, now) >= h.review_on) {
      h.status = "review_due";
      h.version++;
    }
  }
}

/** A hospital's holds that keep its records, in short form. */
export const keptHolds = (r: HospitalRecord): HoldShort[] =>
  r.holds.filter(keepsRecords).map(shortHold);

export type HoldsMockOptions = {
  /** Hospitals whose removal has started deleting: a hold there is 409. */
  removalStarted?: string[];
};

export function holdsMock(
  core: MockCore,
  { removalStarted = [] }: HoldsMockOptions = {},
): HoldsClient {
  const { now } = core;
  /** Every hospital brought up to date (which settles their holds). */
  const settled = () =>
    core.hospitals().map((r) => core.findHospital(r.hospital.id));
  /** The hold and its hospital, settled; 404 when there is none. */
  function find(id: string): { r: HospitalRecord; h: LegalHoldDetail } {
    for (const r of settled()) {
      const h = r.holds.find((x) => x.id === id);
      if (h) return { r, h };
    }
    return fail(404, "not_found");
  }
  /** A change to the hold: a new version and a line in its history. */
  function record(
    h: LegalHoldDetail,
    m: TeamMember,
    event: HoldEvent["action"],
    detail: string | null,
  ) {
    h.version++;
    h.history.unshift({
      at: iso(now()),
      actor: person(m),
      action: event,
      detail,
    });
  }
  /** Activity for a hold: its reference and the reason's words, never the note. */
  const audit = (
    m: TeamMember,
    action: Parameters<MockCore["log"]>[1],
    r: HospitalRecord,
    h: LegalHold,
    words: string,
  ) =>
    core.log(person(m), action, {
      hospital: hospitalRef(r.hospital),
      target: h.reference,
      detail: words,
    });
  /** Brings the hospital (its hold list, its removal's checks) up to date. */
  const refresh = (r: HospitalRecord) => core.findHospital(r.hospital.id);

  return {
    listHolds: (q) =>
      core.read(() => {
        const status = q.status ?? "open";
        if (
          status !== "open" &&
          status !== "all" &&
          !HOLD_STATUSES.includes(status)
        )
          invalid();
        const needle = q.q?.trim().toLowerCase() ?? "";
        const rows = settled()
          .flatMap((r) => r.holds)
          .filter((h) =>
            status === "all"
              ? true
              : status === "open"
                ? OPEN.includes(h.status)
                : h.status === status,
          )
          .filter((h) => !q.hospital || h.hospital.id === q.hospital)
          .filter((h) => !needle || h.reference.toLowerCase().includes(needle))
          .sort((a, b) => Date.parse(b.placed_at) - Date.parse(a.placed_at))
          .map(withoutHistory);
        const start = Math.max(0, Number(q.cursor) || 0);
        const end = start + PAGE;
        return {
          holds: rows.slice(start, end),
          next_cursor: end < rows.length ? String(end) : null,
        };
      }),

    getHold: (id) => core.read(() => find(id).h),

    placeHold: (body, opts) =>
      core.write(opts, async (m) => {
        const b = (body ?? {}) as Record<string, unknown>;
        if (typeof b.hospital_id !== "string") invalid();
        // A hold keeps every record: no dates.
        if (
          (b.from !== undefined && b.from !== null) ||
          (b.to !== undefined && b.to !== null)
        )
          fail(422, "invalid_range");
        nothing(b.note);
        nothing(b.asked_by);
        const reason = b.reason as HoldReason;
        if (!HOLD_REASONS.includes(reason)) invalid();
        const ref = reference(b.reference);
        const review_on = day(b.review_on);
        const r = core.findHospital(b.hospital_id as string);
        const hosp = r.hospital;
        const today0 = today(r, now());
        const latest = `${Number(today0.slice(0, 4)) + REVIEW_MAX_YEARS}${today0.slice(4)}`;
        if (review_on <= today0 || review_on > latest) invalid();
        if (hosp.status === "removed") fail(409, "hospital_removed");
        if (removalStarted.includes(hosp.id)) fail(409, "removal_started");
        // An open hold with the same reference: before the code is spent.
        if (
          core
            .hospitals()
            .some((x) =>
              x.holds.some(
                (h) => h.reference === ref && OPEN.includes(h.status),
              ),
            )
        )
          fail(409, "conflict");
        await core.checkCode(m, body);

        // A scheduled removal that hasn't started stops: back to pending,
        // where the new hold blocks it.
        const stopped =
          hosp.status === "removal_scheduled" && hosp.removal !== null;
        if (stopped) {
          const removal = hosp.removal!;
          hosp.status = "removal_pending";
          removal.status = "requested";
          removal.approved_by = null;
          removal.approved_at = null;
          hosp.version++;
        }
        const at = iso(now());
        const h: LegalHoldDetail = {
          id: core.newId("hold"),
          hospital: hospitalRef(hosp),
          scope: { from: null, to: null },
          reason,
          reference: ref,
          asked_by: null,
          note: null,
          placed_by: person(m),
          placed_at: at,
          review_on,
          status: "active",
          lift: null,
          stopped_removal: stopped,
          version: 1,
          history: [{ at, actor: person(m), action: "placed", detail: null }],
        };
        r.holds.unshift(h);
        audit(m, "hold_placed", r, h, reasonWords(reason));
        refresh(r);
        return h;
      }),

    // Not served by core yet.
    editHold: (_id, _body, opts) =>
      core.write(opts, () => fail(501, "not_implemented")),

    requestLift: (id, body, opts) =>
      core.write(opts, async (m) => {
        const b = (body ?? {}) as Record<string, unknown>;
        const reason = b.reason as LiftReason;
        if (!LIFT_REASONS.includes(reason)) invalid();
        nothing(b.note);
        // The document that allows it, as a reference: never free text.
        const authority = reference(b.authority);
        const { h } = find(id);
        if (h.status !== "active" && h.status !== "review_due")
          fail(409, "conflict");
        await core.checkCode(m, body);
        const at = now();
        lapsed.delete(h);
        h.status = "lift_requested";
        h.lift = {
          id: core.newId("req"),
          kind: "hold_lift",
          requested_by: person(m),
          requested_at: iso(at),
          reason,
          // Set per caller on the way out.
          requested_by_you: true,
          expires_at: iso(at + LAPSE_DAYS * D),
          note: null,
          authority,
          records_due: null,
          due_after: null,
          approved_by: null,
          approved_at: null,
          released_on: null,
        };
        const words = LIFT_REASON_WORDS[reason];
        record(h, m, "lift_requested", words);
        audit(m, "hold_lift_requested", find(id).r, h, words);
        return h;
      }),

    approveLift: (id, body, opts) =>
      core.write(opts, async (m) => {
        const version = versionOf(body);
        const { r, h } = find(id);
        const lift = h.lift;
        // Lapsed while the approver looked at it: say so, never a quiet no.
        if (h.status !== "lift_requested" && lapsed.has(h))
          fail(409, "expired");
        // Only the request the approver saw: not one made since.
        if (version !== h.version || h.status !== "lift_requested" || !lift)
          return fail(409, "conflict");
        // Only the server's record of who asked decides, never a name.
        if (lift.requested_by.id === m.id) fail(409, "same_person");
        await core.checkCode(m, body);
        const at = now();
        h.status = "lifted";
        lift.approved_by = person(m);
        lift.approved_at = iso(at);
        // No grace period: the hold is lifted at once.
        lift.released_on = iso(at);
        const words = LIFT_REASON_WORDS[lift.reason];
        record(h, m, "lifted", words);
        audit(m, "hold_lifted", r, h, words);
        refresh(r);
        return h;
      }),

    cancelLift: (id, body, opts) =>
      core.write(opts, (m) => {
        const version = versionOf(body);
        const { r, h } = find(id);
        const lift = h.lift;
        if (version !== h.version || h.status !== "lift_requested" || !lift)
          return fail(409, "conflict");
        h.status = openStatus(r, h, now());
        h.lift = null;
        const words = LIFT_REASON_WORDS[lift.reason];
        record(h, m, "lift_cancelled", words);
        audit(m, "hold_lift_cancelled", r, h, words);
        return h;
      }),

    // A lift lands at once: core has nothing to undo (501).
    undoLift: (_id, _body, opts) =>
      core.write(opts, () => fail(501, "not_implemented")),
  };
}
