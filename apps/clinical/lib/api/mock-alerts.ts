import { getAuthClient } from "../auth/client";
import type { AlertsClient } from "./alerts";
import type {
  AlertLocationOut,
  AlertOut,
  AlertRoutingOut,
  AlertSentTo,
  AlertSeverity,
  CauseConfidence,
  DismissReason,
  FindingFlag,
  NotificationSettingsOut,
} from "./alerts-contract";
import type { Sex, WriteOpts } from "./contract";
import { categoryRef } from "./emr-fixtures";
import { AlertHandledError, ApiError } from "./errors";

/** In the demo a new sample alert arrives this often (spec §7). */
export const MOCK_ALERT_EVERY_MS = 120_000;
/** Arrivals stop after this many, so a long demo stays small. */
export const MOCK_ARRIVALS_MAX = 30;
/** The sample hospital's connected systems, by its own labels (R17, ADR 0003). */
export const MOCK_SOURCES = ["Main record", "Results system"] as const;
export const ALERT_PAGE_SIZE = 20;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOTE_MAX = 500;
const SENT_TO = new Set<AlertSentTo>(["you", "queue"]);
const REASONS = new Set<DismissReason>([
  "not_relevant",
  "already_known",
  "wrong_patient",
  "other",
]);

type Source = (typeof MOCK_SOURCES)[number];

/** One piece of evidence: label, value, and how long before the alert it was recorded (null: no time). */
type Evidence = [label: string, value: string | null, before: number | null];
type Cause = [
  label: string,
  confidence: CauseConfidence,
  evidence?: Evidence[],
];

const FOR_YOU: AlertRoutingOut = { to_you: true, queue: false };
const QUEUE_ONLY: AlertRoutingOut = { to_you: false, queue: true };

/** One synthetic alert. Every name and MRN here is invented. */
interface Sample {
  severity: AlertSeverity;
  finding: {
    name: string;
    value: string | null;
    unit: string | null;
    flag: FindingFlag | null;
    range: string | null;
    standardised?: boolean;
  };
  causes: Cause[];
  /** One of the sample categories (`emr-fixtures`). */
  category: string;
  name: string;
  mrn: string;
  location: AlertLocationOut | null;
  age: number | null;
  sex: Sex | null;
  source: Source;
}

interface Seed extends Sample {
  id: string;
  minutesAgo: number;
  routing: AlertRoutingOut;
  handled?: {
    status: "handled" | "dismissed";
    by: string;
    minutesAgo: number;
    reason?: DismissReason;
  };
}

