import { afterEach, describe, expect, it } from "vitest";
import type { Change, FollowUp } from "../api/analytics-contract";
import {
  TOP,
  changeLine,
  followUpLine,
  noPrevious,
  rankChanges,
  showAllLabel,
  topChanges,
} from "./changes";

const g = (value: number | null) => ({ value, suppressed: false });
const TUNDE = { id: "tm_tunde", name: "Tunde Okafor" };

function change(id: string, over: Partial<Change> = {}): Change {
  return {
    id,
    hospital: { id: `h_${id}`, name: `Hospital ${id}` },
    area: "use",
    measure: "questions",
    direction: "falling",
    serious: false,
    previous: g(100),
    current: g(90),
    summary: `Hospital ${id}: questions down 10% (100 → 90 a week)`,
    follow_up: null,
    version: 1,
    ...over,
  };
}
const follow = (at = "2026-10-21T10:00:00Z"): FollowUp => ({
  by: TUNDE,
  at,
  note: null,
  version: 1,
});
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

const TZ = process.env.TZ;
afterEach(() => {
  if (TZ === undefined) delete process.env.TZ;
  else process.env.TZ = TZ;
});

describe("rankChanges", () => {
  it("serious first, then by size", () => {
    const ranked = rankChanges([
      change("small", { previous: g(100), current: g(90) }), // 0.1
      change("big", { previous: g(100), current: g(200) }), // 1.0
      change("serious_small", {
        serious: true,
        area: "alerts",
        measure: "critical_median_ack_minutes",
        direction: "worse",
        previous: g(20),
        current: g(22),
      }), // 0.1
      change("mid", { previous: g(140), current: g(83) }), // 0.41
      change("serious_big", {
        serious: true,
        area: "alerts",
        measure: "critical_median_ack_minutes",
        direction: "worse",
        previous: g(18),
        current: g(36),
      }), // 1.0
    ]);
    expect(ids(ranked)).toEqual([
      "serious_big",
      "serious_small",
      "big",
      "mid",
      "small",
    ]);
  });

  it("followed-up rows go below", () => {
    const ranked = rankChanges([
      change("serious_done", {
        serious: true,
        direction: "worse",
        follow_up: follow(),
        previous: g(10),
        current: g(40),
      }),
      change("big_done", {
        previous: g(10),
        current: g(100),
        follow_up: follow(),
      }),
      change("small", { previous: g(100), current: g(95) }),
      change("mid", { previous: g(100), current: g(150) }),
    ]);
    expect(ids(ranked)).toEqual(["mid", "small", "serious_done", "big_done"]);
    expect(ranked.map((c) => c.followedUp)).toEqual([false, false, true, true]);
  });

  it("a change with no previous period ranks after the sized ones, and keeps its order", () => {
    const ranked = rankChanges([
      change("new_a", { previous: g(null), current: g(0) }),
      change("tiny", { previous: g(100), current: g(99) }),
      change("new_b", { previous: g(null), current: g(7) }),
    ]);
    expect(ids(ranked)).toEqual(["tiny", "new_a", "new_b"]);
    expect(ranked.map((c) => c.comparable)).toEqual([true, false, false]);
  });

  it("does not change the list it was given", () => {
    const list = [change("a"), change("b", { serious: true })];
    rankChanges(list);
    expect(ids(list)).toEqual(["a", "b"]);
  });

  it("top 5 then Show all", () => {
    const list = rankChanges(
      Array.from({ length: 8 }, (_, i) =>
        change(`c${i}`, { previous: g(100), current: g(100 + (8 - i)) }),
      ),
    );
    expect(TOP).toBe(5);
    const top = topChanges(list);
    expect(ids(top.shown)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(top.showAll).toBe("Show all (8)");
    expect(ids(topChanges(list, true).shown)).toHaveLength(8);
    expect(topChanges(list, true).showAll).toBeNull();
    expect(topChanges(list.slice(0, 5)).showAll).toBeNull();
    expect(showAllLabel(12)).toBe("Show all (12)");
  });
});

describe("noPrevious", () => {
  it("is true only when previous is null and not hidden", () => {
    expect(noPrevious(change("a", { previous: g(null) }))).toBe(true);
    expect(noPrevious(change("a", { previous: g(0) }))).toBe(false);
    expect(
      noPrevious(change("a", { previous: { value: null, suppressed: true } })),
    ).toBe(false);
  });
});

describe("changeLine", () => {
  const summary =
    "Northgate General Hospital: Critical alerts acknowledged 2× slower (18 → 36 min)";
  it("worse gives ⚠ and says worse", () => {
    expect(
      changeLine(
        change("w", {
          direction: "worse",
          previous: g(18),
          current: g(36),
          summary,
        }),
      ),
    ).toEqual({ sign: "⚠", words: `Worse: ${summary}` });
  });

  it("rising gives ↑ and says rising", () => {
    expect(
      changeLine(
        change("r", {
          direction: "rising",
          summary:
            "All hospitals: Low potassium alerts rising (48 → 83 a week)",
        }),
      ),
    ).toEqual({
      sign: "↑",
      words:
        "Rising: All hospitals: Low potassium alerts rising (48 → 83 a week)",
    });
  });

  it("falling gives ↓ and says falling", () => {
    expect(
      changeLine(
        change("f", {
          direction: "falling",
          summary:
            "Riverside Children's Hospital: questions down 41% (140 → 83 a week)",
        }),
      ),
    ).toEqual({
      sign: "↓",
      words:
        "Falling: Riverside Children's Hospital: questions down 41% (140 → 83 a week)",
    });
  });

  it("better uses ↑ or ↓ by the value's movement", () => {
    const down = change("b", {
      direction: "better",
      measure: "median_review_hours",
      previous: g(30),
      current: g(14),
      summary: "Havana Hospital: answers reviewed faster (30 → 14 hours)",
    });
    expect(changeLine(down)).toEqual({
      sign: "↓",
      words: "Better: Havana Hospital: answers reviewed faster (30 → 14 hours)",
    });
    const up = change("b2", {
      direction: "better",
      measure: "agreement_rate",
      previous: g(0.7),
      current: g(0.9),
      summary: "Havana Hospital: more reviews agree (70% → 90%)",
    });
    expect(changeLine(up).sign).toBe("↑");
    // With nothing earlier, the measure says which way is better.
    expect(changeLine({ ...down, previous: g(null) }).sign).toBe("↓");
    expect(changeLine({ ...up, previous: g(null) }).sign).toBe("↑");
  });
});

describe("followUpLine", () => {
  it("Followed up by Tunde Okafor · 21 Oct", () => {
    process.env.TZ = "UTC";
    expect(followUpLine(follow("2026-10-21T10:00:00Z"))).toBe(
      "Followed up by Tunde Okafor · 21 Oct",
    );
  });

  it("uses the viewer's local date and fixed month names", () => {
    process.env.TZ = "Etc/GMT-1"; // UTC+1
    expect(followUpLine(follow("2026-10-20T23:30:00Z"))).toBe(
      "Followed up by Tunde Okafor · 21 Oct",
    );
    process.env.TZ = "UTC";
    expect(followUpLine(follow("2026-09-05T12:00:00Z"))).toBe(
      "Followed up by Tunde Okafor · 5 Sep",
    );
  });
});
