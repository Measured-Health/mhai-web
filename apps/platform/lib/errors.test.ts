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
});
