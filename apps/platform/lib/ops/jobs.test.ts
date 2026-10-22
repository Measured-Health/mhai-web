import { describe, expect, it } from "vitest";
import type { Job, JobType } from "@/lib/api/ops-contract";
import { cancelEffects, oldQuestions, resultLine, resultTone } from "./jobs";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const H = 3_600_000;
const job = (type: JobType, createdAgo = 0): Job => ({
  id: `j_${type}_${createdAgo}`,
  type,
  hospital: null,
  created_at: new Date(NOW - createdAgo).toISOString(),
  failed_at: new Date(NOW).toISOString(),
  attempts: 1,
  kind: "timeout",
  status: "failed",
  cancelled_by: null,
  cancelled_at: null,
});

describe("oldQuestions", () => {
  it("counts questions first tried over 24 hours ago", () => {
    const jobs = [
      job("run_query", 24 * H + 60_000),
      job("run_query", 24 * H - 60_000),
      job("ingest_document", 5 * 24 * H),
    ];
    expect(oldQuestions(jobs, NOW)).toBe(1);
    expect(oldQuestions([job("run_query", 24 * H - 60_000)], NOW)).toBe(0);
  });
});

describe("cancelEffects", () => {
  it("gives each kind's line once, in a fixed order", () => {
    const lines = cancelEffects([
      job("run_triage"),
      job("retention_purge"),
      job("run_query", 1),
      job("run_query", 2),
      job("kb_search"),
      job("ingest_document"),
      job("approve_correction"),
    ]);
    expect(lines).toEqual([
      "The clinician will see 'Couldn't complete' and can ask again.",
      "The document won't be read; the clinician can upload it again.",
      "The correction stays waiting and can be approved again.",
      "The records clean-up runs again tomorrow. Nothing is deleted.",
      "The work won't be done. Nothing is deleted.",
    ]);
  });
  it("says nothing for a type that is not chosen", () => {
    expect(cancelEffects([job("run_query")])).toHaveLength(1);
  });
});

describe("resultLine", () => {
  it("says the count", () => {
    expect(resultLine(3, 0, "Retried")).toBe("Retried 3 jobs");
  });
  it("uses singular for one", () => {
    expect(resultLine(1, 0, "Retried")).toBe("Retried 1 job");
  });
  it("adds how many had already moved on", () => {
    expect(resultLine(2, 1, "Cancelled")).toBe(
      "Cancelled 2 jobs · 1 was already moved on",
    );
    expect(resultLine(2, 2, "Retried")).toBe(
      "Retried 2 jobs · 2 were already retried or finished",
    );
  });
  it("says plainly when nothing was done", () => {
    expect(resultLine(0, 2, "Retried")).toBe(
      "No jobs were retried · 2 were already retried or finished",
    );
    expect(resultLine(0, 1, "Cancelled")).toBe(
      "No jobs were cancelled · 1 was already moved on",
    );
    expect(resultLine(0, 0, "Retried")).toBe("No jobs were retried");
    expect(resultLine(0, 2, "Retried")).not.toMatch(/^Retried 0/);
  });
  it("is a success tone only when something was done", () => {
    expect(resultTone(1)).toBe("ok");
    expect(resultTone(0)).toBe("info");
  });
});
