import { describe, expect, it } from "vitest";
import type {
  ChangeOut,
  MeasureOut,
  UsageAlertsOut,
} from "@/lib/api/admin-contract";
import { flagWord } from "@/lib/notifications/alert-view";
import { mockAdminWith, sampleAlerts } from "@/tests/admin";
import {
  ALERTS_FAILED,
  NOTHING_UNUSUAL,
  bucketLabel,
  changeFor,
  changeText,
  criticalTargetLabel,
  findingLabel,
  placeLabel,
  readAlerts,
  risingLine,
  seriesSummary,
  shown,
  unusualLine,
  valueText,
  verdict,
  whatChanged,
  worseningLine,
} from "./alert-usage";

const up = (amount: number, previous: number): ChangeOut => ({
  direction: "up",
  amount,
  previous,
});
const m = (
  value: number | null,
  change: ChangeOut | null = null,
  suppressed = false,
): MeasureOut => ({ value, suppressed, change });
const hidden = (): MeasureOut => m(null, null, true);

/** The sample with a field replaced, possibly by something unreadable. */
const broken = (a: UsageAlertsOut, over: Record<string, unknown>) =>
  ({ ...a, ...over }) as unknown as UsageAlertsOut;
/** The sample without one field (an older or half-built block). */
const without = (a: UsageAlertsOut, key: keyof UsageAlertsOut) => {
  const copy: Partial<UsageAlertsOut> = { ...a };
  delete copy[key];
  return copy as UsageAlertsOut;
};
const stateOf = (a: UsageAlertsOut) => readAlerts({ alerts: a }).state;

