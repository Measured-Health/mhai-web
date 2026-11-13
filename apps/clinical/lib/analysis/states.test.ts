import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import {
  BUSY_TEXT,
  INVALID_TEXT,
  NOT_READY_TEXT,
  OFF_TEXT,
  canRetry,
  problemOf,
  problemText,
  shouldRetryAnalysis,
} from "./states";

describe("analysis refusals in plain words", () => {
  it.each([
    [404, "not_found", { kind: "off" }, OFF_TEXT],
    [503, "not_ready", { kind: "not_ready" }, NOT_READY_TEXT],
    [429, "rate_limited", { kind: "busy" }, BUSY_TEXT],
    [
      422,
      "invalid_range",
      { kind: "invalid", code: "invalid_range" },
      INVALID_TEXT.invalid_range,
    ],
    [
      422,
      "too_many_filters",
      { kind: "invalid", code: "too_many_filters" },
      INVALID_TEXT.too_many_filters,
    ],
    [
      422,
      "validation_failed",
      { kind: "invalid", code: "other" },
      INVALID_TEXT.other,
    ],
  ])("%i %s", (status, code, problem, text) => {
    const p = problemOf(new ApiError(status, code));
    expect(p).toEqual(problem);
    expect(problemText(p)).toBe(text);
  });

  it("anything else is a plain failure", () => {
    expect(problemOf(new ApiError(503, "unavailable"))).toEqual({
      kind: "failed",
    });
    expect(problemOf(new ApiError(502, "bad_gateway"))).toEqual({
      kind: "failed",
    });
    expect(problemOf(new Error("network"))).toEqual({ kind: "failed" });
    expect(problemText({ kind: "failed" })).toBeNull();
  });

  it("offers Try again only where asking again can help", () => {
    expect(canRetry({ kind: "not_ready" })).toBe(true);
    expect(canRetry({ kind: "busy" })).toBe(true);
    expect(canRetry({ kind: "off" })).toBe(false);
    expect(canRetry({ kind: "invalid", code: "other" })).toBe(false);
  });

  it("not_ready and 4xx are shown at once; 5xx and network errors retry", () => {
    expect(shouldRetryAnalysis(0, new ApiError(503, "not_ready"))).toBe(false);
    expect(shouldRetryAnalysis(0, new ApiError(429, "rate_limited"))).toBe(
      false,
    );
    expect(shouldRetryAnalysis(0, new ApiError(404, "not_found"))).toBe(false);
    expect(shouldRetryAnalysis(0, new ApiError(503, "unavailable"))).toBe(true);
    expect(shouldRetryAnalysis(3, new ApiError(503, "unavailable"))).toBe(
      false,
    );
    expect(shouldRetryAnalysis(0, new Error("network"))).toBe(true);
  });
});
