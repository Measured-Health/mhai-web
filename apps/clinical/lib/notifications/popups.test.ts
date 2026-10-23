import { describe, expect, it } from "vitest";
import type { AlertSeverity } from "@/lib/api/alerts-contract";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
import {
  ALERT_POPUP_MS,
  POPUP_MAX,
  SEEN_MAX,
  alertPopup,
  baselineFrom,
  moreAlertsPopup,
  newAlerts,
  planPopups,
  rememberSeen,
} from "./popups";

const since = ALERT_NOW;
const fresh = (
  id: string,
  severity: AlertSeverity,
  minutesAfter = 1,
  name = `Patient ${id}`,
) =>
  makeAlert({
    id,
    severity,
    created_at: new Date(since + minutesAfter * 60_000).toISOString(),
    patient: { ...makeAlert().patient, full_name: name },
  });
const ON = { alert_popups: true };
const OFF = { alert_popups: false };

describe("newAlerts", () => {
  const W = since;
  it("treats the first check as a baseline", () => {
    expect(newAlerts(null, [fresh("a", "critical")], W)).toEqual([]);
  });

  it("finds alerts whose id was not seen before", () => {
    const a = fresh("a", "urgent");
    const old = fresh("old", "urgent");
    expect(newAlerts(new Set(["old"]), [a, old], W)).toEqual([a]);
    expect(newAlerts(new Set(["a"]), [a], W)).toEqual([]);
  });

  it("never pops an alert older than the baseline watermark, even if its id is unseen", () => {
    const outside = fresh("outside", "urgent", -30);
    const newer = fresh("newer", "urgent", 2);
    const watermark = baselineFrom([fresh("w", "info", 0)]);
    expect(newAlerts(new Set(["w"]), [outside, newer], watermark)).toEqual([
      newer,
    ]);
  });

  it("pops an unseen Critical older than the watermark, even while muted", () => {
    const late = fresh("late", "critical", -30);
    const quiet = fresh("quiet", "urgent", -30);
    const plan = planPopups(
      newAlerts(new Set(["w"]), [late, quiet], since),
      OFF,
    );
    expect(plan.show).toEqual([late]);
    expect(newAlerts(new Set(["w"]), [late, quiet], since)).toEqual([late]);
  });

  it("takes the watermark from the newest baseline created_at", () => {
    expect(baselineFrom([fresh("a", "info", 1), fresh("b", "info", 5)])).toBe(
      since + 5 * 60_000,
    );
    expect(baselineFrom([])).toBeNull();
    expect(
      baselineFrom([{ ...fresh("x", "info"), created_at: "garbage" }]),
    ).toBeNull();
  });

  it("never compares alert times with the device clock (A7)", () => {
    const realNow = Date.now;
    try {
      for (const skew of [10 * 365 * 86_400_000, -10 * 365 * 86_400_000]) {
        Date.now = () => ALERT_NOW + skew;
        const c = fresh("c", "critical", 1);
        const old = fresh("o", "urgent", -5);
        expect(newAlerts(new Set(["x"]), [c, old], W)).toEqual([c]);
      }
    } finally {
      Date.now = realNow;
    }
  });

  it("never pops what was present at the baseline, but pops a later arrival", () => {
    const first = [fresh("a", "critical"), fresh("b", "urgent")];
    const seen = rememberSeen(null, first);
    const w = baselineFrom(first);
    expect(newAlerts(seen, first, w)).toEqual([]);
    const late = fresh("late", "critical", 9);
    expect(newAlerts(seen, [late, ...first], w)).toEqual([late]);
    const seen2 = rememberSeen(seen, [late, ...first]);
    expect(newAlerts(seen2, [late, ...first], w)).toEqual([]);
  });

  it("pops a repeated or reopened id only once", () => {
    const a = fresh("a", "urgent", 3);
    const seen = rememberSeen(new Set(), [a]);
    expect(newAlerts(seen, [{ ...a, status: "handled" }], W)).toEqual([]);
    expect(newAlerts(seen, [a], W)).toEqual([]);
  });

  it("collapses duplicates in a merged list", () => {
    const c = fresh("c", "critical", 3);
    expect(newAlerts(new Set(["x"]), [c, c], W)).toEqual([c]);
    expect(planPopups([c, c], OFF).show).toEqual([c]);
  });

  it("skips handled ones, and counts an alert with an unreadable time as new", () => {
    const handled = { ...fresh("h", "critical"), status: "handled" as const };
    const odd = { ...fresh("o", "urgent"), created_at: "garbage" };
    expect(newAlerts(new Set(), [handled, odd], W)).toEqual([odd]);
    expect(newAlerts(new Set(), [odd], null)).toEqual([odd]);
  });

  it("pops a Critical newer than the watermark even with alert pop-ups muted", () => {
    const seen = rememberSeen(null, [fresh("a", "urgent")]);
    const next = [
      fresh("a", "urgent"),
      fresh("c", "critical", 4),
      fresh("u", "urgent", 4),
    ];
    const p = planPopups(newAlerts(seen, next, W), OFF);
    expect(p.show.map((a) => a.id)).toEqual(["c"]);
  });

  it("keeps every current id, trimming only older ones beyond SEEN_MAX", () => {
    const many = Array.from({ length: SEEN_MAX + 5 }, (_, i) =>
      fresh(`id${i}`, "info"),
    );
    const all = rememberSeen(new Set(["older"]), many);
    expect(all.size).toBe(SEEN_MAX + 5);
    expect(all.has("older")).toBe(false);
    expect(all.has("id0")).toBe(true);
    const some = rememberSeen(
      new Set(["o1", "o2"]),
      many.slice(0, SEEN_MAX - 1),
    );
    expect(some.size).toBe(SEEN_MAX);
    expect(some.has("o2")).toBe(true);
    expect(some.has("o1")).toBe(false);
  });
});

