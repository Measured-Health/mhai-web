import { describe, expect, it } from "vitest";
import type { GuardedOut, UsageAlertsOut } from "@/lib/api/admin-contract";
import { USAGE_ALERTS_SCHEMA } from "@/lib/api/admin-schema";
import { mockAdminWith, sampleAlerts } from "@/tests/admin";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  HANDLING_LABEL,
  NO_DATA,
  minutesLabel,
  readAlerts,
  shown,
  valueText,
} from "./alert-usage";

const g = (value: number): GuardedOut => ({ value, suppressed: false });
const hidden = (): GuardedOut => ({ value: null, suppressed: true });

describe("readAlerts", () => {
  it("reads null as no record source: the group is left out", () => {
    expect(readAlerts({ alerts: null })).toEqual({ state: "off" });
  });

  it("reads core's unavailable block as couldn't load (R2)", () => {
    expect(readAlerts({ alerts: { unavailable: true } })).toEqual({
      state: "failed",
    });
  });

  it("reads the sample as ready, and the sample is core's exact shape", async () => {
    for (const p of ["this_month", "last_month", "last_90_days"] as const) {
      const a = await sampleAlerts(p);
      expect(USAGE_ALERTS_SCHEMA.safeParse(a).success).toBe(true);
      expect(readAlerts({ alerts: a })).toEqual({ state: "ready", alerts: a });
    }
    const edge = (await mockAdminWith("edge").getUsage("this_month")).alerts;
    expect(USAGE_ALERTS_SCHEMA.safeParse(edge).success).toBe(true);
    expect(readAlerts({ alerts: edge }).state).toBe("ready");
  });

  it("refuses a shown count from 1 to 4 anywhere (Review Focus 2)", async () => {
    const a = await sampleAlerts();
    const bad: UsageAlertsOut = {
      ...a,
      by_route: { ...a.by_route, named: g(3) },
    };
    expect(readAlerts({ alerts: bad }).state).toBe("failed");
  });

  it("refuses one hidden part beside a shown total: total minus the rest gives it away", async () => {
    const a = await sampleAlerts();
    const bad: UsageAlertsOut = {
      ...a,
      by_severity: { ...a.by_severity, critical: hidden() },
    };
    expect(readAlerts({ alerts: bad }).state).toBe("failed");
  });

  it("refuses a hidden total whose parts are all shown: their sum gives it away", async () => {
    const a = await sampleAlerts();
    expect(readAlerts({ alerts: { ...a, total: hidden() } }).state).toBe(
      "failed",
    );
  });

  it("allows one hidden route: one alert can go to both, so nothing adds up", async () => {
    const a = await sampleAlerts();
    const ok: UsageAlertsOut = {
      ...a,
      by_route: { ...a.by_route, named: hidden() },
    };
    expect(readAlerts({ alerts: ok }).state).toBe("ready");
  });
});

describe("values under the small-group rule", () => {
  it("hides a suppressed value and any count from 1 to 4", () => {
    expect(shown(hidden())).toEqual({ kind: "hidden" });
    expect(shown({ value: 12, suppressed: true })).toEqual({ kind: "hidden" });
    expect(shown(g(4))).toEqual({ kind: "hidden" });
    expect(shown(g(0))).toEqual({ kind: "value", value: 0 });
    expect(shown(g(5))).toEqual({ kind: "value", value: 5 });
    expect(shown(undefined)).toEqual({ kind: "none" });
  });

  it("writes values in plain words", () => {
    expect(valueText(shown(hidden()))).toBe("Fewer than 5");
    expect(valueText(shown(g(1284)))).toBe("1,284");
    expect(valueText({ kind: "none" })).toBe(NO_DATA);
    expect(minutesLabel(22)).toBe("22 min");
    expect(minutesLabel(96)).toBe("1.6 h");
  });
});

describe("labels", () => {
  it("names every one of core's categories and handling states in plain words", () => {
    expect(CATEGORY_ORDER).toEqual([
      "blood_chemistry",
      "blood_count",
      "kidney_function",
      "blood_gases_lactate",
      "heart_markers",
      "blood_sugar",
      "vital_signs",
      "infection_markers",
    ]);
    for (const l of [
      ...Object.values(CATEGORY_LABEL),
      ...Object.values(HANDLING_LABEL),
    ]) {
      expect(l).not.toMatch(/_|lab/i);
    }
  });
});
