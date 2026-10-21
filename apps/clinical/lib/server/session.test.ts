import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  const options = new Map<string, Record<string, unknown>>();
  return {
    values,
    options,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string, o: Record<string, unknown>) => {
      values.set(n, v);
      options.set(n, o);
    },
    delete: (n: string) => values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import {
  MFA_COOKIE,
  SESSION_COOKIE,
  clearSession,
  readMfa,
  readSession,
  readTrust,
  seal,
  startSession,
  unseal,
  writeMfa,
  writeTrust,
} from "./session";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "x".repeat(32));
  jar.values.clear();
  jar.options.clear();
});
afterEach(() => vi.unstubAllEnvs());

// Distinctive, so "the cookie doesn't contain it" can't pass or fail by chance.
const TOKEN = "plain-token-marker-7f3c9a";
const LOGIN = {
  access_token: TOKEN,
  expires_in: 900,
  user: { username: "a.reyes", role: "clinician", mfa_enabled: true },
};

describe("seal / unseal", () => {
  it("round-trips, and two seals of the same value differ", () => {
    const a = seal({ n: 1 });
    expect(unseal(a)).toEqual({ n: 1 });
    expect(seal({ n: 1 })).not.toBe(a);
  });
  it("rejects tampering and garbage", () => {
    const a = seal({ n: 1 });
    // Flip a real bit of the last byte. Swapping the last characters isn't
    // enough: their spare base64 bits decode to the same bytes about once in
    // a thousand seals, so the test flaked.
    const raw = Buffer.from(a, "base64url");
    const last = raw.length - 1;
    raw[last] = raw[last]! ^ 1;
    expect(unseal(raw.toString("base64url"))).toBeNull();
    expect(unseal("not-a-cookie")).toBeNull();
    expect(unseal(undefined)).toBeNull();
  });
  it("treats a truncated value as none, without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = seal({ n: 1 });
    // IV + a short tag and no ciphertext: shorter than 29 bytes.
    const short = Buffer.from(a, "base64url").subarray(0, 20);
    expect(unseal(short.toString("base64url"))).toBeNull();
    // A forged 4-byte tag (no authTagLength pin) must not be accepted.
    const raw = Buffer.from(a, "base64url");
    const forged = Buffer.concat([raw.subarray(0, 16), raw.subarray(28)]);
    expect(unseal(forged.toString("base64url"))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("rejects a value sealed with another secret", () => {
    const a = seal({ n: 1 });
    vi.stubEnv("SESSION_SECRET", "y".repeat(32));
    expect(unseal(a)).toBeNull();
  });
  it("fails loudly without a strong secret", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => seal({})).toThrow(/SESSION_SECRET/);
    expect(() => unseal("abc")).toThrow(/SESSION_SECRET/);
  });
});

describe("session cookies", () => {
  it("starts a session in a sealed, httpOnly, strict cookie for the token's life", async () => {
    const r = await startSession(LOGIN, 1_000);
    expect(r).toMatchObject({
      status: "signed_in",
      user: { roles: ["clinician"] },
      steps: [],
    });
    const raw = jar.values.get(SESSION_COOKIE)!;
    expect(raw).not.toContain(TOKEN);
    expect(jar.options.get(SESSION_COOKIE)).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 900,
    });
    expect(await readSession(1_000)).toMatchObject({
      token: TOKEN,
      expiresAt: 901_000,
    });
  });
  it("reads a session sealed before roles combined (one role)", async () => {
    jar.values.set(
      SESSION_COOKIE,
      seal({
        token: TOKEN,
        expiresAt: Date.now() + 60_000,
        user: { username: "a.reyes", role: "clinician" },
        steps: [],
      }),
    );
    expect((await readSession())?.user.roles).toEqual(["clinician"]);
  });
  it("treats an expired session as none", async () => {
    await startSession(LOGIN, 0);
    expect(await readSession(900_001)).toBeNull();
  });
  it("keeps the MFA step token for 5 minutes, and clears both cookies", async () => {
    await writeMfa("mfa-tok", 0);
    expect(jar.options.get(MFA_COOKIE)).toMatchObject({
      maxAge: 300,
      httpOnly: true,
    });
    expect(await readMfa(299_000)).toMatchObject({ mfaToken: "mfa-tok" });
    expect(await readMfa(300_001)).toBeNull();
    await startSession(LOGIN);
    await clearSession();
    expect(jar.values.size).toBe(0);
  });
  it("keeps the trusted-device token across sign-out", async () => {
    await writeTrust("dev-1");
    await clearSession();
    expect(await readTrust()).toBe("dev-1");
  });
});
