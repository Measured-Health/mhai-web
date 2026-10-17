import { getAuthClient } from "../auth/client";
import {
  createStepUp,
  DEMO_EMAILS,
  getDemoStepUp,
  type StepUp,
} from "../auth/mock";
import { EMAIL_RE } from "../email";
import type { AdminClient, StaffAction } from "./admin";
import type {
  ActivityEventOut,
  ActivityType,
  ChangeOut,
  GuardedOut,
  HospitalSettingsOut,
  InviteOut,
  MeasureOut,
  OversightItemOut,
  SignInMethod,
  StaffIssue,
  StaffOut,
  StaffRemoveAuth,
  StaffRole,
  StaffStatus,
  UsageAlertsOut,
  UsageOut,
  UsagePeriod,
} from "./admin-contract";
import type { AlertLocationOut } from "./alerts-contract";
import { ApiError } from "./errors";

export const MOCK_HOSPITAL = "Havana Hospital";
export const ACTIVITY_PAGE_SIZE = 50;
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const INVITE_MS = 7 * D;

const iso = (ms: number) => new Date(ms).toISOString();
const copy = <T>(v: T): T => structuredClone(v);
const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

type Seed = {
  id: string;
  name: string;
  display: string;
  email: string;
  roles: StaffRole[];
  specialty: string | null;
  status?: StaffStatus;
  issues?: StaffIssue[];
  signIn?: SignInMethod | null;
  activeAgo?: number | null;
  inviteExpiresIn?: number;
  review?: string[];
};

function person(now: number, p: Seed): StaffOut {
  const status = p.status ?? "active";
  const review = p.review ?? [];
  const ago = p.activeAgo ?? null;
  return {
    id: p.id,
    full_name: p.name,
    display_name: p.display,
    email: p.email,
    roles: p.roles,
    specialty: p.specialty,
    can_review: review.length > 0,
    review_specialties: review,
    status,
    issues: p.issues ?? [],
    sign_in:
      p.signIn !== undefined ? p.signIn : status === "active" ? "sso" : null,
    last_active_at: ago === null ? null : iso(now - ago),
    joined_at: status === "invited" ? null : iso(now - 200 * D),
    invited_at: status === "invited" ? iso(now - 2 * D) : null,
    invite_expires_at:
      p.inviteExpiresIn === undefined ? null : iso(now + p.inviteExpiresIn),
    is_you: false,
    version: 1,
  };
}

