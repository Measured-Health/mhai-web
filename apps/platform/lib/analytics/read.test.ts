import { describe, expect, it } from "vitest";
import type {
  AnalyticsOut,
  ChangesOut,
  Guarded,
  Period,
} from "../api/analytics-contract";
import {
  buildAnalytics,
  buildSeries,
  seedChanges,
  type AnalyticsMode,
} from "../api/analytics-fixtures";
import { valueText } from "./measures";
import {
  AREAS,
  failedText,
  readAnalytics,
  readSeries,
  type AnalyticsState,
} from "./read";

// 11 Nov 2026: the latest finished week is 1–7 Nov, month October,
// quarter Jul–Sep; What changed compares 1–7 Nov with October.
const NOW = Date.parse("2026-11-11T09:30:00.000Z");
const sample = (mode: AnalyticsMode = "normal", period: Period = "month") =>
  buildAnalytics(period, NOW, mode, seedChanges(NOW, mode));

type Ok<T> = Exclude<T, { unavailable: true } | { not_yet: true } | null>;
const ok = <T>(v: T) => v as Ok<T>;
function okState<K extends keyof AnalyticsState>(s: AnalyticsState, k: K) {
  const a = s[k];
  if (typeof a !== "object" || a === null || a.status !== "ok")
    throw new Error(`${k} not ok`);
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
  alerts: "off",
  quality: "ok",
  hospitals: "ok",
};
const ALL_FAILED = {
  changes: "failed",
  use: "failed",
  alerts: "failed",
  quality: "failed",
  hospitals: "failed",
};
const v = (value: number | null): Guarded => ({ value, suppressed: false });

/** A copy of the sample with one change made to it. */
function edit(
  f: (a: AnalyticsOut & Record<string, unknown>) => void,
  mode: AnalyticsMode = "normal",
  period: Period = "month",
) {
  const a = structuredClone(sample(mode, period)) as AnalyticsOut &
    Record<string, unknown>;
  f(a);
  return a;
}
const useBlock = (a: AnalyticsOut) => ok(a.use);
const qualityRows = (a: AnalyticsOut) => ok(a.quality).rows;
const changes = (a: AnalyticsOut) => a.what_changed as ChangesOut;

describe("readAnalytics: the sample data", () => {
  it("every period of the demo reads; alerts are not switched on", () => {
    for (const p of ["week", "month", "quarter"] as const) {
      const s = readAnalytics(sample("normal", p), p);
      expect(statuses(s)).toEqual(ALL_OK);
      expect(s.period).toBe(p);
    }
    const s = readAnalytics(sample(), "month");
    expect(s.from).toBe("2026-10-01T00:00:00.000Z");
  });

  it("trend points are successive periods of the kind, each one period", () => {
    const week = okState(readAnalytics(sample("normal", "week")), "use");
    expect(week.trend).toHaveLength(12);
    // Month-aligned weeks: 22–31 Oct is ten days.
    expect(week.trend.map((p) => p.start.slice(0, 10)).slice(-4)).toEqual([
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-11-01",
    ]);
    const quarter = okState(readAnalytics(sample("normal", "quarter")), "use");
    expect(quarter.trend).toHaveLength(8);
    expect(quarter.trend.at(-1)!.start).toBe("2026-07-01T00:00:00.000Z");
  });

  it("0 shows, 1–4 hidden, never through a rate", () => {
    const use = okState(readAnalytics(sample("normal", "week")), "use");
    const hilltop = row(use.rows, "h_hilltop");
    expect(valueText(hilltop.questions, "count")).toBe("0");
    expect(valueText(hilltop.questions_per_clinician, "rate")).toBe(
      "No data yet",
    );
    const lakeside = row(use.rows, "h_lakeside");
    expect(valueText(lakeside.questions, "count")).toBe("Fewer than 5");
    expect(valueText(lakeside.questions_per_clinician, "rate")).toBe(
      "Fewer than 5",
    );
    // The server sends a rate over Lakeside's hidden counts: refused.
    const rate = readAnalytics(
      edit(
        (a) => {
          row(useBlock(a).rows, "h_lakeside").questions_per_clinician = v(1.8);
        },
        "normal",
        "week",
      ),
    );
    expect(rate.use.status).toBe("failed");
    expect(rate.quality.status).toBe("ok");
  });

  it("a new hospital is listed only from its month", () => {
    const rows = (p: Period) =>
      okState(readAnalytics(sample("normal", p)), "hospitals").rows.map(
        (r) => r.hospital.id,
      );
    expect(rows("month")).toContain("h_hilltop");
    expect(rows("quarter")).not.toContain("h_hilltop");
  });
});

