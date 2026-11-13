// A hospital's cloud model policy (Plan 14; core openapi 1.16.0,
// `ModelPolicy`): who drafts its answers, the agreement checked for it, its
// monthly token limit and this month's usage. Platform admins change it with
// step-up; auditors read it. No key or secret is ever part of it.
import { z } from "zod";
import { ApiError } from "@mhai/api-client/errors";
import type { StepUp, WriteOpts } from "./contract";

/**
 * The providers a hospital may opt in to (core 1.16.0, `setHospitalModelPolicy`'s
 * `cloud_provider`), in the order the design prefers them (decision 1).
 * Google Gemini came in 1.16.0.
 */
export type CloudProvider = "anthropic" | "openai" | "xai" | "gemini";
export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  "anthropic",
  "openai",
  "xai",
  "gemini",
];
/**
 * The providers the reply's `cloud_provider` can name. That enum can't grow
 * in /api/v1 (ADR 0012), so it is null for Gemini too: `provider_code` is
 * the source of truth.
 */
export type ReplyCloudProvider = Exclude<CloudProvider, "gemini">;
const REPLY_CLOUD_PROVIDERS = ["anthropic", "openai", "xai"] as const;
/**
 * A provider code as core sends it. More codes may come without a new API
 * version, and an unknown one is shown as it is, so only its shape is
 * checked: a short lower-case word.
 */
export const PROVIDER_CODE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/**
 * The reference of the recorded agreement check: `AGR-YYYY-NNNN`,
 * `DPA-YYYY-NNNN` (2 to 8 digits after the year), or `DEMO-SYNTHETIC`.
 * Checked here as a convenience only; core decides.
 */
export const AGREEMENT_REF = /^(DEMO-SYNTHETIC|(AGR|DPA)-[0-9]{4}-[0-9]{2,8})$/;
export const BUDGET_MAX = 1_000_000_000;
/** Core's default when a hospital has no policy (decision 4). */
export const BUDGET_DEFAULT = 2_000_000;
/** The share of the limit at which the screen warns (decision 4). */
export const BUDGET_WARN = 0.8;

export type ModelPolicy = {
  hospital_id: string;
  /**
   * The provider when the reply's enum names it; null when off, and for
   * Gemini. Never read for the screen: `provider_code` is.
   */
  cloud_provider: ReplyCloudProvider | null;
  /**
   * The provider, as a code (core 1.16.0): "anthropic", "gemini", "openai",
   * "xai" or one added later. null: off, the hospital's answers are drafted
   * by MHAI's own model.
   */
  provider_code: string | null;
  agreement_ref: string | null;
  monthly_token_budget: number;
  /** null when no policy was ever set. */
  updated_at: string | null;
  /** This month's (UTC) token ledger; zeros when nothing was used. */
  usage: { month: string; used: number; reserved: number };
};

export type ModelPolicyIn = {
  cloud_provider: CloudProvider | null;
  /** Required with a provider; always null when off. */
  agreement_ref: string | null;
  monthly_token_budget: number;
} & StepUp;

export interface ModelPolicyClient {
  /** Platform admins and auditors. 404 when no such hospital. */
  getModelPolicy(hospitalId: string): Promise<ModelPolicy>;
  /**
   * Platform admins only, with step-up. 422 on a bad body, 409 `conflict`
   * when the provider isn't enabled on this deployment, 404 when no such
   * hospital, 429 `rate_limited` after 10 writes a minute.
   */
  setModelPolicy(
    hospitalId: string,
    body: ModelPolicyIn,
    opts: WriteOpts,
  ): Promise<ModelPolicy>;
}

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const COUNT = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** `ModelPolicy` as core 1.16.0 sends it: these keys and no others. */
const MODEL_POLICY = z
  .strictObject({
    hospital_id: z.string(),
    cloud_provider: z.enum(REPLY_CLOUD_PROVIDERS).nullable(),
    provider_code: z.string().regex(PROVIDER_CODE).nullable(),
    agreement_ref: z.string().regex(AGREEMENT_REF).nullable(),
    monthly_token_budget: COUNT.min(1).max(BUDGET_MAX),
    updated_at: z
      .string()
      .refine((s) => !Number.isNaN(Date.parse(s)))
      .nullable(),
    usage: z.strictObject({
      month: z.string().regex(MONTH),
      used: COUNT,
      reserved: COUNT,
    }),
  })
  // The two provider fields agree: `cloud_provider` names the code when its
  // enum can, and is null otherwise (off, Gemini, a later provider).
  .refine(({ cloud_provider: p, provider_code: c }) =>
    c !== null && (REPLY_CLOUD_PROVIDERS as readonly string[]).includes(c)
      ? p === c
      : p === null,
  )
  // A provider needs its reference.
  .refine((v) => v.provider_code === null || v.agreement_ref !== null);

/**
 * Reads a policy reply, failing closed: anything the contract doesn't allow
 * (a provider code of the wrong shape, provider fields that disagree, a bad
 * reference, a provider with no reference, a count that isn't a whole
 * number, an extra or missing key, another hospital's id) is 502
 * `bad_gateway`, so the screen says it couldn't load rather than show a
 * guess. A provider code this app doesn't know is read, and shown as it is.
 */
export function readModelPolicy(v: unknown, hospitalId: string): ModelPolicy {
  const r = MODEL_POLICY.safeParse(v);
  // Only the hospital asked about: never another hospital's policy.
  if (!r.success || r.data.hospital_id !== hospitalId)
    throw new ApiError(502, "bad_gateway");
  return r.data;
}