/** 13 synthetic people at Havana Hospital. Names are invented. */
function seedStaff(now: number): StaffOut[] {
  return [
    {
      id: "s-reyes",
      name: "Dr. Ana Reyes",
      display: "Dr. Reyes",
      email: DEMO_EMAILS.clinician,
      roles: ["clinician"],
      specialty: "Internal Medicine",
      activeAgo: 0,
      review: ["Internal Medicine"],
    },
    {
      id: "s-obi",
      name: "Dr. Ngozi Obi",
      display: "Dr. Obi",
      email: DEMO_EMAILS.director,
      roles: ["clinician", "hospital_admin"],
      specialty: "Emergency medicine",
      activeAgo: 5 * MIN,
      review: ["Emergency medicine", "Infectious disease"],
    },
    {
      id: "s-nwosu",
      name: "Grace Nwosu",
      display: "Grace Nwosu",
      email: DEMO_EMAILS.hospitalAdmin,
      roles: ["hospital_admin"],
      specialty: null,
      activeAgo: 20 * MIN,
    },
    {
      id: "s-okafor",
      name: "Dr. Chidi Okafor",
      display: "Dr. Okafor",
      email: "c.okafor@havanahospital.org",
      roles: ["clinician"],
      specialty: "Infectious disease",
      activeAgo: 2 * H,
      review: ["Infectious disease"],
    },
    {
      id: "s-bello",
      name: "Dr. Tunde Bello",
      display: "Dr. Bello",
      email: "t.bello@havanahospital.org",
      roles: ["clinician"],
      specialty: "Internal Medicine",
      signIn: "password_mfa",
      activeAgo: D,
      review: ["Internal Medicine"],
    },
    {
      id: "s-mensah",
      name: "Dr. Kofi Mensah",
      display: "Dr. Mensah",
      email: "k.mensah@havanahospital.org",
      roles: ["clinician"],
      specialty: "Cardiology",
      issues: ["mfa_not_set_up"],
      signIn: "password",
      activeAgo: null,
      review: ["Cardiology", "Internal Medicine"],
    },
    {
      id: "s-adeyemi",
      name: "Dr. Funmi Adeyemi",
      display: "Dr. Adeyemi",
      email: "f.adeyemi@havanahospital.org",
      roles: ["clinician"],
      specialty: "Paediatrics",
      status: "invited",
      inviteExpiresIn: 5 * D,
    },
    {
      id: "s-sani",
      name: "Dr. Halima Sani",
      display: "Dr. Sani",
      email: "h.sani@havanahospital.org",
      roles: ["clinician"],
      specialty: "Obstetrics",
      status: "invited",
      issues: ["invite_expired"],
      inviteExpiresIn: -D,
    },
    {
      id: "s-eze",
      name: "Dr. James Eze",
      display: "Dr. Eze",
      email: "j.eze@havanahospital.org",
      roles: ["clinician"],
      specialty: "Surgery",
      status: "deactivated",
      activeAgo: 21 * D,
    },
    {
      id: "s-udo",
      name: "Dr. Amaka Udo",
      display: "Dr. Udo",
      email: "a.udo@havanahospital.org",
      roles: ["clinician"],
      specialty: "Paediatrics",
      activeAgo: 3 * H,
      review: ["Paediatrics"],
    },
    {
      id: "s-owusu",
      name: "Dr. Samuel Owusu",
      display: "Dr. Owusu",
      email: "s.owusu@havanahospital.org",
      roles: ["clinician"],
      specialty: "Emergency medicine",
      signIn: "password_mfa",
      activeAgo: 6 * H,
      review: ["Emergency medicine"],
    },
    {
      id: "s-danjuma",
      name: "Dr. Yusuf Danjuma",
      display: "Dr. Danjuma",
      email: "y.danjuma@havanahospital.org",
      roles: ["clinician"],
      specialty: "Internal Medicine",
      activeAgo: 4 * D,
      review: ["Internal Medicine"],
    },
    {
      id: "s-long",
      name: "Dr. Oluwaseun Adebayo-Ogunleye-Fashola",
      display: "Dr. Adebayo-Ogunleye-Fashola",
      email: "o.adebayo-ogunleye-fashola@havanahospital.org",
      roles: ["clinician"],
      specialty: "Infectious disease",
      activeAgo: 9 * D,
      review: ["Infectious disease"],
    },
  ].map((p) => person(now, p as Seed));
}

function seedSettings(): HospitalSettingsOut {
  return {
    hospital_name: MOCK_HOSPITAL,
    review_overdue_hours: 4,
    reviewers_share_specialty: true,
    require_mfa_for_clinicians: true,
    idle_timeout_minutes: 15,
    allow_trust_device: true,
    sso: { status: "connected", domain: "havanahospital.org" },
    allowed_email_domains: ["havanahospital.org"],
    specialties: [
      "Cardiology",
      "Emergency medicine",
      "Infectious disease",
      "Internal Medicine",
      "Obstetrics",
      "Paediatrics",
      "Surgery",
    ],
    limits: {
      review_overdue_hours: [1, 2, 4, 8, 24],
      idle_timeout_minutes: [5, 10, 15, 30],
    },
    version: 1,
  };
}

const USAGE: Record<UsagePeriod, Omit<UsageOut, "period" | "from" | "to">> = {
  this_month: {
    consultations: 1284,
    active_clinicians: 39,
    agreement_rate: 0.82,
    median_review_hours: 3.1,
    confidence: { high: 796, caution: 347, review: 103, failed: 38 },
    by_specialty: [
      { specialty: "Internal Medicine", consultations: 412 },
      { specialty: "Paediatrics", consultations: 318 },
      { specialty: "Emergency medicine", consultations: 251 },
      { specialty: "Infectious disease", consultations: 203 },
      { specialty: "Cardiology", consultations: 100 },
    ],
  },
  last_month: {
    consultations: 1102,
    active_clinicians: 36,
    agreement_rate: 0.79,
    median_review_hours: 3.6,
    confidence: { high: 650, caution: 320, review: 99, failed: 33 },
    by_specialty: [
      { specialty: "Internal Medicine", consultations: 360 },
      { specialty: "Paediatrics", consultations: 280 },
      { specialty: "Emergency medicine", consultations: 220 },
      { specialty: "Infectious disease", consultations: 160 },
      { specialty: "Cardiology", consultations: 82 },
    ],
  },
  last_90_days: {
    consultations: 3510,
    active_clinicians: 44,
    agreement_rate: 0.8,
    median_review_hours: 3.4,
    confidence: { high: 2120, caution: 960, review: 320, failed: 110 },
    by_specialty: [
      { specialty: "Internal Medicine", consultations: 1120 },
      { specialty: "Paediatrics", consultations: 860 },
      { specialty: "Emergency medicine", consultations: 700 },
      { specialty: "Infectious disease", consultations: 560 },
      { specialty: "Cardiology", consultations: 270 },
    ],
  },
};

