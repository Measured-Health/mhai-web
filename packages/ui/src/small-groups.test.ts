import { describe, expect, it } from "vitest";
import { FEWER_THAN_5, isSmallCount, SMALL_GROUP_MIN } from "./small-groups";

describe("small groups", () => {
  it("has the agreed constants", () => {
    expect(SMALL_GROUP_MIN).toBe(5);
    expect(FEWER_THAN_5).toBe("Fewer than 5");
  });

  it("calls only 1 to 4 small", () => {
    expect([0, 1, 4, 5, 6].map(isSmallCount)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });
});