describe("readAnalytics: not yet, unavailable, alerts", () => {
  it("before the first period: not yet, with when figures start (F19)", () => {
    const s = readAnalytics(sample("not_yet"), "month");
    expect(s.from).toBeNull();
    for (const k of ["use", "quality", "hospitals"] as const)
      expect(s[k]).toEqual({
        status: "not_yet",
        period: "month",
        first_from: "2026-12-01T00:00:00.000Z",
      });
    // What changed isn't evaluated yet: Couldn't load, never "Nothing unusual".
    expect(s.changes.status).toBe("failed");
    expect(s.alerts.status).toBe("off");
  });

  it("not yet reads only before the first period, and data only after it", () => {
    const early = readAnalytics(
      edit((a) => {
        (a as Record<string, unknown>).use = {
          not_yet: true,
          first_from: "2026-12-01T00:00:00.000Z",
        };
      }),
    );
    expect(early.use.status).toBe("failed");
    const late = readAnalytics(
      edit((a) => {
        a.use = structuredClone(sample().use);
      }, "not_yet"),
    );
    expect(late.use.status).toBe("failed");
    // first_from must start a period of the kind.
    const odd = readAnalytics(
      edit((a) => {
        a.use = { not_yet: true, first_from: "2026-12-02T00:00:00.000Z" };
      }, "not_yet"),
    );
    expect(odd.use.status).toBe("failed");
  });

  it("every area unavailable: each says Couldn't load; alerts stay off", () => {
    const s = readAnalytics(sample("unavailable"), "month");
    expect(statuses(s)).toEqual({ ...ALL_FAILED, alerts: "off" });
    expect(failedText("changes")).toBe("Couldn't load what changed");
  });

  it("alerts sent as anything but null fail closed, and What changed with them", () => {
    const s = readAnalytics(
      edit((a) => {
        (a as Record<string, unknown>).alerts = { rows: [] };
      }),
    );
    expect(s.alerts.status).toBe("failed");
    expect(s.changes.status).toBe("failed");
    expect(s.use.status).toBe("ok");
  });
});

describe("readAnalytics: strict", () => {
  it("an unknown key at the top fails every area", () => {
    expect(statuses(readAnalytics(edit((a) => void (a.extra = 1))))).toEqual(
      ALL_FAILED,
    );
  });

  it("changes must stay unavailable: What changed is what_changed (F21)", () => {
    const s = readAnalytics(
      edit((a) => {
        (a as Record<string, unknown>).changes = a.what_changed;
      }),
    );
    expect(statuses(s)).toEqual(ALL_FAILED);
  });

  it("a period other than the one asked for, or from/to not one period, fails every area", () => {
    expect(statuses(readAnalytics(sample("normal", "week"), "month"))).toEqual(
      ALL_FAILED,
    );
    expect(
      statuses(
        readAnalytics(edit((a) => void (a.from = "2026-10-02T00:00:00.000Z"))),
      ),
    ).toEqual(ALL_FAILED);
    // A rolling window: 30 days back from a day that isn't a month's end.
    expect(
      statuses(
        readAnalytics(edit((a) => void (a.to = "2026-10-31T00:00:00.000Z"))),
      ),
    ).toEqual(ALL_FAILED);
    expect(
      statuses(readAnalytics(edit((a) => void (a.period = "30d" as Period)))),
    ).toEqual(ALL_FAILED);
  });

  it("an unknown key in a row, a median or a value fails that area only", () => {
    const rowKey = readAnalytics(
      edit((a) => {
        Object.assign(row(useBlock(a).rows, "h_havana"), { patient: "x" });
      }),
    );
    expect(rowKey.use.status).toBe("failed");
    expect(rowKey.quality.status).toBe("ok");
    const valueKey = readAnalytics(
      edit((a) => {
        Object.assign(row(qualityRows(a), "h_havana").answers, { raw: 3 });
      }),
    );
    expect(valueKey.quality.status).toBe("failed");
    expect(valueKey.use.status).toBe("ok");
  });

  it("an unsuppressed 3, or a hidden value with its number, fails the area", () => {
    const three = readAnalytics(
      edit((a) => {
        row(qualityRows(a), "h_havana").reviews = v(3);
      }),
    );
    expect(three.quality.status).toBe("failed");
    const carried = readAnalytics(
      edit((a) => {
        row(useBlock(a).rows, "h_lakeside").questions = {
          value: 3,
          suppressed: true,
        };
      }),
    );
    expect(carried.use.status).toBe("failed");
    const staff = readAnalytics(
      edit((a) => {
        ok(a.hospitals).rows[0]!.size.staff = v(2);
      }),
    );
    expect(staff.hospitals.status).toBe("failed");
  });

  it("a trend point that isn't the start of a period of the kind fails the area", () => {
    const s = readAnalytics(
      edit((a) => {
        useBlock(a).trend[0]!.start = "2026-01-05T00:00:00.000Z";
      }),
    );
    expect(s.use.status).toBe("failed");
  });
});

