import { POSITION_ORDER } from "@mhai/ui/clearances";
import type { ClearanceClient } from "./clearances";
import type { StepUp } from "./clearances-contract";
import type { WriteOpts } from "./contract";
import { apiBlob, apiOk, apiRequest, keyHeader } from "./request";
import { refusal } from "@mhai/api-client/errors";

/** Page images the proxy lets through (the sample pages are SVG; real ones never are). */
const PAGE_TYPES = ["image/png", "image/jpeg"] as const;

/** The admin's own two-step code, as the API takes it. */
const code = (a: StepUp) =>
  "mfaCode" in a ? { mfa_code: a.mfaCode } : { backup_code: a.backupCode };

/** The clearance-letter API through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveClearances({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): ClearanceClient {
  const id = encodeURIComponent;
  const post = <T>(path: string, body: unknown, opts?: WriteOpts) =>
    apiOk<T>(fetchImpl, path, {
      method: "POST",
      body,
      headers: keyHeader(opts),
      keepalive: opts?.keepalive,
    });

  return {
    async getNamedAccess() {
      const { res, data } = await apiRequest(
        fetchImpl,
        "/analysis/named-access",
      );
      // 404: the key is off, so nothing about names exists here.
      if (res.status === 404) return { position: "off", since: null };
      if (!res.ok) throw refusal(res.status, data);
      // Anything unexpected fails closed to Off.
      const position = POSITION_ORDER.find((p) => p === data?.position);
      return position
        ? {
            position,
            since: typeof data?.since === "string" ? data.since : null,
          }
        : { position: "off", since: null };
    },
    listClearances: () => apiOk(fetchImpl, "/hospital/clearances"),
    getClearance: (c) => apiOk(fetchImpl, `/hospital/clearances/${id(c)}`),
    uploadClearance(u, opts) {
      const form = new FormData();
      form.append("file", u.file);
      form.append("signed_by", u.signed_by);
      form.append("signer_title", u.signer_title);
      form.append("letter_date", u.letter_date);
      for (const s of u.covered) form.append("covered", s);
      for (const e of u.covered_platform ?? [])
        form.append("covered_platform", e);
      form.append("end_date", u.end_date);
      if (u.renews) form.append("renews", u.renews);
      for (const [k, v] of Object.entries(code(u))) form.append(k, v);
      return apiOk(fetchImpl, "/hospital/clearances", {
        method: "POST",
        form,
        headers: keyHeader(opts),
      });
    },
    revokeClearance(c, { reason, note, version, ...auth }, opts) {
      return post(
        `/hospital/clearances/${id(c)}/revoke`,
        {
          reason,
          ...(note ? { note } : {}),
          ...(version !== undefined ? { version } : {}),
          ...code(auth as StepUp),
        },
        opts,
      );
    },
    narrowClearance(c, { remove, reason, note, version, ...auth }, opts) {
      return post(
        `/hospital/clearances/${id(c)}/narrow`,
        {
          remove,
          reason,
          ...(note ? { note } : {}),
          version,
          ...code(auth as StepUp),
        },
        opts,
      );
    },
    getClearancePage: (c, n) =>
      apiBlob(
        fetchImpl,
        `/hospital/clearances/${id(c)}/pages/${Math.trunc(n)}`,
        PAGE_TYPES,
      ),
  };
}
