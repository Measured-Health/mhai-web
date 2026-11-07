// A hospital's cloud model policy (Plan 14; core openapi 1.10.0,
// `ModelPolicy`): who drafts its answers, the agreement checked for it, its
// monthly token limit and this month's usage. Platform admins change it with
// step-up; auditors read it. No key or secret is ever part of it.
import { ApiError } from "@mhai/api-client/errors";
import type { StepUp, WriteOpts } from "./contract";

export type CloudProvider = "anthropic" | "openai" | "xai";
/** In the order the design prefers them (decision 1). */
export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  "anthropic",
  "openai",
  "xai",
];

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
  /** null: off, the hospital's answers are drafted by MHAI's own model. */
  cloud_provider: CloudProvider | null;
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

const KEYS = [
  "hospital_id",
  "cloud_provider",
  "agreement_ref",
  "monthly_token_budget",
  "updated_at",
  "usage",
];
const USAGE_KEYS = ["month", "used", "reserved"];
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const exactly = (o: Record<string, unknown>, keys: string[]) =>
  Object.keys(o).length === keys.length &&
  keys.every((k) => Object.hasOwn(o, k));
const count = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/**
 * Reads a policy reply, failing closed: anything the contract doesn't allow
 * (an unknown provider, a bad reference, a provider with no reference, a
 * count that isn't a whole number, an extra key, another hospital's id) is
 * 502 `bad_gateway`, so
 * the screen says it couldn't load rather than show a guess.
 */
export function readModelPolicy(v: unknown, hospitalId: string): ModelPolicy {
  const bad = (): never => {
    throw new ApiError(502, "bad_gateway");
  };
  if (!isObject(v) || !exactly(v, KEYS)) return bad();
  const p = v.cloud_provider;
  if (p !== null && !CLOUD_PROVIDERS.includes(p as CloudProvider)) bad();
  const ref = v.agreement_ref;
  if (ref !== null && !(typeof ref === "string" && AGREEMENT_REF.test(ref)))
    bad();
  if (p !== null && ref === null) bad();
  const budget = v.monthly_token_budget;
  if (
    !count(budget) ||
    (budget as number) < 1 ||
    (budget as number) > BUDGET_MAX
  )
    bad();
  // Only the hospital asked about: never another hospital's policy.
  if (v.hospital_id !== hospitalId) bad();
  const at = v.updated_at;
  if (at !== null && !(typeof at === "string" && !Number.isNaN(Date.parse(at))))
    bad();
  const u = v.usage;
  if (!isObject(u) || !exactly(u, USAGE_KEYS)) return bad();
  if (typeof u.month !== "string" || !MONTH.test(u.month)) bad();
  if (!count(u.used) || !count(u.reserved)) bad();
  return {
    hospital_id: v.hospital_id as string,
    cloud_provider: p as CloudProvider | null,
    agreement_ref: ref as string | null,
    monthly_token_budget: budget as number,
    updated_at: at as string | null,
    usage: {
      month: u.month as string,
      used: u.used as number,
      reserved: u.reserved as number,
    },
  };
}
