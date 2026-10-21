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
    } | null;
    throw new AuthError(
      KNOWN.has(data?.code as AuthErrorCode)
        ? (data!.code as AuthErrorCode)
        : "unavailable",
    );
  }

  /** The server refuses a hospital account with 403 `not_platform`. */
  const signInCall = async (path: string, body: unknown) => {
    try {
      return await call<SignInResult>(path, body);
    } catch (e) {
      if (e instanceof AuthError && e.code === "not_platform")
        return { status: "not_platform" } as const;
      throw e;
    }
  };

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
    async regenerateBackupCodes() {
      const r = await call<{ backupCodes: string[] }>("/mfa/recovery-codes");
      return r.backupCodes;
    },
    listDevices: () => call<Device[]>("/devices", undefined, "GET"),
    signOutDevice,
    async signOutEverywhere() {
      // Every other session, then this one.
      const devices = await call<Device[]>("/devices", undefined, "GET");
      for (const d of devices) if (!d.current) await signOutDevice(d.id);
      await call("/logout").catch(() => {});
    },
  };
}
