import { describe, expect, it } from "vitest";
import { passwordError, passwordRules } from "./password-rules";

const ok = (pw: string, id: string | null = "a.reyes@havanahospital.org") =>
  Object.fromEntries(passwordRules(pw, id).map((r) => [r.id, r.ok]));

describe("passwordRules", () => {
  it("needs 12 characters", () => {
    expect(ok("short-pass1").length).toBe(false);
    expect(ok("long-enough-pass").length).toBe(true);
  });
  it("rejects common passwords and one repeated character", () => {
    expect(ok("password1234").common).toBe(false);
    expect(ok("PASSWORD1234").common).toBe(false);
    expect(ok("aaaaaaaaaaaaaa").common).toBe(false);
    expect(ok("tram-lantern-okra").common).toBe(true);
  });
  it("can't contain the email's name part or the username", () => {
    expect(ok("A.Reyes-2026-ward").identity).toBe(false);
    expect(ok("tram-lantern-okra").identity).toBe(true);
    expect(ok("tram-lantern-okra", null).identity).toBe(true);
  });
  it("leaves every rule unticked while empty", () => {
    expect(Object.values(ok(""))).toEqual([false, false, false]);
  });
});

describe("passwordError", () => {
  it("explains what's wrong, rules first", () => {
    expect(passwordError("short", "short", null)).toBe(
      "Choose a password that meets every rule.",
    );
    expect(passwordError("tram-lantern-okra", "tram-lantern-okr", null)).toBe(
      "The passwords don't match.",
    );
    expect(
      passwordError("tram-lantern-okra", "tram-lantern-okra", null),
    ).toBeNull();
  });
});
