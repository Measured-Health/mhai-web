import { describe, expect, it } from "vitest";
import { groupHistory } from "./group-history";

const at = (h: number) => ({
  id: String(h),
  title: "x",
  urgency: "routine" as const,
  createdAt: h,
  query: {} as never,
});
const DAY = 86_400_000;
const now = new Date("2026-10-13T15:00:00").getTime();

describe("groupHistory", () => {
  it("groups by Today, Yesterday, Earlier and drops empty groups", () => {
    const g = groupHistory(
      [at(now - 60_000), at(now - DAY), at(now - 5 * DAY)],
      now,
    );
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 1],
      ["Earlier", 1],
    ]);
    expect(groupHistory([at(now)], now).map((x) => x.label)).toEqual(["Today"]);
  });
});
