// The demo's legal holds (Plan 8a), built on the mock core. Memory only. It
// refuses what the backend refuses (spec §9), with the same codes.
import { ApiError } from "@mhai/api-client/errors";
import type { Hospital, Person, TeamMember } from "./contract";
import type { HospitalRecord } from "./fixtures";
import {
  HOLD_GRACE_DAYS,
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
import {
  HOLD_REASON_WORDS,
  LIFT_REASON_WORDS,
  RECORDS_DUE,
  dateIn,
  nextCleanUp,
} from "./holds-fixtures";
import type { MockCore } from "./mock";

const D = 24 * 3_600_000;
const PAGE = 50;
const REFERENCE_MAX = 100;
const ASKED_BY_MAX = 200;
const NOTE_MAX = 500;
const AUTHORITY_MAX = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN: readonly HoldStatus[] = ["active", "review_due", "lift_requested"];
/** What a hold edit may send; anything else is 422. */
const EDITABLE = new Set(["review_on", "note", "version"]);

const iso = (ms: number) => new Date(ms).toISOString();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });

/** Trimmed text of 1 to `max` characters, else 422. */
function text(v: unknown, max: number): string {
  if (typeof v !== "string") return invalid();
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : invalid();
}
/** Optional text: absent, null or blank is null; over `max` is 422. */
function optText(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return invalid();
  return v.trim() === "" ? null : text(v, max);
}
/** A real calendar date, YYYY-MM-DD, else 422. */
function day(v: unknown): string {
  if (typeof v !== "string" || !DATE.test(v)) return invalid();
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(v)
    ? v
    : invalid();
}
const optDay = (v: unknown) =>
  v === undefined || v === null || v === "" ? null : day(v);

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
const ref = (h: Hospital): Person => ({ id: h.id, name: h.name });

/**
 * Time-driven changes to a hospital's holds: a review date reached, a lift
 * request lapsed, records released after the grace period. Run with every
 * read of the hospital (the hospitals part's settle), so Activity has them.
 */
export function settleHolds(
  r: HospitalRecord,
  now: number,
  log: MockCore["log"],
) {
  for (const h of r.holds) {
    const lift = h.lift;
    if (h.status === "lift_requested" && lift) {
      if (now >= Date.parse(lift.expires_at)) {
        h.status = openStatus(r, h, now);
        h.lift = null;
        h.version++;
        h.history.unshift({
          at: lift.expires_at,
          actor: lift.requested_by,
          action: "lift_lapsed",
          detail: LIFT_REASON_WORDS[lift.reason],
        });
        log(lift.requested_by, "hold_lift_lapsed", {
          hospital: ref(r.hospital),
          target: h.reference,
          detail: LIFT_REASON_WORDS[lift.reason],
        });
      }
    }
    if (h.status === "active" && today(r, now) >= h.review_on) {
      h.status = "review_due";
      h.version++;
    }
    if (
      h.status === "lifted" &&
      lift?.released_on &&
      now >= Date.parse(lift.released_on) &&
      !h.history.some((e) => e.action === "released")
    ) {
      const actor = lift.approved_by ?? lift.requested_by;
      h.history.unshift({
        at: lift.released_on,
        actor,
        action: "released",
        detail: null,
      });
      log(actor, "hold_released", {
        hospital: ref(r.hospital),
        target: h.reference,
        detail: LIFT_REASON_WORDS[lift.reason],
      });
    }
  }
}

/** A hospital's holds that keep its records, in short form. */
export const keptHolds = (r: HospitalRecord, now: number): HoldShort[] =>
  r.holds.filter((h) => keepsRecords(h, now)).map(shortHold);

export type HoldsMockOptions = {
  /** Hospitals whose removal has started deleting: a hold there is 409. */
  removalStarted?: string[];
};

