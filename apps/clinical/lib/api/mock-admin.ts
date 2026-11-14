import { getAuthClient } from "../auth/client";
import {
  createStepUp,
  DEMO_EMAILS,
  getDemoStepUp,
  type StepUp,
} from "../auth/mock";
import type { AdminClient, StaffAction } from "./admin";
import {
  loosensSignIn,
  type ActivityEventOut,
  type ActivityType,
  type GuardedOut,
  type HospitalSettingsOut,
  type OversightItemOut,
  type SignInMethod,
  type StaffIssue,
  type StaffOut,
  type StaffRole,
  type StaffStatus,
  type StepUpAuth,
  type UsageAlertsOut,
  type UsageOut,
  type UsagePeriod,
} from "./admin-contract";
import { ApiError } from "./errors";
import { auditEvents } from "./mock-audit";

export const MOCK_HOSPITAL = "Havana Hospital";
export const ACTIVITY_PAGE_SIZE = 50;
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

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
};

/**
 * Reviewing as core derives it (1.24.0): an active clinician reviews every
 * specialty; there is no reviewer assignment.
 */
const derived = (s: StaffOut): StaffOut => ({
  ...s,
  can_review: s.status === "active" && s.roles.includes("clinician"),
  review_specialties: [],
});

function person(now: number, p: Seed): StaffOut {
  const status = p.status ?? "active";
  const ago = p.activeAgo ?? null;
  return derived({
    id: p.id,
    full_name: p.name,
    display_name: p.display,
    email: p.email,
    roles: p.roles,
    specialty: p.specialty,
    can_review: false,
    review_specialties: [],
    status,
    issues: p.issues ?? [],
    sign_in: p.signIn !== undefined ? p.signIn : "sso",
    last_active_at: ago === null ? null : iso(now - ago),
    joined_at: iso(now - 200 * D),
    // Core has no invites.
    invited_at: null,
    invite_expires_at: null,
    is_you: false,
    version: 1,
  });
}

/** 12 synthetic people at Havana Hospital (core has no invites). Names are invented. */
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
    },
    {
      id: "s-obi",
      name: "Dr. Ngozi Obi",
      display: "Dr. Obi",
      email: DEMO_EMAILS.director,
      roles: ["clinician", "hospital_admin"],
      specialty: "Emergency medicine",
      activeAgo: 5 * MIN,
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
    },
    {
      id: "s-danjuma",
      name: "Dr. Yusuf Danjuma",
      display: "Dr. Danjuma",
      email: "y.danjuma@havanahospital.org",
      roles: ["clinician"],
      specialty: "Internal Medicine",
      activeAgo: 4 * D,
    },
    {
      id: "s-kemi",
      name: "Dr. Kemi Adeyemi",
      display: "Dr. Kemi Adeyemi",
      email: DEMO_EMAILS.analyst,
      roles: ["clinician", "analyst"],
      specialty: "Internal Medicine",
      activeAgo: 8 * H,
    },
    {
      id: "s-long",
      name: "Dr. Oluwaseun Adebayo-Ogunleye-Fashola",
      display: "Dr. Adebayo-Ogunleye-Fashola",
      email: "o.adebayo-ogunleye-fashola@havanahospital.org",
      roles: ["clinician"],
      specialty: "Infectious disease",
      activeAgo: 9 * D,
    },
  ].map((p) => person(now, p as Seed));
}

