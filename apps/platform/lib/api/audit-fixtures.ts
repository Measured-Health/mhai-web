// The platform demo's sample audit log. Every person is invented and every
// hospital is a demo hospital (plus one that was removed). Patients appear
// only as pseudonymous ids, and only on the three named drill-downs.
// Fingerprints are sample data, not security: a small synchronous FNV-based
// expander over the position and id. Only export checksums use real SHA-256.
import { KINDS } from "@/lib/audit/kinds";
import type {
  AuditActor,
  AuditEvent,
  AuditFacts,
  AuditHospital,
  AuditPerson,
  AuditTarget,
  Checkpoint,
  ExportRecord,
  Letter,
  Outcome,
  VerifyRun,
} from "./audit-contract";
import type { Person } from "./contract";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

export const SEED_FIRST_SEQ = 9_880_000;
export const CHECKPOINT_ID = "cp_2026_10";
export const LETTER_ID = "cl_northgate_2026";
/** The position the checks count from (the checkpoint's last purged entry). */
export const CHECKED_FROM_SEQ = 8_676_000;
export const SECURITY_CONTACT = {
  name: "Grace Ade",
  email: "security@measured-health.example",
};
/** How long a sample check takes in the mock. */
export const CHECK_MS = 1_500;

export type SeedMode = "intact" | "broken" | "error" | "unproven" | "stale";

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const hex8 = (n: number) => n.toString(16).padStart(8, "0");

/** 64 hex characters, the same for the same position and id. */
export const fingerprint = (seq: number, id: string): string =>
  Array.from({ length: 8 }, (_, i) => hex8(fnv(`${i}|${seq}|${id}`))).join("");
/** "P-7F3A2C": a patient's pseudonymous id (Plan 6's Analysis id). */
const pseudonym = (key: string, n: number) =>
  `P-${hex8(fnv(`${key}|${n}`))
    .slice(0, 6)
    .toUpperCase()}`;
const rnd = (i: number, salt: string) => fnv(`${i}|${salt}`);
export const sha64 = (label: string) =>
  Array.from({ length: 8 }, (_, i) => hex8(fnv(`${i}#${label}`))).join("");

type Hosp = AuditHospital & {
  key: string;
  /** Oldest age (days) it has staff activity; newest age it has. */
  maxAge: number;
  minAge: number;
};
const HOSPITALS: Hosp[] = [
  { id: "h_havana", name: "Havana Hospital", key: "hv" },
  { id: "h_northgate", name: "Northgate General Hospital", key: "ng" },
  { id: "h_riverside", name: "Riverside Children's Hospital", key: "rv" },
  { id: "h_eastbrook", name: "Eastbrook Medical Centre", key: "eb" },
  { id: "h_westfield", name: "Westfield Clinic", key: "wf", minAge: 45 },
  { id: "h_harbour", name: "Harbour View Hospital", key: "hb" },
  { id: "h_southpoint", name: "Southpoint Hospital", key: "sp" },
  { id: "h_lakeside", name: "Lakeside Community Clinic", key: "ls" },
  { id: "h_hilltop", name: "Hilltop Cottage Hospital", key: "ht", maxAge: 90 },
  {
    id: "h_oldmill",
    name: "Old Mill Clinic",
    key: "om",
    removed: true,
    maxAge: 392,
    minAge: 300,
  },
].map((h) => ({
  removed: false,
  maxAge: 395,
  minAge: 0,
  ...h,
})) as Hosp[];

const hRef = (h: Hosp): AuditHospital => ({
  id: h.id,
  name: h.name,
  removed: h.removed,
});
const byKey = (k: string) => HOSPITALS.find((h) => h.key === k)!;

const FIRST = [
  "Folake",
  "Emeka",
  "Ngozi",
  "Seun",
  "Bola",
  "Chinedu",
  "Yetunde",
  "Ibrahim",
  "Halima",
  "Kunle",
  "Zainab",
  "Tobi",
  "Adaeze",
  "Musa",
  "Funmi",
  "Dayo",
];
const LAST = [
  "Adeyemi",
  "Okeke",
  "Bello",
  "Nwankwo",
  "Ibe",
  "Lawson",
  "Danjuma",
  "Ogunleye",
  "Eze",
  "Balogun",
  "Mohammed",
  "Afolabi",
];
const ROLES = ["hospital_admin", "clinician", "clinician", "reviewer"] as const;