describe("readAlerts", () => {
  it("reads null or a missing field as switched off (Review Focus 5)", () => {
    expect(readAlerts({ alerts: null })).toEqual({ state: "off" });
    expect(readAlerts({})).toEqual({ state: "off" });
  });

  it("reads an unavailable or half-built block as couldn't load (Review Focus 1)", async () => {
    expect(readAlerts({ alerts: { unavailable: true } })).toEqual({
      state: "failed",
    });
    const a = await sampleAlerts();
    expect(stateOf(without(a, "total"))).toBe("failed");
    expect(stateOf(broken(a, { series: null }))).toBe("failed");
    expect(readAlerts({ alerts: a })).toEqual({ state: "ready", alerts: a });
  });

  it("reads a half-built series as couldn't load, never as zero or calm (F4)", async () => {
    const a = await sampleAlerts();
    const pts = a.series.points;
    const withPoint = (i: number, over: Record<string, unknown>) =>
      broken(a, {
        series: {
          ...a.series,
          points: pts.map((p, j) => (j === i ? { ...p, ...over } : p)),
        },
      });
    expect(
      stateOf(broken(a, { series: { ...a.series, bucket: "month" } })),
    ).toBe("failed");
    expect(stateOf(withPoint(3, { total: undefined }))).toBe("failed");
    expect(stateOf(withPoint(3, { total: "8" }))).toBe("failed");
    expect(stateOf(withPoint(3, { total: Number.NaN }))).toBe("failed");
    expect(stateOf(withPoint(3, { total: -1 }))).toBe("failed");
    expect(stateOf(withPoint(3, { start: null }))).toBe("failed");
    expect(stateOf(withPoint(3, { start: "14 Oct" }))).toBe("failed");
    expect(stateOf(withPoint(3, { start: "2026-02-31" }))).toBe("failed");
    expect(stateOf(withPoint(3, { start: pts[2]!.start }))).toBe("failed");
    expect(stateOf(withPoint(13, { usual_multiple: Number.NaN }))).toBe(
      "failed",
    );
    // A flag that says "not unusual" is unreadable: it must not read as calm.
    expect(stateOf(withPoint(13, { usual_multiple: 0.8 }))).toBe("failed");
    // Every total bad: never "No alerts in this period".
    expect(
      stateOf(
        broken(a, {
          series: {
            ...a.series,
            points: pts.map((p) => ({ ...p, total: null })),
          },
        }),
      ),
    ).toBe("failed");
  });

  it("reads malformed flags as couldn't load, never Nothing unusual (F5)", async () => {
    const a = await sampleAlerts();
    const [finding, location] = a.rising;
    expect(stateOf(broken(a, { rising: null }))).toBe("failed");
    expect(
      stateOf(broken(a, { rising: [{ ...finding, kind: "ward" }, location] })),
    ).toBe("failed");
    expect(
      stateOf(broken(a, { rising: [{ ...finding, count: "31" }, location] })),
    ).toBe("failed");
    expect(
      stateOf(
        broken(a, { rising: [finding, { ...location, previous: Number.NaN }] }),
      ),
    ).toBe("failed");
    expect(stateOf(broken(a, { worsening: { value: 0.71 } }))).toBe("failed");
    expect(
      stateOf(broken(a, { worsening: { value: "0.71", previous: 0.88 } })),
    ).toBe("failed");
    expect(stateOf(broken(a, { worsening: null }))).toBe("ready");
  });

  it("reads an unreadable target or value as couldn't load (F17)", async () => {
    const a = await sampleAlerts();
    for (const t of [Number.NaN, 0, -15, Infinity, "15"])
      expect(stateOf(broken(a, { critical_target_minutes: t }))).toBe("failed");
    // A count always has a number or is hidden; null with no flag is unreadable.
    expect(stateOf(broken(a, { total: m(null) }))).toBe("failed");
    expect(stateOf(broken(a, { unhandled: m(-2) }))).toBe("failed");
    expect(stateOf(broken(a, { unhandled: m(2.5) }))).toBe("failed");
    expect(stateOf(broken(a, { critical_within_target: m(1.4) }))).toBe(
      "failed",
    );
    expect(stateOf(broken(a, { median_ack_minutes: m(-1) }))).toBe("failed");
    expect(
      stateOf(
        broken(a, {
          total: m(128, {
            direction: "sideways",
            amount: 3,
            previous: 95,
          } as unknown as ChangeOut),
        }),
      ),
    ).toBe("failed");
    expect(stateOf(broken(a, { total: m(128, up(Number.NaN, 95)) }))).toBe(
      "failed",
    );
    // A median with nothing to measure is fine: it reads "No data yet".
    expect(stateOf(broken(a, { median_ack_minutes: m(null) }))).toBe("ready");
  });

  it("needs all four dismissal reasons, each readable", async () => {
    const a = await sampleAlerts();
    expect(
      stateOf(broken(a, { dismiss_reasons: a.dismiss_reasons.slice(1) })),
    ).toBe("failed");
    expect(
      stateOf(
        broken(a, {
          dismiss_reasons: [
            ...a.dismiss_reasons.slice(1),
            { reason: "bored", count: { value: 9, suppressed: false } },
          ],
        }),
      ),
    ).toBe("failed");
    expect(
      stateOf(
        broken(a, {
          top_findings: [{ name: "Sodium", flag: "low", count: 24 }],
        }),
      ),
    ).toBe("failed");
  });

  it("refuses a block whose hidden values could be worked out from the rest (F7)", async () => {
    const a = await sampleAlerts();
    // Info 3 with Alerts 128, Critical 17, Urgent 46: shown as "Fewer than 5"
    // it would still be 128 - 17 - 46 - ... on screen. Nothing is shown.
    expect(
      stateOf(
        broken(a, {
          by_severity: { ...a.by_severity, info: m(3, up(50, 2)) },
        }),
      ),
    ).toBe("failed");
    // One severity hidden alone is the total minus the others.
    expect(
      stateOf(
        broken(a, { by_severity: { ...a.by_severity, critical: hidden() } }),
      ),
    ).toBe("failed");
    expect(stateOf(broken(a, { total: hidden() }))).toBe("failed");
    // One reason hidden alone, or a raw 1 to 4 among them.
    const [r0, r1, r2, r3] = a.dismiss_reasons;
    expect(
      stateOf(
        broken(a, {
          dismiss_reasons: [
            r0,
            r1,
            r2,
            { ...r3!, count: { value: 6, suppressed: false } },
          ],
        }),
      ),
    ).toBe("failed");
    expect(
      stateOf(
        broken(a, {
          dismiss_reasons: [
            r0,
            { ...r1!, count: { value: 2, suppressed: false } },
            r2,
            r3,
          ],
        }),
      ),
    ).toBe("failed");
    // One outcome share hidden alone is 100% minus the other.
    expect(stateOf(broken(a, { dismissed_share: hidden() }))).toBe("failed");
    // Hidden together, as the server does it, is fine.
    expect(
      stateOf(
        broken(a, {
          acknowledged_share: hidden(),
          dismissed_share: hidden(),
        }),
      ),
    ).toBe("ready");
    const edge = (await mockAdminWith("edge").getUsage("this_month")).alerts;
    expect(readAlerts({ alerts: edge }).state).toBe("ready");
  });
});

