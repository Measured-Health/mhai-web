// The platform demo's sample clearance letters and named-access switch
// (Plan 11b). Every name is invented. Havana Hospital has the clinical demo's
// letters, with the same ids, kept in this app's memory only: verifying one
// here doesn't change the clinical demo. Dates are relative to the mock's
// clock; the global switch went On on the latest 3 Feb at least 60 days
// back.
import type { Person } from "./contract";
import type {
  Clearance,
  ClearanceEvent,
  Signoffs,
  SwitchChange,
  SwitchState,
} from "./clearances-contract";
import { LETTER_ID as NORTHGATE_LETTER } from "./audit-fixtures";

const D = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Team members linked to a hospital (a past account there, say), by team
 * member id: they never verify that hospital's letters (409 `same_side`).
 */
export const LINKED: Readonly<Record<string, readonly string[]>> = {
  tm_bola: ["h_havana"],
};

/** A calendar day shifted by whole days: no time zone, no clock change. */
export function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The day it is in a time zone, as YYYY-MM-DD. */
export function dayIn(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const HAVANA: Person = { id: "h_havana", name: "Havana Hospital" };
const NORTHGATE: Person = {
  id: "h_northgate",
  name: "Northgate General Hospital",
};
const RIVERSIDE: Person = {
  id: "h_riverside",
  name: "Riverside Children's Hospital",
};

const ADA: Person = { id: "tm_ada", name: "Ada Bakare" };
const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };

// Havana's staff, as the clinical demo has them.
const GRACE: Person = { id: "s-nwosu", name: "Grace Nwosu" };
const KEMI: Person = { id: "s-kemi", name: "Dr. Kemi Adeyemi" };
const OBI: Person = { id: "s-obi", name: "Dr. Obi" };
const EZE: Person = { id: "s-eze", name: "Dr. Eze" };
// Northgate's and Riverside's.
const IFEOMA: Person = { id: "s-nnaji", name: "Ifeoma Nnaji" };
const EMEKA: Person = { id: "s-udoh", name: "Emeka Udoh" };
const ZAINAB: Person = { id: "s-zainab", name: "Dr. Zainab Bello" };
const TOBI: Person = { id: "s-tobi", name: "Tobi Akande" };

type Side = ClearanceEvent["side"];
const event = (
  kind: ClearanceEvent["kind"],
  at: number,
  by: Person | null = null,
  side: Side = null,
  reason: string | null = null,
): ClearanceEvent => ({ at: iso(at), kind, by, side, reason, note: null });

/** A letter as the store keeps it; `covers_you` and `verifiable_by_you` are set per caller. */
export type ClearanceRecord = Omit<
  Clearance,
  "covers_you" | "verifiable_by_you"
>;

function letter(
  over: Partial<ClearanceRecord> &
    Pick<ClearanceRecord, "id" | "hospital" | "uploaded_by">,
): ClearanceRecord {
  return {
    status: "waiting",
    refused_reason: null,
    signed_by: "Dr. Funmi Ade",
    signer_title: "Chief Medical Director",
    letter_date: "",
    covered: [],
    covered_platform: [],
    end_date: "",
    uploaded_at: "",
    ready_at: null,
    verified_by: null,
    verified_at: null,
    rejection: null,
    revocation: null,
    pages: 0,
    history: [],
    version: 1,
    ...over,
  };
}

/**
 * The sample letters, newest first. `today` is the hospitals' day (they are
 * all in Africa/Lagos).
 */