function seedSettings(): HospitalSettingsOut {
  return {
    hospital_name: MOCK_HOSPITAL,
    review_overdue_hours: 4,
    // Core has no reviewing by specialty, single sign-on or invites yet.
    reviewers_share_specialty: false,
    require_mfa_for_clinicians: true,
    idle_timeout_minutes: 15,
    allow_trust_device: true,
    sso: { status: "not_set_up", domain: null },
    allowed_email_domains: [],
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

const USAGE: Record<
  UsagePeriod,
  Omit<UsageOut, "period" | "from" | "to" | "alerts">
> = {
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
 * The usage alerts sample: switched on, no record source (null), failing, or
 * "edge": the sample with a hidden set (Critical and Urgent hidden together,
 * as core's small-group rule hides two so neither can be worked out). Never
 * a raw 1 to 4.
 */
export type MockAlertsMode = "on" | "off" | "unavailable" | "edge";

const count = (value: number): GuardedOut => ({ value, suppressed: false });
const hidden = (): GuardedOut => ({ value: null, suppressed: true });

/** Core's block, already guarded (written for 16 Oct 2026, R12). */
const USAGE_ALERTS: Record<UsagePeriod, UsageAlertsOut> = {
  this_month: {
    total: count(128),
    by_severity: { critical: count(17), urgent: count(46), info: count(65) },
    by_category: {
      blood_chemistry: count(52),
      blood_count: count(24),
      kidney_function: count(18),
      blood_gases_lactate: hidden(),
      heart_markers: count(9),
      blood_sugar: count(11),
      vital_signs: count(10),
      infection_markers: hidden(),
    },
    // One alert can go to both, so these needn't add up to the total.
    by_route: { queue: count(97), named: count(58) },
    by_handling: {
      open: count(9),
      acknowledged: count(98),
      dismissed: count(15),
      withdrawn: count(6),
    },
  },
  last_month: {
    total: count(182),
    by_severity: { critical: count(22), urgent: count(70), info: count(90) },
    by_category: {
      blood_chemistry: count(70),
      blood_count: count(33),
      kidney_function: count(25),
      blood_gases_lactate: count(8),
      heart_markers: count(12),
      blood_sugar: count(14),
      vital_signs: count(13),
      infection_markers: count(7),
    },
    by_route: { queue: count(139), named: count(76) },
    by_handling: {
      open: count(0),
      acknowledged: count(149),
      dismissed: count(28),
      withdrawn: count(5),
    },
  },
  last_90_days: {
    total: count(525),
    by_severity: { critical: count(63), urgent: count(189), info: count(273) },
    by_category: {
      blood_chemistry: count(201),
      blood_count: count(96),
      kidney_function: count(71),
      blood_gases_lactate: count(22),
      heart_markers: count(35),
      blood_sugar: count(40),
      vital_signs: count(38),
      infection_markers: count(22),
    },
    by_route: { queue: count(402), named: count(221) },
    by_handling: {
      open: count(9),
      acknowledged: count(425),
      dismissed: count(77),
      withdrawn: count(14),
    },
  },
};

function alertsFor(p: UsagePeriod, mode: MockAlertsMode): UsageOut["alerts"] {
  if (mode === "off") return null;
  if (mode === "unavailable") return { unavailable: true };
  const a = copy(USAGE_ALERTS[p]);
  if (mode === "edge") {
    // Two severities hidden together, so neither can be worked out; few
    // were sent to named clinicians: hidden, like any small group.
    a.by_severity.critical = hidden();
    a.by_severity.urgent = hidden();
    a.by_route.named = hidden();
  }
  return a;
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

/** About 130 events over 60 days, newest first, as core words them (1.24.0). */
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
    },
    {
      ago: 31 * MIN,
      type: "sign_in",
      kind: "signed_in_without_mfa",
      actor: who("Dr. Mensah"),
    },
    {
      ago: 56 * MIN,
      type: "security",
      kind: "sign_in_locked",
      target: who("Dr. Bello"),
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
    },
    {
      ago: 3 * H,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Okafor"),
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
    },
    {
      ago: 3 * D,
      type: "admin",
      kind: "settings_changed",
      actor: who("Grace Nwosu"),
    },
    {
      ago: 4 * D,
      type: "admin",
      kind: "alert_recipients_changed",
      actor: who("Grace Nwosu"),
    },
    {
      ago: 4 * D + 5 * MIN,
      type: "admin",
      kind: "alert_rules_changed",
      actor: who("Grace Nwosu"),
    },
    {
      ago: 4 * D + 10 * MIN,
      type: "admin",
      kind: "alert_units_changed",
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

/** The demo's cap on analysts per hospital (core's is the hospital's own setting). */
export const MOCK_ANALYST_CAP = 3;

/**
 * The demo's hospital admin API: one hospital, memory only (a reload resets
 * it), never stored. It enforces the guards core does (1.24.0), in core's
 * order: the refusals that need no code first, then the step-up code, then
 * the Analyst rules (migration 00030).
 */
export function createMockAdmin({
  now = () => Date.now(),
  me: meOpt,
  delayMs = 150,
  twoStep,
  stepUp,
  alerts: alertsMode = "on",
  analysis = "on",
  analystCap = MOCK_ANALYST_CAP,
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
  /** The usage alerts sample: on (default), no record source, or failing. */
  alerts?: MockAlertsMode;
  /** Whether Analysis is switched on for the hospital (`analysis_off` when not). */
  analysis?: "on" | "off";
  /** How many analysts the hospital may have (`analyst_cap` past it). */
  analystCap?: number;
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
  /** Core counts only active admins with two-step on. */
  const activeAdmins = () =>
    staff.filter(
      (s) =>
        s.status === "active" &&
        s.roles.includes("hospital_admin") &&
        !s.issues.includes("mfa_not_set_up"),
    ).length;
  const isLastAdmin = (s: StaffOut) =>
    s.status === "active" &&
    s.roles.includes("hospital_admin") &&
    !s.issues.includes("mfa_not_set_up") &&
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
    const next = derived({ ...s, version: s.version + 1 });
    staff = staff.map((x) => (x.id === s.id ? next : x));
    return next;
  };
  /** The step-up gate (403 mfa_required / mfa_invalid, 429 mfa_locked). */
  const checkCode = async (auth: StepUpAuth | null) => {
    if (!(await hasTwoStep(await youEmail()))) fail(403, "mfa_required");
    if (!auth) fail(403, "mfa_required");
    const r = await codes().check(await youEmail(), auth!);
    if (r === "locked") fail(429, "mfa_locked");
    if (r === "invalid") fail(403, "mfa_invalid");
  };
  const reply = async (s: StaffOut) => (await mark([s]))[0]!;

  const reviewersFor = (c: Correction) =>
    staff.filter(
      (s) => s.status === "active" && s.can_review && s.id !== c.suggesterId,
    );
  const findCorrection = (id: string) =>
    corrections.find((c) => c.id === id) ?? fail(404, "not_found");

  return {
    async listStaff() {
      await wait();
      return mark(staff);
    },

    async updateStaff(id, p, auth) {
      await wait();
      const s = find(id);
      if (p.roles) {
        if (!p.roles.length || new Set(p.roles).size !== p.roles.length)
          fail(422, "validation_failed");
        // Analyst needs Clinician.
        if (p.roles.includes("analyst") && !p.roles.includes("clinician"))
          fail(422, "not_eligible");
      }
      if (p.version !== s.version) fail(409, "conflict");
      const roles = p.roles ?? s.roles;
      const added = roles.filter((r) => !s.roles.includes(r));
      const removed = s.roles.filter((r) => !roles.includes(r));
      const you = await isYou(s);
      // No role added to yourself, Clinician included; never drop your own admin role.
      if (you && (added.length || removed.includes("hospital_admin")))
        fail(403, "self_change");
      if (removed.includes("hospital_admin") && isLastAdmin(s))
        fail(409, "last_admin");
      const specialty =
        p.specialty !== undefined && p.specialty !== s.specialty;
      // An edit that changes nothing answers the person without a code.
      if (!added.length && !removed.length && !specialty) return reply(s);
      await checkCode(auth);
      if (added.includes("analyst")) {
        if (analysis === "off") fail(409, "analysis_off");
        if (
          s.status !== "active" ||
          s.issues.includes("mfa_not_set_up") ||
          !roles.includes("clinician")
        )
          fail(422, "not_eligible");
        if (
          staff.filter((x) => x.roles.includes("analyst")).length >= analystCap
        )
          fail(409, "analyst_cap");
      }
      // Removing Clinician removes Analyst.
      const next = save({
        ...s,
        roles: roles.includes("clinician")
          ? [...roles]
          : roles.filter((r) => r !== "analyst"),
        ...(p.specialty !== undefined ? { specialty: p.specialty } : {}),
      });
      const target = who(s.display_name);
      const had = s.roles.includes("analyst");
      const has = next.roles.includes("analyst");
      const others = [...added, ...removed].filter((r) => r !== "analyst");
      if (others.length) await log("admin", "roles_changed", { target });
      if (had !== has)
        await log("admin", has ? "analyst_granted" : "analyst_removed", {
          target,
        });
      if (specialty)
        await log("admin", "specialty_changed", {
          target,
          specialty: p.specialty ?? null,
        });
      return reply(next);
    },

    async staffAction(id, action: StaffAction, auth) {
      await wait();
      const s = find(id);
      const target = who(s.display_name);
      if (await isYou(s)) fail(403, "self_change");
      if (action === "deactivate") {
        if (s.status !== "active") fail(409, "conflict");
        if (isLastAdmin(s)) fail(409, "last_admin");
        await checkCode(auth);
        await log("admin", "deactivated", { target });
        if (s.roles.includes("analyst"))
          await log("admin", "analyst_removed", { target });
        // Analyst ends with the account: reactivating needs a fresh grant.
        return reply(
          save({
            ...s,
            status: "deactivated",
            roles: s.roles.filter((r) => r !== "analyst"),
          }),
        );
      }
      if (s.status !== "deactivated") fail(409, "conflict");
      await checkCode(auth);
      await log("admin", "reactivated", { target });
      return reply(save({ ...s, status: "active" }));
    },

    async getSettings() {
      await wait();
      return copy(settings);
    },

    async updateSettings(p, auth) {
      await wait();
      if (
        (p.review_overdue_hours !== undefined &&
          !settings.limits.review_overdue_hours.includes(
            p.review_overdue_hours,
          )) ||
        (p.idle_timeout_minutes !== undefined &&
          !settings.limits.idle_timeout_minutes.includes(
            p.idle_timeout_minutes,
          )) ||
        ("reviewers_share_specialty" in p &&
          (p as { reviewers_share_specialty?: boolean })
            .reviewers_share_specialty !== false)
      )
        fail(422, "validation_failed");
      if (p.version !== settings.version) fail(409, "conflict");
      if (loosensSignIn(settings, p)) await checkCode(auth);
      const { version: _v, ...changes } = p;
      void _v;
      settings = { ...settings, ...changes, version: settings.version + 1 };
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
        alerts: alertsFor(period, alertsMode),
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
      const audit = auditEvents();
      const merged = audit.length
        ? [...activity, ...audit].sort(
            (a, b) => Date.parse(b.at) - Date.parse(a.at),
          )
        : activity;
      const all = merged.filter((e) => {
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
      // Core has no reviewer assignment or reminders.
      const items: OversightItemOut[] = corrections.map((c) => ({
        id: c.id,
        ref: c.ref,
        suggested_by: copy(c.suggested_by),
        specialty: c.specialty,
        submitted_at: c.submitted_at,
        assigned_to: null,
        reminded_at: null,
        eligible_reviewers: reviewersFor(c).length,
      }));
      const reviewers = settings.specialties
        .map((specialty) => ({
          specialty,
          reviewers: staff.filter(
            (s) =>
              s.status === "active" &&
              s.can_review &&
              s.specialty === specialty,
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
  };
}
