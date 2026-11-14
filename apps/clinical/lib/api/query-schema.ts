// A question as core openapi 1.22.0 takes it (`QueryCreateIn`), checked
// strictly in the BFF before anything goes upstream: these keys only, of the
// type and in the range core says. A linked patient is only ever a canonical
// lower-case uuid (core's own 422 rule); anything else never leaves the BFF.
import { z } from "zod";
import { isPatientId } from "../patient-link";

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export const QUERY_CREATE_SCHEMA = z.strictObject({
  patient_data: z.strictObject({
    age: z.number().int().min(0).max(130),
    sex: z.enum(["female", "male", "other", "unknown"]),
    symptoms: z.array(z.string().min(1).max(200)).max(50),
    medical_history: z.string().max(4000).optional(),
  }),
  clinical_question: z.string().min(1).max(4000),
  urgency: z.enum(["routine", "urgent", "emergency"]),
  specialty: z
    .string()
    .max(32)
    .regex(/^[A-Za-z][A-Za-z -]{0,31}$/)
    .optional(),
  client_created_at: z
    .string()
    .max(35)
    .regex(INSTANT)
    .refine((s) => !Number.isNaN(Date.parse(s)))
    .optional(),
  patient_id: z.string().refine(isPatientId).optional(),
});