function periodRange(
  p: UsagePeriod,
  now: number,
): { from: string; to: string } {
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (p === "this_month") return { from: iso(monthStart), to: iso(now) };
  if (p === "last_month")
    return {
      from: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)),
      to: iso(monthStart - 1),
    };
  return { from: iso(now - 90 * D), to: iso(now) };
}

/**
 * The usage alerts sample: switched on, switched off (null), failing, or "edge":
 * the sample with hidden measures (Critical and Urgent, the Critical median),
 * a measure with nothing to measure yet (the median) and, in a weekly period,
 * a flagged week. Never a raw 1 to 4.
 */
export type MockAlertsMode = "on" | "off" | "unavailable" | "edge";

const count = (value: number): GuardedOut => ({ value, suppressed: false });
const hiddenCount = (): GuardedOut => ({ value: null, suppressed: true });
const measure = (
  value: number,
  change: ChangeOut | null = null,
): MeasureOut => ({
  value,
  suppressed: false,
  change,
});
const up = (amount: number, previous: number): ChangeOut => ({
  direction: "up",
  amount,
  previous,
});
const down = (amount: number, previous: number): ChangeOut => ({
  direction: "down",
  amount,
  previous,
});
const ward = (name: string): AlertLocationOut => ({
  kind: "admitted",
  ward: name,
  bed: null,
});
const CARDIOLOGY: AlertLocationOut = {
  kind: "outpatient",
  clinic: "Cardiology clinic",
};
const EMERGENCY: AlertLocationOut = { kind: "emergency" };

type SeriesSeed = {
  bucket: "day" | "week";
  /** One per bucket from the period's first day. */
  values: readonly number[];
  /** Bucket index → about how many times the usual. */
  unusual?: Readonly<Record<number, number>>;
};
type AlertsSeed = Omit<UsageAlertsOut, "series"> & { series: SeriesSeed };

/**
 * Written for 16 Oct 2026 (R12). The server's small-group rule is already
 * applied: hidden groups are null, and where one group in a set is hidden,
 * another is too, so neither can be worked out from the rest.
 */
