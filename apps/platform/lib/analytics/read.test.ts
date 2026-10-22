import { describe, expect, it } from "vitest";
import {
  MEASURES,
  type AlertsRow,
  type AnalyticsOut,
  type Guarded,
  type Period,
} from "../api/analytics-contract";
import {
  buildAnalytics,
  buildSeries,
  seedChanges,
  type AnalyticsMode,
} from "../api/analytics-fixtures";
import { noPrevious } from "./changes";
import { measureText, valueText } from "./measures";
import {
  AREAS,
  NOTHING_UNUSUAL,
  NOT_ENOUGH_TO_COMPARE,
  failedText,
  readAnalytics,
  readSeries,
  type AnalyticsState,
} from "./read";

const NOW = Date.parse("2026-10-22T09:30:00.000Z");
const sample = (mode: AnalyticsMode = "normal", period: Period = "30d") =>
  buildAnalytics(period, NOW, mode, seedChanges(NOW, mode));

type Ok<T> = Exclude<T, { unavailable: true }>;
function ok<T>(v: T): Ok<T> {
  if (v && typeof v === "object" && "unavailable" in v)
    throw new Error("area unavailable");
  return v as Ok<T>;
}
function okState<K extends keyof AnalyticsState>(s: AnalyticsState, k: K) {
  const a = s[k];
  if (a.status !== "ok") throw new Error(`${k} failed`);
  return a as Extract<AnalyticsState[K], { status: "ok" }>;
}
const row = <R extends { hospital: { id: string } }>(rows: R[], id: string) => {
  const r = rows.find((x) => x.hospital.id === id);
  if (!r) throw new Error(`no row ${id}`);
  return r;
};
const statuses = (s: AnalyticsState) =>
  Object.fromEntries(AREAS.map((k) => [k, s[k].status]));
const ALL_OK = {
  changes: "ok",
  use: "ok",
  alerts: "ok",
  quality: "ok",
  hospitals: "ok",
};
const HIDDEN = { value: null, suppressed: true };
const v = (value: number | null) => ({ value, suppressed: false });

/** A copy of the sample with one change made to it. */
function edit(f: (a: AnalyticsOut) => void, mode: AnalyticsMode = "normal") {
  const a = structuredClone(sample(mode));
  f(a);
  return a;
}
const useRows = (a: AnalyticsOut) => ok(a.use).rows;
const alertRows = (a: AnalyticsOut) => ok(a.alerts).rows;
const qualityRows = (a: AnalyticsOut) => ok(a.quality).rows;
const items = (a: AnalyticsOut) => ok(a.changes).items;

describe("readAnalytics: the sample data", () => {
  it("every period of the demo reads", () => {
    for (const p of ["7d", "30d", "90d"] as const)
      expect(statuses(readAnalytics(sample("normal", p)))).toEqual(ALL_OK);
  });

  it("0 shows, 1–4 hidden, never through a rate or median", () => {
    const s = readAnalytics(sample());
    const use = okState(s, "use");
    // Hilltop: zeros show as 0; nothing to divide by.
    const hilltop = row(use.rows, "h_hilltop");
    expect(valueText(hilltop.questions, "count")).toBe("0");
    expect(valueText(hilltop.active_clinicians, "count")).toBe("0");
    expect(valueText(hilltop.questions_per_clinician, "rate")).toBe(
      "No data yet",
    );
    // Lakeside: its 1–4 counts are hidden and so is the rate over them.
    const lakeside = row(use.rows, "h_lakeside");
    expect(valueText(lakeside.questions, "count")).toBe("Fewer than 5");
    expect(valueText(lakeside.active_clinicians, "count")).toBe("Fewer than 5");
    expect(valueText(lakeside.questions_per_clinician, "rate")).toBe(
      "Fewer than 5",
    );
    const alerts = okState(s, "alerts");
    const la = row(alerts.rows, "h_lakeside");
    expect(la.by_severity.critical.suppressed).toBe(true);
    expect(valueText(la.critical_median_ack_minutes, "minutes")).toBe(
      "Fewer than 5",
    );
    expect(valueText(row(alerts.rows, "h_hilltop").total, "count")).toBe("0");

    // The server sends a rate over Lakeside's hidden counts: refused.
    const rate = readAnalytics(
      edit((a) => {
        row(useRows(a), "h_lakeside").questions_per_clinician = v(1.8);
      }),
    );
    expect(rate.use.status).toBe("failed");
    // A median over its hidden Critical alerts: refused.
    const median = readAnalytics(
      edit((a) => {
        row(alertRows(a), "h_lakeside").critical_median_ack_minutes = v(20);
      }),
    );
    expect(median.alerts.status).toBe("failed");
    // The all-hospitals median follows the same rule.
    const med = readAnalytics(
      edit((a) => {
        const m = ok(a.use).median;
        m.questions = HIDDEN;
        m.questions_per_clinician = v(2.5);
      }),
    );
    expect(med.use.status).toBe("failed");
  });

  it("a hidden value never carries its number past the reader", () => {
    const s = readAnalytics(
      edit((a) => {
        row(useRows(a), "h_lakeside").questions = {
          value: 3,
          suppressed: true,
        };
      }),
    );
    expect(row(okState(s, "use").rows, "h_lakeside").questions).toEqual(HIDDEN);
  });
});

