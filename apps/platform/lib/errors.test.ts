import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { platformError } from "./errors";

const e = (status: number, code: string) =>
  platformError(new ApiError(status, code));

describe("platformError", () => {
  it("gives plain words for every code", () => {
    expect(e(409, "conflict")).toEqual({
      title: "Changed by someone else",
      body: "Reload to see the latest.",
      stale: true,
      gone: false,
    });
    expect(e(404, "not_found")).toMatchObject({
      title: "This was removed or no longer exists.",
      gone: true,
      stale: false,
    });
    const words: Record<string, string> = {
      duplicate: "That short code is already used.",
      invalid: "Check the highlighted fields.",
      mfa_invalid: "That code didn't work. Try again.",
      mfa_locked: "Too many wrong codes. Try again in 15 minutes.",
      mfa_required: "Turn on two-step in Account first.",
      same_person: "A different platform admin must approve this.",
      blocked: "Removal can't go ahead yet.",
      last_admin: "There must always be at least one platform admin.",
      own_role: "You can't change your own role.",
      forbidden: "Your account can only view this.",
    };
    for (const [code, title] of Object.entries(words))
      expect(e(409, code)).toMatchObject({ title, stale: false, gone: false });
  });

  it("gives plain words for the legal-hold, request and settings codes", () => {
    const words: Record<string, string> = {
      hospital_removed:
        "This hospital has been removed. There is nothing left to hold.",
      removal_started:
        "This hospital's removal has already started. Act outside the app now.",
      invalid_range: "The end date must be on or after the start date.",
      expired: "This request lapsed after 7 days. Make a new request.",
      not_ready: "No longer ready to switch on.",
      below_minimum: "That's shorter than the minimum allowed.",
    };
    for (const [code, title] of Object.entries(words))
      expect(e(409, code)).toMatchObject({ title, gone: false });
  });

  it("expired and not_ready are stale; the other new codes are not", () => {
    expect(e(409, "expired").stale).toBe(true);
    expect(e(409, "not_ready").stale).toBe(true);
    for (const code of [
      "hospital_removed",
      "removal_started",
      "invalid_range",
      "below_minimum",
    ])
      expect(e(409, code).stale).toBe(false);
  });

  it("treats a network failure, a 5xx and an unknown error as unreachable", () => {
    const down = "Couldn't reach the service. Try again.";
    expect(platformError(new ApiError(0, "network")).title).toBe(down);
    expect(e(502, "bad_gateway").title).toBe(down);
    expect(e(500, "whatever").title).toBe(down);
    expect(platformError(new Error("boom")).title).toBe(down);
  });

  it("an unlisted 4xx is not called unreachable", () => {
    expect(e(418, "teapot").title).toBe("Something went wrong. Try again.");
    expect(e(429, "rate_limited").title).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("a screen's own wording for a code replaces the default", () => {
    const dup = { duplicate: "That email is already on the team." };
    const err = (code: string) => new ApiError(409, code);
    expect(platformError(err("duplicate"), dup).title).toBe(
      "That email is already on the team.",
    );
    expect(platformError(err("duplicate")).title).toBe(
      "That short code is already used.",
    );
    expect(platformError(err("conflict"), dup).stale).toBe(true);
  });
});