const USAGE_ALERTS: Record<UsagePeriod, AlertsSeed> = {
  this_month: {
    critical_target_minutes: 15,
    has_previous: true,
    total: measure(128, up(35, 95)),
    by_severity: {
      critical: measure(17, up(42, 12)),
      urgent: measure(46, up(21, 38)),
      info: measure(65, up(44, 45)),
    },
    // None was unhandled on the same days last month: no percentage from 0.
    unhandled: measure(9),
    median_ack_minutes: measure(22, up(6, 16)),
    median_ack_minutes_critical: measure(11, up(3, 8)),
    critical_within_target: measure(0.71, down(17, 0.88)),
    acknowledged_share: measure(0.82, down(3, 0.85)),
    dismissed_share: measure(0.18, up(3, 0.15)),
    dismiss_reasons: [
      { reason: "not_relevant", count: count(9) },
      { reason: "already_known", count: count(7) },
      { reason: "wrong_patient", count: hiddenCount() },
      { reason: "other", count: hiddenCount() },
    ],
    top_findings: [
      { name: "Potassium", flag: "low", count: count(31) },
      { name: "Sodium", flag: "low", count: count(24) },
      { name: "Platelets", flag: "low", count: count(18) },
      { name: null, flag: null, count: count(11) },
      { name: "Haemoglobin", flag: "low", count: hiddenCount() },
    ],
    top_locations: [
      { location: ward("Ward 3"), count: count(34) },
      { location: EMERGENCY, count: count(29) },
      { location: ward("Ward 5"), count: count(21) },
      { location: null, count: count(8) },
      { location: CARDIOLOGY, count: hiddenCount() },
    ],
    series: {
      bucket: "day",
      values: [6, 7, 5, 8, 6, 7, 9, 6, 7, 8, 6, 7, 8, 23, 7, 8],
      unusual: { 13: 3.1 },
    },
    rising: [
      {
        kind: "finding",
        name: "Potassium",
        flag: "low",
        count: 31,
        previous: 9,
      },
      { kind: "location", location: ward("Ward 3"), count: 34, previous: 12 },
    ],
    worsening: { value: 0.71, previous: 0.88 },
  },
  last_month: {
    critical_target_minutes: 15,
    has_previous: true,
    total: measure(182, up(7, 170)),
    by_severity: {
      critical: measure(22, down(12, 25)),
      urgent: measure(70, up(6, 66)),
      info: measure(90, up(14, 79)),
    },
    unhandled: measure(0),
    median_ack_minutes: measure(16, down(2, 18)),
    median_ack_minutes_critical: measure(8, down(1, 9)),
    critical_within_target: measure(0.88, up(2, 0.86)),
    acknowledged_share: measure(0.82, up(2, 0.8)),
    dismissed_share: measure(0.18, down(2, 0.2)),
    dismiss_reasons: [
      { reason: "not_relevant", count: count(14) },
      { reason: "already_known", count: count(11) },
      // Both are hidden so neither can be worked out.
      { reason: "wrong_patient", count: hiddenCount() },
      { reason: "other", count: hiddenCount() },
    ],
    top_findings: [
      { name: "Sodium", flag: "low", count: count(41) },
      { name: "Platelets", flag: "low", count: count(33) },
      { name: "Potassium", flag: "low", count: count(14) },
      { name: null, flag: null, count: count(12) },
      { name: "Glucose", flag: "high", count: count(9) },
    ],
    top_locations: [
      { location: EMERGENCY, count: count(52) },
      { location: ward("Ward 5"), count: count(40) },
      { location: ward("Ward 3"), count: count(22) },
      { location: null, count: count(10) },
      { location: CARDIOLOGY, count: hiddenCount() },
    ],
    series: {
      bucket: "day",
      values: [
        6, 7, 5, 6, 7, 6, 5, 6, 7, 6, 6, 7, 5, 6, 7, 6, 5, 6, 7, 6, 6, 7, 5, 6,
        7, 6, 5, 6, 7, 5,
      ],
    },
    rising: [],
    worsening: null,
  },
  last_90_days: {
    critical_target_minutes: 15,
    has_previous: false,
    total: measure(525),
    by_severity: {
      critical: measure(63),
      urgent: measure(189),
      info: measure(273),
    },
    unhandled: measure(9),
    median_ack_minutes: measure(19),
    median_ack_minutes_critical: measure(10),
    critical_within_target: measure(0.8),
    acknowledged_share: measure(0.82),
    dismissed_share: measure(0.18),
    dismiss_reasons: [
      { reason: "not_relevant", count: count(40) },
      { reason: "already_known", count: count(33) },
      { reason: "wrong_patient", count: count(6) },
      { reason: "other", count: count(12) },
    ],
    top_findings: [
      { name: "Sodium", flag: "low", count: count(110) },
      { name: "Platelets", flag: "low", count: count(86) },
      { name: "Potassium", flag: "low", count: count(64) },
      { name: null, flag: null, count: count(41) },
      { name: "Glucose", flag: "high", count: count(30) },
    ],
    top_locations: [
      { location: EMERGENCY, count: count(150) },
      { location: ward("Ward 5"), count: count(118) },
      { location: ward("Ward 3"), count: count(80) },
      { location: null, count: count(34) },
      { location: CARDIOLOGY, count: count(21) },
    ],
    series: {
      bucket: "week",
      values: [38, 41, 36, 40, 39, 42, 37, 44, 40, 43, 41, 45, 39],
    },
    rising: [],
    worsening: null,
  },
};

