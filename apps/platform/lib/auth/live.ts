import { mfaReplaceCalls } from "@mhai/api-client/mfa-replace";
import { readBackupCode } from "@mhai/api-client/codes";
import { ApiError } from "@mhai/api-client/errors";
import { createApiRequest, keyHeader } from "@mhai/api-client/request";
import { reportUnauthorized } from "./events";

/** The step-up calls under /api/auth (a 401 signs out, as /api/v1 does). */
const stepUpApi = createApiRequest({
  prefix: "/api/auth",
  onUnauthorized: reportUnauthorized,
});
import {
  AUTH_ERROR_CODES,
  AuthError,
  type AuthClient,
  type AuthErrorCode,
  type Device,
  type SignInResult,
} from "./types";

const KNOWN = new Set<AuthErrorCode>(AUTH_ERROR_CODES);

/** The app's own /api/auth routes; the session is an httpOnly cookie. */
export function createLiveAuthClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AuthClient {
  async function call<T>(
    path: string,
    body?: unknown,
    method = "POST",
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`/api/auth${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new AuthError("unavailable");
    }
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    const data = (await res.json().catch(() => null)) as {
      code?: string;
      newBackupCode?: unknown;
    } | null;
    throw new AuthError(
      KNOWN.has(data?.code as AuthErrorCode)
        ? (data!.code as AuthErrorCode)
        : "unavailable",
      undefined,
      readBackupCode(data?.newBackupCode) ?? undefined,
    );
  }

  /** The server refuses a hospital account with 403 `not_platform`. */
  const signInCall = async (path: string, body: unknown) => {
    try {
      return await call<SignInResult>(path, body);
    } catch (e) {
      if (e instanceof AuthError && e.code === "not_platform")
        return {
          status: "not_platform",
          ...(e.newBackupCode ? { newBackupCode: e.newBackupCode } : {}),
        } as const;
      throw e;
    }
  };

  // Step-up calls: refusals come back as ApiError, like other step-ups.
  const replace = mfaReplaceCalls(fetchImpl);

  const signOutDevice = (id: string) =>
    call<void>(`/devices/${encodeURIComponent(id)}`, undefined, "DELETE");

  return {
    async getSession() {
      try {
        return await call("/session", undefined, "GET");
      } catch (e) {
        if (e instanceof AuthError && e.code === "session_expired") return null;
        throw e;
      }
    },
    signIn: (login, password) => signInCall("/login", { login, password }),
    // No trust option: the route would strip one anyway.
    verifyCode: (code, { backup }) => signInCall("/mfa", { code, backup }),
    async signOut() {
      await call("/logout").catch(() => {});
    },
    keepAlive: () => call<void>("/session"),
    acceptTerms: () => call("/terms"),
    changePassword: (current, next) => call("/password", { current, next }),
    startMfaSetup: () => call("/mfa/setup"),
    confirmMfaSetup: (code) => call("/mfa/setup/confirm", { code }),
    async regenerateBackupCode(code, idempotencyKey) {
      // A step-up: refusals come back as ApiError, like other step-ups.
      const r = await stepUpApi.apiOk<{ backupCode?: unknown }>(
        fetchImpl,
        "/mfa/recovery-codes",
        { method: "POST", body: code, headers: keyHeader({ idempotencyKey }) },
      );
      const fresh = readBackupCode(r?.backupCode);
      if (!fresh) throw new ApiError(502, "bad_gateway");
      return fresh;
    },
    startMfaReplace: (code, key) => replace.start(code, key),
    confirmMfaReplace: (code, key) => replace.confirm(code, key),
    listDevices: () => call<Device[]>("/devices", undefined, "GET"),
    signOutDevice,
    async signOutEverywhere() {
      // Every other session (all tried, whatever fails), then always this
      // one; then any failure is reported.
      const devices = await call<Device[]>("/devices", undefined, "GET");
      const others = await Promise.allSettled(
        devices.filter((d) => !d.current).map((d) => signOutDevice(d.id)),
      );
      await call("/logout").catch(() => {});
      const failed = others.find((r) => r.status === "rejected");
      if (failed) throw (failed as PromiseRejectedResult).reason;
    },
  };
}