describe("readAnalytics: fails closed", () => {
  it("an unsuppressed 3 fails the area closed", () => {
    const s = readAnalytics(
      edit((a) => {
        row(useRows(a), "h_lakeside").questions = v(3);
      }),
    );
    expect(s.use.status).toBe("failed");
    expect(s.alerts.status).toBe("ok");

    // In a median, in the Hospitals sizes, in a trend and in a change too.
    expect(
      readAnalytics(edit((a) => void (ok(a.alerts).median.unhandled = v(2))))
        .alerts.status,
    ).toBe("failed");
    expect(
      readAnalytics(
        edit((a) => {
          ok(a.hospitals).rows[0]!.size.questions = v(4);
        }),
      ).hospitals.status,
    ).toBe("failed");
    expect(
      readAnalytics(edit((a) => void (ok(a.use).trend[0]!.value = v(1)))).use
        .status,
    ).toBe("failed");
    expect(
      readAnalytics(
        edit((a) => {
          const c = items(a).find((c) => c.id === "chg_rch_questions")!;
          c.current = v(3);
        }),
      ).changes.status,
    ).toBe("failed");
  });

  it("a share over a hidden count fails closed", () => {
    const s = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_lakeside");
        r.answers = HIDDEN;
        r.needs_review_share = v(0.2);
      }),
    );
    expect(s.quality.status).toBe("failed");
    const w = readAnalytics(
      edit((a) => {
        row(alertRows(a), "h_lakeside").critical_within_target = v(0.7);
      }),
    );
    expect(w.alerts.status).toBe("failed");
    // A hidden side whose summary still gives the number is refused.
    const c = readAnalytics(
      edit((a) => {
        items(a)[0]!.previous = HIDDEN;
      }),
    );
    expect(c.changes.status).toBe("failed");
  });

  it("a share whose numerator works out to 1–4 fails closed", () => {
    // 50 answers × 6% needing review = 3.
    const nr = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_havana");
        r.answers = v(50);
        r.needs_review_share = v(0.06);
      }),
    );
    expect(nr.quality.status).toBe("failed");
    // 50 answers × 94% leaves 3 not needing review.
    const rest = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_havana");
        r.answers = v(50);
        r.needs_review_share = v(0.94);
      }),
    );
    expect(rest.quality.status).toBe("failed");
    // 20 Critical × 90% within target leaves 2 outside it.
    const within = (share: number) =>
      readAnalytics(
        edit((a) => {
          const r = row(alertRows(a), "h_havana");
          const sev = r.by_severity;
          sev.critical = v(20);
          r.total = v(20 + sev.urgent.value! + sev.info.value!);
          r.critical_within_target = v(share);
        }),
      ).alerts.status;
    expect(within(0.9)).toBe("failed");
    expect(within(0.1)).toBe("failed");
    expect(within(0.5)).toBe("ok");
  });

  it("agreement is hidden over hidden reviews or 1–4 disagreements", () => {
    const hiddenReviews = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_havana");
        r.reviews = HIDDEN;
        r.median_review_hours = HIDDEN;
      }),
    );
    expect(hiddenReviews.quality.status).toBe("failed");
    const hours = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_havana");
        r.reviews = HIDDEN;
        r.agreement_rate = HIDDEN;
      }),
    );
    expect(hours.quality.status).toBe("failed");
    // 50 reviews × (1 − 96%) = 2 disagreements.
    const two = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_havana");
        r.reviews = v(50);
        r.agreement_rate = v(0.96);
      }),
    );
    expect(two.quality.status).toBe("failed");
    // Every hidden together reads, as the server sends it.
    const all = readAnalytics(
      edit((a) => {
        const r = row(qualityRows(a), "h_havana");
        r.reviews = HIDDEN;
        r.agreement_rate = HIDDEN;
        r.median_review_hours = HIDDEN;
      }),
    );
    expect(all.quality.status).toBe("ok");
  });

  it("a median that isn't a whole number reads; one under 5 doesn't", () => {
    const half = readAnalytics(
      edit((a) => void (ok(a.use).median.questions = v(125.5))),
    );
    expect(half.use.status).toBe("ok");
    expect(
      readAnalytics(edit((a) => void (ok(a.use).median.questions = v(2.5)))).use
        .status,
    ).toBe("failed");
    expect(
      readAnalytics(edit((a) => void (ok(a.alerts).median.total = v(4.5))))
        .alerts.status,
    ).toBe("failed");
    // A row's count is still a whole number.
    expect(
      readAnalytics(
        edit((a) => void (row(useRows(a), "h_havana").questions = v(125.5))),
      ).use.status,
    ).toBe("failed");
  });

  it("trends: a hidden point reads, an unhidden 1–4 fails", () => {
    const s = readAnalytics(
      edit((a) => {
        ok(a.use).trend[0]!.value = HIDDEN;
        ok(a.alerts).trend[1]!.value = HIDDEN;
        ok(a.quality).trend[2]!.value = HIDDEN;
      }),
    );
    expect(statuses(s)).toEqual(ALL_OK);
    expect(okState(s, "use").trend[0]!.value).toEqual(HIDDEN);
    expect(
      readAnalytics(edit((a) => void (ok(a.alerts).trend[3]!.value = v(3))))
        .alerts.status,
    ).toBe("failed");
    expect(
      readAnalytics(edit((a) => void (ok(a.quality).trend[0]!.value = v(1.5))))
        .quality.status,
    ).toBe("failed");
  });

  it("a severity set with one hidden member hides the set", () => {
    // One hidden severity beside a shown total: the total gives it away.
    const one = readAnalytics(
      edit((a) => {
        row(alertRows(a), "h_havana").by_severity.urgent = HIDDEN;
      }),
    );
    expect(one.alerts.status).toBe("failed");
    // Two hidden members whose sum the total gives as under 5.
    const pair = readAnalytics(
      edit((a) => {
        const r: AlertsRow = row(alertRows(a), "h_havana");
        r.total = v(3 + (r.by_severity.info.value ?? 0) + 0);
        r.by_severity.critical = HIDDEN;
        r.by_severity.urgent = HIDDEN;
      }),
    );
    expect(pair.alerts.status).toBe("failed");
    // The confidence mix follows the same rule.
    const mix = readAnalytics(
      edit((a) => {
        row(qualityRows(a), "h_havana").confidence.low = HIDDEN;
      }),
    );
    expect(mix.quality.status).toBe("failed");
    // Every member hidden, as the server does it: shown as hidden.
    const s = readAnalytics(sample());
    const la = row(okState(s, "alerts").rows, "h_lakeside");
    expect(Object.values(la.by_severity).every((g) => g.suppressed)).toBe(true);
  });

  it("the shape is wrong", () => {
    const bad: ((a: AnalyticsOut) => void)[] = [
      (a) => void ((ok(a.use) as { rows: unknown }).rows = "x"),
      (a) =>
        void (row(useRows(a), "h_havana").questions = { value: 7 } as never),
      (a) => void (row(useRows(a), "h_havana").questions = v(-6)),
      (a) => void (row(useRows(a), "h_havana").questions = v(6.5)),
      (a) => void ((ok(a.use) as { updated_at: unknown }).updated_at = "soon"),
      (a) => void (row(useRows(a), "h_havana").hospital.id = "h havana"),
      (a) => void useRows(a).push(structuredClone(useRows(a)[0]!)),
    ];
    for (const f of bad)
      expect(readAnalytics(edit(f)).use.status).toBe("failed");
    const share = readAnalytics(
      edit(
        (a) => void (row(qualityRows(a), "h_havana").agreement_rate = v(1.4)),
      ),
    );
    expect(share.quality.status).toBe("failed");
    const dup = readAnalytics(
      edit((a) => void items(a).push(structuredClone(items(a)[0]!))),
    );
    expect(dup.changes.status).toBe("failed");
    const dir = readAnalytics(
      edit(
        (a) => void ((items(a)[0] as { direction: string }).direction = "up"),
      ),
    );
    expect(dir.changes.status).toBe("failed");
    // Not an object at all.
    expect(statuses(readAnalytics(null as never))).toEqual({
      changes: "failed",
      use: "failed",
      alerts: "failed",
      quality: "failed",
      hospitals: "failed",
    });
  });

  it("each area fails alone", () => {
    const cases: [keyof AnalyticsState, (a: AnalyticsOut) => void][] = [
      ["use", (a) => void (row(useRows(a), "h_havana").questions = v(2))],
      ["quality", (a) => void (row(qualityRows(a), "h_havana").answers = v(1))],
      ["hospitals", (a) => void (ok(a.hospitals).rows[1]!.size.staff = -1)],
      ["changes", (a) => void (items(a)[2]!.id = "")],
    ];
    for (const [area, f] of cases) {
      const s = readAnalytics(edit(f));
      expect(statuses(s)).toEqual({ ...ALL_OK, [area]: "failed" });
    }
    // An unavailable area leaves the others alone too.
    const s = readAnalytics(
      edit((a) => void (a.quality = { unavailable: true })),
    );
    expect(statuses(s)).toEqual({ ...ALL_OK, quality: "failed" });
  });

  it("every area unavailable gives every area failed", () => {
    const s = readAnalytics(sample("unavailable"));
    expect(statuses(s)).toEqual({
      changes: "failed",
      use: "failed",
      alerts: "failed",
      quality: "failed",
      hospitals: "failed",
    });
    expect(AREAS.map(failedText)).toEqual([
      "Couldn't load what changed",
      "Couldn't load use",
      "Couldn't load alert safety",
      "Couldn't load answer quality",
      "Couldn't load hospitals",
    ]);
  });
});

