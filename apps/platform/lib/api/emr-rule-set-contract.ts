// A hospital's EMR rule set (core openapi 1.20.0, `EMRRuleSet`): which
// reviewed rule set file turns the hospital's record findings into patient
// alerts, or none (shadow: findings are stored for review, no alert is
// sent). Platform admins switch it with step-up; auditors read it.
import { z } from "zod";
import { ApiError } from "@mhai/api-client/errors";
import type { StepUp, WriteOpts } from "./contract";

/** A rule set version as core takes it, e.g. `0-synthetic`. */
export const RULE_SET_VERSION = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** The rule set file's SHA-256: 64 lower-case hex characters. */
export const RULE_SET_SHA256 = /^[0-9a-f]{64}$/;

export type EmrRuleSet = {
  hospital_id: string;
  /** null for both: shadow, the default. */
  version: string | null;
  sha256: string | null;
  /** When it was last switched; null when it never was. */
  activated_at: string | null;
};

/** Both null: back to shadow. Both keys are always sent. */
export type EmrRuleSetIn = {
  version: string | null;
  sha256: string | null;
} & StepUp;

export interface EmrRuleSetClient {
  /** Platform admins and auditors. 404 when no such hospital. */
  getEmrRuleSet(hospitalId: string): Promise<EmrRuleSet>;
  /**
   * Platform admins only, with step-up. 422 on a bad body, 404 when no such
   * hospital, 429 `rate_limited` after 10 writes a minute, 503 `not_ready`
   * when patient records are off on this deployment.
   */
  setEmrRuleSet(
    hospitalId: string,
    body: EmrRuleSetIn,
    opts: WriteOpts,
  ): Promise<EmrRuleSet>;
}

const RULE_SET = z
  .strictObject({
    hospital_id: z.string(),
    version: z.string().regex(RULE_SET_VERSION).nullable(),
    sha256: z.string().regex(RULE_SET_SHA256).nullable(),
    activated_at: z
      .string()
      .max(35)
      .refine((s) => !Number.isNaN(Date.parse(s)))
      .nullable(),
  })
  // Shadow is both null; a rule set is both set.
  .refine((r) => (r.version === null) === (r.sha256 === null));

/**
 * Reads a rule set reply, failing closed: an extra or missing key, a value
 * of the wrong shape, half a rule set, or another hospital's id is 502
 * `bad_gateway`, so the screen says it couldn't load rather than guess
 * whether alerts are on.
 */
export function readEmrRuleSet(v: unknown, hospitalId: string): EmrRuleSet {
  const r = RULE_SET.safeParse(v);
  if (!r.success || r.data.hospital_id !== hospitalId)
    throw new ApiError(502, "bad_gateway");
  return r.data;
}
