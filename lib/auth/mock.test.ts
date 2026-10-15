import { describe, expect, it } from "vitest";
import { totp } from "./totp";
import { AuthError, initials, isClinical } from "./types";
import {
  MOCK_BACKUP_CODES,
  MOCK_CODE,
  MOCK_NEW_BACKUP_CODES,
  MOCK_RESET_TOKEN,
  MOCK_SSO_CODE,
  MOCK_TOTP_SECRET,
  SAMPLE_ACCOUNTS,
  createMockAuthClient,
} from "./mock";

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AuthError;
  }
  throw new Error("expected a rejection");
};

describe("mock auth client", () => {
  it("signs a normal clinician straight in", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn("a.reyes@havanahospital.org", "anything");
    expect(r).toMatchObject({ status: "signed_in", steps: [] });
    if (r.status !== "signed_in") throw new Error();
    expect(r.user).toMatchObject({
      email: "a.reyes@havanahospital.org",
      role: "clinician",
      displayName: "Dr. Reyes",
      mfaEnabled: true,
    });
    expect(await c.getSession()).toEqual({ user: r.user, steps: [] });
  });

  it("counts down wrong passwords, then locks for 15 minutes", async () => {
    let t = 0;
    const c = createMockAuthClient({ now: () => t });
    const e1 = await fail(c.signIn("x@h.org", "wrong"));
    expect(e1).toMatchObject({ code: "invalid_credentials", attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) await fail(c.signIn("x@h.org", "wrong"));
    expect(await fail(c.signIn("x@h.org", "wrong"))).toMatchObject({
      code: "locked",
    });
    expect(await fail(c.signIn("x@h.org", "right"))).toMatchObject({
      code: "locked",
    });
    t = 15 * 60_000 + 1;
    expect((await c.signIn("x@h.org", "right")).status).toBe("signed_in");
  });

  it("asks for a two-step code, and accepts 123456 or a backup code once", async () => {
    const c = createMockAuthClient();
    expect(await c.signIn("mfa@h.org", "pw")).toEqual({
      status: "mfa_required",
    });
    expect(
      await fail(c.verifyCode("000000", { backup: false, trustDevice: false })),
    ).toMatchObject({ code: "mfa_invalid" });
    const r = await c.verifyCode(MOCK_CODE, {
      backup: false,
      trustDevice: true,
    });
    expect(r.status).toBe("signed_in");

    await c.signOut();
    await c.signIn("mfa@h.org", "pw");
    const code = MOCK_BACKUP_CODES[0]!.toLowerCase().replace("-", " ");
    expect(
      (await c.verifyCode(code, { backup: true, trustDevice: false })).status,
    ).toBe("signed_in");
    await c.signOut();
    await c.signIn("mfa@h.org", "pw");
    expect(
      await fail(
        c.verifyCode(MOCK_BACKUP_CODES[0]!, {
          backup: true,
          trustDevice: false,
        }),
      ),
    ).toMatchObject({ code: "mfa_invalid" });
  });

  it("says the code step expired when nothing is pending", async () => {
    const c = createMockAuthClient();
    expect(
      await fail(
        c.verifyCode(MOCK_CODE, { backup: false, trustDevice: false }),
      ),
    ).toMatchObject({ code: "mfa_expired" });
  });

  it("gives a new account its first sign-in steps", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn("new.nurse@h.org", "temp");
    expect(r).toMatchObject({
      status: "signed_in",
      steps: ["terms", "password", "mfa"],
      user: { mfaEnabled: false },
    });
    await c.acceptTerms();
    await c.changePassword(null, "a-long-enough-password");
    expect((await c.getSession())?.steps).toEqual(["mfa"]);
    const setup = await c.startMfaSetup();
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/MHAI:/);
    expect(setup.backupCodes).toHaveLength(10);
    await expect(c.confirmMfaSetup("111111")).rejects.toMatchObject({
      code: "mfa_invalid",
    });
    await c.confirmMfaSetup(MOCK_CODE);
    expect(await c.getSession()).toMatchObject({
      user: { mfaEnabled: true },
      steps: [],
    });
  });

  it("signs admin and auditor accounts in with their role", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn("admin@h.org", "pw");
    if (r.status !== "signed_in") throw new Error();
    expect(r.user.role).toBe("admin");
    expect(isClinical(r.user)).toBe(false);
  });

  it("checks passwords and reset links", async () => {
    const c = createMockAuthClient();
    await c.signIn("a@h.org", "pw");
    await expect(c.changePassword("pw", "short")).rejects.toMatchObject({
      code: "weak_password",
    });
    await expect(
      c.changePassword("wrong", "a-long-enough-password"),
    ).rejects.toMatchObject({ code: "wrong_password" });
    await c.changePassword(null, "a-long-enough-password");
    await c.requestPasswordReset("anyone@anywhere.org");
    await expect(
      c.resetPassword("old", "a-long-enough-password"),
    ).rejects.toMatchObject({ code: "link_expired" });
    await c.resetPassword(MOCK_RESET_TOKEN, "a-long-enough-password");
  });

  it("lists devices and signs them out", async () => {
    const c = createMockAuthClient();
    await c.signIn("a@h.org", "pw");
    const devices = await c.listDevices();
    expect(devices.filter((d) => d.current)).toHaveLength(1);
    const other = devices.find((d) => !d.current)!;
    await c.signOutDevice(other.id);
    expect(await c.listDevices()).toHaveLength(devices.length - 1);
    await c.signOutEverywhere();
    expect(await c.getSession()).toBeNull();
  });

  it("offers every capability, so the demo shows the whole design", () => {
    expect(Object.values(createMockAuthClient().capabilities)).not.toContain(
      false,
    );
  });

  it("makes initials from a display name", () => {
    expect(initials("Dr. Reyes")).toBe("DR");
    expect(initials("Ana Maria Reyes")).toBe("AM");
    expect(initials("  ")).toBe("?");
  });

  it("gives each sample account its own person", async () => {
    const c = createMockAuthClient();
    const r = await c.signIn(SAMPLE_ACCOUNTS[2].email, "temp");
    if (r.status !== "signed_in") throw new Error();
    expect(r.user).toMatchObject({
      displayName: "Nurse Bello",
      mfaEnabled: false,
      backupCodesLeft: null,
    });
    expect((await c.signIn(SAMPLE_ACCOUNTS[3].email, "pw")).status).toBe(
      "signed_in",
    );
    expect(await fail(c.signIn(SAMPLE_ACCOUNTS[4].email, "pw"))).toMatchObject({
      code: "locked",
    });
  });

  it("finishes hospital sign-on with the demo code only", async () => {
    const c = createMockAuthClient();
    expect(await fail(c.completeHospitalSignIn("nope"))).toMatchObject({
      code: "sso_failed",
    });
    expect((await c.completeHospitalSignIn(MOCK_SSO_CODE)).status).toBe(
      "signed_in",
    );
  });

  it("replaces backup codes and counts what's left", async () => {
    const c = createMockAuthClient();
    await c.signIn("mfa@h.org", "pw");
    await c.verifyCode(MOCK_BACKUP_CODES[0]!, {
      backup: true,
      trustDevice: false,
    });
    expect((await c.getSession())?.user.backupCodesLeft).toBe(7);
    expect(await c.regenerateBackupCodes()).toEqual(MOCK_NEW_BACKUP_CODES);
    expect((await c.getSession())?.user.backupCodesLeft).toBe(10);
  });

  it("accepts a real authenticator code and rejects a wrong one", async () => {
    const at = 1_700_000_000_000;
    const c = createMockAuthClient({ now: () => at });
    await c.signIn("mfa.okafor@havanahospital.org", "pw");
    const good = await totp(MOCK_TOTP_SECRET, at);
    const bad = good === "000000" ? "000001" : "000000";
    expect(
      (await fail(c.verifyCode(bad, { backup: false, trustDevice: false })))
        .code,
    ).toBe("mfa_invalid");
    await c.signIn("mfa.okafor@havanahospital.org", "pw");
    expect(
      await c.verifyCode(good, { backup: false, trustDevice: false }),
    ).toMatchObject({ status: "signed_in" });
  });

  it("confirms two-step setup with a real authenticator code", async () => {
    const at = 1_700_000_000_000;
    const c = createMockAuthClient({ now: () => at });
    await c.signIn("new.bello@havanahospital.org", "temp");
    await expect(c.confirmMfaSetup("999999")).rejects.toMatchObject({
      code: "mfa_invalid",
    });
    await c.confirmMfaSetup(await totp(MOCK_TOTP_SECRET, at));
    expect((await c.getSession())?.steps).not.toContain("mfa");
  });
});
