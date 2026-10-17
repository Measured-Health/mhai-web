import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { FORBIDDEN_TERMS } from "../labels";
import { adminError } from "./errors";

describe("adminError", () => {
  it("maps each refusal to plain words", () => {
    expect(adminError(new ApiError(403, "self_change"))).toMatchObject({
      title: "You can't change your own access",
      gone: false,
      stale: false,
    });
    expect(adminError(new ApiError(409, "last_admin")).title).toBe(
      "The hospital needs a hospital admin",
    );
    expect(adminError(new ApiError(409, "conflict"))).toMatchObject({
      title: "Someone else changed this just now",
      stale: true,
    });
    expect(adminError(new ApiError(404, "not_found"))).toMatchObject({
      gone: true,
    });
    expect(adminError(new ApiError(409, "already_decided"))).toMatchObject({
      title: "This correction has already been decided",
      gone: true,
    });
    expect(adminError(new ApiError(0, "network")).title).toBe(
      "Couldn't reach MHAI",
    );
    expect(adminError(new Error("boom")).title).toBe("Couldn't reach MHAI");
    expect(adminError(new ApiError(503, "error")).title).toBe(
      "MHAI couldn't save this",
    );
    expect(adminError(new ApiError(403, "forbidden")).title).toBe(
      "You can't do this",
    );
  });

  it("words the two-step refusals plainly (remove staff)", () => {
    expect(adminError(new ApiError(403, "mfa_invalid"))).toMatchObject({
      title: "That code didn't work. Try again.",
      body: "Check the code in your authenticator app.",
      gone: false,
      stale: false,
    });
    expect(adminError(new ApiError(403, "mfa_required"))).toMatchObject({
      title:
        "Turn on two-step verification in Profile & security to remove staff.",
      body: "Then come back and try again.",
    });
    expect(adminError(new ApiError(429, "mfa_locked"))).toMatchObject({
      title: "Too many tries. Wait 15 minutes, then try again.",
      body: "This keeps the account safe.",
    });
  });

  it("never shows a backend term", () => {
    const codes = [
      "self_change",
      "last_admin",
      "conflict",
      "not_found",
      "already_decided",
      "not_eligible",
      "domain_not_allowed",
      "rate_limited",
      "forbidden",
      "mfa_required",
      "mfa_invalid",
      "mfa_locked",
      "invalid",
      "weird_new_code",
    ];
    for (const c of codes) {
      const { title, body } = adminError(new ApiError(409, c));
      for (const t of FORBIDDEN_TERMS)
        expect(`${title} ${body}`).not.toContain(t);
      expect(`${title} ${body}`).not.toContain("_");
    }
  });
});