describe("readAnalytics: what changed", () => {
  it("reads the demo list, followed-up rows last, in the server's order", () => {
    const c = okState(readAnalytics(sample()), "changes");
    expect(c.items.map((x) => x.id)).toEqual([
      "chg_ngh_needs_review",
      "chg_ngh_questions",
      "chg_hav_needs_review",
      "chg_all_questions",
      "chg_hav_agreement",
      "chg_rch_questions",
    ]);
    expect(c.items.at(-1)!.followedUp).toBe(true);
    expect(c.window).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-08T00:00:00.000Z",
    });
  });

  it("is the same for every period", () => {
    const ids = (p: Period) =>
      okState(readAnalytics(sample("normal", p)), "changes").items.map(
        (x) => x.id,
      );
    expect(ids("week")).toEqual(ids("quarter"));
  });

  it("an empty list reads (Nothing unusual this period)", () => {
    const s = readAnalytics(edit((a) => void (changes(a).items = [])));
    expect(okState(s, "changes").items).toEqual([]);
  });

  it("a change on a hidden side fails the list (T7)", () => {
    const s = readAnalytics(
      edit((a) => {
        changes(a).items[0]!.previous = { value: null, suppressed: true };
      }),
    );
    expect(s.changes.status).toBe("failed");
    expect(s.use.status).toBe("ok");
  });

  it("a measure core doesn't compare, or the wrong direction for it, fails", () => {
    const clinicians = readAnalytics(
      edit((a) => {
        changes(a).items[1]!.measure = "active_clinicians";
      }),
    );
    expect(clinicians.changes.status).toBe("failed");
    const way = readAnalytics(
      edit((a) => {
        changes(a).items[1]!.direction = "worse";
      }),
    );
    expect(way.changes.status).toBe("failed");
    const area = readAnalytics(
      edit((a) => {
        changes(a).items[1]!.area = "quality";
      }),
    );
    expect(area.changes.status).toBe("failed");
  });

  it("a window that isn't a month against a later week fails", () => {
    for (const w of [
      { from: "2026-10-08T00:00:00.000Z", to: "2026-11-08T00:00:00.000Z" },
      { from: "2026-10-01T00:00:00.000Z", to: "2026-11-07T00:00:00.000Z" },
      { from: "2026-11-01T00:00:00.000Z", to: "2026-11-08T00:00:00.000Z" },
    ]) {
      const s = readAnalytics(edit((a) => void (changes(a).window = w)));
      expect(s.changes.status).toBe("failed");
    }
  });

  it("an unknown key in a change or its follow-up fails the list", () => {
    const key = readAnalytics(
      edit((a) => {
        Object.assign(changes(a).items[0]!, { note: "x" });
      }),
    );
    expect(key.changes.status).toBe("failed");
    const fu = readAnalytics(
      edit((a) => {
        const f = changes(a).items.at(-1)!.follow_up!;
        delete (f as Partial<typeof f>).by_you;
      }),
    );
    expect(fu.changes.status).toBe("failed");
  });
});

