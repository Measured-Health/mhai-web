// The patient match list and the exclusion's reply as core openapi 1.21.0
// sends them, read strictly: every field core sends, of the type it says,
// and nothing else. A reply that doesn't match is a failed read (502), never
// a guess.
import { z } from "zod";
import { ApiError } from "./errors";

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const instant = z
  .string()
  .max(35)
  .regex(INSTANT)
  .refine((s) => !Number.isNaN(Date.parse(s)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID);

const CARD = z.strictObject({
  id: uuid,
  full_name: z.string().min(1).max(200),
  mrn: z.string().min(1).max(64).nullable(),
  age: z.number().int().min(0).max(150).nullable(),
  sex: z.enum(["female", "male", "other", "unknown"]),
  sources: z.array(z.string().min(1).max(40)).max(20),
  records: z.number().int().min(0),
});

export const PATIENT_MATCHES_SCHEMA = z.strictObject({
  matches: z
    .array(
      z.strictObject({
        id: uuid,
        reason: z.enum([
          "mrn_birth_sex",
          "mrn_only",
          "source_merge",
          "document_link",
        ]),
        a: CARD,
        b: CARD,
        proposed_at: instant,
      }),
    )
    .max(100),
});

// Core leaves `purge_held` out before 1.21.0: read that as not held.
export const EXCLUSION_SCHEMA = z
  .strictObject({
    patient_id: uuid,
    purge_by: instant,
    purge_held: z.boolean().optional(),
  })
  .transform((r) => ({ ...r, purge_held: r.purge_held ?? false }));

/** Reads a reply strictly: anything that doesn't match is 502 `bad_gateway`. */
export function readStrict<S extends z.ZodType>(
  schema: S,
  data: unknown,
): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(502, "bad_gateway");
  return r.data;
}
