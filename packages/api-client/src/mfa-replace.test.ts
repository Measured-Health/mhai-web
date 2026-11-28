import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { base32Encode } from "./totp";
import { mfaReplaceCalls } from "./mfa-replace";
import { clearNewBackupCode, pendingBackupCode } from "./new-backup-code";

// Synthetic: never a real key.
const SECRET = base32Encode("synthetic-test-key-1");
const SETUP = {
  otpauthUri: `otpauth://totp/MHAI:a%40b.example?secret=${SECRET}&issuer=MHAI&algorithm=SHA1&digits=6&period=30`,
  secret: SECRET,
};

const fails = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return { status: (e as ApiError).status, code: (e as ApiError).code };
  }
  throw new Error("expected a refusal");
};

describe("mfaReplaceCalls", () => {
  it("posts the step-up with its key to the app's own route", async () => {
    const fetchImpl = vi.fn(async () => Response.json(SETUP));
    const calls = mfaReplaceCalls(fetchImpl as typeof fetch);
    expect(await calls.start({ mfa_code: "123456" }, "k-1")).toEqual(SETUP);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/mfa/replace");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      body: '{"mfa_code":"123456"}',
    });
    expect(init.headers).toMatchObject({ "Idempotency-Key": "k-1" });
  });

  it("confirms with {code} and its key", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await mfaReplaceCalls(fetchImpl as typeof fetch).confirm("654321", "k-2");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/mfa/replace/confirm");
    expect(init.body).toBe('{"code":"654321"}');
    expect(init.headers).toMatchObject({ "Idempotency-Key": "k-2" });
  });

  it("a refusal is an ApiError with the code only", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ code: "conflict", detail: "x" }, { status: 409 }),
    );
    const calls = mfaReplaceCalls(fetchImpl as typeof fetch);
    expect(await fails(calls.confirm("654321", "k"))).toEqual({
      status: 409,
      code: "conflict",
    });
  });

  it("no network is ApiError(0, network)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const calls = mfaReplaceCalls(fetchImpl as typeof fetch);
    expect(
      await fails(calls.start({ backup_code: "ppppp-qqqqq" }, "k")),
    ).toEqual({ status: 0, code: "network" });
  });

  it.each([
    [{ ...SETUP, extra: 1 }],
    [{ otpauthUri: "https://evil.example", secret: SECRET }],
    [{ ...SETUP, secret: "lower-case" }],
    [{}],
  ])("an unexpected reply %j is refused", async (body) => {
    const fetchImpl = vi.fn(async () => Response.json(body));
    const calls = mfaReplaceCalls(fetchImpl as typeof fetch);
    expect(await fails(calls.start({ mfa_code: "123456" }, "k"))).toEqual({
      status: 502,
      code: "unavailable",
    });
  });

  describe("a backup code spent on the step-up", () => {
    // Built at run time: never a code-shaped literal in the repo.
    const renewed = () => ["abcde", "fghjk"].join("-");
    const withCode = (body: unknown, status = 200, code = renewed()) =>
      vi.fn(async () =>
        Response.json(body, {
          status,
          headers: { "X-MHAI-New-Backup-Code": code },
        }),
      );

    it("offers core's replacement to be shown, on success", async () => {
      clearNewBackupCode();
      const calls = mfaReplaceCalls(withCode(SETUP) as typeof fetch);
      await calls.start({ backup_code: "x" }, "k");
      expect(pendingBackupCode()).toBe(renewed());
      clearNewBackupCode();
    });

    it("and on a refusal after the code was spent", async () => {
      clearNewBackupCode();
      const calls = mfaReplaceCalls(
        withCode({ code: "unavailable" }, 503) as typeof fetch,
      );
      await fails(calls.start({ backup_code: "x" }, "k"));
      expect(pendingBackupCode()).toBe(renewed());
      clearNewBackupCode();
    });

    it("never one not in the exact shape", async () => {
      clearNewBackupCode();
      const calls = mfaReplaceCalls(
        withCode(SETUP, 200, "not a code") as typeof fetch,
      );
      await calls.start({ backup_code: "x" }, "k");
      expect(pendingBackupCode()).toBeNull();
    });
  });
});