const SEEDS: Seed[] = [
  {
    id: "al-101",
    minutesAgo: 18,
    routing: { to_you: true, queue: true },
    severity: "critical",
    finding: {
      name: "Potassium",
      value: "2.9",
      unit: "mmol/L",
      flag: "low",
      range: "3.5–5.1",
    },
    causes: [
      [
        "Diuretic treatment",
        "high",
        [["Furosemide 40 mg daily", "started 19 Oct", null]],
      ],
      ["Vomiting or diarrhoea", "caution", []],
      ["Low magnesium", "review", [["Magnesium", "0.6 mmol/L (low)", DAY]]],
    ],
    category: "blood-chemistry",
    name: "Maryam Abdullahi",
    mrn: "204817",
    location: { kind: "admitted", ward: "Ward 3", bed: "Bed 12" },
    age: 67,
    sex: "female",
    source: "Main record",
  },
  {
    id: "al-102",
    minutesAgo: 35,
    routing: QUEUE_ONLY,
    severity: "critical",
    finding: {
      name: "Lactate",
      value: "4.8",
      unit: "mmol/L",
      flag: "high",
      range: "0.5–2.2",
    },
    causes: [
      [
        "Sepsis",
        "caution",
        [
          ["Temperature", "38.9 °C (high)", 50 * MIN],
          ["White cells", "17.2 ×10⁹/L (high)", 40 * MIN],
        ],
      ],
      [
        "Poor blood flow to the tissues",
        "review",
        [["Blood pressure", "84/50 mmHg (low)", 30 * MIN]],
      ],
    ],
    category: "blood-gases",
    name: "Ibrahim Danladi",
    mrn: "377190",
    location: { kind: "emergency" },
    age: 59,
    sex: "male",
    source: "Results system",
  },
  {
    id: "al-103",
    minutesAgo: 52,
    routing: QUEUE_ONLY,
    severity: "urgent",
    finding: {
      name: "Haemoglobin",
      value: "7.1",
      unit: "g/dL",
      flag: "low",
      range: "12.0–15.5",
    },
    causes: [
      [
        "Bleeding",
        "caution",
        [
          ["Haemoglobin", "10.4 g/dL", 30 * DAY],
          ["Aspirin 75 mg daily", "taking", null],
        ],
      ],
      ["Iron deficiency", "caution", [["Ferritin", "9 µg/L (low)", 60 * DAY]]],
      [
        "Long-term kidney disease",
        "review",
        [["Creatinine", "142 µmol/L (high)", 60 * DAY]],
      ],
    ],
    category: "blood-count",
    name: "Esther Okoye",
    mrn: "128844",
    location: { kind: "outpatient", clinic: "Cardiology clinic" },
    age: 74,
    sex: "female",
    source: "Results system",
  },
  {
    id: "al-104",
    minutesAgo: 70,
    routing: FOR_YOU,
    severity: "urgent",
    finding: {
      name: "Heart rate",
      value: "128",
      unit: "/min",
      flag: "high",
      range: "60–100",
    },
    causes: [
      ["Fever", "caution", [["Temperature", "38.4 °C (high)", 20 * MIN]]],
      ["Dehydration", "review", []],
    ],
    category: "vital-signs",
    name: "Oluwafunmilayo Adebayo-Ogunleye-Fashola",
    mrn: "559031",
    location: null,
    age: 38,
    sex: "female",
    source: "Main record",
  },
  {
    id: "al-105",
    minutesAgo: 95,
    routing: FOR_YOU,
    severity: "info",
    finding: {
      name: "Creatinine",
      value: "168",
      unit: "µmol/L",
      flag: "high",
      range: "45–90",
    },
    // For you, with likely causes but no evidence.
    causes: [
      ["Dehydration", "caution", []],
      ["Medicine side effect", "review", []],
    ],
    category: "kidney-function",
    name: "Samuel Bassey",
    mrn: "640212",
    location: { kind: "admitted", ward: "Ward 5", bed: null },
    age: 81,
    sex: "male",
    source: "Results system",
  },
  {
    id: "al-106",
    minutesAgo: 120,
    routing: FOR_YOU,
    severity: "info",
    finding: {
      name: "HS-TROP (local code)",
      value: "52",
      unit: "ng/L",
      flag: "high",
      range: "<14",
      standardised: false,
    },
    causes: [],
    category: "heart-markers",
    name: "Blessing Uche",
    mrn: "702366",
    location: { kind: "outpatient", clinic: null },
    age: 63,
    sex: "female",
    source: "Results system",
  },
  {
    id: "al-107",
    minutesAgo: 180,
    routing: FOR_YOU,
    severity: "urgent",
    finding: {
      name: "Sodium",
      value: "128",
      unit: "mmol/L",
      flag: "low",
      range: "135–145",
    },
    causes: [
      [
        "Diuretic treatment",
        "caution",
        [["Hydrochlorothiazide 25 mg daily", "started 2 Oct", null]],
      ],
    ],
    category: "blood-chemistry",
    name: "Kemi Afolabi",
    mrn: "815540",
    location: { kind: "admitted", ward: "Ward 2", bed: "Bed 7" },
    age: 70,
    sex: "female",
    source: "Main record",
    handled: { status: "handled", by: "Dr. Okafor", minutesAgo: 150 },
  },
  {
    id: "al-108",
    minutesAgo: 300,
    routing: { to_you: true, queue: true },
    severity: "info",
    finding: {
      name: "Glucose",
      value: "11.2",
      unit: "mmol/L",
      flag: "high",
      range: "3.9–7.8",
    },
    causes: [
      ["Known diabetes", "high", [["HbA1c", "71 mmol/mol (high)", 90 * DAY]]],
    ],
    category: "blood-sugar",
    name: "Peter Ogbu",
    mrn: "903117",
    location: { kind: "outpatient", clinic: "Diabetes clinic" },
    age: 52,
    sex: "male",
    source: "Main record",
    handled: {
      status: "dismissed",
      by: "Nurse Bello",
      minutesAgo: 280,
      reason: "already_known",
    },
  },
];