describe("values under the small-group rule", () => {
  it("hides a suppressed value and any count from 1 to 4 (Review Focus 2)", () => {
    expect(shown({ value: 12, suppressed: true }, "count")).toEqual({
      kind: "hidden",
    });
    expect(shown({ value: 3, suppressed: false }, "count")).toEqual({
      kind: "hidden",
    });
    expect(shown({ value: 0, suppressed: false }, "count")).toEqual({
      kind: "value",
      value: 0,
    });
    expect(shown({ value: null, suppressed: false }, "minutes")).toEqual({
      kind: "none",
    });
    expect(shown(undefined, "count")).toEqual({ kind: "none" });
    // Shares and medians trust the server's flag: 0.04 is a share, not a count.
    expect(shown({ value: 0.04, suppressed: false }, "share")).toEqual({
      kind: "value",
      value: 0.04,
    });
  });

  it("writes values in plain words, never 0 for nothing measured", () => {
    expect(valueText({ kind: "value", value: 1284 }, "count")).toBe("1,284");
    expect(valueText({ kind: "value", value: 22 }, "minutes")).toBe("22 min");
    expect(valueText({ kind: "value", value: 95 }, "minutes")).toBe("1.6 h");
    expect(valueText({ kind: "value", value: 59.7 }, "minutes")).toBe("1 h");
    expect(valueText({ kind: "value", value: 0.71 }, "share")).toBe("71%");
    expect(valueText({ kind: "hidden" }, "count")).toBe("Fewer than 5");
    expect(valueText({ kind: "none" }, "minutes")).toBe("No data yet");
  });
});

describe("changes", () => {
  it("writes changes per kind and period", () => {
    expect(changeText(up(35, 95), "count", "this_month")).toBe(
      "up 35% vs last month",
    );
    expect(
      changeText(
        { direction: "down", amount: 2, previous: 18 },
        "minutes",
        "last_month",
      ),
    ).toBe("down 2 min vs the month before");
    expect(
      changeText(
        { direction: "down", amount: 17, previous: 0.88 },
        "share",
        "this_month",
      ),
    ).toBe("down 17 points vs last month");
    expect(changeText(up(1, 0.8), "share", "last_90_days")).toBe(
      "up 1 point vs the 90 days before",
    );
    expect(
      changeText(
        { direction: "same", amount: 0, previous: 9 },
        "count",
        "this_month",
      ),
    ).toBe("no change vs last month");
    expect(changeText(up(0.3, 10), "minutes", "this_month")).toBe(
      "no change vs last month",
    );
  });

  it("reads only response times as better or worse", () => {
    expect(verdict(up(6, 16), "lower")).toBe("worse");
    expect(
      verdict({ direction: "down", amount: 2, previous: 18 }, "lower"),
    ).toBe("better");
    expect(
      verdict({ direction: "down", amount: 17, previous: 0.88 }, "higher"),
    ).toBe("worse");
    expect(verdict(up(35, 95), null)).toBeNull();
    expect(
      verdict({ direction: "same", amount: 0, previous: 1 }, "lower"),
    ).toBeNull();
  });

  it("shows no change beside a hidden or missing value (Review Focus 4)", () => {
    expect(changeFor(m(40, up(10, 36)), "count", true)).toEqual(up(10, 36));
    expect(changeFor(m(null, up(10, 36), true), "count", true)).toBeNull();
    expect(changeFor(m(3, up(50, 2)), "count", true)).toBeNull();
    expect(changeFor(m(40, up(900, 4)), "count", true)).toBeNull();
    expect(changeFor(m(null, up(2, 9)), "minutes", true)).toBeNull();
    expect(changeFor(m(40, null), "count", true)).toBeNull();
    expect(changeFor(undefined, "count", true)).toBeNull();
  });

  it("ignores every change and flag without a previous period (Review Focus 3)", async () => {
    const a = await sampleAlerts("this_month");
    expect(changeFor(a.total, "count", false)).toBeNull();
    expect(whatChanged({ ...a, has_previous: false })).toEqual({
      kind: "no_previous",
    });
  });
});