export function holdsMock(
  core: MockCore,
  { removalStarted = [] }: HoldsMockOptions = {},
): HoldsClient {
  const { now, log } = core;
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
    log(person(m), action, {
      hospital: ref(r.hospital),
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
        const from = optDay(b.from);
        const to = optDay(b.to);
        if (to !== null && from === null) invalid();
        if (from !== null && to !== null && to < from)
          fail(422, "invalid_range");
        const reason = b.reason as HoldReason;
        if (!HOLD_REASONS.includes(reason)) invalid();
        const reference = text(b.reference, REFERENCE_MAX);
        const asked_by = text(b.asked_by, ASKED_BY_MAX);
        const note = optText(b.note, NOTE_MAX);
        if (reason === "other" && note === null) invalid();
        const review_on = day(b.review_on);
        const r = core.findHospital(b.hospital_id as string);
        const hosp = r.hospital;
        if (hosp.status === "removed") fail(409, "hospital_removed");
        if (removalStarted.includes(hosp.id)) fail(409, "removal_started");
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
          hospital: ref(hosp),
          scope: { from, to },
          reason,
          reference,
          asked_by,
          note,
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
        audit(m, "hold_placed", r, h, HOLD_REASON_WORDS[reason]);
        refresh(r);
        return h;
      }),

    editHold: (id, body, opts) =>
      core.write(opts, (m) => {
        const b = (body ?? {}) as Record<string, unknown>;
        if (Object.keys(b).some((k) => !EDITABLE.has(k))) invalid();
        if (typeof b.version !== "number") invalid();
        const review_on =
          b.review_on === undefined ? undefined : day(b.review_on);
        const note =
          b.note === undefined ? undefined : optText(b.note, NOTE_MAX);
        const { r, h } = find(id);
        if (h.status === "lifted") fail(409, "conflict");
        if (b.version !== h.version) fail(409, "conflict");
        const changed: string[] = [];
        if (review_on !== undefined && review_on !== h.review_on) {
          h.review_on = review_on;
          changed.push("Review date");
          if (h.status === "review_due" || h.status === "active")
            h.status = openStatus(r, h, now());
        }
        if (note !== undefined && note !== h.note) {
          if (h.reason === "other" && note === null) invalid();
          h.note = note;
          changed.push("Note");
        }
        record(h, m, "edited", changed.join(", ") || null);
        audit(m, "hold_edited", r, h, HOLD_REASON_WORDS[h.reason]);
        refresh(r);
        return h;
      }),

    requestLift: (id, body, opts) =>
      core.write(opts, async (m) => {
        const b = (body ?? {}) as Record<string, unknown>;
        const reason = b.reason as LiftReason;
        if (!LIFT_REASONS.includes(reason)) invalid();
        const note = optText(b.note, NOTE_MAX);
        const authority = text(b.authority, AUTHORITY_MAX);
        const { r, h } = find(id);
        if (h.status !== "active" && h.status !== "review_due")
          fail(409, "conflict");
        await core.checkCode(m, body);
        const at = now();
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
          note,
          authority,
          records_due: RECORDS_DUE[r.hospital.id] ?? 0,
          due_after: nextCleanUp(at),
          approved_by: null,
          approved_at: null,
          released_on: null,
        };
        const words = LIFT_REASON_WORDS[reason];
        record(h, m, "lift_requested", words);
        audit(m, "hold_lift_requested", r, h, words);
        return h;
      }),

    approveLift: (id, body, opts) =>
      core.write(opts, async (m) => {
        const { r, h } = find(id);
        const lift = h.lift;
        if (h.status !== "lift_requested" || !lift)
          // Lapsed while the approver looked at it: say so, never a quiet no.
          return fail(
            409,
            h.history[0]?.action === "lift_lapsed" ? "expired" : "conflict",
          );
        // Only the server's record of who asked decides, never a name.
        if (lift.requested_by.id === m.id) fail(409, "same_person");
        await core.checkCode(m, body);
        const at = now();
        h.status = "lifted";
        lift.approved_by = person(m);
        lift.approved_at = iso(at);
        lift.released_on = iso(at + HOLD_GRACE_DAYS * D);
        const words = LIFT_REASON_WORDS[lift.reason];
        record(h, m, "lifted", words);
        audit(m, "hold_lifted", r, h, words);
        refresh(r);
        return h;
      }),

    cancelLift: (id, opts) =>
      core.write(opts, (m) => {
        const { r, h } = find(id);
        const lift = h.lift;
        if (h.status !== "lift_requested" || !lift)
          return fail(409, "conflict");
        h.status = openStatus(r, h, now());
        h.lift = null;
        const words = LIFT_REASON_WORDS[lift.reason];
        record(h, m, "lift_cancelled", words);
        audit(m, "hold_lift_cancelled", r, h, words);
        return h;
      }),

    undoLift: (id, body, opts) =>
      core.write(opts, async (m) => {
        const { r, h } = find(id);
        const lift = h.lift;
        if (
          h.status !== "lifted" ||
          !lift?.released_on ||
          now() >= Date.parse(lift.released_on)
        )
          return fail(409, "conflict");
        await core.checkCode(m, body);
        h.status = openStatus(r, h, now());
        h.lift = null;
        const words = LIFT_REASON_WORDS[lift.reason];
        record(h, m, "lift_undone", words);
        audit(m, "hold_lift_undone", r, h, words);
        refresh(r);
        return h;
      }),
  };
}
