// A clinician's patient lookup by MRN (core openapi 1.29.0,
// `POST /patients/lookup`), checked strictly on both sides of the BFF: the
// MRN that goes up, and the one patient that comes back. The MRN and the
// patient are memory only: never in a URL, storage, a log, analytics, the
// console or the title (CONTRIBUTING, "Patient data in the browser").
import { z } from "zod";
import { isPatientId } from "../patient-link";

/** The longest MRN we send, once trimmed (core: 64 once its spaces go). */
export const MRN_MAX = 64;

/**
 * Letters and digits, with dots, slashes, hyphens, underscores or spaces
 * between them; nothing else (no control characters, quotes, wildcards or
 * percent signs), so a typed MRN can't be a pattern or a path.
 */
const MRN_CHARS = /^[A-Za-z0-9](?:[A-Za-z0-9 ./_-]*[A-Za-z0-9])?$/;

export type MrnProblem = "empty" | "invalid";

/** Why a typed MRN can't be looked up, or null when it can. */
export function mrnProblem(raw: string): MrnProblem | null {
  const mrn = raw.trim();
  if (!mrn) return "empty";
  return mrn.length <= MRN_MAX && MRN_CHARS.test(mrn) ? null : "invalid";
}

/** As core compares it: spaces removed, upper case, nothing else. */
export const normaliseMrn = (mrn: string) =>
  mrn.trim().replace(/ /g, "").toUpperCase();

/** The body the BFF forwards: `{mrn}` and nothing else, trimmed and checked. */
export const LOOKUP_IN = z.strictObject({
  mrn: z
    .string()
    .max(256)
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(MRN_MAX).regex(MRN_CHARS)),
});

/** The one patient core answers with: these keys only, of these types. */
export const LOOKUP_OUT = z.strictObject({
  id: z.string().refine(isPatientId),
  full_name: z.string().trim().min(1).max(200).nullable(),
  mrn: z
    .string()
    .min(1)
    .max(MRN_MAX)
    .regex(/^[A-Z0-9./_-]+$/),
  age: z.number().int().min(0).max(150).nullable(),
  sex: z.enum(["female", "male", "other", "unknown"]),
});

export type PatientFound = z.output<typeof LOOKUP_OUT>;

/**
 * The reply, read strictly, for the MRN that was asked about: a reply that
 * doesn't match the schema, or names another MRN, is null (never a guess).
 */
export function readLookup(raw: unknown, asked: string): PatientFound | null {
  const r = LOOKUP_OUT.safeParse(raw);
  return r.success && r.data.mrn === normaliseMrn(asked) ? r.data : null;
}
