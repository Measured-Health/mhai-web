// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  const options = new Map<string, Record<string, unknown>>();
  return {
    values,
    options,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string, o: Record<string, unknown> = {}) => {
      values.set(n, v);
      options.set(n, o);
    },
    delete: (n: string) => void values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import type { ApiUser } from "@/lib/api/auth-contract";
import {
  IDLE_LIMIT_MS,
  MFA_COOKIE,
  SESSION_COOKIE,
  readMfa,
  readSession,
  stepsFor,
  touchSession,
  writeMfa,
  writeSession,
  type ServerSession,
} from "./session";

const T0 = Date.parse("2026-10-20T09:00:00Z");
const S: ServerSession = {
  token: "tok",
  expiresAt: T0 + 60 * 60_000,
  lastSeenAt: T0,
  user: {
    id: "u1",
    email: "ada@measured-health.example",
    name: "Ada",
    roles: ["platform_admin"],
    mfaEnabled: true,
    backupCodesLeft: 8,
  },
  steps: [],
};

beforeEach(() => {
  vi.stubEnv("PLATFORM_SESSION_SECRET", "p".repeat(40));
  jar.values.clear();
  jar.options.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe("platform session", () => {
  it("is idle after 15 minutes", () => {
    expect(IDLE_LIMIT_MS).toBe(900_000);
  });

  it("a session idle for 15 minutes and 1 second reads as null", async () => {
    await writeSession(S, T0);
    expect(await readSession(T0 + 15 * 60_000)).not.toBeNull();
    expect(await readSession(T0 + 15 * 60_000 + 1000)).toBeNull();
  });

  it("a session idle for 14 minutes reads and touch moves lastSeenAt", async () => {
    await writeSession(S, T0);
    const now = T0 + 14 * 60_000;
    const s = await readSession(now);
    expect(s).toMatchObject({ token: "tok", lastSeenAt: T0 });
    await touchSession(s!, now);
    expect((await readSession(now))?.lastSeenAt).toBe(now);
    // Another 14 minutes from the touch is still fine.
    expect(await readSession(now + 14 * 60_000)).not.toBeNull();
  });

  it("reads null when expired, unsealable, missing or without lastSeenAt", async () => {
    expect(await readSession(T0)).toBeNull();
    await writeSession(S, T0);
    expect(await readSession(S.expiresAt)).toBeNull();
    jar.values.set(SESSION_COOKIE, "garbage");
    expect(await readSession(T0)).toBeNull();
    const { lastSeenAt: _drop, ...old } = S;
    void _drop;
    await writeSession(old as ServerSession, T0);
    expect(await readSession(T0)).toBeNull();
  });

  it("the cookie is host-only, httpOnly, strict", async () => {
    await writeSession(S, T0);
    await writeMfa("m", T0);
    for (const name of [SESSION_COOKIE, MFA_COOKIE]) {
      const o = jar.options.get(name)!;
      expect(o).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/",
      });
      expect(o).not.toHaveProperty("domain");
    }
    expect(SESSION_COOKIE).toBe("mhai_platform_session");
    expect(MFA_COOKIE).toBe("mhai_platform_mfa");
    expect(jar.options.get(MFA_COOKIE)?.maxAge).toBe(300);
    // The session cookie never outlives the idle limit.
    expect(jar.options.get(SESSION_COOKIE)?.maxAge).toBe(900);
    // The token is sealed, never readable.
    expect(jar.values.get(SESSION_COOKIE)).not.toContain("tok");
    vi.stubEnv("NODE_ENV", "production");
    await writeSession(S, T0);
    expect(jar.options.get(SESSION_COOKIE)?.secure).toBe(true);
  });

  it("holds the two-step token for 300 seconds", async () => {
    await writeMfa("m", T0);
    expect(await readMfa(T0 + 299_000)).toMatchObject({ mfaToken: "m" });
    expect(await readMfa(T0 + 300_000)).toBeNull();
  });

  it("refuses a short or missing secret", async () => {
    vi.stubEnv("PLATFORM_SESSION_SECRET", "short");
    await expect(writeSession(S, T0)).rejects.toThrow(
      /PLATFORM_SESSION_SECRET/,
    );
    vi.stubEnv("PLATFORM_SESSION_SECRET", undefined);
    await expect(writeSession(S, T0)).rejects.toThrow(
      /PLATFORM_SESSION_SECRET/,
    );
    await expect(readSession(T0)).rejects.toThrow(/PLATFORM_SESSION_SECRET/);
  });

  it("stepsFor always owes mfa without two-step", () => {
    const u: ApiUser = { username: "a", role: "admin" };
    expect(stepsFor({ ...u, mfa_enabled: true })).toEqual([]);
    expect(stepsFor({ ...u, mfa_enabled: false })).toEqual(["mfa"]);
    expect(stepsFor(u)).toEqual(["mfa"]);
    expect(
      stepsFor({
        ...u,
        must_change_password: true,
        terms_accepted_at: null,
      }),
    ).toEqual(["password", "terms", "mfa"]);
    expect(
      stepsFor({ ...u, mfa_enabled: true, terms_accepted_at: null }),
    ).toEqual(["terms"]);
  });
});