describe("planPopups", () => {
  it("pops up everything new when alert pop-ups are on, most severe first", () => {
    const p = planPopups(
      [
        fresh("i", "info", 3),
        fresh("u", "urgent", 2),
        fresh("c", "critical", 1),
      ],
      ON,
    );
    expect(p.show.map((a) => a.id)).toEqual(["c", "u", "i"]);
    expect(p.rest).toEqual([]);
  });

  it("pops up Critical even when alert pop-ups are off (Review Focus 2)", () => {
    const p = planPopups(
      [fresh("u", "urgent"), fresh("i", "info"), fresh("c", "critical")],
      OFF,
    );
    expect(p.show.map((a) => a.id)).toEqual(["c"]);
    expect(p.rest).toEqual([]);
  });

  it("treats an unknown severity as Urgent, so muting quiets it", () => {
    expect(planPopups([fresh("x", "catastrophic" as never)], OFF).show).toEqual(
      [],
    );
  });

  it("caps a burst and summarises the rest, most severe first (Review Focus 3)", () => {
    const burst = [
      ...["u1", "u2", "u3", "u4", "u5", "u6"].map((id, i) =>
        fresh(id, "urgent", i + 1),
      ),
      fresh("c1", "critical", 7),
      fresh("c2", "critical", 8),
    ];
    const p = planPopups(burst, ON);
    expect(p.show.map((a) => a.id)).toEqual(["c2", "c1", "u6"]);
    expect(p.show).toHaveLength(POPUP_MAX);
    expect(p.rest).toHaveLength(5);
    expect(moreAlertsPopup(p.rest)).toEqual({
      title: "5 more new patient alerts",
      body: "See them all in Notifications.",
      severity: "urgent",
      live: "polite",
      ms: ALERT_POPUP_MS,
      viewName: "View all new patient alerts",
    });
  });

  it("makes a summary with Critical in it assertive and lasting", () => {
    const p = planPopups(
      ["c1", "c2", "c3", "c4"].map((id, i) => fresh(id, "critical", i + 1)),
      OFF,
    );
    expect(moreAlertsPopup(p.rest)).toMatchObject({
      title: "1 more new patient alert",
      body: "Including 1 Critical. See them all in Notifications.",
      severity: "critical",
      live: "assertive",
      ms: null,
    });
    expect(moreAlertsPopup([])).toBeNull();
  });
});

describe("alertPopup", () => {
  it("names the severity, the patient and the finding", () => {
    expect(alertPopup(fresh("c", "critical", 1, "Halima Garba"))).toEqual({
      title: "Critical patient alert",
      body: "Halima Garba · Potassium 2.9 mmol/L (low; normal 3.5–5.1)",
      severity: "critical",
      live: "assertive",
      ms: null,
      viewName: "View alert for Halima Garba",
    });
    expect(alertPopup(fresh("u", "urgent"))).toMatchObject({
      title: "Urgent patient alert",
      live: "polite",
      ms: ALERT_POPUP_MS,
    });
    expect(alertPopup(fresh("i", "info"))).toMatchObject({
      title: "Info patient alert",
      live: "polite",
    });
  });
});

describe("pop-up routing", () => {
  const queueOnly = (id: string, severity: AlertSeverity) => ({
    ...fresh(id, severity),
    routing: { to_you: false, queue: true },
  });
  it("a queue-only Urgent alert doesn't pop up with pop-ups on", () => {
    expect(planPopups([queueOnly("q", "urgent")], ON).show).toEqual([]);
  });
  it("a queue-only Critical one does", () => {
    const q = queueOnly("q", "critical");
    expect(planPopups([q], ON).show).toEqual([q]);
    expect(planPopups([q], OFF).show).toEqual([q]);
  });
  it("a for-you Urgent alert pops up only with pop-ups on", () => {
    const a = {
      ...fresh("y", "urgent"),
      routing: { to_you: true, queue: true },
    };
    expect(planPopups([a], ON).show).toEqual([a]);
    expect(planPopups([a], OFF).show).toEqual([]);
  });
});