type Staff = AuditActor & { email: string; hosp: Hosp };
const STAFF: Staff[] = HOSPITALS.flatMap((h, hi) =>
  ROLES.map((role, j): Staff => {
    const g = hi * 4 + j;
    const first = FIRST[g % FIRST.length];
    const last = LAST[(g * 5 + 3) % LAST.length];
    return {
      id: `u_${h.key}_${j + 1}`,
      name: `${first} ${last}`,
      role,
      kind: "staff",
      email: `${first}.${last}@${h.key}.example`.toLowerCase(),
      hosp: h,
    };
  }),
);
const staffOf = (h: Hosp, role: Staff["role"], n = 0) =>
  STAFF.filter((s) => s.hosp === h && s.role === role)[n]!;

const plat = (
  id: string,
  name: string,
  role: AuditActor["role"],
): AuditActor => ({
  id,
  name,
  role,
  kind: "platform",
});
export const ADA = plat("tm_ada", "Ada Bakare", "platform_admin");
export const TUNDE = plat("tm_tunde", "Tunde Okafor", "platform_admin");
export const AMARA = plat("tm_amara", "Amara Eze", "auditor");
const SYSTEM: AuditActor = {
  id: "system",
  name: "System",
  role: "system",
  kind: "system",
};
const person = (a: AuditActor): Person => ({ id: a.id, name: a.name });

/** Everyone the person picker can find. */
export function auditPeople(): AuditPerson[] {
  const team: [AuditActor, string][] = [
    [ADA, "ada.bakare@measured-health.example"],
    [TUNDE, "tunde.okafor@measured-health.example"],
    [AMARA, "amara.eze@measured-health.example"],
    // Active in the demo, so their session reads and exports are in the log.
    [
      plat("tm_new", "Chidi Nwosu", "platform_admin"),
      "new.admin@measured-health.example",
    ],
  ];
  return [
    ...team.map(([a, email]) => ({
      id: a.id,
      name: a.name,
      email,
      role: a.role,
      kind: a.kind,
      hospital: null,
    })),
    ...STAFF.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      kind: s.kind,
      hospital: { id: s.hosp.id, name: s.hosp.name },
    })),
  ];
}
export const auditHospitals = (): AuditHospital[] => HOSPITALS.map(hRef);

const SPECIALTIES = [
  "cardiology",
  "respiratory",
  "emergency_medicine",
  "paediatrics",
  "general_medicine",
  "neurology",
  "obstetrics",
];
// Plan 6's Analysis view ids and location types (ruling 5).
const VIEWS = ["prevalence", "affected", "co-occurring", "findings", "quality"];
const LOCATIONS = ["admitted", "outpatient", "emergency"];
const CONFIDENCE = ["high", "medium", "low"] as const;
const DEVICES = [
  "Firefox 140 on macOS",
  "Chrome 141 on Windows",
  "Safari 18 on iPhone",
  "Chrome 141 on Android",
  "Edge 141 on Windows",
];

type Spec = {
  at: number;
  kind: string;
  actor: AuditActor;
  hospital?: Hosp | null;
  target?: AuditTarget | null;
  outcome?: Outcome;
  flag?: "security" | "policy" | null;
  reason?: string | null;
  note?: string | null;
  refs?: Partial<AuditEvent["refs"]>;
  facts?: AuditFacts;
  pseudonyms?: string[];
  /** For the check entries, patched once positions are known. */
  check?: number;
};

export type AuditSeed = {
  /** Newest first. */
  events: AuditEvent[];
  /** The pseudonyms on a named drill-down, by event id. */
  pseudonyms: Record<string, string[]>;
  letters: Record<string, Letter>;
  exports: ExportRecord[];
  /** Newest first. */
  runs: VerifyRun[];
  checkpoint: Checkpoint;
  /** The first entry that fails the check, in broken mode. */
  firstBrokenSeq: number | null;
};

const day = (ms: number) => iso(ms).slice(0, 10);

export function checkpointOf(now: number): Checkpoint {
  const before = new Date(now);
  before.setUTCFullYear(before.getUTCFullYear() - 6);
  return {
    id: CHECKPOINT_ID,
    at: iso(now - 21 * D),
    purged_count: 412_006,
    before: before.toISOString(),
    kind: "retention",
    incident_ref: null,
    reason: "retention",
  };
}

