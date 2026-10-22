import { describe, expect, it } from "vitest";
import { checkpoint, intactRun } from "@/tests/audit-event";
import {
  STALE_MS,
  bannerOn,
  coverageLine,
  errorWords,
  headerLine,
  integrityOf,
  isRunning,
  runSentence,
  staleness,
} from "./integrity";
import type { ReadStatus } from "./read";

/** A clock after every fixture run has finished. */
const NOW = Date.parse("2026-10-22T07:00:00Z");

const status = (over: Partial<ReadStatus> = {}): ReadStatus => ({
  latest: intactRun(),
  running: null,
  open_failure: null,
  security_contact: { name: "Grace Ade", email: "security@example.org" },
  oldest_kept_at: "2021-01-03T12:00:00Z",
  ...over,
});
const broken = intactRun({
  id: "run_0",
  started_at: "2026-10-21T12:00:00Z",
  finished_at: "2026-10-21T12:10:00Z",
  state: "broken",
  to_seq: null,
  to_at: null,
  first_broken_seq: 9_880_117,
  first_broken_at: "2026-10-21T23:14:00Z",
});

describe("integrityOf", () => {
  it("intact needs entries_checked > 0, a start, to_seq, to_at and finished_at", () => {
    expect(integrityOf(intactRun(), NOW)).toBe("intact");
  });

  it("each missing piece gives couldnt_check", () => {
    for (const over of [
      { entries_checked: 0 },
      { entries_checked: null },
      { from_checkpoint: null },
      { to_seq: null },
      { to_at: null },
      { finished_at: null },
    ])
      expect(integrityOf(intactRun(over), NOW), JSON.stringify(over)).toBe(
        "couldnt_check",
      );
    expect(
      integrityOf(intactRun({ state: "error", error_code: "timed_out" }), NOW),
    ).toBe("couldnt_check");
  });

  it("from_first counts as a start", () => {
    expect(
      integrityOf(intactRun({ from_checkpoint: null, from_first: true }), NOW),
    ).toBe("intact");
  });

  it("reads broken and checking", () => {
    expect(integrityOf(broken, NOW)).toBe("broken");
    expect(
      integrityOf(intactRun({ state: "running", finished_at: null }), NOW),
    ).toBe("checking");
  });
});

