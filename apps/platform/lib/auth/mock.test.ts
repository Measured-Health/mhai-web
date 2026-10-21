import { beforeEach, describe, expect, it } from "vitest";
import { createMockPlatform } from "@/lib/api/mock";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import {
  createStepUp,
  MOCK_BACKUP_CODES,
  type DemoStepUp,
} from "@/lib/api/step-up";
import { createMockAuthClient, NEW_ADMIN_EMAIL, SAMPLE_ACCOUNTS } from "./mock";
import { AuthError, type AuthClient } from "./types";

let stepUp: DemoStepUp;
let client: AuthClient;
beforeEach(() => {
  stepUp = createStepUp();
  client = createMockAuthClient({ stepUp });
});

const api = () => createMockPlatform({ delayMs: 0, stepUp });

describe("mock auth client", () => {
  it("asks every team member with two-step for a code, then signs in", async () => {
    for (const email of [
      TEAM_EMAILS.ada,
      TEAM_EMAILS.tunde,
      TEAM_EMAILS.amara,
    ]) {
      expect(await client.signIn(email, "pw")).toEqual({
        status: "mfa_required",
      });
      const r = await client.verifyCode("123456", { backup: false });
      expect(r.status).toBe("signed_in");
      await client.signOut();
    }
  });

  it("gives Ada the platform admin role and Amara the auditor role", async () => {
    await client.signIn(TEAM_EMAILS.ada, "pw");
    const ada = await client.verifyCode("123456", { backup: false });
    expect(ada.status === "signed_in" && ada.user.roles).toEqual([
      "platform_admin",
    ]);
    await client.signOut();
    await client.signIn(TEAM_EMAILS.amara, "pw");
    const amara = await client.verifyCode("123456", { backup: false });
    expect(amara.status === "signed_in" && amara.user.roles).toEqual([
      "auditor",
    ]);
  });

  it("the new admin owes a password, the terms and two-step", async () => {
    const r = await client.signIn(NEW_ADMIN_EMAIL, "temporary");
    expect(r).toMatchObject({
      status: "signed_in",
      steps: ["password", "terms", "mfa"],
    });
  });

  it("any other email is a clinician account: not_platform, no session", async () => {
    expect(await client.signIn("a.reyes@havanahospital.org", "pw")).toEqual({
      status: "not_platform",
    });
    expect(await client.getSession()).toBeNull();
  });

  it("refuses the password 'wrong'", async () => {
    await expect(client.signIn(TEAM_EMAILS.ada, "wrong")).rejects.toThrow(
      AuthError,
    );
  });

  it("a wrong code is mfa_invalid; five lock the account for 15 minutes", async () => {
    await client.signIn(TEAM_EMAILS.ada, "pw");
    for (let i = 0; i < 5; i++)
      await expect(
        client.verifyCode("000000", { backup: false }),
      ).rejects.toMatchObject({ code: "mfa_invalid" });
    await expect(
      client.verifyCode("123456", { backup: false }),
    ).rejects.toMatchObject({ code: "mfa_locked" });
  });

  it("a backup code spent at sign-in is spent for step-ups too", async () => {
    await client.signIn(TEAM_EMAILS.ada, "pw");
    await client.verifyCode(MOCK_BACKUP_CODES[0], { backup: true });
    expect(stepUp.takeBackup(MOCK_BACKUP_CODES[0])).toBe(false);
    await client.signOut();
    await client.signIn(TEAM_EMAILS.ada, "pw");
    await expect(
      client.verifyCode(MOCK_BACKUP_CODES[0], { backup: true }),
    ).rejects.toMatchObject({ code: "mfa_invalid" });
  });

  it("tells the sample API who is signed in, and nobody after sign-out", async () => {
    const platform = api();
    await expect(platform.listHospitals({})).rejects.toMatchObject({
      status: 401,
    });
    await client.signIn(TEAM_EMAILS.ada, "pw");
    // Not until the code is entered.
    await expect(platform.listHospitals({})).rejects.toMatchObject({
      status: 401,
    });
    await client.verifyCode("123456", { backup: false });
    await expect(platform.listHospitals({})).resolves.toBeTruthy();
    await client.signOut();
    await expect(platform.listHospitals({})).rejects.toMatchObject({
      status: 401,
    });
  });

  it("a not_platform sign-in leaves the sample API signed out", async () => {
    await client.signIn(TEAM_EMAILS.ada, "pw");
    await client.verifyCode("123456", { backup: false });
    await client.signIn("a.reyes@havanahospital.org", "pw");
    await expect(api().listHospitals({})).rejects.toMatchObject({
      status: 401,
    });
  });

  it("two-step setup confirms with the code and drops the step", async () => {
    await client.signIn(NEW_ADMIN_EMAIL, "temporary");
    await client.changePassword(null, "tram-lantern-okra");
    await client.acceptTerms();
    const setup = await client.startMfaSetup();
    expect(setup.backupCodes).toEqual([...MOCK_BACKUP_CODES]);
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    await expect(client.confirmMfaSetup("000000")).rejects.toMatchObject({
      code: "mfa_invalid",
    });
    await client.confirmMfaSetup("123456");
    const s = await client.getSession();
    expect(s?.steps).toEqual([]);
    expect(s?.user.mfaEnabled).toBe(true);
  });

  it("keep-alive resolves", async () => {
    await client.signIn(TEAM_EMAILS.ada, "pw");
    await client.verifyCode("123456", { backup: false });
    await expect(client.keepAlive()).resolves.toBeUndefined();
  });

  it("lists Ada, Tunde, Amara and the new admin as sample accounts", () => {
    expect(SAMPLE_ACCOUNTS.map((a) => a.email)).toEqual([
      TEAM_EMAILS.ada,
      TEAM_EMAILS.tunde,
      TEAM_EMAILS.amara,
      NEW_ADMIN_EMAIL,
    ]);
  });
});
