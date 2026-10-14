import { afterEach, describe, expect, it, vi } from "vitest";
import { toResultView } from "../result-view";
import { getClient } from "./client";
import { FIXTURES } from "./fixtures";
import { createMockClient, pickScenario } from "./mock";

const q = (text: string) => ({
  patient_data: { age: 54, sex: "male" as const, symptoms: ["x"] },
  clinical_question: text,
  urgency: "routine" as const,
});

describe("mock client", () => {
  it("picks scenarios from the question text", () => {
    expect(pickScenario(q("chest pain"))).toBe("high");
    expect(pickScenario(q("fever and rash, dengue?"))).toBe("caution");
    expect(pickScenario(q("low potassium"))).toBe("review");
    expect(pickScenario(q("please fail"))).toBe("failed");
  });

  it("walks through stages, then completes with a result", async () => {
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("chest pain"));
    expect((await c.getStatus(query_id)).current_stage).toBe("pii_masking");
    t = 25;
    const mid = await c.getStatus(query_id);
    expect(mid.status).toBe("processing");
    expect(mid.current_stage).toBe("generation");
    t = 1000;
    expect((await c.getStatus(query_id)).status).toBe("completed");
    expect((await c.getResult(query_id)).decision).toBe("PASS");
  });

  it("ends failed for the failed scenario and has no result", async () => {
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("fail"));
    t = 35;
    const s = await c.getStatus(query_id);
    expect(s.status).toBe("failed");
    expect(s.error_code).toBe("pipeline_timeout");
    await expect(c.getResult(query_id)).rejects.toThrow("result_not_ready");
  });

  it("records feedback; corrections go to review", async () => {
    const c = createMockClient();
    expect(await c.sendFeedback({ query_id: "q", action: "validate" })).toEqual(
      { status: "recorded" },
    );
    expect(
      (
        await c.sendFeedback({
          query_id: "q",
          action: "correct",
          corrected_diagnosis: "abc",
          reason: "abc",
        })
      ).status,
    ).toBe("pending_review");
  });

  it("never writes to browser storage or cookies across a full flow", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(Document.prototype, "cookie", "set");
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("chest pain"));
    await c.getStatus(query_id);
    t = 1000;
    await c.getStatus(query_id);
    await c.getResult(query_id);
    await c.sendFeedback({
      query_id,
      action: "correct",
      corrected_diagnosis: "abc",
      reason: "abc",
    });
    await c.getReadiness();
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it("returns an independent copy of the fixture with the query id", async () => {
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("chest pain"));
    t = 1000;
    const r = await c.getResult(query_id);
    expect(r.query_id).toBe(query_id);
    r.citations.pop();
    expect(FIXTURES.high.citations).toHaveLength(4);
    expect(FIXTURES.high.query_id).toBe("");
  });

  it("reports the mock backend as ready", async () => {
    expect(await createMockClient().getReadiness()).toEqual({
      ok: true,
      degraded_services: [],
    });
  });

  it("throws not_found for an unknown query", async () => {
    await expect(createMockClient().getStatus("nope")).rejects.toThrow(
      "not_found",
    );
  });
});

describe("fixtures", () => {
  it("map to their intended result kinds", () => {
    expect(toResultView(FIXTURES.high).kind).toBe("high");
    expect(toResultView(FIXTURES.caution).kind).toBe("caution");
    expect(toResultView(FIXTURES.review).kind).toBe("review");
  });

  it("are interchangeable and overridable in typed code", () => {
    const pick = (r: (typeof FIXTURES)["high"] = FIXTURES.high) => r;
    expect(pick(FIXTURES.caution).decision).toBe("REGENERATE");
    expect({ ...FIXTURES.high, icd10_code: null }.icd10_code).toBeNull();
  });
});

describe("getClient", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns a shared mock client in mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    expect(getClient()).toBe(getClient());
  });

  it("refuses to run without mock mode in Plan 1", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    expect(() => getClient()).toThrow(/Plan 2/);
  });
});