describe("readAnalytics: the Critical guard", () => {
  it("the Critical guard: overdue with no serious change fails changes", () => {
    // The demo's guard mode: Northgate's serious change is gone, its
    // overdue Critical alerts (hidden as fewer than 5) stay.
    const guard = sample("guard");
    expect(
      row(alertRows(guard), "h_northgate").critical_overdue.suppressed,
    ).toBe(true);
    const s = readAnalytics(guard);
    expect(statuses(s)).toEqual({ ...ALL_OK, changes: "failed" });

    // Overdue shown above 0 with no serious change: the same.
    const shown = readAnalytics(
      edit((a) => {
        a.changes = { ...ok(a.changes), items: [] };
        row(alertRows(a), "h_havana").critical_overdue = v(6);
      }),
    );
    expect(shown.changes.status).toBe("failed");
    // A serious change for another hospital doesn't cover it.
    const other = readAnalytics(
      edit((a) => {
        row(alertRows(a), "h_havana").critical_overdue = v(7);
      }),
    );
    expect(other.changes.status).toBe("failed");
    // A non-serious change for the same hospital doesn't either.
    const notSerious = readAnalytics(
      edit((a) => {
        for (const c of items(a)) c.serious = false;
      }),
    );
    expect(notSerious.changes.status).toBe("failed");
    // With the serious change there, it reads.
    expect(readAnalytics(sample()).changes.status).toBe("ok");
  });

  it("an empty list with nothing overdue reads as nothing unusual", () => {
    const s = readAnalytics(
      edit((a) => {
        a.changes = { ...ok(a.changes), items: [] };
        for (const r of alertRows(a)) r.critical_overdue = v(0);
      }),
    );
    expect(okState(s, "changes").items).toEqual([]);
    expect(NOTHING_UNUSUAL).toBe("Nothing unusual this period");
  });

  it("alerts unavailable fails changes too", () => {
    const s = readAnalytics(
      edit((a) => void (a.alerts = { unavailable: true })),
    );
    expect(statuses(s)).toEqual({
      ...ALL_OK,
      alerts: "failed",
      changes: "failed",
    });
    // Alerts that fail their own checks can't be trusted for the guard either.
    const bad = readAnalytics(
      edit((a) => void (row(alertRows(a), "h_havana").unhandled = v(2))),
    );
    expect(bad.changes.status).toBe("failed");
  });
});