/** Buckets from the period's first day, never past its end (R12). */
function seriesFor(
  seed: SeriesSeed,
  from: string,
  to: string,
): UsageAlertsOut["series"] {
  const step = seed.bucket === "day" ? D : 7 * D;
  const first = Date.parse(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(to);
  const points = seed.values.flatMap((total, i) => {
    const t = first + i * step;
    return t > end
      ? []
      : [
          {
            start: iso(t).slice(0, 10),
            total,
            usual_multiple: seed.unusual?.[i] ?? null,
          },
        ];
  });
  return { bucket: seed.bucket, points };
}

function alertsFor(
  p: UsagePeriod,
  range: { from: string; to: string },
  mode: MockAlertsMode,
): UsageOut["alerts"] {
  if (mode === "off") return null;
  if (mode === "unavailable") return { unavailable: true };
  const { series, ...rest } = copy(USAGE_ALERTS[p]);
  if (mode === "edge") {
    // Two severities hidden together, so neither can be worked out.
    rest.by_severity.critical = { ...hiddenCount(), change: null };
    rest.by_severity.urgent = { ...hiddenCount(), change: null };
    rest.median_ack_minutes_critical = { ...hiddenCount(), change: null };
    rest.median_ack_minutes = { value: null, suppressed: false, change: null };
    if (series.bucket === "week") series.unusual = { 11: 2.1 };
  }
  return { ...rest, series: seriesFor(series, range.from, range.to) };
}

type EventSeed = Partial<ActivityEventOut> &
  Pick<ActivityEventOut, "type" | "kind"> & { ago: number };

function event(now: number, n: number, e: EventSeed): ActivityEventOut {
  const { ago, ...rest } = e;
  return {
    id: `e-${n}`,
    at: iso(now - ago),
    actor: null,
    target: null,
    specialty: null,
    confidence: null,
    device: null,
    count: null,
    flag: null,
    ...rest,
  };
}

const who = (display_name: string) => ({ display_name });

/** About 130 events over 60 days, newest first. */
function seedActivity(now: number): ActivityEventOut[] {
  const named: EventSeed[] = [
    {
      ago: 10 * MIN,
      type: "admin",
      kind: "specialty_changed",
      actor: who("Dr. Obi"),
      target: who("Dr. Mensah"),
      specialty: "Cardiology",
    },
    {
      ago: 13 * MIN,
      type: "review",
      kind: "correction_approved",
      actor: who("Dr. Okafor"),
      specialty: "Infectious disease",
    },
    {
      ago: 20 * MIN,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Bello"),
      specialty: "Internal Medicine",
      confidence: "caution",
    },
    {
      ago: 31 * MIN,
      type: "sign_in",
      kind: "signed_in_without_mfa",
      actor: who("Dr. Mensah"),
      device: "Chrome on Windows",
      flag: "policy",
    },
    {
      ago: 49 * MIN,
      type: "account",
      kind: "invite_accepted",
      actor: who("Dr. Udo"),
    },
    {
      ago: 56 * MIN,
      type: "security",
      kind: "sign_in_locked",
      target: who("Dr. Bello"),
      count: 5,
      flag: "alert",
    },
    {
      ago: 71 * MIN,
      type: "feedback",
      kind: "correction_suggested",
      actor: who("Dr. Owusu"),
      specialty: "Emergency medicine",
    },
    {
      ago: 2 * H,
      type: "sign_in",
      kind: "signed_in",
      actor: who("Dr. Reyes"),
      device: "Safari on iPhone",
    },
    {
      ago: 3 * H,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Okafor"),
      specialty: "Infectious disease",
      confidence: "high",
    },
    {
      ago: 5 * H,
      type: "feedback",
      kind: "result_agreed",
      actor: who("Dr. Udo"),
      specialty: "Paediatrics",
    },
    {
      ago: D,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Danjuma"),
      specialty: "Internal Medicine",
      confidence: "review",
    },
    {
      ago: 2 * D,
      type: "admin",
      kind: "invite_sent",
      actor: who("Dr. Obi"),
      target: who("Dr. Adeyemi"),
    },
    {
      ago: 3 * D,
      type: "admin",
      kind: "settings_changed",
      actor: who("Grace Nwosu"),
    },
    {
      ago: 21 * D,
      type: "admin",
      kind: "deactivated",
      actor: who("Dr. Obi"),
      target: who("Dr. Eze"),
    },
  ];
  const people = [
    "Dr. Reyes",
    "Dr. Okafor",
    "Dr. Bello",
    "Dr. Udo",
    "Dr. Owusu",
    "Dr. Danjuma",
  ];
  const routine = Array.from({ length: 120 }, (_, i): EventSeed => ({
    ago: 4 * H + i * 12 * H,
    type: "sign_in",
    kind: "signed_in",
    actor: who(people[i % people.length]!),
    device: i % 2 ? "Chrome on Windows" : "Safari on iPhone",
  }));
  return [...named, ...routine]
    .sort((a, b) => a.ago - b.ago)
    .map((e, i) => event(now, i + 1, e));
}

type Correction = Omit<OversightItemOut, "eligible_reviewers"> & {
  suggesterId: string;
};

function seedCorrections(now: number): Correction[] {
  return [
    {
      id: "c-118",
      ref: "C-118",
      suggested_by: who("Dr. Reyes"),
      suggesterId: "s-reyes",
      specialty: "Paediatrics",
      submitted_at: iso(now - 5 * H),
      assigned_to: null,
      reminded_at: null,
    },
    {
      id: "c-117",
      ref: "C-117",
      suggested_by: who("Dr. Bello"),
      suggesterId: "s-bello",
      specialty: "Internal Medicine",
      submitted_at: iso(now - 3 * H),
      assigned_to: null,
      reminded_at: null,
    },
    {
      id: "c-116",
      ref: "C-116",
      suggested_by: who("Dr. Okafor"),
      suggesterId: "s-okafor",
      specialty: "Infectious disease",
      submitted_at: iso(now - 42 * MIN),
      assigned_to: null,
      reminded_at: null,
    },
  ];
}

/**
 * The demo's hospital admin API: one hospital, memory only (a reload resets
 * it), never stored. It enforces the same guards the backend must (R5, R7).
 */
export function createMockAdmin({
  now = () => Date.now(),
  me: meOpt,
  delayMs = 150,
  twoStep,
  stepUp,
  alerts: alertsMode = "on",
}: {
  now?: () => number;
  me?: () => Promise<string | null>;
  delayMs?: number;
  /**
   * Whether this admin has two-step on. By default, everyone does except the
   * "New admin" sample (its real state comes from the sign-in session when
   * `me` is not given).
   */
  twoStep?: (email: string | null) => Promise<boolean>;
  /**
   * The two-step codes. By default the running demo's own (so a backup code
   * spent at sign-in is spent here too); a fresh set when `me` is given.
   */
  stepUp?: StepUp;
  /** The usage alerts sample: on (default), switched off, or failing. */
  alerts?: MockAlertsMode;
} = {}): AdminClient {
  let staff = seedStaff(now());
  let settings = seedSettings();
  let activity = seedActivity(now());
  const corrections = seedCorrections(now());
  const me =
    meOpt ??
    (async () => (await getAuthClient().getSession())?.user.email ?? null);
  let nextId = 1;
  const codes = (): StepUp =>
    (stepUp ??= meOpt === undefined ? getDemoStepUp() : createStepUp(now));
  const hasTwoStep =
    twoStep ??
    (async (email: string | null) => {
      if (email === null) return true;
      if (meOpt === undefined) {
        const u = (await getAuthClient().getSession())?.user;
        if (u?.email?.toLowerCase() === email) return u.mfaEnabled;
      }
      return email !== DEMO_EMAILS.newAdmin;
    });

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };
  const youEmail = async () => (await me())?.toLowerCase() ?? null;
  const mark = async (rows: StaffOut[]) => {
    const email = await youEmail();
    return rows.map((s) => ({
      ...copy(s),
      is_you: email !== null && s.email.toLowerCase() === email,
    }));
  };
  const find = (id: string) =>
    staff.find((s) => s.id === id) ?? fail(404, "not_found");
  const isYou = async (s: StaffOut) =>
    s.email.toLowerCase() === (await youEmail());
  const activeAdmins = () =>
    staff.filter(
      (s) => s.status === "active" && s.roles.includes("hospital_admin"),
    ).length;
  const isLastAdmin = (s: StaffOut) =>
    s.status === "active" &&
    s.roles.includes("hospital_admin") &&
    activeAdmins() <= 1;
  const actorName = async () => {
    const email = await youEmail();
    return (
      staff.find((s) => s.email.toLowerCase() === email)?.display_name ??
      "Hospital admin"
    );
  };
  const log = async (
    type: ActivityType,
    kind: ActivityEventOut["kind"],
    extra: Partial<ActivityEventOut> = {},
  ) => {
    activity = [
      event(now(), 10_000 + nextId++, {
        ago: 0,
        type,
        kind,
        actor: who(await actorName()),
        ...extra,
      }),
      ...activity,
    ];
  };
  const save = (s: StaffOut): StaffOut => {
    const next = { ...s, version: s.version + 1 };
    staff = staff.map((x) => (x.id === s.id ? next : x));
    return next;
  };
  /** The two-step gate for removing staff (403 mfa_required / mfa_invalid, 429 mfa_locked). */
  const checkCode = async (auth: StaffRemoveAuth) => {
    if (!(await hasTwoStep(await youEmail()))) fail(403, "mfa_required");
    const r = await codes().check(await youEmail(), auth);
    if (r === "locked") fail(429, "mfa_locked");
    if (r === "invalid") fail(403, "mfa_invalid");
  };
  const reply = async (s: StaffOut) => (await mark([s]))[0]!;

  const reviewersFor = (c: Correction) =>
    staff.filter(
      (s) =>
        s.status === "active" &&
        s.roles.includes("clinician") &&
        s.can_review &&
        s.id !== c.suggesterId &&
        (!settings.reviewers_share_specialty ||
          (c.specialty !== null && s.review_specialties.includes(c.specialty))),
    );
  const findCorrection = (id: string) =>
    corrections.find((c) => c.id === id) ?? fail(404, "not_found");

  return {
    async listStaff() {
      await wait();
      return mark(staff);
    },

    async inviteStaff({ emails, roles, specialty }) {
      await wait();
      const out: InviteOut = { invited: [], skipped: [] };
      const seen = new Set<string>();
      const domains = settings.allowed_email_domains;
      for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        const skip = (reason: InviteOut["skipped"][number]["reason"]) =>
          out.skipped.push({
            email: reason === "invalid_email" ? raw : email,
            reason,
          });
        if (!EMAIL_RE.test(email)) {
          skip("invalid_email");
          continue;
        }
        if (seen.has(email)) {
          skip("duplicate");
          continue;
        }
        seen.add(email);
        if (staff.some((s) => s.email.toLowerCase() === email)) {
          skip("already_staff");
          continue;
        }
        if (domains.length && !domains.includes(email.split("@")[1]!)) {
          skip("domain_not_allowed");
          continue;
        }
        const row: StaffOut = {
          ...person(now(), {
            id: `s-new-${nextId++}`,
            name: email,
            display: email,
            email,
            roles: [...roles],
            specialty,
            status: "invited",
          }),
          invite_expires_at:
            settings.sso.status === "connected" ? null : iso(now() + INVITE_MS),
        };
        staff = [...staff, row];
        out.invited.push(row);
        await log("admin", "invite_sent", { target: who(email) });
      }
      return { invited: await mark(out.invited), skipped: out.skipped };
    },

    async updateStaff(id, p) {
      await wait();
      const s = find(id);
      if (p.version !== s.version) fail(409, "conflict");
      if (p.roles) {
        if (!p.roles.length) fail(422, "invalid");
        const drops = !p.roles.includes("hospital_admin");
        if (drops && s.roles.includes("hospital_admin")) {
          if (await isYou(s)) fail(403, "self_change");
          if (isLastAdmin(s)) fail(409, "last_admin");
        }
      }
      const next = save({
        ...s,
        ...(p.roles ? { roles: [...p.roles] } : {}),
        ...(p.specialty !== undefined ? { specialty: p.specialty } : {}),
        ...(p.can_review !== undefined ? { can_review: p.can_review } : {}),
        ...(p.review_specialties
          ? { review_specialties: [...p.review_specialties] }
          : {}),
      });
      const target = who(s.display_name);
      // Allowed, but audited and flagged (product decision, 2026-10-17).
      if (p.roles && (await isYou(s)))
        await log("security", "self_role_change", {
          target,
          flag: "alert",
          roles_added: p.roles.filter((r) => !s.roles.includes(r)),
        });
      else if (p.roles) await log("admin", "roles_changed", { target });
      if (p.specialty !== undefined)
        await log("admin", "specialty_changed", {
          target,
          specialty: p.specialty,
        });
      if (p.can_review !== undefined || p.review_specialties)
        await log("admin", "reviewer_changed", { target });
      return reply(next);
    },

    async staffAction(id, action: StaffAction) {
      await wait();
      const s = find(id);
      const target = who(s.display_name);
      const passwordUser = s.status === "active" && s.sign_in !== "sso";
      switch (action) {
        case "deactivate": {
          if (await isYou(s)) fail(403, "self_change");
          if (s.status !== "active") fail(409, "conflict");
          if (isLastAdmin(s)) fail(409, "last_admin");
          await log("admin", "deactivated", { target });
          return reply(save({ ...s, status: "deactivated" }));
        }
        case "reactivate": {
          if (s.status !== "deactivated") fail(409, "conflict");
          await log("admin", "reactivated", { target });
          return reply(save({ ...s, status: "active" }));
        }
        case "password-reset": {
          if (!passwordUser) fail(409, "conflict");
          await log("admin", "password_reset_sent", { target });
          return reply(save(s));
        }
        case "reset-mfa": {
          if (!passwordUser) fail(409, "conflict");
          await log("admin", "mfa_reset", { target });
          return reply(
            save({
              ...s,
              sign_in: "password",
              issues: [...new Set<StaffIssue>([...s.issues, "mfa_not_set_up"])],
            }),
          );
        }
        case "remind": {
          if (!s.issues.includes("mfa_not_set_up")) fail(409, "conflict");
          await log("admin", "mfa_reminder_sent", { target });
          return reply(save(s));
        }
        case "resend-invite": {
          if (s.status !== "invited") fail(409, "conflict");
          await log("admin", "invite_sent", { target });
          return reply(
            save({
              ...s,
              issues: s.issues.filter((i) => i !== "invite_expired"),
              invited_at: iso(now()),
              invite_expires_at: iso(now() + INVITE_MS),
            }),
          );
        }
      }
    },

    async removeStaff(id, auth) {
      await wait();
      const s = find(id);
      if (await isYou(s)) fail(403, "self_change");
      if (isLastAdmin(s)) fail(409, "last_admin");
      await checkCode(auth);
      staff = staff.filter((x) => x.id !== id);
      await log(
        "admin",
        s.status === "invited" ? "invite_cancelled" : "removed",
        { target: who(s.display_name) },
      );
    },

    async getSettings() {
      await wait();
      return copy(settings);
    },

    async updateSettings(p) {
      await wait();
      if (p.version !== settings.version) fail(409, "conflict");
      if (
        (p.review_overdue_hours !== undefined &&
          !settings.limits.review_overdue_hours.includes(
            p.review_overdue_hours,
          )) ||
        (p.idle_timeout_minutes !== undefined &&
          !settings.limits.idle_timeout_minutes.includes(
            p.idle_timeout_minutes,
          ))
      )
        fail(422, "invalid");
      settings = { ...settings, ...p, version: settings.version + 1 };
      await log("admin", "settings_changed");
      return copy(settings);
    },

    async getUsage(period) {
      await wait();
      const range = periodRange(period, now());
      return {
        period,
        ...range,
        ...copy(USAGE[period]),
        alerts: alertsFor(period, range, alertsMode),
      };
    },

    async listActivity(q) {
      await wait();
      const term = q.person ? fold(q.person) : null;
      const staffName = q.staff_id
        ? (staff.find((s) => s.id === q.staff_id)?.display_name ?? "")
        : null;
      const from = q.from ? Date.parse(q.from) : -Infinity;
      const to = q.to ? Date.parse(q.to) : Infinity;
      const all = activity.filter((e) => {
        const t = Date.parse(e.at);
        const names = [e.actor?.display_name, e.target?.display_name];
        return (
          (!q.type || e.type === q.type) &&
          (!q.flagged || e.flag !== null) &&
          t >= from &&
          t <= to &&
          (!term || names.some((n) => n && fold(n).includes(term))) &&
          (staffName === null || names.includes(staffName))
        );
      });
      const start = q.cursor ? Number(q.cursor) : 0;
      const size = Math.min(q.limit ?? ACTIVITY_PAGE_SIZE, ACTIVITY_PAGE_SIZE);
      const end = start + size;
      return {
        events: copy(all.slice(start, end)),
        next_cursor: end < all.length ? String(end) : null,
      };
    },

    async getOversight() {
      await wait();
      const items: OversightItemOut[] = corrections.map((c) => ({
        id: c.id,
        ref: c.ref,
        suggested_by: copy(c.suggested_by),
        specialty: c.specialty,
        submitted_at: c.submitted_at,
        assigned_to: c.assigned_to ? copy(c.assigned_to) : null,
        reminded_at: c.reminded_at,
        eligible_reviewers: reviewersFor(c).length,
      }));
      const reviewers = settings.specialties
        .map((specialty) => ({
          specialty,
          reviewers: staff.filter(
            (s) =>
              s.status === "active" &&
              s.can_review &&
              s.review_specialties.includes(specialty),
          ).length,
        }))
        .sort((a, b) => b.reviewers - a.reviewers);
      return {
        overdue_after_hours: settings.review_overdue_hours,
        waiting: items.length,
        median_decision_hours: 3.1,
        decided_this_week: 12,
        items,
        reviewers_by_specialty: reviewers,
      };
    },

    async listEligibleReviewers(id) {
      await wait();
      return reviewersFor(findCorrection(id)).map((s) => ({
        id: s.id,
        display_name: s.display_name,
        specialty: s.specialty,
      }));
    },

    async remindReviewers(id) {
      await wait();
      const c = findCorrection(id);
      c.reminded_at = iso(now());
      await log("review", "reviewers_reminded", { specialty: c.specialty });
    },

    async assignReviewer(id, staffId) {
      await wait();
      const c = findCorrection(id);
      const r = reviewersFor(c).find((s) => s.id === staffId);
      if (!r) fail(422, "not_eligible");
      c.assigned_to = who(r!.display_name);
      await log("review", "reviewer_assigned", {
        target: who(r!.display_name),
        specialty: c.specialty,
      });
    },
  };
}