describe("readSeries", () => {
  const H = { id: "h_havana", name: "Havana Hospital" };
  const pt = (value: Guarded, median: number | null = 10) => ({
    start: "2026-10-01T00:00:00.000Z",
    value,
    median,
  });
  const reply = (measure: string, points: unknown) => ({
    measure,
    hospital: H,
    points,
  });

  it("reads every series the mock sends, for every kind", () => {
    for (const p of ["week", "month", "quarter"] as const) {
      for (const m of [
        "questions_per_clinician",
        "needs_review_share",
      ] as const)
        for (const h of ["h_havana", "h_lakeside", "h_hilltop"])
          expect(readSeries(buildSeries(h, m, p, NOW), m, p).status).toBe("ok");
      for (const c of seedChanges(NOW, "normal"))
        expect(
          readSeries(
            buildSeries(c.hospital?.id ?? null, c.measure, p, NOW, c.id),
            c.measure,
            p,
            c.id,
          ).status,
        ).toBe("ok");
    }
  });

  it("a change across all hospitals has no hospital and no median (F14)", () => {
    const s = readSeries(
      buildSeries(null, "questions", "month", NOW, "chg_all_questions"),
      "questions",
      "month",
      "chg_all_questions",
    );
    if (s.status !== "ok") throw new Error("failed");
    expect(s.hospital).toBeNull();
    expect(s.points.every((p) => p.median === null)).toBe(true);
    expect(s.points).toHaveLength(12);
  });

  it("a new hospital's periods before it started read as nothing to show", () => {
    const s = readSeries(
      buildSeries("h_hilltop", "questions_per_clinician", "month", NOW),
      "questions_per_clinician",
      "month",
    );
    if (s.status !== "ok") throw new Error("failed");
    expect(s.points.filter((p) => p.value.value !== null)).toHaveLength(0);
    expect(s.points.at(-1)!.value).toEqual(v(null));
  });

  it("hides a count median between 0 and 5, but not 0 or 5", () => {
    const s = readSeries(
      {
        change_id: "c1",
        ...reply("questions", [
          pt(v(9), 3),
          pt(v(9), 0.5),
          pt(v(9), 0),
          pt(v(9), 5),
        ]),
      },
      "questions",
      "month",
      "c1",
    );
    if (s.status !== "ok") throw new Error("failed");
    expect(s.points.map((p) => p.median)).toEqual([
      { value: null, suppressed: true },
      { value: null, suppressed: true },
      v(0),
      v(5),
    ]);
  });

  it("fails closed on what the contract doesn't allow", () => {
    const failed = { status: "failed" };
    const good = reply("needs_review_share", [pt(v(0.2))]);
    expect(readSeries(good, "needs_review_share", "month").status).toBe("ok");
    // Another measure, another period kind, a point mid-period.
    expect(readSeries(good, "questions_per_clinician", "month")).toEqual(
      failed,
    );
    expect(
      readSeries(
        reply("needs_review_share", [
          { ...pt(v(0.2)), start: "2026-10-08T00:00:00.000Z" },
        ]),
        "needs_review_share",
        "month",
      ),
    ).toEqual(failed);
    // An unhidden 1–4, an extra key.
    expect(
      readSeries(
        { change_id: "c1", ...reply("questions", [pt(v(3))]) },
        "questions",
        "month",
        "c1",
      ),
    ).toEqual(failed);
    expect(
      readSeries({ ...good, extra: 1 }, "needs_review_share", "month"),
    ).toEqual(failed);
    // A change's series: its own id; a hospital's: none, and a hospital.
    expect(
      readSeries(
        { change_id: "c2", ...good },
        "needs_review_share",
        "month",
        "c1",
      ),
    ).toEqual(failed);
    expect(
      readSeries({ change_id: "c1", ...good }, "needs_review_share", "month"),
    ).toEqual(failed);
    expect(
      readSeries({ ...good, hospital: null }, "needs_review_share", "month"),
    ).toEqual(failed);
    // All hospitals has no median.
    expect(
      readSeries(
        { change_id: "c1", ...good, hospital: null },
        "needs_review_share",
        "month",
        "c1",
      ),
    ).toEqual(failed);
  });
});