describe("readAnalytics: what changed", () => {
  it("ranks the demo list: serious first, followed up last", () => {
    const s = readAnalytics(sample());
    const ids = okState(s, "changes").items.map((c) => c.id);
    expect(ids[0]).toBe("chg_ngh_critical_ack");
    expect(ids.at(-1)).toBe("chg_rch_questions");
    expect(ids).toHaveLength(6);
  });

  it("no previous period gives 'Not enough data to compare yet'", () => {
    const s = readAnalytics(sample());
    const list = okState(s, "changes").items;
    const hilltop = list.find((c) => c.id === "chg_hch_clinicians")!;
    expect(hilltop.comparable).toBe(false);
    expect(noPrevious(hilltop)).toBe(true);
    expect(NOT_ENOUGH_TO_COMPARE).toBe("Not enough data to compare yet");
    // Every other change compares.
    expect(
      list
        .filter((c) => c.id !== "chg_hch_clinicians")
        .every((c) => c.comparable),
    ).toBe(true);
    // It reads without a crash and isn't refused.
    expect(s.changes.status).toBe("ok");
  });

  it("keeps follow-ups with their change", () => {
    const s = readAnalytics(sample());
    const c = okState(s, "changes").items.find(
      (c) => c.id === "chg_rch_questions",
    )!;
    expect(c.followedUp).toBe(true);
    expect(c.follow_up?.by.name).toBe("Tunde Okafor");
  });

  it("a hidden side shows 'Fewer than 5' and the list still reads", () => {
    const hidePrevious = (summary: string) =>
      readAnalytics(
        edit((a) => {
          const c = items(a).find((c) => c.id === "chg_rch_questions")!;
          c.previous = HIDDEN;
          c.summary = summary;
        }),
      );
    const s = hidePrevious(
      "Riverside Children's Hospital: questions up from fewer than 5 to 83 a week",
    );
    const c = okState(s, "changes").items.find(
      (c) => c.id === "chg_rch_questions",
    )!;
    expect(measureText(c.measure, c.previous)).toBe("Fewer than 5");
    expect(c.comparable).toBe(true);
    expect(
      hidePrevious("Riverside: questions up (Fewer Than 5 → 83)").changes
        .status,
    ).toBe("ok");
    // A summary that could give the hidden side away is refused.
    expect(
      hidePrevious("Riverside: questions up (3 → 83)").changes.status,
    ).toBe("failed");
    expect(
      hidePrevious("Riverside: questions up from fewer than 5, up 2000%")
        .changes.status,
    ).toBe("failed");
    // Both sides hidden: no number at all beyond "fewer than 5".
    const both = (summary: string) =>
      readAnalytics(
        edit((a) => {
          const c = items(a).find((c) => c.id === "chg_rch_questions")!;
          c.previous = HIDDEN;
          c.current = HIDDEN;
          c.summary = summary;
        }),
      ).changes.status;
    expect(both("Riverside: questions fell, both weeks fewer than 5")).toBe(
      "ok",
    );
    expect(both("Riverside: questions fell to fewer than 5 from 4")).toBe(
      "failed",
    );
  });

  it("a summary carries only the shown side's number", () => {
    const withSides = (summary: string, previous: Guarded, current: Guarded) =>
      readAnalytics(
        edit((a) => {
          const c = items(a).find((c) => c.id === "chg_rch_questions")!;
          c.previous = previous;
          c.current = current;
          c.summary = summary;
        }),
      ).changes.status;
    const up = (summary: string) => withSides(summary, HIDDEN, v(83));
    // A delta, or any number other than the shown side's, gives it away.
    expect(
      up("Riverside: questions up from fewer than 5 to 83, up by 79"),
    ).toBe("failed");
    expect(up("Riverside: questions up (fewer than 5; +79)")).toBe("failed");
    expect(up("Riverside: questions up from fewer than 5 to 84")).toBe(
      "failed",
    );
    // The shown side's number, as the app writes it, is fine.
    expect(up("Riverside: questions up from fewer than 5 to 83")).toBe("ok");
    expect(
      withSides("Questions fell from 83 to fewer than 5", v(83), HIDDEN),
    ).toBe("ok");
    expect(
      withSides("Questions rose from fewer than 5 to 1,180", HIDDEN, v(1180)),
    ).toBe("ok");
    expect(
      withSides("Questions rose from fewer than 5 to 1180", HIDDEN, v(1180)),
    ).toBe("ok");
    // "fewer than 50" is not the phrase.
    expect(up("Riverside: questions up from fewer than 50 to 83")).toBe(
      "failed",
    );
    expect(
      withSides(
        "Riverside: questions fell, fewer than 50 both weeks",
        HIDDEN,
        HIDDEN,
      ),
    ).toBe("failed");
  });

  it("a change's measure belongs to its area", () => {
    const s = readAnalytics(
      edit((a) => {
        const c = items(a).find((c) => c.id === "chg_rch_questions")!;
        c.area = "alerts";
      }),
    );
    expect(s.changes.status).toBe("failed");
  });

  it("a malformed follow-up fails the list", () => {
    const s = readAnalytics(
      edit((a) => {
        const c = items(a).find((c) => c.id === "chg_rch_questions")!;
        (c.follow_up as { at: unknown }).at = 5;
      }),
    );
    expect(s.changes.status).toBe("failed");
  });
});

