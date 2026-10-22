import { describe, expect, it } from "vitest";
import type { HealthOut } from "@/lib/api/ops-contract";
import { buildHealth } from "@/lib/api/ops-fixtures";
import { statusWords } from "./labels";
import { answerTimeLine, readHealth, STALE_MS, waitLabel } from "./health";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const fresh = (mode: Parameters<typeof buildHealth>[1] = "normal") =>
  buildHealth(NOW, mode, 3, 5);
const at = (out: HealthOut, ageMs: number): HealthOut => ({
  ...out,
  updated_at: new Date(NOW - ageMs).toISOString(),
});
const read = (out: HealthOut | undefined, failed = false) =>
  readHealth(out, { failed, now: NOW });
const BLOCKS = [
  "parts",
  "queue",
  "failedJobs",
  "timing",
  "errors",
  "versions",
] as const;

describe("readHealth", () => {
  it("ok, slow and problem map to their words", () => {
    expect(statusWords.ok).toBe("Working normally");
    expect(statusWords.slow).toBe("Slower than usual");
    expect(statusWords.problem).toBe("Having problems");
    for (const [mode, overall] of [
      ["normal", "ok"],
      ["slow", "slow"],
      ["problem", "problem"],
    ] as const) {
      const s = read(fresh(mode));
      expect(s.overall).toBe(overall);
      for (const b of BLOCKS) expect(s.blocks[b].status).toBe("ok");
    }
  });

  it("a failed call is couldnt_check with every block failed and lastGood kept", () => {
    const out = fresh();
    const s = read(out, true);
    expect(s.overall).toBe("couldnt_check");
    expect(s.lastGood).toBe(out.updated_at);
    for (const b of BLOCKS) expect(s.blocks[b].status).toBe("failed");
  });

  it("a fresh reading where no block can be read has no last good time", () => {
    const bad = {
      ...fresh(),
      parts: "x",
      queue: "x",
      failed_jobs: "x",
      timing: "x",
      errors: "x",
      versions: "x",
    } as unknown as HealthOut;
    const s = read(bad);
    for (const b of BLOCKS) expect(s.blocks[b].status).toBe("failed");
    expect(s.lastGood).toBeNull();
  });

  it("no reading at all is couldnt_check with no last good time", () => {
    const s = read(undefined, true);
    expect(s.overall).toBe("couldnt_check");
    expect(s.lastGood).toBeNull();
  });

  it("a reading 2 min 1 s old is couldnt_check", () => {
    const out = at(fresh(), STALE_MS + 1000);
    const s = read(out);
    expect(s.overall).toBe("couldnt_check");
    expect(s.lastGood).toBe(out.updated_at);
    for (const b of BLOCKS) expect(s.blocks[b].status).toBe("failed");
  });

  it("one at 1 min 59 s is shown", () => {
    expect(read(at(fresh(), 119_000)).overall).toBe("ok");
  });

  it("an unknown part key fails the parts block alone", () => {
    const out = fresh();
    const bad = {
      ...out,
      parts: [
        ...out.parts,
        { key: "mystery", status: "ok", since: out.updated_at },
      ],
    } as unknown as HealthOut;
    const s = read(bad);
    expect(s.blocks.parts.status).toBe("failed");
    for (const b of BLOCKS.filter((x) => x !== "parts"))
      expect(s.blocks[b].status).toBe("ok");
  });

  it("a part missing or repeated fails the parts block alone", () => {
    const out = fresh();
    const missing = { ...out, parts: out.parts.slice(1) };
    const twice = { ...out, parts: [...out.parts.slice(1), out.parts[1]!] };
    for (const bad of [missing, twice, { ...out, parts: [] }]) {
      const s = read(bad);
      expect(s.blocks.parts.status).toBe("failed");
      expect(s.blocks.queue.status).toBe("ok");
    }
  });

  it("a reading dated far ahead of the clock is couldnt_check", () => {
    expect(read(at(fresh(), -6 * 60_000)).overall).toBe("couldnt_check");
    expect(read(at(fresh(), -60_000)).overall).toBe("ok");
  });

  it("an unknown overall fails only the overall line", () => {
    const bad = { ...fresh(), overall: "great" } as unknown as HealthOut;
    const s = read(bad);
    expect(s.overall).toBe("couldnt_check");
    for (const b of BLOCKS) expect(s.blocks[b].status).toBe("ok");
  });

  it("an unknown error kind fails the errors block alone", () => {
    const out = fresh();
    const bad = {
      ...out,
      errors: [{ kind: "gremlins", last_hour: 1, last_24h: 1 }],
    } as unknown as HealthOut;
    const s = read(bad);
    expect(s.blocks.errors.status).toBe("failed");
    expect(s.blocks.parts.status).toBe("ok");
    expect(s.blocks.timing.status).toBe("ok");
  });

  it("an unknown status or step fails its own block", () => {
    const out = fresh();
    const badStatus = {
      ...out,
      parts: out.parts.map((p) => ({ ...p, status: "meh" })),
    } as unknown as HealthOut;
    expect(read(badStatus).blocks.parts.status).toBe("failed");
    const badStep = {
      ...out,
      timing: {
        ...out.timing,
        last_hour: {
          ...out.timing.last_hour,
          steps: [{ step: "secret", p50_ms: 1, p95_ms: 2 }],
        },
      },
    } as unknown as HealthOut;
    const s = read(badStep);
    expect(s.blocks.timing.status).toBe("failed");
    expect(s.blocks.queue.status).toBe("ok");
  });

  it("a wrong-shaped queue fails the queue alone", () => {
    const bad = {
      ...fresh(),
      queue: { waiting: "many" },
    } as unknown as HealthOut;
    const s = read(bad);
    expect(s.blocks.queue.status).toBe("failed");
    expect(s.blocks.failedJobs.status).toBe("ok");
  });
});

describe("answerTimeLine", () => {
  it("shows one decimal below 10 s and whole seconds from 10 s", () => {
    expect(answerTimeLine({ p50_ms: 2400, p95_ms: 11800 })).toBe(
      "Half within 2.4 s · 95 in 100 within 12 s",
    );
    expect(answerTimeLine({ p50_ms: 9400, p95_ms: 10000 })).toBe(
      "Half within 9.4 s · 95 in 100 within 10 s",
    );
  });
});

describe("waitLabel", () => {
  it("reads in seconds, minutes, then hours and minutes", () => {
    expect(waitLabel(0)).toBe("0 s");
    expect(waitLabel(45)).toBe("45 s");
    expect(waitLabel(60)).toBe("1 min");
    expect(waitLabel(420)).toBe("7 min");
    expect(waitLabel(3600)).toBe("1 h 0 min");
    expect(waitLabel(3900)).toBe("1 h 5 min");
  });
});
