import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { totp } from "@mhai/api-client/totp";
import {
  MOCK_BACKUP_CODES,
  MOCK_CODE,
  MOCK_NEW_TOTP_SECRET,
  MOCK_TOTP_SECRET,
  REPLACE_MS,
  createMockAuthClient,
} from "./mock";
import type { AuthClient } from "./types";

const KEY = "k-1";
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    const { status, code } = e as ApiError;
    return { status, code };
  }
  throw new Error("expected a refusal");
};

let t: number;
let c: AuthClient;
beforeEach(async () => {
  t = 1_700_000_000_000;
  c = createMockAuthClient({ now: () => t });
  await c.signIn("mfa.okafor@pilot-hospital.example", "pw");
  await c.verifyCode(MOCK_CODE, { backup: false, trustDevice: false });
});
const oldApp = () => totp(MOCK_TOTP_SECRET, t);
const newApp = () => totp(MOCK_NEW_TOTP_SECRET, t);

describe("mock: moving two-step to a new app", () => {
  it("the old app works until the new app's code confirms it, then only the new one", async () => {
    const r = await c.startMfaReplace({ mfa_code: await oldApp() }, KEY);
    expect(r.secret).toBe(MOCK_NEW_TOTP_SECRET);
    expect(r.otpauthUri).toMatch(
      /^otpauth:\/\/totp\/MHAI%20Demo:mfa\.okafor%40pilot-hospital\.example\?secret=[A-Z2-7]+&issuer=MHAI%20Demo&algorithm=SHA1&digits=6&period=30$/,
    );
    // Not confirmed yet: the current app still works.
    await c.startMfaReplace({ mfa_code: await oldApp() }, KEY);
    await c.confirmMfaReplace(await newApp(), KEY);
    expect(
      await refusal(c.startMfaReplace({ mfa_code: await oldApp() }, KEY)),
    ).toEqual({ status: 403, code: "mfa_invalid" });
    await c.startMfaReplace({ mfa_code: await newApp() }, KEY);
  });

  it("a wrong code is refused at either step, and the move still waits", async () => {
    expect(
      await refusal(c.startMfaReplace({ mfa_code: "000000" }, KEY)),
    ).toEqual({ status: 403, code: "mfa_invalid" });
    await c.startMfaReplace({ mfa_code: MOCK_CODE }, KEY);
    expect(await refusal(c.confirmMfaReplace(await oldApp(), KEY))).toEqual({
      status: 403,
      code: "mfa_invalid",
    });
    await c.confirmMfaReplace(await newApp(), KEY);
  });

  it("nothing waiting, or after 15 minutes, is 409: start again", async () => {
    expect(await refusal(c.confirmMfaReplace(await newApp(), KEY))).toEqual({
      status: 409,
      code: "conflict",
    });
    await c.startMfaReplace({ mfa_code: MOCK_CODE }, KEY);
    t += REPLACE_MS + 1;
    expect(await refusal(c.confirmMfaReplace(await newApp(), KEY))).toEqual({
      status: 409,
      code: "conflict",
    });
    // It was dropped, so a right code later is still 409.
    expect(await refusal(c.confirmMfaReplace(await newApp(), KEY))).toEqual({
      status: 409,
      code: "conflict",
    });
  });

  it("a backup code starts it once, and the other backup codes stay the same", async () => {
    await c.startMfaReplace({ backup_code: MOCK_BACKUP_CODES[0]! }, KEY);
    expect(
      await refusal(
        c.startMfaReplace({ backup_code: MOCK_BACKUP_CODES[0]! }, KEY),
      ),
    ).toEqual({ status: 403, code: "mfa_invalid" });
    await c.startMfaReplace({ mfa_code: MOCK_CODE }, KEY);
    await c.confirmMfaReplace(await newApp(), KEY);
    await c.startMfaReplace({ backup_code: MOCK_BACKUP_CODES[1]! }, KEY);
  });

  it("five wrong codes lock it", async () => {
    for (let i = 0; i < 5; i++)
      await refusal(c.startMfaReplace({ mfa_code: "000000" }, KEY));
    expect(
      await refusal(c.startMfaReplace({ mfa_code: MOCK_CODE }, KEY)),
    ).toEqual({ status: 429, code: "mfa_locked" });
  });

  it("signing out drops what was waiting; no session is 401", async () => {
    await c.startMfaReplace({ mfa_code: MOCK_CODE }, KEY);
    await c.signOut();
    expect(await refusal(c.confirmMfaReplace(await newApp(), KEY))).toEqual({
      status: 401,
      code: "session_expired",
    });
    await c.signIn("mfa.okafor@pilot-hospital.example", "pw");
    await c.verifyCode(MOCK_CODE, { backup: false, trustDevice: false });
    expect(await refusal(c.confirmMfaReplace(await newApp(), KEY))).toEqual({
      status: 409,
      code: "conflict",
    });
  });

  it("an account without two-step can't start it", async () => {
    const fresh = createMockAuthClient();
    await fresh.signIn("new.bello@pilot-hospital.example", "pw");
    expect(
      await refusal(fresh.startMfaReplace({ mfa_code: MOCK_CODE }, KEY)),
    ).toEqual({ status: 403, code: "mfa_required" });
  });
});