/** What arrives in the demo, in this order, again and again (spec §7). */
const ARRIVALS: Sample[] = [
  {
    severity: "urgent",
    finding: {
      name: "Platelets",
      value: "62",
      unit: "×10⁹/L",
      flag: "low",
      range: "150–400",
    },
    causes: [
      [
        "Medicine side effect",
        "caution",
        [["Heparin", "started 5 days ago", null]],
      ],
      ["Infection", "review", []],
    ],
    category: "blood-count",
    name: "Emeka Nnamdi",
    mrn: "318552",
    location: { kind: "admitted", ward: "Ward 2", bed: "Bed 4" },
    age: 45,
    sex: "male",
    source: "Results system",
  },
  {
    severity: "critical",
    finding: {
      name: "Potassium",
      value: "6.7",
      unit: "mmol/L",
      flag: "high",
      range: "3.5–5.1",
    },
    causes: [
      [
        "Kidney injury",
        "caution",
        [["Creatinine", "310 µmol/L (high)", 10 * MIN]],
      ],
      [
        "Medicine side effect",
        "caution",
        [["Ramipril 10 mg daily", null, null]],
      ],
      ["Sample damaged in handling", "review", []],
    ],
    category: "blood-chemistry",
    name: "Halima Garba",
    mrn: "401276",
    location: { kind: "emergency" },
    age: 72,
    sex: "female",
    source: "Results system",
  },
  {
    severity: "info",
    finding: {
      name: "Sodium",
      value: "132",
      unit: "mmol/L",
      flag: "low",
      range: "135–145",
    },
    causes: [["Medicine side effect", "review", []]],
    category: "blood-chemistry",
    name: "Joseph Eke",
    mrn: "512903",
    location: { kind: "outpatient", clinic: "Renal clinic" },
    age: 58,
    sex: "male",
    source: "Main record",
  },
];

const iso = (ms: number) => new Date(ms).toISOString();

function build(
  id: string,
  s: Sample,
  createdAt: number,
  routing: AlertRoutingOut,
): AlertOut {
  return {
    id,
    severity: s.severity,
    status: "new",
    finding: {
      name: s.finding.name,
      value: s.finding.value,
      unit: s.finding.unit,
      flag: s.finding.flag,
      reference_range: s.finding.range,
      recorded_at: iso(createdAt - 4 * MIN),
      code_system: s.finding.standardised === false ? null : "LOINC",
      standardised: s.finding.standardised ?? true,
    },
    likely_causes: s.causes.map(([label, confidence, evidence = []]) => ({
      label,
      confidence,
      evidence: evidence.map(([l, value, before]) => ({
        label: l,
        value,
        recorded_at: before === null ? null : iso(createdAt - before),
      })),
    })),
    patient: { full_name: s.name, mrn: s.mrn, location: s.location },
    age: s.age,
    sex: s.sex,
    source_label: s.source,
    // An opaque link, as the backend would build it; never the MRN.
    emr_link: `https://record.example/open/${id}`,
    handled_by: null,
    handled_at: null,
    dismiss_reason: null,
    created_at: iso(createdAt),
    category: categoryRef(s.category),
    routing: { ...routing },
  };
}

function seed(s: Seed, start: number): AlertOut {
  const a = build(s.id, s, start - s.minutesAgo * MIN, s.routing);
  if (s.handled) {
    a.status = s.handled.status;
    a.handled_by = { display_name: s.handled.by };
    a.handled_at = iso(start - s.handled.minutesAgo * MIN);
    a.dismiss_reason = s.handled.reason ?? null;
  }
  return a;
}

const newest = (x: AlertOut, y: AlertOut) =>
  Date.parse(y.created_at) - Date.parse(x.created_at);

/** For tests: lets a colleague handle an alert first (Review Focus 1). */
export interface MockAlerts extends AlertsClient {
  handleElsewhere(
    id: string,
    by: string,
    status?: "handled" | "dismissed",
  ): void;
}

/**
 * The demo's patient alerts: memory only (a reload resets them), never
 * stored. A new one arrives every MOCK_ALERT_EVERY_MS while `arrivals` is on.
 * It enforces what the backend must: one handling per alert (409 with who
 * and when), idempotent retries, the reasons and the note limit.
 */