export function seedClearances(now: number, today: string): ClearanceRecord[] {
  const up = (days: number) => now - days * D;
  const havana = (
    over: Partial<ClearanceRecord> & Pick<ClearanceRecord, "id">,
  ) => letter({ hospital: HAVANA, uploaded_by: GRACE, ...over });
  const uploaded = (at: number) => event("uploaded", at, GRACE, "hospital");
  const ready = (at: number) => event("ready", at);
  const verified = (at: number, by = TUNDE) =>
    event("verified", at, by, "platform");
  return [
    havana({
      id: "cl_check",
      status: "checking",
      letter_date: shiftDay(today, -1),
      covered: [KEMI],
      end_date: shiftDay(today, 180),
      uploaded_at: iso(now - 1000),
      history: [uploaded(now - 1000)],
    }),
    letter({
      id: "cl_north",
      hospital: NORTHGATE,
      uploaded_by: IFEOMA,
      signed_by: "Dr. Tayo Bankole",
      signer_title: "Medical Director",
      letter_date: shiftDay(today, -2),
      covered: [EMEKA],
      end_date: shiftDay(today, 240),
      uploaded_at: iso(up(1)),
      ready_at: iso(up(1) + 6000),
      pages: 2,
      history: [
        event("uploaded", up(1), IFEOMA, "hospital"),
        ready(up(1) + 6000),
      ],
    }),
    havana({
      id: "cl_bad",
      status: "refused",
      refused_reason: "failed_safety_check",
      letter_date: shiftDay(today, -2),
      covered: [GRACE],
      end_date: shiftDay(today, 150),
      uploaded_at: iso(up(0.1)),
      history: [
        uploaded(up(0.1)),
        event("refused", up(0.1) + 4000, null, null, "failed_safety_check"),
      ],
    }),
    havana({
      id: "cl_wait",
      letter_date: shiftDay(today, -4),
      covered: [OBI],
      covered_platform: [TUNDE],
      end_date: shiftDay(today, 120),
      uploaded_at: iso(up(3)),
      ready_at: iso(up(3) + 6000),
      pages: 3,
      history: [uploaded(up(3)), ready(up(3) + 6000)],
    }),
    havana({
      id: "cl_act",
      status: "active",
      letter_date: shiftDay(today, -30),
      covered: [GRACE],
      end_date: shiftDay(today, 137),
      uploaded_at: iso(up(25)),
      ready_at: iso(up(25) + 6000),
      verified_by: TUNDE,
      verified_at: iso(up(24)),
      pages: 2,
      history: [uploaded(up(25)), ready(up(25) + 6000), verified(up(24))],
    }),
    letter({
      id: "cl_river",
      hospital: RIVERSIDE,
      uploaded_by: TOBI,
      status: "active",
      signed_by: "Dr. Halima Sani",
      signer_title: "Chief Medical Director",
      letter_date: shiftDay(today, -345),
      covered: [ZAINAB],
      end_date: shiftDay(today, 20),
      uploaded_at: iso(up(340)),
      ready_at: iso(up(340) + 6000),
      verified_by: ADA,
      verified_at: iso(up(339)),
      pages: 1,
      history: [
        event("uploaded", up(340), TOBI, "hospital"),
        ready(up(340) + 6000),
        verified(up(339), ADA),
        event("reminded", up(10), null, null, "30_days"),
      ],
    }),
    // Plan 9's audit log has this letter's three named views (ruling 6).
    letter({
      id: NORTHGATE_LETTER,
      hospital: NORTHGATE,
      uploaded_by: IFEOMA,
      status: "active",
      signed_by: "Dr. Tayo Bankole",
      signer_title: "Medical Director",
      letter_date: shiftDay(today, -93),
      covered: [IFEOMA, EMEKA],
      end_date: shiftDay(today, 275),
      uploaded_at: iso(up(92)),
      ready_at: iso(up(92) + 6000),
      verified_by: TUNDE,
      verified_at: iso(up(91.5)),
      pages: 2,
      history: [
        event("uploaded", up(92), IFEOMA, "hospital"),
        ready(up(92) + 6000),
        verified(up(91.5)),
      ],
    }),
    havana({
      id: "cl_soon",
      status: "active",
      letter_date: shiftDay(today, -340),
      covered: [KEMI],
      end_date: shiftDay(today, 12),
      uploaded_at: iso(up(335)),
      ready_at: iso(up(335) + 6000),
      verified_by: TUNDE,
      verified_at: iso(up(334)),
      pages: 2,
      history: [
        uploaded(up(335)),
        ready(up(335) + 6000),
        verified(up(334)),
        event("reminded", up(18), null, null, "30_days"),
      ],
    }),
    havana({
      id: "cl_rej",
      status: "rejected",
      letter_date: shiftDay(today, -45),
      covered: [KEMI],
      end_date: shiftDay(today, 200),
      uploaded_at: iso(up(40)),
      ready_at: iso(up(40) + 6000),
      rejection: {
        by: TUNDE,
        at: iso(up(38)),
        reason: "end_date_mismatch",
        note: null,
      },
      pages: 2,
      history: [
        uploaded(up(40)),
        ready(up(40) + 6000),
        event("rejected", up(38), TUNDE, "platform", "end_date_mismatch"),
      ],
    }),
    havana({
      id: "cl_end",
      status: "ended",
      letter_date: shiftDay(today, -430),
      covered: [GRACE],
      end_date: shiftDay(today, -60),
      uploaded_at: iso(up(425)),
      ready_at: iso(up(425) + 6000),
      verified_by: TUNDE,
      verified_at: iso(up(424)),
      pages: 2,
      history: [
        uploaded(up(425)),
        ready(up(425) + 6000),
        verified(up(424)),
        event("ended", up(59)),
      ],
    }),
    havana({
      id: "cl_rev",
      status: "revoked",
      letter_date: shiftDay(today, -90),
      covered: [EZE],
      end_date: shiftDay(today, 100),
      uploaded_at: iso(up(85)),
      ready_at: iso(up(85) + 6000),
      verified_by: TUNDE,
      verified_at: iso(up(84)),
      revocation: {
        by: GRACE,
        side: "hospital",
        at: iso(up(20)),
        day: shiftDay(today, -20),
        reason: "person_left",
        note: null,
      },
      pages: 2,
      history: [
        uploaded(up(85)),
        ready(up(85) + 6000),
        verified(up(84)),
        event("revoked", up(20), GRACE, "hospital", "person_left"),
      ],
    }),
  ];
}

