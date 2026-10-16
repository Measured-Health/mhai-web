import { describe, expect, it } from "vitest";
import {
  DIFF_TOKEN_LIMIT,
  tokenize,
  wordDiff,
  type DiffPart,
} from "./word-diff";

const before = (p: DiffPart[]) =>
  p
    .filter((x) => x.kind !== "add")
    .map((x) => x.text)
    .join("");
const after = (p: DiffPart[]) =>
  p
    .filter((x) => x.kind !== "del")
    .map((x) => x.text)
    .join("");
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("wordDiff", () => {
  it("marks a changed word and keeps the rest", () => {
    expect(wordDiff("Acute asthma, moderate", "Acute asthma, severe")).toEqual([
      { kind: "same", text: "Acute asthma, " },
      { kind: "del", text: "moderate" },
      { kind: "add", text: "severe" },
    ]);
  });

  it("handles additions, identical text and empty sides", () => {
    expect(
      wordDiff("Hypokalaemia", "Hypokalaemia, likely from diuretic use"),
    ).toEqual([
      { kind: "same", text: "Hypokalaemia" },
      { kind: "add", text: ", likely from diuretic use" },
    ]);
    expect(wordDiff("NSTEMI", "NSTEMI")).toEqual([
      { kind: "same", text: "NSTEMI" },
    ]);
    expect(wordDiff("", "New text")).toEqual([
      { kind: "add", text: "New text" },
    ]);
    expect(wordDiff("", "")).toEqual([]);
  });

  it("treats Unicode letters, marks and numbers as words", () => {
    expect(tokenize("Café 10⁹/L")).toEqual(["Café", " ", "10⁹", "/", "L"]);
  });

  it("keeps every character, including emoji and combining marks (Review Focus 5)", () => {
    const samples: [string, string][] = [
      ["Fiebre 🙂 alta", "Fiebre 🙂 muy alta"],
      ["Café au lait spots", "Café au lait macules"],
      ["Platelets < 100 × 10⁹/L", "Platelets < 20 × 10⁹/L"],
      ["حمى الضنك", "حمى الضنك الشديدة"],
      ["👩🏽‍⚕️ advice", "👩🏽‍⚕️ urgent advice"],
    ];
    for (const [a, b] of samples) {
      const d = wordDiff(a, b);
      expect(before(d)).toBe(a);
      expect(after(d)).toBe(b);
      for (const part of d) expect(part.text).not.toMatch(LONE_SURROGATE);
    }
  });

  it("falls back to before and after for very long text, quickly", () => {
    const words = Array.from({ length: DIFF_TOKEN_LIMIT }, (_, i) => `w${i}`);
    const a = `${words.join(" ")} ${words.join(" ")}`;
    const b = `${"x".repeat(2000)} ${words.join(" ")}`;
    const started = performance.now();
    const d = wordDiff(a, b);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(before(d)).toBe(a);
    expect(after(d)).toBe(b);
  });
});