export function createMockAlerts({
  now = () => Date.now(),
  me: meOpt,
  delayMs = 150,
  arrivals = true,
}: {
  now?: () => number;
  me?: () => Promise<string | null>;
  delayMs?: number;
  arrivals?: boolean;
} = {}): MockAlerts {
  const start = now();
  const rows: AlertOut[] = SEEDS.map((s) => seed(s, start));
  const done = new Map<string, AlertOut>();
  let arrived = 0;
  let settings: NotificationSettingsOut = {
    alert_popups: true,
    correction_popups: true,
  };
  const me =
    meOpt ??
    (async () =>
      (await getAuthClient().getSession())?.user.displayName ?? null);

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };
  const copy = (a: AlertOut): AlertOut => structuredClone(a);
  const catchUp = () => {
    if (!arrivals) return;
    const due = Math.min(
      MOCK_ARRIVALS_MAX,
      Math.floor((now() - start) / MOCK_ALERT_EVERY_MS),
    );
    while (arrived < due) {
      arrived += 1;
      rows.push(
        build(
          `al-n${arrived}`,
          ARRIVALS[(arrived - 1) % ARRIVALS.length]!,
          start + arrived * MOCK_ALERT_EVERY_MS,
          // For you and queue-only in turn, so a queue-only Urgent one
          // arrives fourth (Review Focus 5).
          arrived % 2 === 1 ? FOR_YOU : QUEUE_ONLY,
        ),
      );
    }
  };
  const find = (id: string) =>
    rows.find((a) => a.id === id) ?? fail(404, "not_found");

  async function handle(
    id: string,
    status: "handled" | "dismissed",
    reason: DismissReason | null,
    opts?: WriteOpts,
  ): Promise<AlertOut> {
    await wait();
    catchUp();
    const key = opts?.idempotencyKey;
    const before = key ? done.get(key) : undefined;
    if (before) return copy(before);
    const a = find(id);
    if (a.status !== "new")
      throw new AlertHandledError({
        status: a.status,
        handled_by: a.handled_by ? { ...a.handled_by } : null,
        handled_at: a.handled_at,
      });
    a.status = status;
    a.handled_by = { display_name: (await me()) ?? "You" };
    a.handled_at = iso(now());
    a.dismiss_reason = reason;
    if (key) done.set(key, copy(a));
    return copy(a);
  }

  return {
    async listAlerts(q) {
      await wait();
      if (q.sent_to !== undefined && !SENT_TO.has(q.sent_to))
        fail(400, "invalid");
      catchUp();
      const sentTo = (a: AlertOut) => {
        const r = a.routing ?? FOR_YOU;
        return q.sent_to === "you"
          ? r.to_you
          : q.sent_to === "queue"
            ? r.queue && !r.to_you
            : true;
      };
      const all = rows
        .filter(
          (a) =>
            (!q.status || a.status === q.status) &&
            (!q.severity || a.severity === q.severity) &&
            (!q.source || a.source_label === q.source) &&
            sentTo(a),
        )
        .sort(newest);
      const from = q.cursor === undefined ? 0 : Number(q.cursor);
      if (!Number.isInteger(from) || from < 0) fail(422, "invalid_cursor");
      const size = q.limit ?? ALERT_PAGE_SIZE;
      return {
        alerts: all.slice(from, from + size).map(copy),
        next_cursor: from + size < all.length ? String(from + size) : null,
        sources: [...MOCK_SOURCES],
        queue: true,
      };
    },
    async getUnreadCount() {
      await wait();
      catchUp();
      return { count: rows.filter((a) => a.status === "new").length };
    },
    acknowledgeAlert: (id, opts) => handle(id, "handled", null, opts),
    async dismissAlert(id, d, opts) {
      if (!REASONS.has(d.reason)) fail(422, "invalid_reason");
      if (d.note !== undefined && d.note.length > NOTE_MAX)
        fail(422, "note_too_long");
      return handle(id, "dismissed", d.reason, opts);
    },
    async getNotificationSettings() {
      await wait();
      return { ...settings };
    },
    async updateNotificationSettings(p) {
      await wait();
      settings = {
        alert_popups: p.alert_popups ?? settings.alert_popups,
        correction_popups: p.correction_popups ?? settings.correction_popups,
      };
      return { ...settings };
    },
    handleElsewhere(id, by, status = "handled") {
      const a = rows.find((x) => x.id === id);
      if (!a) return;
      a.status = status;
      a.handled_by = { display_name: by };
      a.handled_at = iso(now());
      a.dismiss_reason = status === "dismissed" ? "other" : null;
    },
  };
}