/** The UTC day `days` before an instant, as YYYY-MM-DD. */
const dayBefore = (at: number, days: number) =>
  new Date(at - days * D).toISOString().slice(0, 10);

/**
 * The three sign-offs for a raise at `at`, dated a day or two before it.
 * `n` numbers the documents (CS-014, PR-007, LG-021 for the global switch).
 */
const ref = (prefix: string, n: number) =>
  `${prefix}-${String(n).padStart(3, "0")}`;
const signoffsFor = (at: number, n: number): Signoffs => ({
  clinical: { by: "Dr. A. Musa", at: dayBefore(at, 2), ref: ref("CS", 14 + n) },
  privacy: { by: "Ngozi Eke", at: dayBefore(at, 1), ref: ref("PR", 7 + n) },
  legal: { by: "Bayo Adeyemi", at: dayBefore(at, 1), ref: ref("LG", 21 + n) },
});

/** How long before `now` the global switch went On, at the least. */
const GLOBAL_ON_MIN_DAYS = 60;

/**
 * When the global switch went On: the latest 3 Feb, 09:00 UTC, at least 60
 * days before `now`. Everything after it (Havana's and Northgate's raises,
 * Northgate's lowering, Plan 9's named views from 40 days back) then falls
 * in order and in the past on any date.
 */
export function globalOnSince(now: number): number {
  const latest = now - GLOBAL_ON_MIN_DAYS * D;
  const y = new Date(latest).getUTCFullYear();
  const at = Date.UTC(y, 1, 3, 9, 0);
  return at <= latest ? at : Date.UTC(y - 1, 1, 3, 9, 0);
}

const raised = (at: number, signoffs: Signoffs): SwitchChange => ({
  at: iso(at),
  from: "off",
  to: "on",
  requested_by: ADA,
  approved_by: TUNDE,
  lowered_by: null,
  reason: null,
  signoffs,
});

const off = (): SwitchState => ({
  position: "off",
  since: null,
  history: [],
  request: null,
  version: 1,
});

/**
 * The switch as the demo starts: global On since 3 Feb (see
 * `globalOnSince`), Havana On a week later, Northgate On a fortnight later
 * and turned Off 5 days ago, every other hospital Off. With the `off`
 * option, nothing was ever raised: global and every hospital are Off with
 * no history (no hospital can be raised above global).
 */
export function seedSwitch(
  now: number,
  globalOn: boolean,
): { global: SwitchState; hospitals: Record<string, SwitchState> } {
  if (!globalOn) return { global: off(), hospitals: {} };
  const since = globalOnSince(now);
  const havanaAt = since + 7 * D;
  const northAt = since + 14 * D;
  const northOff = now - 5 * D;
  return {
    global: {
      position: "on",
      since: iso(since),
      history: [raised(since, signoffsFor(since, 0))],
      request: null,
      version: 1,
    },
    hospitals: {
      h_havana: {
        position: "on",
        since: iso(havanaAt),
        history: [raised(havanaAt, signoffsFor(havanaAt, 1))],
        request: null,
        version: 1,
      },
      h_northgate: {
        position: "off",
        since: iso(northOff),
        history: [
          {
            at: iso(northOff),
            from: "on",
            to: "off",
            requested_by: null,
            approved_by: null,
            lowered_by: TUNDE,
            reason: "Paused while Northgate checks who its letter covers",
            signoffs: null,
          },
          raised(northAt, signoffsFor(northAt, 2)),
        ],
        request: null,
        version: 1,
      },
    },
  };
}

export const emptySwitch = off;
