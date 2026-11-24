import { ApiError, refusal } from "./errors";

/** A step-up as the API takes it: the app's code, or a backup code. */
export type StepUpCode = { mfa_code: string } | { backup_code: string };

/** The new app's key as the BFF returns it. */
export interface MfaReplace {
  otpauthUri: string;
  secret: string;
}

const isReplace = (v: unknown): v is MfaReplace => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    Object.keys(o).length === 2 &&
    typeof o.otpauthUri === "string" &&
    o.otpauthUri.startsWith("otpauth://totp/") &&
    typeof o.secret === "string" &&
    /^[A-Z2-7]{16,128}$/.test(o.secret)
  );
};

/**
 * Moving two-step to a new app, through the app's own BFF routes
 * (`/api/auth/mfa/replace` and `/confirm`). One Idempotency-Key per call.
 * Refusals are `ApiError`s carrying the BFF's status and code only; no
 * network is `ApiError(0, "network")`.
 */
export function mfaReplaceCalls(
  fetchImpl: typeof fetch = (...a) => fetch(...a),
) {
  async function post(
    path: string,
    body: unknown,
    key: string,
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(`/api/auth/mfa/replace${path}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.ok) return res.status === 204 ? undefined : res.json();
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    throw refusal(res.status, data);
  }
  return {
    async start(code: StepUpCode, key: string): Promise<MfaReplace> {
      const r = await post("", code, key).catch((e: unknown) => {
        throw e instanceof ApiError ? e : new ApiError(502, "unavailable");
      });
      if (!isReplace(r)) throw new ApiError(502, "unavailable");
      return { otpauthUri: r.otpauthUri, secret: r.secret };
    },
    async confirm(code: string, key: string): Promise<void> {
      await post("/confirm", { code }, key);
    },
  };
}