describe("readSeries", () => {
  const H = { id: "h_lakeside", name: "Lakeside Community Clinic" };
  const pt = (value: Guarded, median: number | null = 10) => ({
    start: "2026-10-01T00:00:00.000Z",
    value,
    median,
  });
  const shown = (value: number | null): Guarded => ({
    value,
    suppressed: false,
  });
  const reply = (measure: string, points: unknown) => ({
    measure,
    hospital: H,
    points,
  });

  it("reads a good reply, keeping what it says", () => {
    const s = readSeries(
      reply("questions", [pt(shown(12), 20), pt(shown(0), null)]),
      "questions",
    );
    expect(s).toEqual({
      status: "ok",
      measure: "questions",
      hospital: H,
      points: [
        { start: pt(shown(0)).start, value: shown(12), median: shown(20) },
        { start: pt(shown(0)).start, value: shown(0), median: null },
      ],
    });
  });

  it("hides a count median between 0 and 5, but not 0 or 5", () => {
    const s = readSeries(
      reply("alerts_total", [
        pt(shown(9), 3),
        pt(shown(9), 4.5),
        pt(shown(9), 0.5),
        pt(shown(9), 0),
        pt(shown(9), 5),
      ]),
      "alerts_total",
    );
    if (s.status !== "ok") throw new Error("failed");
    expect(s.points.map((p) => p.median)).toEqual([
      { value: null, suppressed: true },
      { value: null, suppressed: true },
      { value: null, suppressed: true },
      shown(0),
      shown(5),
    ]);
  });

  it("keeps a small median of a rate or share", () => {
    const s = readSeries(
      reply("questions_per_clinician", [pt(shown(2.5), 3)]),
      "questions_per_clinician",
    );
    if (s.status !== "ok") throw new Error("failed");
    expect(s.points[0]!.median).toEqual(shown(3));
  });

  it("fails on an unhidden count of 1-4", () => {
    for (const n of [1, 3, 4])
      expect(
        readSeries(reply("questions", [pt(shown(n))]), "questions"),
      ).toEqual({ status: "failed" });
  });

  it("fails on a count that is not a whole number or is missing", () => {
    for (const v of [shown(12.5), shown(null), shown(-6)])
      expect(readSeries(reply("questions", [pt(v)]), "questions").status).toBe(
        "failed",
      );
  });

  it("drops the number of a hidden value", () => {
    const s = readSeries(
      reply("questions", [pt({ value: 3, suppressed: true })]),
      "questions",
    );
    if (s.status !== "ok") throw new Error("failed");
    expect(s.points[0]!.value).toEqual({ value: null, suppressed: true });
  });

  it("fails when the measure is not the one asked for", () => {
    // A count of 3 read as a rate would show.
    expect(
      readSeries(reply("questions_per_clinician", [pt(shown(3))]), "questions")
        .status,
    ).toBe("failed");
    expect(
      readSeries(reply("questions", [pt(shown(3))]), "questions_per_clinician")
        .status,
    ).toBe("failed");
  });

  it("fails on a malformed reply", () => {
    const bad: unknown[] = [
      null,
      "nope",
      { measure: "questions", hospital: H },
      reply("questions", null),
      reply("questions", {}),
      { measure: "questions", hospital: { id: "a b", name: "X" }, points: [] },
      reply("questions", [null]),
      reply("questions", [{ ...pt(shown(9)), start: "yesterday" }]),
      reply("questions", [{ ...pt(shown(9)), value: 9 }]),
      reply("questions", [pt(shown(9), -1)]),
      reply("questions", [pt(shown(9), Number.NaN)]),
      reply("questions", [{ ...pt(shown(9)), median: "10" }]),
      reply("questions", [{ start: pt(shown(9)).start, value: shown(9) }]),
    ];
    for (const b of bad)
      expect(readSeries(b, "questions")).toEqual({ status: "failed" });
  });

  it("reads every series the mock sends", () => {
    for (const id of [null, "h_lakeside", "h_havana", "h_hilltop"])
      for (const m of MEASURES)
        for (const p of ["7d", "30d", "90d"] as const)
          expect(readSeries(buildSeries(id, m, p, NOW), m).status).toBe("ok");
  });
});
