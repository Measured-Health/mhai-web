// The demo's EMR rule sets, built on the mock core. Memory only. It refuses
// what core refuses (openapi 1.20.0), in core's order: the body (422), the
// hospital (404), the rate (429), then the code; with patient records off
// on the deployment, a switch is 503 `not_ready`. Synthetic values only.
import { ApiError } from "@mhai/api-client/errors";
import type { MockCore } from "./mock";
import {
  RULE_SET_SHA256,
  RULE_SET_VERSION,
  type EmrRuleSet,
  type EmrRuleSetClient,
} from "./emr-rule-set-contract";

const D = 24 * 3_600_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
/** The demo's synthetic rule set: not a real file's hash. */
export const DEMO_RULE_SET = {
  version: "0-synthetic",
  sha256: "5a1e".repeat(16),
} as const;

const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};

export type EmrRuleSetMockOptions = {
  /** Patient records are on for the deployment (core's `CORE_EMR_ENABLED`). */
  emrEnabled?: boolean;
};

export function emrRuleSetMock(
  core: MockCore,
  { emrEnabled = true }: EmrRuleSetMockOptions = {},
): EmrRuleSetClient {
  const { now } = core;
  const iso = (ms: number) => new Date(ms).toISOString();
  // Havana sends alerts; every other hospital is in shadow.
  const sets = new Map<string, Omit<EmrRuleSet, "hospital_id">>([
    ["h_havana", { ...DEMO_RULE_SET, activated_at: iso(now() - 6 * D) }],
  ]);
  const writes = new Map<string, number[]>();
  const shown = (id: string): EmrRuleSet => ({
    hospital_id: id,
    ...(sets.get(id) ?? { version: null, sha256: null, activated_at: null }),
  });

  return {
    getEmrRuleSet: (id) =>
      core.read(() => {
        core.findHospital(id);
        return shown(id);
      }),
    setEmrRuleSet: (id, body, opts) =>
      core.write(opts, async (m) => {
        if (!emrEnabled) fail(503, "not_ready");
        const b = body as unknown as Record<string, unknown>;
        const v = b?.version;
        const s = b?.sha256;
        if (
          !("version" in b) ||
          !("sha256" in b) ||
          (v === null) !== (s === null) ||
          (v !== null &&
            !(typeof v === "string" && RULE_SET_VERSION.test(v))) ||
          (s !== null && !(typeof s === "string" && RULE_SET_SHA256.test(s)))
        )
          fail(422, "validation_failed");
        core.findHospital(id);
        const recent = (writes.get(m.id) ?? []).filter(
          (t) => t > now() - RATE_WINDOW_MS,
        );
        if (recent.length >= RATE_MAX) fail(429, "rate_limited");
        writes.set(m.id, [...recent, now()]);
        await core.checkCode(m, body);
        sets.set(id, {
          version: v as string | null,
          sha256: s as string | null,
          activated_at: iso(now()),
        });
        return shown(id);
      }),
  };
}
