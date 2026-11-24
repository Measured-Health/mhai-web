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
  type Capabilities,
} from "./types";

/** The BFF routes cover everything the UI offers. */
export const LIVE_CAPABILITIES: Capabilities = {
  sso: true,
  emailLogin: true,
  passwordReset: true,
  devices: true,
  trustDevice: true,
};

const KNOWN = new Set<AuthErrorCode>(AUTH_ERROR_CODES);

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
    if (res.ok)
      return (
        res.status === 204 || res.status === 202 ? undefined : await res.json()
      ) as T;
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

  // Step-up calls: refusals come back as ApiError, like other step-ups.
  const replace = mfaReplaceCalls(fetchImpl);

  return {
    capabilities: LIVE_CAPABILITIES,
    async getSession() {
      try {
        return await call("/session", undefined, "GET");
      } catch (e) {
        if (e instanceof AuthError && e.code === "session_expired") return null;
        throw e;
      }
    },
    signIn: (login, password) => call("/login", { login, password }),
    signInWithHospital() {
      // A route handler redirects to the hospital, not a Next.js page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/api/auth/oidc/login");
      return new Promise<never>(() => {}); // the page is leaving
    },
    verifyCode: (code, { backup, trustDevice }) =>
      call("/mfa", { code, backup, trustDevice }),
    completeHospitalSignIn: (code) => call("/oidc/exchange", { code }),
    async signOut() {
      await call("/logout").catch(() => {});
    },
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
    requestPasswordReset: (email) => call("/password/forgot", { email }),
    resetPassword: (token, next) => call("/password/reset", { token, next }),
    listDevices: () => call("/devices", undefined, "GET"),
    signOutDevice: (id) =>
      call(`/devices/${encodeURIComponent(id)}`, undefined, "DELETE"),
    signOutEverywhere: () => call("/devices/sign-out-all"),
  };
}
