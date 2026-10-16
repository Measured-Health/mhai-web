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
    } | null;
    throw new AuthError(
      KNOWN.has(data?.code as AuthErrorCode)
        ? (data!.code as AuthErrorCode)
        : "unavailable",
    );
  }

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
    async regenerateBackupCodes() {
      const r = await call<{ backupCodes: string[] }>("/mfa/recovery-codes");
      return r.backupCodes;
    },
    requestPasswordReset: (email) => call("/password/forgot", { email }),
    resetPassword: (token, next) => call("/password/reset", { token, next }),
    listDevices: () => call("/devices", undefined, "GET"),
    signOutDevice: (id) =>
      call(`/devices/${encodeURIComponent(id)}`, undefined, "DELETE"),
    signOutEverywhere: () => call("/devices/sign-out-all"),
  };
}