/** The last 06:00 UTC at or before `now`. */
export function lastSchedule(now: number): number {
  const d = new Date(now);
  const six = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6);
  return six <= now ? six : six - D;
}

/** Where the schedule's runs are counted back from, by mode. */
const runBase = (now: number, mode: SeedMode) =>
  mode === "stale" ? now - 30 * H - MIN : lastSchedule(now);

const RUNS_SEEDED = 14;

export function seedAudit(
  now: number,
  mode: SeedMode = "intact",
  bad = false,
): AuditSeed {
  const cp = checkpointOf(now);
  const specs: Spec[] = [];
  const add = (s: Spec) => void specs.push(s);
  const ago = (days: number) => now - days * D;

  // Routine staff activity, spread over 13 months.
  const MAIN = 138;
  for (let i = 0; i < MAIN; i++) {
    const age = 0.1 + (i + (rnd(i, "j") % 80) / 100) * (390 / MAIN);
    const live = HOSPITALS.filter((h) => age <= h.maxAge && age >= h.minAge);
    const h = live[rnd(i, "h") % live.length];
    const at = ago(age);
    const clin = staffOf(h, "clinician", i % 2);
    switch (i % 8) {
      case 2:
      case 3:
        add({
          at,
          kind: "question_asked",
          actor: clin,
          hospital: h,
          facts: {
            specialty: SPECIALTIES[rnd(i, "s") % SPECIALTIES.length],
            confidence: CONFIDENCE[rnd(i, "c") % 3],
          },
        });
        break;
      case 4:
        add({
          at,
          kind: "answer_sent_for_review",
          actor: clin,
          hospital: h,
          facts: { specialty: SPECIALTIES[rnd(i, "s") % SPECIALTIES.length] },
        });
        break;
      case 5:
        add({
          at,
          kind: "review_submitted",
          actor: staffOf(h, "reviewer"),
          hospital: h,
        });
        break;
      case 6:
        add({ at, kind: "alert_acknowledged", actor: clin, hospital: h });
        break;
      case 7:
        add({
          at,
          kind: i % 16 === 7 ? "signed_out" : "signed_in",
          actor: clin,
          hospital: h,
          target:
            i % 16 === 7
              ? { kind: "session", id: `ses_${hex8(rnd(i, "ses"))}` }
              : null,
        });
        break;
      default:
        add({
          at,
          kind: "signed_in",
          actor: staffOf(h, "hospital_admin"),
          hospital: h,
        });
    }
  }

  // Refused sign-ins, and one lock.
  for (let i = 0; i < 12; i++) {
    const age = 3 + ((i * 37 + 11) % 370) / 1;
    const live = HOSPITALS.filter((h) => age <= h.maxAge && age >= h.minAge);
    const h = live[i % live.length];
    add({
      at: ago(age),
      kind: "sign_in_refused",
      actor: staffOf(h, "clinician", i % 2),
      hospital: h,
      outcome: "refused",
      reason: "wrong_code",
    });
  }
  const eb = byKey("eb");
  add({
    at: ago(33.4),
    kind: "sign_in_locked",
    actor: staffOf(eb, "clinician"),
    hospital: eb,
    outcome: "refused",
    flag: "security",
    reason: "locked",
  });

  // Staff changes, and one refused change to their own role.
  const STAFF_KINDS = [
    "staff_invited",
    "staff_role_changed",
    "staff_deactivated",
    "staff_reactivated",
  ];
  for (let i = 0; i < 12; i++) {
    const age = 8 + i * 29;
    const live = HOSPITALS.filter((h) => age <= h.maxAge && age >= h.minAge);
    const h = live[(i * 3) % live.length];
    const who = staffOf(h, "clinician", (i + 1) % 2);
    add({
      at: ago(age),
      kind: STAFF_KINDS[i % 4],
      actor: staffOf(h, "hospital_admin"),
      hospital: h,
      target: { kind: "staff", id: who.id, name: who.name },
    });
  }
  const ngH = byKey("ng");
  const ngAdmin = staffOf(ngH, "hospital_admin");
  add({
    at: ago(14.2),
    kind: "own_role_change_refused",
    actor: ngAdmin,
    hospital: ngH,
    target: { kind: "staff", id: ngAdmin.id },
    outcome: "refused",
    flag: "security",
    reason: "wrong_role",
  });

  // Consultations aside, de-identified drill-downs and Analysis.
  for (let i = 0; i < 20; i++) {
    const age = 2 + i * 19 + (i % 3);
    const live = HOSPITALS.filter((h) => age <= h.maxAge && age >= h.minAge);
    const h = live[(i * 5) % live.length];
    add({
      at: ago(age),
      kind: i % 4 === 3 ? "analysis_viewed" : "drilldown_deidentified",
      actor: staffOf(h, "hospital_admin"),
      hospital: h,
      facts:
        i % 4 === 3
          ? {}
          : {
              view: VIEWS[i % VIEWS.length],
              patient_count: 6 + ((i * 7) % 50),
              location_type: LOCATIONS[i % LOCATIONS.length],
            },
    });
  }

  // Westfield and Old Mill.
  const wf = byKey("wf");
  const om = byKey("om");
  add({
    at: ago(45),
    kind: "hospital_deactivated",
    actor: ADA,
    hospital: wf,
    target: { kind: "hospital", id: wf.id, name: wf.name },
    reason: "contract_ended",
  });
  add({
    at: ago(392.5),
    kind: "hospital_added",
    actor: ADA,
    hospital: om,
    target: { kind: "hospital", id: om.id, name: om.name },
  });
  add({
    at: ago(330),
    kind: "hospital_deactivated",
    actor: ADA,
    hospital: om,
    target: { kind: "hospital", id: om.id, name: om.name },
    reason: "contract_ended",
  });
  add({
    at: ago(302),
    kind: "removal_requested",
    actor: ADA,
    hospital: om,
    target: { kind: "hospital", id: om.id, name: om.name },
  });
  add({
    at: ago(301),
    kind: "removal_approved",
    actor: TUNDE,
    hospital: om,
    target: { kind: "hospital", id: om.id, name: om.name },
  });
  add({
    at: ago(300),
    kind: "hospital_removed",
    actor: TUNDE,
    hospital: om,
    target: { kind: "hospital", id: om.id, name: om.name },
  });
  const ht = byKey("ht");
  add({
    at: ago(91),
    kind: "hospital_added",
    actor: ADA,
    hospital: ht,
    target: { kind: "hospital", id: ht.id, name: ht.name },
  });
  add({
    at: ago(70),
    kind: "sso_updated",
    actor: ADA,
    hospital: ngH,
    target: { kind: "hospital", id: ngH.id, name: ngH.name },
  });
  add({
    at: ago(210),
    kind: "team_invited",
    actor: ADA,
    target: { kind: "team_member", id: AMARA.id, name: AMARA.name },
  });
  add({
    at: ago(9.6),
    kind: "change_followed_up",
    actor: TUNDE,
    hospital: ngH,
    target: {
      kind: "change",
      id: "chg_ngh_critical_ack",
      name: "Critical alerts acknowledged more slowly",
    },
    note: "Raised with the hospital's admin; they will review staffing.",
  });

  // The clearance letter and three named drill-downs at Northgate.
  const letterRefs = { clearance_id: LETTER_ID };
  const ngClin = staffOf(ngH, "clinician");
  add({
    at: ago(92),
    kind: "letter_uploaded",
    actor: ngAdmin,
    hospital: ngH,
    target: { kind: "clearance", id: LETTER_ID },
    refs: letterRefs,
  });
  add({
    at: ago(91.5),
    kind: "letter_verified",
    actor: TUNDE,
    hospital: ngH,
    target: { kind: "clearance", id: LETTER_ID },
    refs: letterRefs,
  });
  const NAMED: [number, string, number][] = [
    [40, "clinical_follow_up", 7],
    [18, "quality_improvement", 12],
    [6, "audit", 3],
  ];
  NAMED.forEach(([age, purpose, count], k) => {
    add({
      at: ago(age),
      kind: "drilldown_named",
      actor: k === 1 ? staffOf(ngH, "clinician", 1) : ngClin,
      hospital: ngH,
      target: { kind: "clearance", id: LETTER_ID },
      reason: purpose,
      refs: letterRefs,
      facts: {
        view: VIEWS[(k + 1) % VIEWS.length],
        patient_count: count,
        purpose: purpose as AuditFacts["purpose"],
      },
      pseudonyms: Array.from({ length: count }, (_, n) =>
        pseudonym("ng", k * 20 + n),
      ),
    });
  });

  // Two past exports, with their downloads.
  const PAST: [number, AuditActor, string, string, number][] = [
    [50, ADA, "exp_s1", "legal_request", 1_840],
    [20, AMARA, "exp_s2", "internal_review", 6_212],
  ];
  for (const [age, who, id, reason, rows] of PAST) {
    add({
      at: ago(age),
      kind: "audit_exported",
      actor: who,
      target: { kind: "export", id },
      reason,
      refs: { export_id: id },
      facts: { rows, capped: false },
    });
    add({
      at: ago(age) + 2 * MIN,
      kind: "export_downloaded",
      actor: who,
      target: { kind: "export", id },
      refs: { export_id: id },
    });
  }

  // Auditors reading the log.
  for (let i = 0; i < 6; i++) {
    add({
      at: ago(4 + i * 31),
      kind: "audit_viewed",
      actor: i % 2 ? AMARA : ADA,
      facts: {
        list: "events",
        filters: {
          hospital: i % 3 === 0 ? "h_northgate" : "platform",
          from: iso(ago(34 + i * 31)),
          to: iso(ago(4 + i * 31)),
        },
      },
    });
  }
  add({
    at: ago(11.1),
    kind: "audit_searched",
    actor: AMARA,
    facts: { searched: "req_9f3a2c11", searched_kind: "request" },
  });

  // Retention runs, monthly, and the checkpoint.
  const cpAt = Date.parse(cp.at);
  for (let m = 1; m <= 13; m++) {
    const d = new Date(now);
    const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, 1, 2);
    const before = new Date(at);
    before.setUTCFullYear(before.getUTCFullYear() - 6);
    add({
      at,
      kind: "retention_run",
      actor: SYSTEM,
      facts: {
        purged_count: 28_000 + (rnd(m, "pg") % 9_000),
        before: before.toISOString(),
      },
    });
  }
  add({
    at: cpAt - 2 * MIN,
    kind: "retention_run",
    actor: SYSTEM,
    facts: { purged_count: cp.purged_count, before: cp.before },
  });
  add({
    at: cpAt,
    kind: "retention_checkpoint",
    actor: SYSTEM,
    facts: {
      checkpoint_id: cp.id,
      purged_count: cp.purged_count,
      before: cp.before,
    },
  });

  // The daily checks (and one made by hand).
  const base = runBase(now, mode);
  for (let k = 0; k < RUNS_SEEDED; k++) {
    const start = base - k * D;
    add({
      at: start + MIN,
      kind: "audit_check_run",
      actor: SYSTEM,
      target: { kind: "run", id: `run_s${k}` },
      facts: { state: "intact" },
      check: k,
    });
  }
  add({
    at: ago(3.3),
    kind: "audit_check_run",
    actor: AMARA,
    target: { kind: "run", id: "run_s_hand" },
    facts: { state: "intact" },
  });

  if (bad) {
    add({
      at: ago(2.2),
      kind: "drilldown_deidentified",
      actor: ngClin,
      hospital: ngH,
      target: {
        kind: "patient",
        pseudonym: "P-BAD001",
        name: "Sample Name",
      } as unknown as AuditTarget,
      facts: { view: VIEWS[0], patient_count: 9 },
    });
    add({
      at: ago(9.2),
      kind: "signed_in",
      actor: ngClin,
      hospital: ngH,
      note: "Signed in from the ward",
    });
  }

  // Positions, oldest first; then newest first for the reader.
  const order = specs
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.at - b.s.at || a.i - b.i);
  const pseudonyms: Record<string, string[]> = {};
  let newestCheckId: string | null = null;
  const oldestFirst: AuditEvent[] = order.map(({ s }, n) => {
    const seq = SEED_FIRST_SEQ + n;
    const id = `ev_${seq}`;
    const kind = KINDS[s.kind];
    if (s.pseudonyms) pseudonyms[id] = s.pseudonyms;
    if (s.check === 0) newestCheckId = id;
    const r = rnd(seq, "req");
    return {
      id,
      seq,
      hash: fingerprint(seq, id),
      at: iso(s.at),
      actor: {
        id: s.actor.id,
        name: s.actor.name,
        role: s.actor.role,
        kind: s.actor.kind,
      },
      hospital: s.hospital ? hRef(s.hospital) : null,
      type: kind.type,
      kind: s.kind,
      target: s.target ?? null,
      outcome: s.outcome ?? "succeeded",
      ip:
        s.actor.kind === "staff"
          ? `203.0.113.${10 + (rnd(seq, "ip") % 200)}`
          : s.actor.kind === "platform"
            ? `198.51.100.${10 + (rnd(seq, "ip") % 20)}`
            : null,
      device: s.actor.kind === "system" ? null : DEVICES[rnd(seq, "dev") % 5],
      flag: s.flag ?? null,
      reason: s.reason ?? null,
      note: s.note ?? null,
      refs: {
        clearance_id: null,
        export_id: null,
        request_id: `req_${hex8(r)}`,
        ...s.refs,
      },
      facts: s.facts ?? {},
      after_break: false,
    };
  });
  const events = oldestFirst.reverse();
  const newest = events[0].seq;
  const firstBrokenSeq = mode === "broken" ? newest - 40 : null;
  const seqUpTo = (t: number) =>
    events.find((e) => Date.parse(e.at) <= t)?.seq ?? SEED_FIRST_SEQ;

  // The runs, newest first.
  const runs: VerifyRun[] = [];
  for (let k = 0; k < RUNS_SEEDED; k++) {
    const start = base - k * D;
    const toSeq = seqUpTo(start);
    const brokenNow = mode === "broken" && k === 0;
    runs.push({
      id: `run_s${k}`,
      started_at: iso(start),
      finished_at: iso(start + MIN),
      by: null,
      state: brokenNow ? "broken" : "intact",
      entries_checked: toSeq - CHECKED_FROM_SEQ,
      from_checkpoint: cp,
      from_first: false,
      to_seq: brokenNow ? null : toSeq,
      to_at: brokenNow ? null : iso(start),
      first_broken_seq: brokenNow ? firstBrokenSeq : null,
      first_broken_id: brokenNow
        ? events.find((e) => e.seq === firstBrokenSeq)!.id
        : null,
      first_broken_at: brokenNow
        ? events.find((e) => e.seq === firstBrokenSeq)!.at
        : null,
      error_code: null,
      outcome: null,
      version: 1,
    });
  }
  // The newest check's entry reads the way its run does.
  if (mode === "broken" && newestCheckId) {
    const e = events.find((x) => x.id === newestCheckId)!;
    e.facts = { state: "broken", first_broken_seq: firstBrokenSeq! };
  }
  // The run made by hand sits where its time puts it.
  const handStart = ago(3.3) - 2 * MIN;
  const handSeq = seqUpTo(handStart);
  const handRun: VerifyRun = {
    id: "run_s_hand",
    started_at: iso(handStart),
    finished_at: iso(handStart + MIN),
    by: person(AMARA),
    state: "intact",
    entries_checked: handSeq - CHECKED_FROM_SEQ,
    from_checkpoint: cp,
    from_first: false,
    to_seq: handSeq,
    to_at: iso(handStart),
    first_broken_seq: null,
    first_broken_id: null,
    first_broken_at: null,
    error_code: null,
    outcome: null,
    version: 1,
  };
  const at = runs.findIndex((r) => Date.parse(r.started_at) < handStart);
  runs.splice(at < 0 ? runs.length : at, 0, handRun);

  const letters: Record<string, Letter> = {
    [LETTER_ID]: {
      id: LETTER_ID,
      status: "active",
      valid_from: day(ago(90)),
      valid_to: day(now + 275 * D),
      verified_by: person(TUNDE),
    },
  };
  const exports: ExportRecord[] = [...PAST]
    .reverse()
    .map(([age, who, id, reason, rows]) => ({
      id,
      kind: "events",
      by: person(who),
      at: iso(ago(age)),
      reason: reason as ExportRecord["reason"],
      note: null,
      reference: null,
      filters: { from: iso(ago(age + 90)), to: iso(ago(age)) },
      filter_names: { hospital: null, person: null, clearance: null },
      rows,
      capped: false,
      checksum: sha64(id),
      expires_at: iso(ago(age) + 15 * MIN),
      downloaded_at: iso(ago(age) + 2 * MIN),
    }));
  return {
    events,
    pseudonyms,
    letters,
    exports,
    runs,
    checkpoint: cp,
    firstBrokenSeq,
  };
}
