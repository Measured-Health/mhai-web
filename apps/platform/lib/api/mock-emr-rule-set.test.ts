import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { readEmrRuleSet, type EmrRuleSetIn } from "./emr-rule-set-contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";
import { DEMO_RULE_SET } from "./mock-emr-rule-set";
import { MOCK_CODE, createStepUp } from "./step-up";

let n = 0;
const KEY = () => ({ idempotencyKey: `rules-${++n}` });
const CODE = { mfa_code: MOCK_CODE };
const ON: EmrRuleSetIn = { ...DEMO_RULE_SET, ...CODE };

function setup(emrEnabled = true) {
  let me: string | null = TEAM_EMAILS.ada;
  const m = createMockPlatform({
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(),
    emrEnabled,
  });
  return { m, as: (e: string) => void (me = e) };
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

describe("mock EMR rule set", () => {
  it("Havana sends alerts, every other hospital is in shadow, in core's shape", async () => {
    const { m } = setup();
    const h = await m.getEmrRuleSet("h_havana");
    expect(readEmrRuleSet(h, "h_havana")).toMatchObject(DEMO_RULE_SET);
    expect(await m.getEmrRuleSet("h_northgate")).toEqual({
      hospital_id: "h_northgate",
      version: null,
      sha256: null,
      activated_at: null,
    });
  });

  it("switches on and back to shadow with the code", async () => {
    const { m } = setup();
    expect(await m.setEmrRuleSet("h_northgate", ON, KEY())).toMatchObject(
      DEMO_RULE_SET,
    );
    const off = await m.setEmrRuleSet(
      "h_northgate",
      { version: null, sha256: null, ...CODE },
      KEY(),
    );
    expect(off).toMatchObject({ version: null, sha256: null });
  });

  it("refuses in core's order: the body, the hospital, then the code", async () => {
    const { m } = setup();
    const bad = { mfa_code: "000000" };
    expect(
      await failure(
        m.setEmrRuleSet(
          "nowhere",
          { version: "0-synthetic", sha256: null, ...bad },
          KEY(),
        ),
      ),
    ).toEqual([422, "validation_failed"]);
    expect(
      await failure(m.setEmrRuleSet("nowhere", { ...ON, ...bad }, KEY())),
    ).toEqual([404, "not_found"]);
    expect(
      await failure(m.setEmrRuleSet("h_northgate", { ...ON, ...bad }, KEY())),
    ).toEqual([403, "mfa_invalid"]);
  });

  it("an auditor reads it and can't switch it", async () => {
    const { m, as } = setup();
    as(TEAM_EMAILS.amara);
    expect((await m.getEmrRuleSet("h_havana")).version).toBe("0-synthetic");
    expect(await failure(m.setEmrRuleSet("h_havana", ON, KEY()))).toEqual([
      403,
      "forbidden",
    ]);
  });

  it("with patient records off, a switch is 503 not_ready", async () => {
    const { m } = setup(false);
    expect(await failure(m.setEmrRuleSet("h_havana", ON, KEY()))).toEqual([
      503,
      "not_ready",
    ]);
  });
});
