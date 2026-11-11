import { afterEach, describe, expect, it } from "vitest";
import type { Change, FollowUp } from "../api/analytics-contract";
import {
  TOP,
  changeLine,
  changeTitle,
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
    summary: "Questions down: 100 to 90 a week",
    follow_up: null,
    version: 1,
    ...over,
  };
}
const follow = (at = "2026-10-21T10:00:00Z"): FollowUp => ({
  by: TUNDE,
  by_you: false,
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
  it("keeps the server's order (core ranks by size past the threshold), serious first", () => {
    const ranked = rankChanges([
      change("first", { previous: g(100), current: g(160) }),
      change("second", { previous: g(100), current: g(400) }),
      change("serious", { serious: true }),
    ]);
    expect(ids(ranked)).toEqual(["serious", "first", "second"]);
  });

  it("followed-up rows go below, keeping their order", () => {
    const ranked = rankChanges([
      change("done_a", { follow_up: follow() }),
      change("a"),
      change("done_b", { follow_up: follow() }),
      change("b"),
    ]);
    expect(ids(ranked)).toEqual(["a", "b", "done_a", "done_b"]);
    expect(ranked.map((c) => c.followedUp)).toEqual([false, false, true, true]);
    expect(ranked.every((c) => c.comparable)).toBe(true);
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
  it("says the direction in a word with its sign; the title names the hospital", () => {
    expect(
      changeLine(
        change("w", {
          area: "quality",
          measure: "needs_review_share",
          direction: "worse",
          previous: g(0.12),
          current: g(0.31),
          summary: "Answers needing review worse: 12.00% to 31.00%",
        }),
      ),
    ).toEqual({
      sign: "⚠",
      words: "Worse: Answers needing review worse: 12.00% to 31.00%",
    });
    expect(
      changeTitle(
        change("r", {
          hospital: null,
          direction: "rising",
          summary: "Questions up: 680.4 to 1031 a week",
        }),
      ),
    ).toEqual({
      sign: "↑",
      words: "All hospitals · Rising: Questions up: 680.4 to 1031 a week",
    });
    expect(changeLine(change("f")).sign).toBe("↓");
  });

  it("better uses ↑ or ↓ by the value's movement", () => {
    const down = change("b", {
      area: "quality",
      measure: "needs_review_share",
      direction: "better",
      previous: g(0.26),
      current: g(0.08),
      summary: "Answers needing review better: 26.00% to 8.00%",
    });
    expect(changeLine(down).sign).toBe("↓");
    const up = change("b2", {
      area: "quality",
      direction: "better",
      measure: "agreement_rate",
      previous: g(0.72),
      current: g(0.9),
      summary: "Agreement rate better: 72.00% to 90.00%",
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