describe("headerLine", () => {
  const finished = Date.parse("2026-10-21T06:00:00Z");

  it("header: exactly 26 h old reads checked, 26 h 1 min reads Not checked since 21 Oct 2026", () => {
    const s = status({
      latest: intactRun({
        started_at: "2026-10-21T05:59:00Z",
        finished_at: "2026-10-21T06:00:00Z",
        to_at: "2026-10-21T06:00:00Z",
      }),
    });
    const at26 = headerLine(s, finished + STALE_MS);
    expect(at26.tone).toBe("ok");
    expect(at26.words).toMatch(/^Integrity: Intact · checked /);
    expect(headerLine(s, finished + STALE_MS + 60_000)).toEqual({
      tone: "warn",
      words: "Integrity: Not checked since 21 Oct 2026",
    });
  });

  it("a check that began 30 h after the range it covered is stale on all three", () => {
    const run = intactRun({
      started_at: "2026-10-22T06:00:00Z",
      to_at: "2026-10-21T00:00:00Z",
      finished_at: "2026-10-22T06:05:00Z",
    });
    expect(staleness(run, NOW)).toEqual({
      kind: "range",
      to_at: "2026-10-21T00:00:00Z",
    });
    expect(integrityOf(run, NOW)).toBe("couldnt_check");
    expect(headerLine(status({ latest: run }), NOW)).toEqual({
      tone: "warn",
      words: "Integrity: Last check covered entries up to 21 Oct 2026",
    });
    const words = runSentence(run, NOW);
    expect(words).toBe(
      "Last check covered entries up to 21 Oct 2026 00:00 UTC.",
    );
    expect(words).not.toMatch(/No changes found|Intact/);
  });

  it("a finish older than 26 h is stale on all three, and says Not checked since", () => {
    const run = intactRun({
      started_at: "2026-10-21T05:59:00Z",
      to_at: "2026-10-21T05:59:00Z",
      finished_at: "2026-10-21T06:00:00Z",
    });
    const late = Date.parse("2026-10-22T09:00:00Z");
    expect(staleness(run, late)).toEqual({
      kind: "age",
      finished: "2026-10-21T06:00:00Z",
    });
    expect(integrityOf(run, late)).toBe("couldnt_check");
    expect(headerLine(status({ latest: run }), late).words).toBe(
      "Integrity: Not checked since 21 Oct 2026",
    );
    expect(runSentence(run, late)).toBe("Not checked since 21 Oct 2026.");
    // As a past run in a history (judged when it finished), it was Intact.
    expect(integrityOf(run, Date.parse(run.finished_at!))).toBe("intact");
  });

  it("a quiet log is fine: a range ending 20 h before the start, finished 1 h ago, is Intact", () => {
    const run = intactRun({
      started_at: "2026-10-22T06:00:00Z",
      to_at: "2026-10-21T10:00:00Z",
      finished_at: "2026-10-22T06:05:00Z",
    });
    expect(staleness(run, NOW)).toBeNull();
    expect(integrityOf(run, NOW)).toBe("intact");
    expect(headerLine(status({ latest: run }), NOW).tone).toBe("ok");
    expect(runSentence(run, NOW)).toMatch(/^No changes found/);
  });

  it("a to_at an hour before started_at with a recent finish is still Intact", () => {
    const run = intactRun({
      started_at: "2026-10-22T06:00:00Z",
      to_at: "2026-10-22T05:00:00Z",
      finished_at: "2026-10-22T06:05:00Z",
    });
    expect(headerLine(status({ latest: run }), NOW).tone).toBe("ok");
  });

  it("reads today's check as HH:mm today, and an older one with its date", () => {
    const local = new Date(2026, 9, 22, 6, 0).toISOString();
    const s = status({
      latest: intactRun({
        started_at: local,
        to_at: local,
        finished_at: local,
      }),
    });
    expect(headerLine(s, new Date(2026, 9, 22, 9, 0).getTime())).toEqual({
      tone: "ok",
      words: "Integrity: Intact · checked 06:00 today",
    });
    expect(headerLine(s, new Date(2026, 9, 23, 1, 0).getTime()).words).toBe(
      "Integrity: Intact · checked 22 Oct, 06:00",
    );
  });

  it("open_failure outranks a later Intact", () => {
    expect(headerLine(status({ open_failure: broken }), finished)).toEqual({
      tone: "bad",
      words: "Integrity: Broken · failed 21 Oct 2026",
    });
    // Even while a new check runs.
    expect(
      headerLine(
        status({
          open_failure: broken,
          running: intactRun({ state: "running" }),
        }),
        finished,
      ).tone,
    ).toBe("bad");
  });

  it("running reads Checking…", () => {
    expect(
      headerLine(
        status({ running: intactRun({ state: "running" }) }),
        finished,
      ),
    ).toEqual({ tone: "ok", words: "Integrity: Checking…" });
  });

  it("no check, and a check without proof, are warnings", () => {
    expect(headerLine(status({ latest: null }), finished)).toEqual({
      tone: "warn",
      words: "Integrity: Not checked yet",
    });
    const unproven = headerLine(
      status({ latest: intactRun({ entries_checked: 0 }) }),
      Date.parse("2026-10-22T07:00:00Z"),
    );
    expect(unproven.tone).toBe("warn");
    expect(unproven.words).toMatch(/^Integrity: Couldn't check · /);
  });

  it("a broken latest with no open_failure reads Broken · failed {date}", () => {
    expect(headerLine(status({ latest: broken }), finished)).toEqual({
      tone: "bad",
      words: "Integrity: Broken · failed 21 Oct 2026",
    });
  });

  it("a malformed open_failure reads Broken with no date", () => {
    const odd = {
      ...intactRun(),
      id: null,
      started_at: null,
      finished_at: null,
    };
    expect(
      headerLine(
        status({ open_failure: { ...odd, state: "error" } }),
        finished,
      ),
    ).toEqual({ tone: "bad", words: "Integrity: Broken" });
  });

  it("a malformed running doesn't read Checking…", () => {
    const old = intactRun({
      started_at: "2026-10-19T05:59:00Z",
      to_at: "2026-10-19T06:00:00Z",
      finished_at: "2026-10-19T06:00:00Z",
    });
    const now = Date.parse("2026-10-22T06:00:00Z");
    for (const running of [
      intactRun({ state: "error", error_code: "unexpected_reply" }),
      intactRun({ state: "intact" }),
    ]) {
      const s = status({ latest: old, running });
      expect(isRunning(s)).toBe(false);
      expect(headerLine(s, now)).toEqual({
        tone: "warn",
        words: "Integrity: Not checked since 19 Oct 2026",
      });
    }
    expect(
      isRunning(status({ running: intactRun({ state: "running" }) })),
    ).toBe(true);
  });

  it("a check finished in the future reads Couldn't check", () => {
    const future = intactRun({
      to_at: "2099-01-01T00:00:00Z",
      finished_at: "2099-01-01T00:00:00Z",
    });
    const now = Date.parse("2026-10-22T07:00:00Z");
    expect(integrityOf(future, now)).toBe("couldnt_check");
    expect(headerLine(status({ latest: future }), now).words).toMatch(
      /^Integrity: Couldn't check/,
    );
    // Within the 5-minute skew it still reads.
    const skew = intactRun({
      to_at: "2026-10-22T06:00:00Z",
      finished_at: "2026-10-22T06:04:00Z",
    });
    expect(integrityOf(skew, Date.parse("2026-10-22T06:00:00Z"))).toBe(
      "intact",
    );
    // Out of order: the last entry after the finish.
    expect(integrityOf(intactRun({ to_at: "2026-10-22T06:02:00Z" }), NOW)).toBe(
      "couldnt_check",
    );
  });

  it("a range fixed at run start, with to_at before started_at, reads Intact", () => {
    const run = intactRun({
      started_at: "2026-10-22T06:00:30Z",
      to_at: "2026-10-22T06:00:00Z",
      finished_at: "2026-10-22T06:05:00Z",
    });
    expect(integrityOf(run, NOW)).toBe("intact");
    expect(headerLine(status({ latest: run }), NOW).tone).toBe("ok");
  });

  it("anything contradicting the proof reads Couldn't check", () => {
    for (const over of [
      { error_code: "timed_out" as const },
      { first_broken_seq: 5 },
      { first_broken_at: "2026-10-22T05:00:00Z" },
    ])
      expect(integrityOf(intactRun(over), NOW), JSON.stringify(over)).toBe(
        "couldnt_check",
      );
  });
});

describe("the run's words", () => {
  it("runSentence gives spec §8.1's Intact and Broken sentences word for word, using 1,204,331 / 4 Jan 2027 / 9,881,204 / 22 Oct 2026 06:00 UTC and 9,880,117 / 21 Oct 2026 23:14 UTC", () => {
    expect(runSentence(intactRun(), NOW)).toBe(
      "No changes found. Checked 1,204,331 entries, from the checkpoint of 4 Jan 2027 to entry 9,881,204 (22 Oct 2026 06:00 UTC).",
    );
    expect(runSentence(broken, NOW)).toBe(
      "The log has been altered or damaged. The first entry that doesn't match is 9,880,117 (21 Oct 2026 23:14 UTC). Entries from there on can't be trusted until this is investigated.",
    );
    expect(
      runSentence(intactRun({ from_checkpoint: null, from_first: true }), NOW),
    ).toBe(
      "No changes found. Checked 1,204,331 entries, from the first entry to entry 9,881,204 (22 Oct 2026 06:00 UTC).",
    );
  });

  it("a check without proof says why it couldn't", () => {
    expect(runSentence(intactRun({ finished_at: null }), NOW)).toBe(
      "The check didn't finish, so the log's integrity is unknown. The reply wasn't what was expected.",
    );
    expect(
      runSentence(intactRun({ state: "error", error_code: "timed_out" }), NOW),
    ).toBe(
      "The check didn't finish, so the log's integrity is unknown. It timed out.",
    );
    expect(
      runSentence(intactRun({ state: "running", entries_checked: 5000 }), NOW),
    ).toBe(
      "Checking… 5,000 entries checked so far, from the checkpoint of 4 Jan 2027.",
    );
  });

  it("coverageLine names the retention checkpoint", () => {
    expect(coverageLine(intactRun())).toBe(
      "Entries before 3 Jan 2021 were removed by retention (412,006 entries, checkpoint of 4 Jan 2027).",
    );
    expect(
      coverageLine(intactRun({ from_checkpoint: null, from_first: true })),
    ).toBeNull();
  });

  it("a re-anchor reads 'checked from the re-anchor of {date} after incident INC-0042'", () => {
    const run = intactRun({
      from_checkpoint: checkpoint({
        kind: "re_anchor",
        incident_ref: "INC-0042",
      }),
    });
    expect(coverageLine(run)).toContain(
      "checked from the re-anchor of 4 Jan 2027 after incident INC-0042",
    );
    expect(runSentence(run, NOW)).toBe(
      "No changes found. Checked 1,204,331 entries, from the re-anchor of 4 Jan 2027 to entry 9,881,204 (22 Oct 2026 06:00 UTC).",
    );
  });

  it("errorWords for the three codes", () => {
    expect(errorWords("timed_out")).toBe("It timed out.");
    expect(errorWords("unreachable")).toBe("The log couldn't be reached.");
    expect(errorWords("unexpected_reply")).toBe(
      "The reply wasn't what was expected.",
    );
    expect(errorWords(null)).toBe("The reply wasn't what was expected.");
  });

  it("bannerOn for an open_failure and for a broken latest", () => {
    expect(bannerOn(undefined)).toEqual({ on: false, date: null });
    expect(bannerOn(status())).toEqual({ on: false, date: null });
    expect(bannerOn(status({ open_failure: broken }))).toEqual({
      on: true,
      date: "21 Oct 2026",
    });
    expect(bannerOn(status({ latest: broken }))).toEqual({
      on: true,
      date: "21 Oct 2026",
    });
  });
});
