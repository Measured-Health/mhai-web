import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { isNotImplemented, platformError } from "./errors";

const e = (status: number, code: string) =>
  platformError(new ApiError(status, code));

describe("platformError", () => {
  it("gives plain words for every code", () => {
    expect(e(409, "conflict")).toEqual({
      title: "Changed by someone else",
      body: "Reload to see the latest.",
      stale: true,
      gone: false,
      unavailable: false,
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
      invalid_range: "A legal hold keeps all of a hospital's records.",
      expired: "This request lapsed after 7 days.",
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

  it("gives plain words for the record connection codes", () => {
    expect(e(409, "not_tested")).toEqual({
      title: "Test the saved settings first.",
      body: "",
      stale: true,
      gone: false,
      unavailable: false,
    });
    expect(e(422, "no_type")).toEqual({
      title: "Choose a connection type.",
      body: "",
      stale: false,
      gone: false,
      unavailable: false,
    });
  });

  it("treats a network failure, a 5xx and an unknown error as unreachable", () => {
    const down = "Couldn't reach the service. Try again.";
    expect(platformError(new ApiError(0, "network")).title).toBe(down);
    expect(e(502, "bad_gateway").title).toBe(down);
    expect(e(500, "whatever").title).toBe(down);
    expect(platformError(new Error("boom")).title).toBe(down);
  });

  it("not_implemented (501) is a calm Not available yet, never unreachable or retried", () => {
    const w = e(501, "not_implemented");
    expect(w).toMatchObject({
      title: "Not available yet",
      unavailable: true,
      stale: false,
      gone: false,
    });
    // A screen's own wording never turns it into an error.
    expect(
      platformError(new ApiError(501, "not_implemented"), {
        not_implemented: "Boom",
      }).title,
    ).toBe("Not available yet");
    expect(isNotImplemented(new ApiError(501, "not_implemented"))).toBe(true);
    expect(isNotImplemented(new ApiError(500, "internal_error"))).toBe(false);
    expect(isNotImplemented(new Error("x"))).toBe(false);
  });

  it("the team and hold codes say what to do next", () => {
    expect(e(409, "own_role").body).toBe(
      "Ask another platform admin to do it.",
    );
    expect(e(409, "last_admin").body).toBe(
      "Make someone else a platform admin first.",
    );
    expect(e(409, "same_person").body).toBe(
      "The person who asked can't approve their own request.",
    );
    expect(e(422, "invalid_range").body).toBe("It can't be limited to dates.");
  });

  it("an unlisted 4xx is not called unreachable", () => {
    expect(e(418, "teapot").title).toBe("Something went wrong. Try again.");
  });

  it("too many writes in a minute says to wait", () => {
    expect(e(429, "rate_limited").title).toBe(
      "Too many changes in a minute. Wait a moment and try again.",
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
