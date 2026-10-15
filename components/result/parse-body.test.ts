import { describe, expect, it } from "vitest";
import { parseBody } from "./parse-body";

const cite = (t: string) => ({
  chunk_id: t,
  source_title: t,
  excerpt: "",
  claim_text: "",
  nli_label: "ENTAILMENT" as const,
  nli_confidence: 1,
  action: "PASS" as const,
  reason: "",
});

describe("parseBody", () => {
  it("splits summary and cited steps", () => {
    const r = parseBody("Summary line.\n- Step one [1]\n- Step two", [
      cite("A"),
    ]);
    expect(r.summary).toBe("Summary line.");
    expect(r.steps).toEqual([
      { text: "Step one", citation: cite("A") },
      { text: "Step two" },
    ]);
  });
  it("ignores markers that point past the citation list", () => {
    expect(parseBody("- Step [7]", []).steps).toEqual([{ text: "Step" }]);
  });
  it("handles empty text", () => {
    expect(parseBody("", [])).toEqual({ summary: "", steps: [] });
  });
  it("treats whitespace-only text as empty", () => {
    expect(parseBody("  \n \r\n", [])).toEqual({ summary: "", steps: [] });
  });
  it("uses the whole text as the summary when there are no bullets", () => {
    expect(parseBody("First part.\r\nSecond part.", [])).toEqual({
      summary: "First part. Second part.",
      steps: [],
    });
  });
  it("ignores a [0] marker instead of wrapping to the last citation", () => {
    expect(parseBody("- Step [0]", [cite("A")]).steps).toEqual([
      { text: "Step" },
    ]);
  });
});
