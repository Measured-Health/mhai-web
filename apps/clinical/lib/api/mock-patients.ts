import { getAuthClient } from "../auth/client";
import { getDemoStepUp, type StepUp } from "../auth/mock";
import { ApiError } from "./errors";
import type {
  ExclusionOut,
  PatientCardOut,
  PatientMatchOut,
  PatientsClient,
  StepUpAuth,
} from "./patients-contract";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["objection", "hospital_policy", "other"]);

/** Synthetic patients only: no real person, MRN or record system. */
export function samplePatients(): PatientCardOut[] {
  const p = (
    n: number,
    full_name: string,
    mrn: string | null,
    age: number | null,
    sex: PatientCardOut["sex"],
    sources: string[],
    records: number,
  ): PatientCardOut => ({
    id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    full_name,
    mrn,
    age,
    sex,
    sources,
    records,
  });
  return [
    p(
      1,
      "Ama Synthetic-Owusu",
      "SYN-100231",
      64,
      "female",
      ["Main record"],
      42,
    ),
    p(2, "Ama S. Owusu", "SYN-100231", 64, "female", ["Results system"], 7),
    p(3, "Kofi Demo-Mensah", "SYN-200417", 51, "male", ["Main record"], 18),
    p(4, "Kofi Mensah", "SYN-200417", null, "unknown", ["Main record"], 3),
    p(5, "Efua Sample-Boateng", null, 38, "female", ["Clinic record"], 11),
    p(6, "Efua Boateng", "SYN-300088", 38, "female", ["Main record"], 26),
    p(7, "Yaw Test-Asante", "SYN-400512", 72, "male", ["Main record"], 54),
  ];
}

/**
 * The demo's patient matches and exclusions for one hospital: memory only,
 * one set per mock (a reload or sign-out resets it), never stored. It
 * enforces what core does, in core's order: the body (422), the match or
 * patient (404, 409 for an MRN two patients share), then the two-step code
 * (403 `mfa_invalid`, 429 `mfa_locked`). With `held`, the hospital is under
 * a legal hold: an exclusion's purge waits (`purge_held`).
 */
export function createMockPatients({
  now = () => Date.now(),
  delayMs = 150,
  held = false,
  stepUp = getDemoStepUp,
  me = async () => (await getAuthClient().getSession())?.user.email ?? null,
}: {
  now?: () => number;
  delayMs?: number;
  /** A legal hold is open on the hospital. */
  held?: boolean;
  stepUp?: () => StepUp;
  /** The signed-in admin's email, whose codes are checked. */
  me?: () => Promise<string | null>;
} = {}): PatientsClient {
  let patients = samplePatients();
  const t0 = now();
  const byN = (n: number) => patients[n - 1]!;
  let matches: PatientMatchOut[] = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      reason: "mrn_birth_sex",
      a: byN(1),
      b: byN(2),
      proposed_at: iso(t0 - 3 * DAY),
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      reason: "mrn_only",
      a: byN(3),
      b: byN(4),
      proposed_at: iso(t0 - 2 * DAY),
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      reason: "document_link",
      a: byN(5),
      b: byN(6),
      proposed_at: iso(t0 - DAY),
    },
  ];
  const done = new Map<string, unknown>();

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };
  const checkCode = async (auth: StepUpAuth) => {
    const r = await stepUp().check(await me(), auth);
    if (r === "locked") fail(429, "mfa_locked");
    if (r === "invalid") fail(403, "mfa_invalid");
  };
  /** One reply per Idempotency-Key, as core replays it. */
  const once = async <T>(key: string, run: () => Promise<T>): Promise<T> => {
    await wait();
    if (done.has(key)) return structuredClone(done.get(key)) as T;
    const r = await run();
    done.set(key, r);
    return structuredClone(r);
  };
  const open = (id: string) =>
    matches.find((m) => m.id === id) ?? fail(404, "not_found");
  const drop = (pid: string) => {
    patients = patients.filter((p) => p.id !== pid);
    matches = matches.filter((m) => m.a.id !== pid && m.b.id !== pid);
  };

  return {
    async listMatches() {
      await wait();
      return structuredClone({ matches });
    },
    confirmMatch: (id, keep, auth, o) =>
      once(o.idempotencyKey, async () => {
        if (keep !== "a" && keep !== "b") fail(422, "validation_failed");
        const m = open(id);
        await checkCode(auth);
        const [kept, gone] = keep === "a" ? [m.a, m.b] : [m.b, m.a];
        const merged: PatientCardOut = {
          ...kept,
          sources: [...new Set([...kept.sources, ...gone.sources])],
          records: kept.records + gone.records,
        };
        drop(gone.id);
        patients = patients.map((p) => (p.id === kept.id ? merged : p));
        matches = matches
          .filter((x) => x.id !== id)
          .map((x) => ({
            ...x,
            a: x.a.id === kept.id ? merged : x.a,
            b: x.b.id === kept.id ? merged : x.b,
          }));
      }),
    rejectMatch: (id, auth, o) =>
      once(o.idempotencyKey, async () => {
        open(id);
        await checkCode(auth);
        matches = matches.filter((m) => m.id !== id);
      }),
    excludePatient: (b, auth, o) =>
      once(o.idempotencyKey, async (): Promise<ExclusionOut> => {
        const byMrn = "mrn" in b;
        const value = byMrn ? b.mrn : b.patient_id;
        if (
          !REASONS.has(b.reason) ||
          typeof value !== "string" ||
          (byMrn ? !value || value.length > 64 : !UUID.test(value))
        )
          fail(422, "validation_failed");
        const found = patients.filter((p) =>
          byMrn ? p.mrn === value : p.id === value,
        );
        if (found.length === 0) fail(404, "not_found");
        if (found.length > 1) fail(409, "conflict");
        await checkCode(auth);
        const patient = found[0]!;
        drop(patient.id);
        return {
          patient_id: patient.id,
          purge_by: iso(held ? now() + DAY : now()),
          purge_held: held,
        };
      }),
  };
}
