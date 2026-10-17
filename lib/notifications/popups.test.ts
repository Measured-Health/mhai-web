import { describe, expect, it } from "vitest";
import type { AlertSeverity } from "@/lib/api/alerts-contract";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
import {
  ALERT_POPUP_MS,
  POPUP_MAX,
  SEEN_MAX,
  alertPopup,
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
  it("treats the first check as a baseline", () => {
    expect(newAlerts(null, [fresh("a", "critical")])).toEqual([]);
  });

  it("finds alerts whose id was not seen before", () => {
    const a = fresh("a", "urgent");
    const old = fresh("old", "urgent");
    expect(newAlerts(new Set(["old"]), [a, old])).toEqual([a]);
    expect(newAlerts(new Set(["a"]), [a])).toEqual([]);
  });

  it("never compares alert times with the device clock (A7)", () => {
    const realNow = Date.now;
    try {
      for (const skew of [10 * 365 * 86_400_000, -10 * 365 * 86_400_000]) {
        Date.now = () => ALERT_NOW + skew;
        const c = fresh("c", "critical");
        const u = {
          ...fresh("u", "urgent"),
          created_at: new Date(since - 5 * 86_400_000).toISOString(),
        };
        expect(newAlerts(new Set(["x"]), [c, u])).toEqual([c, u]);
      }
    } finally {
      Date.now = realNow;
    }
  });

  it("never pops what was present at the baseline, but pops a later arrival", () => {
    const first = [fresh("a", "critical"), fresh("b", "urgent")];
    const seen = rememberSeen(null, first);
    expect(newAlerts(seen, first)).toEqual([]);
    const late = fresh("late", "critical");
    expect(newAlerts(seen, [late, ...first])).toEqual([late]);
    const seen2 = rememberSeen(seen, [late, ...first]);
    expect(newAlerts(seen2, [late, ...first])).toEqual([]);
  });

  it("skips handled ones, and counts an unreadable time as new", () => {
    const handled = { ...fresh("h", "critical"), status: "handled" as const };
    const odd = { ...fresh("o", "urgent"), created_at: "garbage" };
    expect(newAlerts(new Set(), [handled, odd])).toEqual([odd]);
  });

  it("keeps the seen set within SEEN_MAX, dropping the oldest ids", () => {
    const many = Array.from({ length: SEEN_MAX + 5 }, (_, i) =>
      fresh(`id${i}`, "info"),
    );
    const seen = rememberSeen(null, many);
    expect(seen.size).toBe(SEEN_MAX);
    expect(seen.has("id0")).toBe(false);
    expect(seen.has(`id${SEEN_MAX + 4}`)).toBe(true);
  });
});

it("pops a Critical that arrives later even with alert pop-ups muted", () => {
  const seen = rememberSeen(null, [fresh("a", "urgent")]);
  const next = [
    fresh("a", "urgent"),
    fresh("c", "critical"),
    fresh("u", "urgent"),
  ];
  const p = planPopups(newAlerts(seen, next), OFF);
  expect(p.show.map((a) => a.id)).toEqual(["c"]);
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
