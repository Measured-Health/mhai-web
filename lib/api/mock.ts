import type { MhaiClient } from "./client";
import type { QueryCreateIn, Stage } from "./contract";
import { FIXTURES } from "./fixtures";

type Scenario = keyof typeof FIXTURES | "failed";
const ORDER: Stage[] = [
  "pii_masking",
  "retrieval",
  "generation",
  "nli_verification",
  "hga_verification",
  "decision",
];

export function pickScenario(q: QueryCreateIn): Scenario {
  const t = q.clinical_question.toLowerCase();
  if (t.includes("fail")) return "failed";
  if (t.includes("potassium") || t.includes("review")) return "review";
  if (t.includes("fever") || t.includes("dengue")) return "caution";
  return "high";
}

export function createMockClient({
  stepMs = 1500,
  now = () => Date.now(),
}: { stepMs?: number; now?: () => number } = {}): MhaiClient {
  // In memory only: never persisted (CONTRIBUTING: no PHI in browser storage).
  const jobs = new Map<string, { started: number; scenario: Scenario }>();
  let n = 0;
  return {
    async createQuery(q) {
      const id = `mock-${++n}-${Math.random().toString(36).slice(2, 8)}`;
      jobs.set(id, { started: now(), scenario: pickScenario(q) });
      return { query_id: id };
    },
    async getStatus(id) {
      const j = jobs.get(id);
      if (!j) throw new Error("not_found");
      const i = Math.floor((now() - j.started) / stepMs);
      if (j.scenario === "failed" && i >= 3) {
        return {
          query_id: id,
          status: "failed",
          progress: 0.5,
          current_stage: null,
          error_code: "pipeline_timeout",
        };
      }
      if (i >= ORDER.length)
        return {
          query_id: id,
          status: "completed",
          progress: 1,
          current_stage: null,
        };
      return {
        query_id: id,
        status: i === 0 ? "queued" : "processing",
        progress: i / ORDER.length,
        current_stage: ORDER[i],
      };
    },
    async getResult(id) {
      const j = jobs.get(id);
      if (
        !j ||
        j.scenario === "failed" ||
        now() - j.started < stepMs * ORDER.length
      )
        throw new Error("result_not_ready");
      return { ...structuredClone(FIXTURES[j.scenario]), query_id: id };
    },
    async sendFeedback(f) {
      return f.action === "correct"
        ? { status: "pending_review", correction_id: `c-${++n}` }
        : { status: "recorded" };
    },
    async getReadiness() {
      return { ok: true, degraded_services: [] };
    },
  };
}
