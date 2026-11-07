import { describe, expect, it } from "vitest";
import {
  monthLabel,
  parseBudget,
  policyLabel,
  targetLabel,
  tokens,
} from "./labels";

describe("the AI model's words", () => {
  it("names the provider as cloud, and off as MHAI's own model", () => {
    expect(policyLabel("anthropic")).toBe("Anthropic (cloud)");
    expect(policyLabel("openai")).toBe("OpenAI (cloud)");
    expect(policyLabel("xai")).toBe("xAI (cloud)");
    expect(policyLabel(null)).toBe("MHAI's own model");
  });

  it("an Activity target it doesn't know has no words", () => {
    expect(targetLabel("none")).toBe("MHAI's own model");
    expect(targetLabel("xai")).toBe("xAI (cloud)");
    expect(targetLabel("Kemi")).toBeNull();
    expect(targetLabel(null)).toBeNull();
  });

  it("reads the limit as typed, whole numbers only", () => {
    expect(parseBudget("2,000,000", 1e9)).toBe(2_000_000);
    expect(parseBudget(" 1 500 000 ", 1e9)).toBe(1_500_000);
    expect(parseBudget("1", 1e9)).toBe(1);
    expect(parseBudget("1000000000", 1e9)).toBe(1e9);
    for (const bad of ["", "0", "-5", "1.5", "2e6", "1000000001", "abc"])
      expect(parseBudget(bad, 1e9)).toBeNull();
  });

  it("formats counts and the month", () => {
    expect(tokens(1_240_000)).toBe("1,240,000");
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});
