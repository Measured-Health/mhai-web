import { describe, expect, it } from "vitest";
import { normalizeBackupCode } from "./codes";

describe("normalizeBackupCode", () => {
  it.each([
    ["4f7k 92qx", "4F7K-92QX"],
    ["4F7K-92QX", "4F7K-92QX"],
    ["4f7", "4F7"],
    ["4f7k92qxzz", "4F7K-92QX"],
    ["", ""],
  ])("%s → %s", (a, b) => expect(normalizeBackupCode(a)).toBe(b));
});