describe("labels", () => {
  it("names the target, the buckets and the groups", () => {
    expect(criticalTargetLabel(15)).toBe("Critical handled within 15 min");
    expect(criticalTargetLabel(10)).toBe("Critical handled within 10 min");
    expect(bucketLabel("2026-10-14", "day")).toBe("14 Oct");
    expect(bucketLabel("2026-09-02", "day")).toBe("2 Sep");
    expect(bucketLabel("2026-10-06", "week")).toBe("Week of 6 Oct");
    expect(findingLabel({ name: "Potassium", flag: "low" })).toBe(
      "Potassium · low",
    );
    expect(findingLabel({ name: "Troponin", flag: null })).toBe("Troponin");
    expect(findingLabel({ name: "Troponin", flag: "odd" })).toBe(
      "Troponin · abnormal",
    );
    expect(findingLabel({ name: null, flag: null })).toBe("Not standardised");
    expect(placeLabel({ kind: "admitted", ward: "Ward 3", bed: "12" })).toBe(
      "Ward 3",
    );
    expect(
      placeLabel({ kind: "outpatient", clinic: "Cardiology clinic" }),
    ).toBe("Outpatient · Cardiology clinic");
    expect(placeLabel({ kind: "emergency" })).toBe("Emergency department");
    expect(placeLabel(null)).toBe("Location not recorded");
  });

  it("shares the flag words with the alert cards (F11)", () => {
    expect(flagWord("low")).toBe("low");
    expect(flagWord("high")).toBe("high");
    expect(flagWord("odd")).toBe("abnormal");
    expect(flagWord(null)).toBeNull();
  });

  it("sums up the series in one line", () => {
    expect(
      seriesSummary({
        bucket: "day",
        points: [
          { start: "2026-10-13", total: 8, usual_multiple: null },
          { start: "2026-10-14", total: 23, usual_multiple: 3.1 },
        ],
      }),
    ).toBe("Most alerts on 14 Oct: 23");
    expect(
      seriesSummary({
        bucket: "week",
        points: [{ start: "2026-10-03", total: 45, usual_multiple: null }],
      }),
    ).toBe("Most alerts in the week of 3 Oct: 45");
    expect(
      seriesSummary({
        bucket: "day",
        points: [{ start: "2026-10-01", total: 0, usual_multiple: null }],
      }),
    ).toBe("No alerts in this period");
    expect(seriesSummary({ bucket: "day", points: [] })).toBe(
      "No alerts in this period",
    );
  });

  it("writes the flags", () => {
    expect(
      unusualLine(
        { start: "2026-10-14", total: 23, usual_multiple: 3.1 },
        "day",
      ),
    ).toBe("14 Oct: 23 alerts, about 3× the usual");
    expect(
      unusualLine(
        { start: "2026-10-06", total: 41, usual_multiple: 1.44 },
        "week",
      ),
    ).toBe("Week of 6 Oct: 41 alerts, about 1.4× the usual");
    expect(
      risingLine({
        kind: "finding",
        name: "Potassium",
        flag: "low",
        count: 31,
        previous: 9,
      }),
    ).toBe("Potassium · low: 31, up from 9");
    expect(
      risingLine({
        kind: "location",
        location: { kind: "admitted", ward: "Ward 3", bed: null },
        count: 34,
        previous: 12,
      }),
    ).toBe("Ward 3: 34, up from 12");
    expect(worseningLine({ value: 0.71, previous: 0.88 }, 15)).toBe(
      "Critical within 15 min: 71%, down from 88%",
    );
  });
});

describe("whatChanged", () => {
  it("lists worsening, busy days, then rising findings and locations", async () => {
    const w = whatChanged(await sampleAlerts("this_month"));
    expect(w.kind === "items" && w.items.map((i) => i.text)).toEqual([
      "Critical within 15 min: 71%, down from 88%",
      "14 Oct: 23 alerts, about 3× the usual",
      "Potassium · low: 31, up from 9",
      "Ward 3: 34, up from 12",
    ]);
  });

  it("says nothing unusual when nothing is flagged", async () => {
    expect(whatChanged(await sampleAlerts("last_month"))).toEqual({
      kind: "nothing",
    });
    expect(NOTHING_UNUSUAL).toBe("Nothing unusual this period");
    expect(ALERTS_FAILED).toBe("Couldn't load patient alerts");
  });

  it("drops small rising groups (Review Focus 2)", async () => {
    const a = await sampleAlerts("this_month");
    const w = whatChanged({
      ...a,
      worsening: null,
      series: { ...a.series, points: [] },
      rising: [
        { kind: "finding", name: "Sodium", flag: "low", count: 3, previous: 9 },
        { kind: "location", location: null, count: 12, previous: 2 },
      ],
    });
    expect(w).toEqual({ kind: "nothing" });
  });

  it("drops worsening when the Critical share is hidden", async () => {
    const a = await sampleAlerts("this_month");
    const w = whatChanged({ ...a, critical_within_target: hidden() });
    expect(w.kind === "items" && w.items.map((i) => i.kind)).toEqual([
      "busy",
      "rising",
      "rising",
    ]);
  });

  it("drops worsening when the previous share isn't shown (F6)", async () => {
    // The server sends no change when the previous period's share was hidden:
    // "down from 88%" would reveal it.
    const a = await sampleAlerts("this_month");
    const w = whatChanged({ ...a, critical_within_target: m(0.71, null) });
    expect(w.kind === "items" && w.items.map((i) => i.kind)).toEqual([
      "busy",
      "rising",
      "rising",
    ]);
  });
});
