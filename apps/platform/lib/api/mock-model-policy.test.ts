import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";
import type { ModelPolicyIn } from "./model-policy-contract";
import { MOCK_CODE, createStepUp } from "./step-up";

const START = Date.parse("2026-11-07T09:30:00.000Z");
let n = 0;
const KEY = () => ({ idempotencyKey: `policy-${++n}` });
const CODE = { mfa_code: MOCK_CODE };

function setup(
  over: { cloudProviders?: ("anthropic" | "openai" | "xai")[] } = {},
) {
  let t = START;
  let me: string | null = TEAM_EMAILS.ada;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    cloudProviders: over.cloudProviders,
  });
  return {
    m,
    as: (e: string | null) => void (me = e),
    advance: (ms: number) => void (t += ms),
  };
}

async function failure(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
  throw new Error("expected a refusal");
}

const ON: ModelPolicyIn = {
  cloud_provider: "anthropic",
  agreement_ref: "AGR-2026-0042",
  monthly_token_budget: 500_000,
  ...CODE,
};
const OFF: ModelPolicyIn = {
  cloud_provider: null,
  agreement_ref: null,
  monthly_token_budget: 2_000_000,
  ...CODE,
};

describe("mock AI model policy", () => {
  it("Havana is on Anthropic for the synthetic demo, with this month's use", async () => {
    const p = await setup().m.getModelPolicy("h_havana");
    expect(p).toEqual({
      hospital_id: "h_havana",
      cloud_provider: "anthropic",
      agreement_ref: "DEMO-SYNTHETIC",
      monthly_token_budget: 2_000_000,
      updated_at: "2026-11-03T09:30:00.000Z",
      usage: { month: "2026-11", used: 1_240_000, reserved: 12_000 },
    });
  });

  it("a hospital with no policy is off, with the default limit and no use", async () => {
    const p = await setup().m.getModelPolicy("h_northgate");
    expect(p).toMatchObject({
      cloud_provider: null,
      agreement_ref: null,
      monthly_token_budget: 2_000_000,
      updated_at: null,
      usage: { month: "2026-11", used: 0, reserved: 0 },
    });
  });

  it("an auditor reads it but can't change it", async () => {
    const s = setup();
    s.as(TEAM_EMAILS.amara);
    expect((await s.m.getModelPolicy("h_havana")).cloud_provider).toBe(
      "anthropic",
    );
    expect(await failure(s.m.setModelPolicy("h_havana", OFF, KEY()))).toEqual([
      403,
      "forbidden",
    ]);
  });

  it("a platform admin switches a hospital on and off, and Activity says so", async () => {
    const s = setup();
    const on = await s.m.setModelPolicy("h_northgate", ON, KEY());
    expect(on).toMatchObject({
      cloud_provider: "anthropic",
      agreement_ref: "AGR-2026-0042",
      monthly_token_budget: 500_000,
      updated_at: "2026-11-07T09:30:00.000Z",
    });
    const off = await s.m.setModelPolicy("h_northgate", OFF, KEY());
    expect(off).toMatchObject({ cloud_provider: null, agreement_ref: null });
    const events = (await s.m.listActivity({ hospital: "h_northgate" })).events;
    expect(
      events
        .filter((e) => e.action === "model_policy_changed")
        .map((e) => [e.target, e.detail, e.hospital?.id]),
    ).toEqual([
      ["none", "anthropic", "h_northgate"],
      ["anthropic", "none", "h_northgate"],
    ]);
  });

  it("a provider the deployment hasn't enabled is 409 conflict, and nothing changes", async () => {
    const s = setup();
    for (const p of ["openai", "xai"] as const)
      expect(
        await failure(
          s.m.setModelPolicy(
            "h_northgate",
            { ...ON, cloud_provider: p },
            KEY(),
          ),
        ),
      ).toEqual([409, "conflict"]);
    expect((await s.m.getModelPolicy("h_northgate")).cloud_provider).toBeNull();
    const ok = setup({ cloudProviders: ["xai"] });
    expect(
      (
        await ok.m.setModelPolicy(
          "h_northgate",
          { ...ON, cloud_provider: "xai" },
          KEY(),
        )
      ).cloud_provider,
    ).toBe("xai");
  });

  it.each([
    ["a provider without a reference", { ...ON, agreement_ref: null }],
    [
      "a reference with no provider",
      { ...OFF, agreement_ref: "AGR-2026-0042" },
    ],
    ["a reference of the wrong shape", { ...ON, agreement_ref: "Dr Obi's OK" }],
    ["an unknown provider", { ...ON, cloud_provider: "other" }],
    ["a zero limit", { ...ON, monthly_token_budget: 0 }],
    ["a limit over the maximum", { ...ON, monthly_token_budget: 1e9 + 1 }],
    ["a fractional limit", { ...ON, monthly_token_budget: 2.5 }],
  ])("%s is 422", async (_name, body) => {
    expect(
      await failure(
        setup().m.setModelPolicy("h_northgate", body as ModelPolicyIn, KEY()),
      ),
    ).toEqual([422, "invalid"]);
  });

  it("the body is checked before the provider, and the provider before the hospital", async () => {
    const s = setup();
    expect(
      await failure(
        s.m.setModelPolicy(
          "h_nowhere",
          { ...ON, cloud_provider: "xai", agreement_ref: null },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        s.m.setModelPolicy(
          "h_nowhere",
          { ...ON, cloud_provider: "xai" },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    expect(await failure(s.m.setModelPolicy("h_nowhere", ON, KEY()))).toEqual([
      404,
      "not_found",
    ]);
    expect(await failure(s.m.getModelPolicy("h_nowhere"))).toEqual([
      404,
      "not_found",
    ]);
  });

  it("needs the person's own code: none is 422, a wrong one 403", async () => {
    const s = setup();
    const noCode = {
      cloud_provider: ON.cloud_provider,
      agreement_ref: ON.agreement_ref,
      monthly_token_budget: ON.monthly_token_budget,
    };
    expect(
      await failure(
        s.m.setModelPolicy("h_northgate", noCode as ModelPolicyIn, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        s.m.setModelPolicy("h_northgate", { ...ON, mfa_code: "000000" }, KEY()),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect((await s.m.getModelPolicy("h_northgate")).cloud_provider).toBeNull();
  });

  it("the same Idempotency-Key replays without a second change", async () => {
    const s = setup();
    const k = KEY();
    await s.m.setModelPolicy("h_northgate", ON, k);
    s.advance(1_000);
    const again = await s.m.setModelPolicy("h_northgate", ON, k);
    expect(again.updated_at).toBe("2026-11-07T09:30:00.000Z");
    const events = (await s.m.listActivity({ hospital: "h_northgate" })).events;
    expect(
      events.filter((e) => e.action === "model_policy_changed"),
    ).toHaveLength(1);
  });

  it("more than 10 writes a minute is 429 rate_limited", async () => {
    const s = setup();
    for (let i = 0; i < 10; i++)
      await s.m.setModelPolicy("h_northgate", ON, KEY());
    expect(await failure(s.m.setModelPolicy("h_northgate", ON, KEY()))).toEqual(
      [429, "rate_limited"],
    );
    s.advance(61_000);
    await s.m.setModelPolicy("h_northgate", ON, KEY());
  });

  it("no reply carries anything but the contract's keys", async () => {
    const p = await setup().m.getModelPolicy("h_havana");
    expect(Object.keys(p).sort()).toEqual([
      "agreement_ref",
      "cloud_provider",
      "hospital_id",
      "monthly_token_budget",
      "updated_at",
      "usage",
    ]);
  });
});
