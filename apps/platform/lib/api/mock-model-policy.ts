// The demo's AI model policies (Plan 14), built on the mock core. Memory
// only. It refuses what core refuses (openapi 1.16.0), in core's order: the
// body (422), the provider (409), the hospital (404), the rate (429), then
// the code. Sample data only: no key or secret exists anywhere in it.
import { ApiError } from "@mhai/api-client/errors";
import type { Person, TeamMember } from "./contract";
import type { MockCore } from "./mock";
import {
  AGREEMENT_REF,
  BUDGET_DEFAULT,
  BUDGET_MAX,
  CLOUD_PROVIDERS,
  type CloudProvider,
  type ModelPolicy,
  type ModelPolicyClient,
} from "./model-policy-contract";

const D = 24 * 3_600_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
/** Core's code for a body it refuses. */
const invalid = (): never => fail(422, "validation_failed");
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });
const iso = (ms: number) => new Date(ms).toISOString();
/** "2026-11": the month, UTC. */
const monthOf = (ms: number) => iso(ms).slice(0, 7);

type PolicyRecord = {
  /** The provider's code; null when off. */
  cloud_provider: CloudProvider | null;
  agreement_ref: string | null;
  monthly_token_budget: number;
  updated_at: string | null;
};

export type ModelPolicyMockOptions = {
  /**
   * The providers this deployment has enabled (core's
   * `CORE_CLOUD_PROVIDERS`): any other is 409. The demo enables Anthropic,
   * as the design's demo does, and Google Gemini, which Lakeside is on.
   */
  cloudProviders?: readonly CloudProvider[];
};

/** Sample policies and this month's use, by hospital id. */
function seed(now: number) {
  const policies = new Map<string, PolicyRecord>([
    [
      "h_havana",
      {
        cloud_provider: "anthropic",
        agreement_ref: "DEMO-SYNTHETIC",
        monthly_token_budget: BUDGET_DEFAULT,
        updated_at: iso(now - 4 * D),
      },
    ],
    [
      "h_riverside",
      {
        cloud_provider: "anthropic",
        agreement_ref: "AGR-2026-0042",
        monthly_token_budget: 1_000_000,
        updated_at: iso(now - 9 * D),
      },
    ],
    // On Google Gemini (core 1.16.0): its reply's `cloud_provider` is null,
    // and only `provider_code` says gemini.
    [
      "h_lakeside",
      {
        cloud_provider: "gemini",
        agreement_ref: "DPA-2026-0107",
        monthly_token_budget: 500_000,
        updated_at: iso(now - 2 * D),
      },
    ],
  ]);
  const usage = new Map<string, { used: number; reserved: number }>([
    ["h_havana", { used: 1_240_000, reserved: 12_000 }],
    ["h_riverside", { used: 870_000, reserved: 0 }],
    ["h_lakeside", { used: 95_000, reserved: 0 }],
  ]);
  return { policies, usage };
}

/** The body as core checks it, else 422. */
function readBody(body: unknown): PolicyRecord {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return invalid();
  const b = body as Record<string, unknown>;
  const p = b.cloud_provider;
  if (p !== null && !CLOUD_PROVIDERS.includes(p as CloudProvider)) invalid();
  const ref = b.agreement_ref ?? null;
  if (ref !== null && !(typeof ref === "string" && AGREEMENT_REF.test(ref)))
    invalid();
  // A provider needs its reference; off has none.
  if ((p === null) !== (ref === null)) invalid();
  const budget = b.monthly_token_budget;
  if (
    typeof budget !== "number" ||
    !Number.isSafeInteger(budget) ||
    budget < 1 ||
    budget > BUDGET_MAX
  )
    invalid();
  return {
    cloud_provider: p as CloudProvider | null,
    agreement_ref: ref as string | null,
    monthly_token_budget: budget as number,
    updated_at: null,
  };
}

export function modelPolicyMock(
  core: MockCore,
  { cloudProviders = ["anthropic", "gemini"] }: ModelPolicyMockOptions = {},
): ModelPolicyClient {
  const { now, log } = core;
  const { policies, usage } = seed(now());
  /** Each person's recent writes, for core's 10 a minute. */
  const writes = new Map<string, number[]>();

  const shown = (id: string): ModelPolicy => {
    const p = policies.get(id);
    const u = usage.get(id) ?? { used: 0, reserved: 0 };
    const code = p?.cloud_provider ?? null;
    return {
      hospital_id: id,
      // As core 1.16.0 answers: the reply's enum can't name Gemini.
      cloud_provider: code === "gemini" ? null : code,
      provider_code: code,
      agreement_ref: p?.agreement_ref ?? null,
      monthly_token_budget: p?.monthly_token_budget ?? BUDGET_DEFAULT,
      updated_at: p?.updated_at ?? null,
      usage: { month: monthOf(now()), ...u },
    };
  };

  return {
    getModelPolicy: (id) =>
      core.read(() => {
        core.findHospital(id);
        return shown(id);
      }),

    setModelPolicy: (id, body, opts) =>
      core.write(opts, async (m) => {
        const next = readBody(body);
        if (
          next.cloud_provider !== null &&
          !cloudProviders.includes(next.cloud_provider)
        )
          fail(409, "conflict");
        const h = core.findHospital(id).hospital;
        const recent = (writes.get(m.id) ?? []).filter(
          (t) => t > now() - RATE_WINDOW_MS,
        );
        if (recent.length >= RATE_MAX) fail(429, "rate_limited");
        writes.set(m.id, [...recent, now()]);
        await core.checkCode(m, body);
        const previous = policies.get(id)?.cloud_provider ?? null;
        policies.set(id, { ...next, updated_at: iso(now()) });
        log(person(m), "model_policy_changed", {
          hospital: { id: h.id, name: h.name },
          target: next.cloud_provider ?? "none",
          detail: previous ?? "none",
        });
        return shown(id);
      }),
  };
}
