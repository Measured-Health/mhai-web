# Plan 5b: Patient alert analytics on the Usage page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give hospital admins a short, counts-only summary of their hospital's
patient alerts on the existing Usage page, on sample data now and ready for
the real API:

- a **Patient alerts** group below the existing numbers, on the same period
  picker, shown only when alerts are switched on, and saying "Couldn't load
  patient alerts" with Try again (never zeros) when they can't load;
- **volumes** (total, Critical, Urgent, Info, still unhandled), **response
  times** (median to acknowledge, overall and for Critical, and "Critical
  handled within 15 min" from the backend's target), **outcomes**
  (acknowledged and dismissed shares, dismissal reasons) and the **top 5
  findings and locations**;
- the **small-group rule**: the server hides any group of fewer than 5; the
  UI shows "Fewer than 5" and no bar, guards against a leak, and the CSV does
  the same;
- **What changed** at the top: changes against the previous period on every
  number, unusual days or weeks, rising findings and locations, and a notice
  when Critical handling worsens; "Nothing unusual this period" and "Not
  enough data to compare" otherwise. The backend computes all of it;
- two reusable charts in `components/ui/charts/`, **`ColumnChart`** and
  **`BarList`**, with no new dependency, ready for Plan 6 Analysis;
- the Usage **CSV export** gains the alert numbers under the same rule.

**Architecture:**

- **Data.** No new route or client method: `GET /hospital/usage` gains an
  `alerts` field. Its types are added to `lib/api/admin-contract.ts`, the
  sample numbers to `lib/api/mock-admin.ts` (with an `alerts` option for the
  switched-off and couldn't-load cases), and the live client passes the field
  through unchanged. `useUsage` (TanStack Query) is unchanged; Try again calls
  its `refetch`.
- **Pure rules** in `lib/admin/alert-usage.ts`, unit-tested without React:
  reading the block (`readAlerts`), the small-group guard (`shown`), the
  wording of values, changes and flags, and the What changed list. The
  small-group constants live in `lib/small-groups.ts` so Plan 6 shares them.
- **Charts** in `components/ui/charts/` know nothing about alerts or admins:
  `BarList` (the Usage page's existing bar style, now shared: Result
  confidence and By specialty move onto it) and `ColumnChart` (columns over
  time, text summary, table toggle, roving keyboard focus, phone layout).
- **Screen.** `components/admin/usage-alerts.tsx` (`UsageAlerts`) renders the
  group from the usage reply; `UsageView` mounts it below its cards. `Tile`
  and `Card` move to `components/admin/usage-parts.tsx` so both share them.
- **Export.** `alertsCsvRows` in `lib/admin/csv.ts`, appended by `usageCsv`,
  built on the device as today.

**The assumed backend contract.** Nothing here exists in the backend yet:
every row is **assumed**, and Task 1 writes it into spec §10 as item 21 so
the backend team can match it or tell us what changed.

| Feature            | Contract                                                                                                                                                                                                                                                                                    | Source                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Where              | `GET /hospital/usage?period=this_month\|last_month\|last_90_days` → `UsageOut` with `alerts?: UsageAlertsOut \| { unavailable: true } \| null`                                                                                                                                              | **assumed** (spec §13; R1) |
| Switched off       | `alerts: null`, or no `alerts` field (an older backend): the group is hidden                                                                                                                                                                                                                | **assumed** (R1)           |
| Couldn't compute   | `alerts: { unavailable: true }`: the rest of usage is fine; the group says "Couldn't load patient alerts"                                                                                                                                                                                   | **assumed** (R1, R2)       |
| Small-group values | `GuardedOut {value, suppressed}`; a hidden value is `{value: null, suppressed: true}`; complementary suppression on sets that add up; `series` is not suppressed                                                                                                                            | **assumed** (spec §4; R3)  |
| Changes            | `MeasureOut = GuardedOut & {change: ChangeOut \| null}`, `ChangeOut {direction: up\|down\|same, amount, previous}`: whole percent for counts, minutes for times, percentage points for shares; null when either side is hidden or missing or the previous count is 0                        | **assumed** (spec §5; R4)  |
| The block          | `critical_target_minutes`, `has_previous`, `total`, `by_severity`, `unhandled`, `median_ack_minutes`, `median_ack_minutes_critical`, `critical_within_target`, `acknowledged_share`, `dismissed_share`, `dismiss_reasons`, `top_findings`, `top_locations`, `series`, `rising`, `worsening` | **assumed** (spec §13)     |
| Series             | `{bucket: "day" \| "week", points: {start: "YYYY-MM-DD", total, usual_multiple \| null}[]}`, oldest first; days for this_month and last_month, weeks for last_90_days                                                                                                                       | **assumed** (spec §13)     |
| Flags              | `rising[]` (finding or location, `count` and `previous`, both at least 5), `worsening {value, previous}` (shares), `usual_multiple` on busy buckets; none of them when `has_previous` is false                                                                                              | **assumed** (spec §5; R5)  |

**Rulings** (open points decided here so the build can go ahead; each is
recorded in the docs by the task named):

- **R1 · One request.** The alert numbers ride on `GET /hospital/usage`. No
  `alerts` field or `alerts: null` means switched off (the group is hidden);
  `{ unavailable: true }` or a block the app can't read means couldn't load.
  There is no separate alerts route, so the "404 hides it" case is the absent
  field (Tasks 1, 3).
- **R2 · A failure never reads as zero or as calm.** Couldn't load shows
  "Couldn't load patient alerts" and Try again (reloads Usage), no tiles, no
  What changed; the CSV gets one row "Alerts,Couldn't load". When Usage
  itself fails, the page's banner shows and the group doesn't (Tasks 3, 4).
- **R3 · The UI guards the small-group rule.** `suppressed: true` shows
  "Fewer than 5" whatever `value` says; a count from 1 to 4 also shows "Fewer
  than 5"; 0 is shown. Shares and medians trust the server's flag. A hidden
  group has no bar (Tasks 2, 3, 4).
- **R4 · Changes.** Shown only when the backend sends one, `has_previous` is
  true, the current value is shown and, for counts, the previous value is not
  1 to 4. Only response times read "better" or "worse"; volumes and outcomes
  are neutral (Task 3).
- **R5 · No previous period.** "Not enough data to compare", and every
  change and flag is ignored even if sent (Task 3).
- **R6 · What changed order:** worsening response, then unusual buckets
  (oldest first), then rising findings, then rising locations. Rising needs
  at least 5 in both periods; worsening is dropped when the Critical share is
  hidden (Task 3).
- **R7 · Usual multiple.** "about 3× the usual": whole numbers from 2 up,
  one decimal below 2 ("about 1.4×") (Task 3).
- **R8 · Groups.** Findings read "Potassium · low"; `name: null` is the one
  "Not standardised" row; an unknown flag reads "abnormal". Locations are
  ward level: the UI drops any `bed` before labelling; `null` reads "Location
  not recorded" (Task 3).
- **R9 · Charts are generic.** `components/ui/charts/*` import nothing from
  `lib/admin` or `lib/notifications`; "Fewer than 5" comes from
  `lib/small-groups.ts` (Task 2).
- **R10 · One bar style.** Result confidence and By specialty move onto
  `BarList`, unchanged on screen (Task 2).
- **R11 · CSV.** Numbers only, rows prefixed "Alerts", "Fewer than 5" for a
  hidden value, an empty cell for a missing median, no changes or flags, no
  commas in measure names (Task 4).
- **R12 · The sample** is written for 16 Oct 2026 (`ADMIN_NOW`); column dates
  follow the period's start and stop at its end, so tests and e2e pin the
  clock. `createMockAdmin({ alerts: "on" | "off" | "unavailable" })` gives the
  other states (Task 1).
- **R13 · Named constants:** `SMALL_GROUP_MIN` (5), `FEWER_THAN_5`, `TOP_MAX`
  (5).
- **R14 · Headings.** The group heading is an `h3` under the page's `h2`; its
  cards and the chart use `h4` (`Card` and `ColumnChart` take a `level`)
  (Tasks 2, 3).

**Tech Stack:** as Plans 2–5a (Next.js 16.4 App Router, React 19.3, TanStack
Query 5, Tailwind 4, `lucide-react` 1.57, Vitest + React Testing Library,
Playwright 1.64.1). No new dependencies.

**Spec:** docs/specs/2026-10-17-usage-alert-analytics-design.md (every
section), docs/specs/2026-10-13-ui-design-v3.md §5.6 (Usage), §6 (wording),
§7 (accessibility) and §10 (backend asks), docs/specs/2026-10-17-notifications-design.md
§3 and §8 (severity, dismissal reasons, findings and locations),
docs/adr/0003-many-emr-systems.md (frontend rules).

**Not in this plan:**

- **Plan 6 Analysis:** longer trends, filters (severity, finding, location,
  source), drill-down from a bar or a column, disease and population
  analysis. It reuses `ColumnChart`, `BarList` and `lib/small-groups.ts`.
- **Generated OpenAPI types.** The contract is written by hand until the
  backend commits `openapi.json`, as in Plans 2–5a.
- **Choosing the thresholds** for "noticeably" and "well above usual": the
  backend's, documented in spec §10 item 21.
- **A Source split** on Usage: Plan 6.

**Sample data (mock):** memory only, deterministic for a given clock, written
for 16 Oct 2026:

- **This month:** 128 alerts (17 Critical, 46 Urgent, 65 Info), up 35%; 9
  still unhandled; median 22 min (up 6 min, worse), Critical 11 min (up
  3 min, worse); 71% of Critical within 15 min (down 17 points, worse, with
  the worsening notice "Critical within 15 min: 71%, down from 88%"); 14 Oct
  flagged at about 3× the usual; Potassium · low (31, up from 9) and Ward 3
  (34, up from 12) rising; "Wrong patient", "Other", Haemoglobin · low and
  the Cardiology clinic hidden as "Fewer than 5";
- **Last month:** 182 alerts across 30 daily columns, better response times,
  0 still unhandled, nothing flagged ("Nothing unusual this period"), two
  reasons and the clinic hidden;
- **Last 90 days:** 525 alerts in 13 weekly columns and `has_previous: false`
  ("Not enough data to compare");
- `createMockAdmin({ alerts: "off" })` sends `alerts: null`; `"unavailable"`
  sends `{ unavailable: true }`.

## Global Constraints

- **Read the Next.js docs before coding** (AGENTS.md). This plan adds no
  route, page or server code; every new component is a client component under
  the existing `"use client"` Usage view.
- **No new dependencies.** Charts are plain React, Tailwind and
  `lucide-react` icons.
- **Plain language; never backend terms (spec §8).** No `suppressed`,
  `critical_target_minutes`, `usual_multiple`, `has_previous`,
  `median_ack_minutes` or `critical_within_target` in UI text, accessible
  names or the CSV. Task 3 adds the codes to `FORBIDDEN_TERMS`. Exact strings
  come from spec §8: "Patient alerts", "What changed", "Nothing unusual this
  period", "Not enough data to compare", "Couldn't load patient alerts",
  "Fewer than 5", "No data yet", "Critical handled within 15 min".
- **EMR-agnostic; no vendor names anywhere** (ADR 0003): not in the UI, code,
  comments, types, tests, sample data, docs or commits. "Not standardised"
  and "Location not recorded" as in ADR 0003. **No "lab" wording**: findings
  are results.
- **Counts only (spec §10).** No patient names, MRNs, beds or alert ids in the
  contract, the sample, the screen or the export.
- **Small-group rule (spec §4).** Any value from a group of fewer than 5
  shows "Fewer than 5" and no bar, on screen and in the CSV. The server
  suppresses; the UI guards (R3). `series` totals are the one exception.
- **The backend computes; the frontend displays.** No differences,
  percentages, medians, thresholds or flags computed from raw numbers in the
  frontend. Rounding, wording and picking the largest column for the summary
  line are display, not statistics.
- **Usage stays a quick summary.** No filters, drill-down or links into
  alerts from this group: those are Plan 6 Analysis (spec §12).
- **Accessibility (spec §9):** severity, better/worse and marked columns
  always carry a word and an icon or marker, never colour alone; every chart
  has a text summary and a table view; columns are reachable from the
  keyboard with a visible focus ring; numbers are written beside every bar;
  44 px targets below `sm`; motion uses the tokens only and is off under
  reduced motion (`lib/motion.test.ts`).
- **Tokens only.** Colours from `app/globals.css` through Tailwind classes;
  no hex values in new code.
- **Labels wrap, never truncate** (`[overflow-wrap:anywhere]`).
- **Tests.** Vitest unit and component tests in every task; Playwright e2e on
  the desktop and mobile projects (Task 5). Tests that read dates pin the
  clock (`ADMIN_NOW`, `page.clock.install`). No fixed sleeps.
- **Docs.** Spec §5.6 and §10 item 21 (Task 1); README, `tests/readme.test.ts`
  and `CHANGELOG.md` under _Unreleased_ (Task 5).
- **Commits.** Imperative subject of at most 72 characters, **no AI
  attribution** (no co-author trailers or "generated with" lines). Work on
  branch `agent/usage-alert-analytics`; humans merge. Never name or copy
  outside reference projects.

## Review Focus

The five real-world failures this feature is most likely to meet that the
happy-path tests would miss. Each has a named test in its owning task.

1. **The alert numbers fail while the rest of Usage loads** (the backend's
   alert job is down, or it sends a half-built block). Expected: "Couldn't
   load patient alerts" with Try again; no tiles, no 0, no "Fewer than 5",
   and never "Nothing unusual this period"; the CSV says "Alerts,Couldn't
   load" instead of leaving the alerts out. Tests: Task 3 ("reads an
   unavailable or half-built block as couldn't load (Review Focus 1)",
   "never reads as zero or Nothing unusual when alerts couldn't load (Review
   Focus 1)", "offers Try again, not zeros, when alerts couldn't load (Review
   Focus 1)"), Task 4 ("says Couldn't load instead of leaving the alerts out
   (Review Focus 1)").
2. **A suppression leak** (a backend bug sends `suppressed: true` with a
   value, or a count of 3 with `suppressed: false`, or flags a small group as
   rising). Expected: "Fewer than 5" and no bar wherever it appears, no
   change beside it, nothing about it in What changed, and "Fewer than 5" in
   the CSV. Tests: Task 1 ("never sends a small number: hidden groups come as
   null (Review Focus 2)"), Task 2 ("writes Fewer than 5 and draws no bar for
   a hidden group, even with a value (Review Focus 2)"), Task 3 ("hides a
   suppressed value and any count from 1 to 4 (Review Focus 2)", "drops small
   rising groups (Review Focus 2)", "never shows a small number or its
   change, even if one is sent (Review Focus 2)"), Task 4 ("never writes a
   small number or a hidden value (Review Focus 2)").
3. **No previous period** (a hospital whose alerts started this month, or a
   backend that still sends changes and flags with `has_previous: false`).
   Expected: "Not enough data to compare", no change beside any number, no
   marked columns and no rising or worsening lines. Tests: Task 3 ("ignores
   every change and flag without a previous period (Review Focus 3)", "says
   Not enough data to compare, with no changes or flags, without a previous
   period (Review Focus 3)").
4. **A change beside a hidden or missing value** (this period's Critical
   count is hidden but the backend still sends "up 40%", or the previous
   count was 3). Expected: no change shown for that number; the rest are
   unaffected. Tests: Task 3 ("shows no change beside a hidden or missing
   value (Review Focus 4)", "never shows a small number or its change, even
   if one is sent (Review Focus 2)").
5. **Alerts switched off, or an older backend** (`alerts: null`, or no
   `alerts` field at all). Expected: no Patient alerts group, nothing on the
   page or in the CSV mentions alerts, and the existing numbers are
   unchanged. Tests: Task 3 ("reads null or a missing field as switched off
   (Review Focus 5)", "shows no alerts group when alerts aren't switched on
   (Review Focus 5)"), Task 4 ("writes no alert rows when alerts are off
   (Review Focus 5)").

---

## File structure

```text
lib/small-groups.ts                  SMALL_GROUP_MIN, FEWER_THAN_5, isSmallCount (new)
lib/api/admin-contract.ts            + GuardedOut, ChangeOut, MeasureOut, FindingGroupOut,
                                       LocationGroupOut, SeriesBucketOut, RisingOut,
                                       UsageAlertsOut, UsageAlertsUnavailableOut; UsageOut.alerts
lib/api/mock-admin.ts                + MockAlertsMode, the sample alert numbers, `alerts` option
tests/admin.ts                       + mockAdminWith(), sampleAlerts()
docs/specs/2026-10-13-ui-design-v3.md  §5.6 Usage bullet, §10 item 21
components/ui/charts/bar-list.tsx    BarList, BarItem (new)
components/ui/charts/column-chart.tsx  ColumnChart, Column (new)
app/globals.css                      + @keyframes rise
components/admin/usage-view.tsx      cards on BarList; mounts UsageAlerts; Tile/Card imported
components/admin/usage-parts.tsx     Tile, Card (moved from usage-view, Card gains `level`) (new)
lib/admin/alert-usage.ts             readAlerts, shown, valueText, changeFor, changeText,
                                       verdict, labels, whatChanged, columnsOf (new)
components/admin/usage-alerts.tsx    UsageAlerts (new)
components/notifications/chips.tsx   exports SEVERITY_ICON
lib/labels.ts                        FORBIDDEN_TERMS + the usage alert codes
lib/admin/csv.ts                     + alertsCsvRows; usageCsv appends it
tests/e2e/hospital-admin.spec.ts     + two Usage tests
README.md, tests/readme.test.ts, CHANGELOG.md
```

---

### Task 1: The usage alerts contract, the client and the sample numbers

**Files:**

- Create: `lib/small-groups.ts`
- Modify: `lib/api/admin-contract.ts`, `lib/api/mock-admin.ts`,
  `lib/api/mock-admin.test.ts`, `lib/api/live-admin.test.ts`,
  `tests/admin.ts`, `docs/specs/2026-10-13-ui-design-v3.md`
- Test: `lib/api/mock-admin.test.ts`, `lib/api/live-admin.test.ts`

**Interfaces:**

- Consumes: `AlertLocationOut`, `AlertSeverity`, `DismissReason`
  (`lib/api/alerts-contract.ts`); `PERIODS` (`lib/admin/report.ts`);
  `createMockAdmin`, `mockAdminAs`, `ADMIN_NOW` (existing).
- Produces (`lib/small-groups.ts`): `SMALL_GROUP_MIN = 5`,
  `FEWER_THAN_5 = "Fewer than 5"`, `isSmallCount(n: number): boolean`
  (true for 1 to 4).
- Produces (`lib/api/admin-contract.ts`): `GuardedOut`, `ChangeDirection`,
  `ChangeOut`, `MeasureOut`, `FindingGroupOut`, `LocationGroupOut`,
  `DismissReasonCountOut`, `SeriesBucketOut`, `AlertSeriesOut`, `RisingOut`,
  `WorseningOut`, `UsageAlertsOut`, `UsageAlertsUnavailableOut`, and
  `UsageOut.alerts?: UsageAlertsOut | UsageAlertsUnavailableOut | null`
  (exact shapes below).
- Produces (`lib/api/mock-admin.ts`):
  `type MockAlertsMode = "on" | "off" | "unavailable"` and the
  `createMockAdmin` option `alerts?: MockAlertsMode` (default `"on"`).
- Produces (`tests/admin.ts`):
  `mockAdminWith(alerts: MockAlertsMode, email?: string): AdminClient` (at
  `ADMIN_NOW`, instant) and
  `sampleAlerts(period?: UsagePeriod): Promise<UsageAlertsOut>`.
- `AdminClient.getUsage` and `useUsage` keep their signatures.

- [ ] **Step 1: Write the failing tests**

In `lib/api/mock-admin.test.ts`, add to the imports:

```ts
import type { GuardedOut, UsageAlertsOut } from "./admin-contract";
import { PERIODS } from "@/lib/admin/report";
import { SMALL_GROUP_MIN } from "@/lib/small-groups";
import { mockAdminWith } from "@/tests/admin";
```

and add, after "gives usage as counts that add up":

```ts
describe("usage alerts (sample, at 16 Oct)", () => {
  const alertsOf = async (p: (typeof PERIODS)[number]["id"]) =>
    (await director().getUsage(p)).alerts as UsageAlertsOut;
  const counts = (a: UsageAlertsOut): GuardedOut[] => [
    a.total,
    a.by_severity.critical,
    a.by_severity.urgent,
    a.by_severity.info,
    a.unhandled,
    ...a.dismiss_reasons.map((r) => r.count),
    ...a.top_findings.map((f) => f.count),
    ...a.top_locations.map((l) => l.count),
  ];

  it("adds up, with a busy day, rising groups and slower Critical handling", async () => {
    const a = await alertsOf("this_month");
    const s = a.by_severity;
    expect(s.critical.value! + s.urgent.value! + s.info.value!).toBe(
      a.total.value,
    );
    expect(a.total).toEqual({
      value: 128,
      suppressed: false,
      change: { direction: "up", amount: 35, previous: 95 },
    });
    expect(a.critical_target_minutes).toBe(15);
    expect(a.series.bucket).toBe("day");
    expect(a.series.points).toHaveLength(16);
    expect(a.series.points[0]!.start).toBe("2026-10-01");
    expect(a.series.points.at(-1)!.start).toBe("2026-10-16");
    expect(a.series.points.reduce((n, p) => n + p.total, 0)).toBe(128);
    expect(a.series.points.filter((p) => p.usual_multiple !== null)).toEqual([
      { start: "2026-10-14", total: 23, usual_multiple: 3.1 },
    ]);
    expect(a.rising).toEqual([
      {
        kind: "finding",
        name: "Potassium",
        flag: "low",
        count: 31,
        previous: 9,
      },
      {
        kind: "location",
        location: { kind: "admitted", ward: "Ward 3", bed: null },
        count: 34,
        previous: 12,
      },
    ]);
    expect(a.worsening).toEqual({ value: 0.71, previous: 0.88 });
  });

  it("never sends a small number: hidden groups come as null (Review Focus 2)", async () => {
    for (const p of PERIODS) {
      const a = await alertsOf(p.id);
      for (const c of counts(a)) {
        if (c.suppressed) expect(c.value).toBeNull();
        else
          expect(
            c.value === 0 || (c.value !== null && c.value >= SMALL_GROUP_MIN),
          ).toBe(true);
      }
      for (const r of a.rising) {
        expect(r.count).toBeGreaterThanOrEqual(SMALL_GROUP_MIN);
        expect(r.previous).toBeGreaterThanOrEqual(SMALL_GROUP_MIN);
      }
      for (const l of a.top_locations)
        if (l.location?.kind === "admitted") expect(l.location.bed).toBeNull();
      expect(a.top_findings.length).toBeLessThanOrEqual(5);
      expect(a.top_locations.length).toBeLessThanOrEqual(5);
    }
    // Two reasons hidden together, so neither can be worked out from the rest.
    const a = await alertsOf("this_month");
    expect(
      a.dismiss_reasons.filter((r) => r.count.suppressed).map((r) => r.reason),
    ).toEqual(["wrong_patient", "other"]);
  });

  it("flags nothing last month, and has no earlier period for the last 90 days", async () => {
    const last = await alertsOf("last_month");
    expect(last.has_previous).toBe(true);
    expect(last.rising).toEqual([]);
    expect(last.worsening).toBeNull();
    expect(last.series.points).toHaveLength(30);
    expect(last.series.points.every((p) => p.usual_multiple === null)).toBe(
      true,
    );
    expect(last.unhandled).toEqual({
      value: 0,
      suppressed: false,
      change: null,
    });

    const ninety = await alertsOf("last_90_days");
    expect(ninety.has_previous).toBe(false);
    expect(ninety.series.bucket).toBe("week");
    expect(ninety.series.points).toHaveLength(13);
    expect(ninety.series.points[0]!.start).toBe("2026-07-18");
    expect(ninety.series.points.reduce((n, p) => n + p.total, 0)).toBe(
      ninety.total.value,
    );
    expect(ninety.rising).toEqual([]);
    expect(ninety.worsening).toBeNull();
    expect(
      [
        ninety.total,
        ninety.median_ack_minutes,
        ninety.critical_within_target,
      ].map((m) => m.change),
    ).toEqual([null, null, null]);
  });

  it("is the same every time (deterministic)", async () => {
    const a = director();
    expect(await a.getUsage("this_month")).toEqual(
      await a.getUsage("this_month"),
    );
    expect(await a.getUsage("this_month")).toEqual(
      await director().getUsage("this_month"),
    );
  });

  it("can be switched off, or fail, for tests", async () => {
    expect(
      (await mockAdminWith("off").getUsage("this_month")).alerts,
    ).toBeNull();
    expect(
      (await mockAdminWith("unavailable").getUsage("this_month")).alerts,
    ).toEqual({ unavailable: true });
  });
});
```

In `lib/api/live-admin.test.ts`, add inside `describe("live admin client")`:

```ts
it("hands back the usage alerts block as the API sent it", async () => {
  const body = { period: "this_month", alerts: { unavailable: true } };
  reply(() => Response.json(body));
  expect(await client().getUsage("this_month")).toEqual(body);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/api/mock-admin.test.ts lib/api/live-admin.test.ts`
Expected: FAIL: the type imports and `mockAdminWith` don't exist, and
`alerts` is undefined. (The live test already passes: the client returns the
body as sent. Keep it as the guard that it stays that way.)

- [ ] **Step 3: The small-group constants and the contract**

Create `lib/small-groups.ts`:

```ts
// The small-group rule (analysis design; usage alert analytics design §4):
// any number from a group of fewer than 5 shows "Fewer than 5". The server
// hides such values; the UI shows the words and never a bar. Shared by
// Usage (Plan 5b) and Analysis (Plan 6).

export const SMALL_GROUP_MIN = 5;
export const FEWER_THAN_5 = "Fewer than 5";

/** 1 to 4: a count the server should have hidden. Zero identifies no one. */
export const isSmallCount = (n: number) => n > 0 && n < SMALL_GROUP_MIN;
```

In `lib/api/admin-contract.ts`, add at the top:

```ts
import type {
  AlertLocationOut,
  AlertSeverity,
  DismissReason,
  FindingFlag,
} from "./alerts-contract";
```

Replace the `UsageOut` interface with:

```ts
export interface UsageOut {
  period: UsagePeriod;
  from: string;
  to: string;
  consultations: number;
  active_clinicians: number;
  /** 0–1; null when nothing was rated. */
  agreement_rate: number | null;
  median_review_hours: number | null;
  /** Counts per confidence level. */
  confidence: Record<ConfidenceLevel, number>;
  by_specialty: { specialty: string; consultations: number }[];
  /**
   * Patient alerts (Plan 5b, spec §10 item 21). Null or absent: alerts aren't
   * switched on (an older backend sends no field). `{ unavailable: true }`:
   * the rest of usage is fine but the alert numbers couldn't be computed.
   */
  alerts?: UsageAlertsOut | UsageAlertsUnavailableOut | null;
}

/**
 * A number under the small-group rule. A hidden value is
 * `{ value: null, suppressed: true }`; `value: null` with `suppressed: false`
 * means there was nothing to measure.
 */
export interface GuardedOut {
  value: number | null;
  suppressed: boolean;
}

export type ChangeDirection = "up" | "down" | "same";

/** The backend's comparison with the previous period of the same length. */
export interface ChangeOut {
  direction: ChangeDirection;
  /** Whole percent for counts, minutes for times, percentage points for shares. */
  amount: number;
  /** The previous period's value, in the measure's unit (0–1 for shares). Never hidden. */
  previous: number;
}

/** A number with its change. `change` is null when either period is hidden or missing. */
export interface MeasureOut extends GuardedOut {
  change: ChangeOut | null;
}

export interface FindingGroupOut {
  /** Display label, e.g. "Potassium"; null for the unmapped findings ("Not standardised"). */
  name: string | null;
  flag: FindingFlag | null;
  count: GuardedOut;
}

export interface LocationGroupOut {
  /** Ward level at most (`bed` is null). Null reads "Location not recorded". */
  location: AlertLocationOut | null;
  count: GuardedOut;
}

export interface DismissReasonCountOut {
  reason: DismissReason;
  count: GuardedOut;
}

export interface SeriesBucketOut {
  /** The hospital's calendar day, or the week's first day: "YYYY-MM-DD". */
  start: string;
  /** Hospital-wide; not suppressed. */
  total: number;
  /** About how many times the usual level, when flagged as unusual; else null. */
  usual_multiple: number | null;
}

export interface AlertSeriesOut {
  /** Days for this_month and last_month, weeks for last_90_days. */
  bucket: "day" | "week";
  /** Oldest first. */
  points: SeriesBucketOut[];
}

/** A finding or location well up on the previous period: at least 5 in both. */
export type RisingOut =
  | {
      kind: "finding";
      name: string | null;
      flag: FindingFlag | null;
      count: number;
      previous: number;
    }
  | {
      kind: "location";
      location: AlertLocationOut | null;
      count: number;
      previous: number;
    };

/** Critical handled within the target dropped noticeably (shares 0–1). */
export interface WorseningOut {
  value: number;
  previous: number;
}

export interface UsageAlertsOut {
  /** The hospital's target for handling a Critical alert, in minutes (15 by default). */
  critical_target_minutes: number;
  /** False when there's no earlier period of the same length: no changes, no flags. */
  has_previous: boolean;
  total: MeasureOut;
  by_severity: Record<AlertSeverity, MeasureOut>;
  unhandled: MeasureOut;
  /** Minutes from raised to acknowledged; value null when none was acknowledged. */
  median_ack_minutes: MeasureOut;
  median_ack_minutes_critical: MeasureOut;
  /** 0–1: Critical alerts acknowledged or dismissed within the target. */
  critical_within_target: MeasureOut;
  /** 0–1 of handled alerts. */
  acknowledged_share: MeasureOut;
  dismissed_share: MeasureOut;
  /** All four reasons: not_relevant, already_known, wrong_patient, other. */
  dismiss_reasons: DismissReasonCountOut[];
  /** At most 5 each, largest first. */
  top_findings: FindingGroupOut[];
  top_locations: LocationGroupOut[];
  series: AlertSeriesOut;
  rising: RisingOut[];
  worsening: WorseningOut | null;
}

export interface UsageAlertsUnavailableOut {
  unavailable: true;
}
```

Update the file's header comment to say the usage contract carries alert
counts only, never patients, MRNs, beds or alert ids.

- [ ] **Step 4: The sample numbers**

In `lib/api/mock-admin.ts`, add to the type imports `ChangeOut`,
`GuardedOut`, `MeasureOut`, `UsageAlertsOut` (from `./admin-contract`) and
`AlertLocationOut` (from `./alerts-contract`). After `periodRange`, add:

```ts
/** The usage alerts sample: switched on, switched off (null) or failing. */
export type MockAlertsMode = "on" | "off" | "unavailable";

const shown = (value: number): GuardedOut => ({ value, suppressed: false });
const hidden = (): GuardedOut => ({ value: null, suppressed: true });
const measure = (
  value: number,
  change: ChangeOut | null = null,
): MeasureOut => ({
  value,
  suppressed: false,
  change,
});
const up = (amount: number, previous: number): ChangeOut => ({
  direction: "up",
  amount,
  previous,
});
const down = (amount: number, previous: number): ChangeOut => ({
  direction: "down",
  amount,
  previous,
});
const ward = (name: string): AlertLocationOut => ({
  kind: "admitted",
  ward: name,
  bed: null,
});
const CARDIOLOGY: AlertLocationOut = {
  kind: "outpatient",
  clinic: "Cardiology clinic",
};
const EMERGENCY: AlertLocationOut = { kind: "emergency" };

type SeriesSeed = {
  bucket: "day" | "week";
  /** One per bucket from the period's first day. */
  values: readonly number[];
  /** Bucket index → about how many times the usual. */
  unusual?: Readonly<Record<number, number>>;
};
type AlertsSeed = Omit<UsageAlertsOut, "series"> & { series: SeriesSeed };

/**
 * Written for 16 Oct 2026 (R12). The server's small-group rule is already
 * applied: hidden groups are null, and where one group in a set is hidden,
 * another is too, so neither can be worked out from the rest.
 */
const USAGE_ALERTS: Record<UsagePeriod, AlertsSeed> = {
  this_month: {
    critical_target_minutes: 15,
    has_previous: true,
    total: measure(128, up(35, 95)),
    by_severity: {
      critical: measure(17, up(42, 12)),
      urgent: measure(46, up(21, 38)),
      info: measure(65, up(44, 45)),
    },
    // None was unhandled on the same days last month: no percentage from 0.
    unhandled: measure(9),
    median_ack_minutes: measure(22, up(6, 16)),
    median_ack_minutes_critical: measure(11, up(3, 8)),
    critical_within_target: measure(0.71, down(17, 0.88)),
    acknowledged_share: measure(0.82, down(3, 0.85)),
    dismissed_share: measure(0.18, up(3, 0.15)),
    dismiss_reasons: [
      { reason: "not_relevant", count: shown(9) },
      { reason: "already_known", count: shown(7) },
      { reason: "wrong_patient", count: hidden() },
      { reason: "other", count: hidden() },
    ],
    top_findings: [
      { name: "Potassium", flag: "low", count: shown(31) },
      { name: "Sodium", flag: "low", count: shown(24) },
      { name: "Platelets", flag: "low", count: shown(18) },
      { name: null, flag: null, count: shown(11) },
      { name: "Haemoglobin", flag: "low", count: hidden() },
    ],
    top_locations: [
      { location: ward("Ward 3"), count: shown(34) },
      { location: EMERGENCY, count: shown(29) },
      { location: ward("Ward 5"), count: shown(21) },
      { location: null, count: shown(8) },
      { location: CARDIOLOGY, count: hidden() },
    ],
    series: {
      bucket: "day",
      values: [6, 7, 5, 8, 6, 7, 9, 6, 7, 8, 6, 7, 8, 23, 7, 8],
      unusual: { 13: 3.1 },
    },
    rising: [
      {
        kind: "finding",
        name: "Potassium",
        flag: "low",
        count: 31,
        previous: 9,
      },
      { kind: "location", location: ward("Ward 3"), count: 34, previous: 12 },
    ],
    worsening: { value: 0.71, previous: 0.88 },
  },
  last_month: {
    critical_target_minutes: 15,
    has_previous: true,
    total: measure(182, up(7, 170)),
    by_severity: {
      critical: measure(22, down(12, 25)),
      urgent: measure(70, up(6, 66)),
      info: measure(90, up(14, 79)),
    },
    unhandled: measure(0),
    median_ack_minutes: measure(16, down(2, 18)),
    median_ack_minutes_critical: measure(8, down(1, 9)),
    critical_within_target: measure(0.88, up(2, 0.86)),
    acknowledged_share: measure(0.82, up(2, 0.8)),
    dismissed_share: measure(0.18, down(2, 0.2)),
    dismiss_reasons: [
      { reason: "not_relevant", count: shown(14) },
      { reason: "already_known", count: shown(11) },
      // 2 is hidden, so 5 is hidden too: otherwise 2 could be worked out.
      { reason: "wrong_patient", count: hidden() },
      { reason: "other", count: hidden() },
    ],
    top_findings: [
      { name: "Sodium", flag: "low", count: shown(41) },
      { name: "Platelets", flag: "low", count: shown(33) },
      { name: "Potassium", flag: "low", count: shown(14) },
      { name: null, flag: null, count: shown(12) },
      { name: "Glucose", flag: "high", count: shown(9) },
    ],
    top_locations: [
      { location: EMERGENCY, count: shown(52) },
      { location: ward("Ward 5"), count: shown(40) },
      { location: ward("Ward 3"), count: shown(22) },
      { location: null, count: shown(10) },
      { location: CARDIOLOGY, count: hidden() },
    ],
    series: {
      bucket: "day",
      values: [
        6, 7, 5, 6, 7, 6, 5, 6, 7, 6, 6, 7, 5, 6, 7, 6, 5, 6, 7, 6, 6, 7, 5, 6,
        7, 6, 5, 6, 7, 5,
      ],
    },
    rising: [],
    worsening: null,
  },
  last_90_days: {
    critical_target_minutes: 15,
    has_previous: false,
    total: measure(525),
    by_severity: {
      critical: measure(63),
      urgent: measure(189),
      info: measure(273),
    },
    unhandled: measure(9),
    median_ack_minutes: measure(19),
    median_ack_minutes_critical: measure(10),
    critical_within_target: measure(0.8),
    acknowledged_share: measure(0.82),
    dismissed_share: measure(0.18),
    dismiss_reasons: [
      { reason: "not_relevant", count: shown(40) },
      { reason: "already_known", count: shown(33) },
      { reason: "wrong_patient", count: shown(6) },
      { reason: "other", count: shown(12) },
    ],
    top_findings: [
      { name: "Sodium", flag: "low", count: shown(110) },
      { name: "Platelets", flag: "low", count: shown(86) },
      { name: "Potassium", flag: "low", count: shown(64) },
      { name: null, flag: null, count: shown(41) },
      { name: "Glucose", flag: "high", count: shown(30) },
    ],
    top_locations: [
      { location: EMERGENCY, count: shown(150) },
      { location: ward("Ward 5"), count: shown(118) },
      { location: ward("Ward 3"), count: shown(80) },
      { location: null, count: shown(34) },
      { location: CARDIOLOGY, count: shown(21) },
    ],
    series: {
      bucket: "week",
      values: [38, 41, 36, 40, 39, 42, 37, 44, 40, 43, 41, 45, 39],
    },
    rising: [],
    worsening: null,
  },
};

/** Buckets from the period's first day, never past its end (R12). */
function seriesFor(
  seed: SeriesSeed,
  from: string,
  to: string,
): UsageAlertsOut["series"] {
  const step = seed.bucket === "day" ? D : 7 * D;
  const first = Date.parse(`${from.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(to);
  const points = seed.values.flatMap((total, i) => {
    const t = first + i * step;
    return t > end
      ? []
      : [
          {
            start: iso(t).slice(0, 10),
            total,
            usual_multiple: seed.unusual?.[i] ?? null,
          },
        ];
  });
  return { bucket: seed.bucket, points };
}

function alertsFor(
  p: UsagePeriod,
  range: { from: string; to: string },
  mode: MockAlertsMode,
): UsageOut["alerts"] {
  if (mode === "off") return null;
  if (mode === "unavailable") return { unavailable: true };
  const { series, ...rest } = copy(USAGE_ALERTS[p]);
  return { ...rest, series: seriesFor(series, range.from, range.to) };
}
```

Add the option to `createMockAdmin`:

```ts
  stepUp,
  alerts: alertsMode = "on",
}: {
  // …the existing options…
  /** The usage alerts sample: on (default), switched off, or failing. */
  alerts?: MockAlertsMode;
} = {}): AdminClient {
```

and replace `getUsage`:

```ts
    async getUsage(period) {
      await wait();
      const range = periodRange(period, now());
      return {
        period,
        ...range,
        ...copy(USAGE[period]),
        alerts: alertsFor(period, range, alertsMode),
      };
    },
```

In `tests/admin.ts`, add:

```ts
import type { UsageAlertsOut, UsagePeriod } from "@/lib/api/admin-contract";
import { createMockAdmin, type MockAlertsMode } from "@/lib/api/mock-admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";

/** The sample hospital at ADMIN_NOW with its alerts on, off or failing. */
export const mockAdminWith = (
  alerts: MockAlertsMode,
  email: string = DEMO_EMAILS.director,
): AdminClient =>
  createMockAdmin({
    now: () => ADMIN_NOW,
    me: async () => email,
    delayMs: 0,
    alerts,
  });

/** A period's sample alert numbers at ADMIN_NOW. */
export async function sampleAlerts(
  period: UsagePeriod = "this_month",
): Promise<UsageAlertsOut> {
  return (await mockAdminWith("on").getUsage(period)).alerts as UsageAlertsOut;
}
```

(Merge the `createMockAdmin` import with the existing one.)

- [ ] **Step 5: Write the backend ask into the UI spec**

In `docs/specs/2026-10-13-ui-design-v3.md` §5.6, under **Usage**, after the
counts bullet, add:

```markdown
- when patient alerts are switched on, a **Patient alerts** summary:
  volumes, response times, outcomes, the top findings and locations, a
  column chart over time and **What changed** against the previous period,
  with groups of fewer than 5 hidden
  ([usage alert analytics design](2026-10-17-usage-alert-analytics-design.md),
  Plan 5b). Deeper trends and drill-down are Analysis (Plan 6);
```

In §10, after item 20, add:

```markdown
21. **Patient alert numbers on Usage.** **Assumed contract** (Plan 5b;
    `docs/specs/2026-10-17-usage-alert-analytics-design.md` §13). The
    frontend reads these until the backend defines them, so please match
    them or tell us what changed:
    - `GET /hospital/usage` gains `alerts`: `null` when alerts aren't
      switched on for the hospital, `{ "unavailable": true }` when the rest
      of usage is fine but the alert numbers can't be computed, or the block
      below. A reply without the field reads as switched off;
    - counts only, for the admin's own hospital: no patient, MRN, bed or
      alert id;
    - **small-group rule:** every value except `series` comes as
      `{value, suppressed}`; any value from a group of fewer than 5 is sent
      as `{ "value": null, "suppressed": true }`, before the response leaves
      the server. Where one group in a set that adds up (severities,
      dismissal reasons, acknowledged and dismissed) is hidden, hide enough
      others that the hidden ones together are at least 5. Shares and
      medians over fewer than 5 are hidden. Zero is sent as 0;
    - the block: `critical_target_minutes` (the hospital's target, 15 by
      default), `has_previous`, `total`, `by_severity` (`critical`,
      `urgent`, `info`), `unhandled`, `median_ack_minutes`,
      `median_ack_minutes_critical`, `critical_within_target` (0–1),
      `acknowledged_share` and `dismissed_share` (0–1 of handled alerts),
      `dismiss_reasons` (all four, as for dismiss), `top_findings` (at most
      5: `name`, null for unmapped, and `flag`), `top_locations` (at most 5,
      ward level, `bed` always null), `series` (`bucket` `day` for
      `this_month` and `last_month`, `week` for `last_90_days`; `points`
      `{start: "YYYY-MM-DD", total, usual_multiple}`, hospital-wide and not
      suppressed), `rising` and `worsening`;
    - every number except the groups carries `change`
      (`{direction: "up"|"down"|"same", amount, previous}`: whole percent for
      counts, minutes for times, percentage points for shares) against the
      previous period of the same length, or `null` when either side is
      hidden or missing or the previous count is 0. With
      `has_previous: false`, every `change` is null and there are no flags;
    - the backend computes every flag: `usual_multiple` on buckets well above
      the usual level, `rising` findings and locations (at least 5 in both
      periods), and `worsening` when `critical_within_target` drops
      noticeably. Please document the thresholds;
    - `Cache-Control: no-store`, as for the rest of usage.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/api && npm run typecheck`
Expected: PASS, including the existing "gives usage as counts that add up"
and every live admin test. Typecheck is clean (`lib/admin/csv.test.ts`
builds a `UsageOut` without `alerts`, which the optional field allows).

- [ ] **Step 7: Commit**

```bash
git add lib/small-groups.ts lib/api/admin-contract.ts lib/api/mock-admin.ts \
  lib/api/mock-admin.test.ts lib/api/live-admin.test.ts tests/admin.ts \
  docs/specs/2026-10-13-ui-design-v3.md
git commit -m "Add the usage alerts contract and sample alert numbers"
```

---

### Task 2: The chart components: BarList and ColumnChart

**Files:**

- Create: `components/ui/charts/bar-list.tsx`,
  `components/ui/charts/column-chart.tsx`,
  `components/ui/charts/charts.test.tsx`
- Modify: `app/globals.css`, `components/admin/usage-view.tsx`
- Test: `components/ui/charts/charts.test.tsx`,
  `components/admin/usage-view.test.tsx` (unchanged, must still pass),
  `lib/motion.test.ts` (unchanged, must still pass)

**Interfaces:**

- Consumes: `FEWER_THAN_5` (`lib/small-groups.ts`, Task 1); `Button`, `cn`
  (`components/ui`).
- Produces (`components/ui/charts/bar-list.tsx`):

  ```ts
  export interface BarItem {
    key: string;
    label: ReactNode;
    /** Bar length in the list's scale; null draws no bar. */
    value: number | null;
    /** Written beside the bar, e.g. "412" or "62%". */
    text: string;
    /** Under the small-group rule: writes "Fewer than 5" and draws no bar. */
    hidden?: boolean;
    icon?: ReactNode;
    /** Bar colour class; `bg-mint` by default. */
    barClass?: string;
  }
  export function BarList(props: {
    items: readonly BarItem[];
    /** The full-bar value; the largest shown value by default. */
    max?: number;
    label?: string;
    empty?: string; // "Nothing to show yet." by default
  }): JSX.Element;
  ```

- Produces (`components/ui/charts/column-chart.tsx`):

  ```ts
  export interface Column {
    key: string;
    /** e.g. "14 Oct" or "Week of 6 Oct". */
    label: string;
    value: number;
    /** Why this column is marked, e.g. "about 3× the usual"; null when not. */
    mark?: string | null;
  }
  export function ColumnChart(props: {
    title: string;
    columns: readonly Column[];
    /** The one-line text summary, always visible. */
    summary: string;
    /** A column's value in words, e.g. (23) => "23 alerts". */
    valueText: (n: number) => string;
    /** Table headers: [the bucket, the value], e.g. ["Day", "Alerts"]. */
    headers: readonly [string, string];
    /** The legend for marked columns. */
    markLegend?: string; // "Unusually busy" by default
    level?: 2 | 3 | 4; // heading level, 3 by default
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

Create `components/ui/charts/charts.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BarList } from "./bar-list";
import { ColumnChart, type Column } from "./column-chart";

const bars = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((li) => li.querySelector<HTMLElement>("[aria-hidden] > span"));

describe("BarList", () => {
  it("writes the number beside each bar and scales to the largest", () => {
    render(
      <BarList
        label="By specialty"
        items={[
          { key: "a", label: "Internal Medicine", value: 412, text: "412" },
          { key: "b", label: "Cardiology", value: 103, text: "103" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "By specialty" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Internal Medicine412", "Cardiology103"]);
    expect(bars(list).map((b) => b?.style.width)).toEqual(["100%", "25%"]);
  });

  it("writes Fewer than 5 and draws no bar for a hidden group, even with a value (Review Focus 2)", () => {
    render(
      <BarList
        label="Reasons"
        items={[
          { key: "a", label: "Already known", value: 9, text: "9" },
          {
            key: "b",
            label: "Wrong patient",
            value: 3,
            text: "3",
            hidden: true,
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Reasons" });
    const [shown, hidden] = within(list).getAllByRole("listitem");
    expect(shown).toHaveTextContent("Already known9");
    expect(hidden).toHaveTextContent(/^Wrong patientFewer than 5$/);
    expect(hidden!.querySelector("[aria-hidden]")).toBeNull();
    expect(list.textContent).not.toContain("3");
  });

  it("uses a fixed scale when given one, and says when there's nothing", () => {
    const { rerender } = render(
      <BarList
        label="Mix"
        max={100}
        items={[{ key: "a", label: "High confidence", value: 62, text: "62%" }]}
      />,
    );
    expect(
      bars(screen.getByRole("list", { name: "Mix" }))[0]?.style.width,
    ).toBe("62%");
    rerender(<BarList label="Mix" items={[]} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });

  it("grows its bars only when motion is allowed", () => {
    render(
      <BarList
        label="L"
        items={[{ key: "a", label: "A", value: 1, text: "1" }]}
      />,
    );
    const bar = bars(screen.getByRole("list", { name: "L" }))[0]!;
    expect(bar.className).toContain(
      "motion-safe:animate-[grow_var(--t-story)_var(--e-out)_both]",
    );
  });
});

const COLUMNS: Column[] = [
  { key: "1", label: "12 Oct", value: 7 },
  { key: "2", label: "13 Oct", value: 8 },
  { key: "3", label: "14 Oct", value: 23, mark: "about 3× the usual" },
  { key: "4", label: "15 Oct", value: 0 },
];
const chart = (columns = COLUMNS) =>
  render(
    <ColumnChart
      title="Alerts over time"
      columns={columns}
      summary="Most alerts on 14 Oct: 23"
      valueText={(n) => (n === 1 ? "1 alert" : `${n} alerts`)}
      headers={["Day", "Alerts"]}
    />,
  );

describe("ColumnChart", () => {
  it("has a title, a text summary and a name for every column", () => {
    chart();
    const region = screen.getByRole("region", { name: "Alerts over time" });
    expect(within(region).getByText("Most alerts on 14 Oct: 23")).toBeVisible();
    const list = within(region).getByRole("list", { name: "Alerts over time" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual([
      "12 Oct: 7 alerts",
      "13 Oct: 8 alerts",
      "14 Oct: 23 alerts, about 3× the usual",
      "15 Oct: 0 alerts",
    ]);
    // Marked with a marker and a legend, never colour alone.
    expect(within(region).getByText("Unusually busy")).toBeVisible();
  });

  it("shows the same numbers as a table, and back", async () => {
    chart();
    const toggle = screen.getByRole("button", { name: "Show as table" });
    await userEvent.click(toggle);
    const table = screen.getByRole("table", { name: "Alerts over time" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Day", "Alerts", "Note"]);
    expect(
      within(table).getByRole("row", { name: "14 Oct 23 about 3× the usual" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    const back = screen.getByRole("button", { name: "Show as chart" });
    expect(back).toHaveFocus();
    await userEvent.click(back);
    expect(
      screen.getByRole("list", { name: "Alerts over time" }),
    ).toBeVisible();
  });

  it("is one tab stop, and the arrow keys, Home and End move between columns", async () => {
    chart();
    const items = screen.getAllByRole("listitem");
    expect(items.filter((li) => li.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab(); // the toggle
    await userEvent.tab(); // the columns
    expect(items[0]).toHaveFocus();
    expect(
      screen.getByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeVisible();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(items[2]).toHaveFocus();
    expect(
      screen.getByText("14 Oct: 23 alerts, about 3× the usual", {
        selector: "p",
      }),
    ).toBeVisible();
    await userEvent.keyboard("{End}");
    expect(items[3]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("role")).not.toBe("listitem");
  });

  it("has a phone layout: a shorter plot, end dates only and a 44px toggle", () => {
    chart();
    expect(screen.getByRole("list").className).toMatch(/\bh-28\b.*\bsm:h-40\b/);
    expect(
      screen.getByText("13 Oct", { selector: "span" }).className,
    ).toContain("hidden sm:inline");
    expect(
      screen.getByRole("button", { name: "Show as table" }).className,
    ).toContain("min-h-11");
  });

  it("grows its columns only when motion is allowed", () => {
    chart();
    const col = screen
      .getAllByRole("listitem")[0]!
      .querySelector("span:last-child")!;
    expect(col.className).toContain(
      "motion-safe:animate-[rise_var(--t-story)_var(--e-out)_both]",
    );
  });

  it("shows only the summary when there are no columns", () => {
    chart([]);
    expect(screen.getByText("Most alerts on 14 Oct: 23")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run components/ui/charts`
Expected: FAIL with "Failed to resolve import './bar-list'".

- [ ] **Step 3: Write BarList**

Create `components/ui/charts/bar-list.tsx`:

```tsx
import type { ReactNode } from "react";
import { FEWER_THAN_5 } from "@/lib/small-groups";
import { cn } from "../cn";

export interface BarItem {
  key: string;
  label: ReactNode;
  /** Bar length in the list's scale; null draws no bar. */
  value: number | null;
  /** Written beside the bar, e.g. "412" or "62%". */
  text: string;
  /** Under the small-group rule: writes "Fewer than 5" and draws no bar. */
  hidden?: boolean;
  icon?: ReactNode;
  /** Bar colour class; `bg-mint` by default. */
  barClass?: string;
}

/**
 * Horizontal bars with the number always written beside them (the Usage
 * page's style). Knows nothing about what it counts, so Analysis reuses it.
 */
export function BarList({
  items,
  max,
  label,
  empty = "Nothing to show yet.",
}: {
  items: readonly BarItem[];
  max?: number;
  label?: string;
  empty?: string;
}) {
  if (!items.length) return <p className="text-[13px] text-ink-3">{empty}</p>;
  const drawn = (i: BarItem) =>
    !i.hidden && i.value !== null && Number.isFinite(i.value);
  const top =
    max ?? Math.max(1, ...items.map((i) => (drawn(i) ? i.value! : 0)));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.key} className="text-[13px]">
          <span className="flex items-center gap-2">
            {i.icon}
            <span className="flex-1 [overflow-wrap:anywhere]">{i.label}</span>
            {i.hidden ? (
              <b className="font-semibold text-ink-2">{FEWER_THAN_5}</b>
            ) : (
              <b className="font-mono">{i.text}</b>
            )}
          </span>
          {drawn(i) && (
            <span
              aria-hidden
              className="mt-1 block h-1.5 rounded-full bg-lilac"
            >
              <span
                className={cn(
                  "block h-full rounded-full motion-safe:animate-[grow_var(--t-story)_var(--e-out)_both]",
                  i.barClass ?? "bg-mint",
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, Math.round((i.value! * 100) / top)))}%`,
                }}
              />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write ColumnChart and its keyframe**

In `app/globals.css`, after `@keyframes grow`, add:

```css
@keyframes rise {
  from {
    transform: scaleY(0);
  }
}
```

Create `components/ui/charts/column-chart.tsx`:

```tsx
"use client";
import { ChartColumn, Table2 } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../button";
import { cn } from "../cn";

export interface Column {
  key: string;
  /** e.g. "14 Oct" or "Week of 6 Oct". */
  label: string;
  value: number;
  /** Why this column is marked, e.g. "about 3× the usual"; null when not. */
  mark?: string | null;
}

const HEADING = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * Columns over time with a text summary, a table view, one tab stop with
 * arrow-key movement, and a phone layout. Knows nothing about what it
 * counts, so Analysis reuses it.
 */
export function ColumnChart({
  title,
  columns,
  summary,
  valueText,
  headers,
  markLegend = "Unusually busy",
  level = 3,
}: {
  title: string;
  columns: readonly Column[];
  summary: string;
  valueText: (n: number) => string;
  headers: readonly [string, string];
  markLegend?: string;
  level?: 2 | 3 | 4;
}) {
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const titleId = useId();
  const summaryId = useId();
  const H = HEADING[level];
  const top = Math.max(1, ...columns.map((c) => c.value));
  const marked = columns.some((c) => c.mark);
  const describe = (c: Column) =>
    `${c.label}: ${valueText(c.value)}${c.mark ? `, ${c.mark}` : ""}`;
  const last = columns.length - 1;

  function move(e: KeyboardEvent, i: number) {
    const to =
      e.key === "ArrowRight"
        ? Math.min(last, i + 1)
        : e.key === "ArrowLeft"
          ? Math.max(0, i - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    setActive(to);
    refs.current[to]?.focus();
  }

  return (
    <section aria-labelledby={titleId} className="card-v3 px-[22px] py-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <H id={titleId} className="flex-1 text-[14px] font-semibold">
          {title}
        </H>
        {columns.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="max-sm:w-full"
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? (
              <ChartColumn aria-hidden className="size-4" />
            ) : (
              <Table2 aria-hidden className="size-4" />
            )}
            {asTable ? "Show as chart" : "Show as table"}
          </Button>
        )}
      </div>
      <p id={summaryId} className="mb-3 text-[13px] text-ink-2">
        {summary}
      </p>
      {columns.length === 0 ? null : asTable ? (
        <table className="w-full text-[13px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="py-1 text-left font-semibold">
                {headers[0]}
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                {headers[1]}
              </th>
              {marked && (
                <th scope="col" className="py-1 pl-3 text-left font-semibold">
                  Note
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  {c.label}
                </th>
                <td className="py-1 text-right font-mono">
                  {c.value.toLocaleString("en-GB")}
                </td>
                {marked && (
                  <td className="py-1 pl-3 [overflow-wrap:anywhere]">
                    {c.mark ?? ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <ol
            aria-labelledby={titleId}
            aria-describedby={summaryId}
            className="flex h-28 items-end gap-[2px] border-b border-line sm:h-40"
          >
            {columns.map((c, i) => (
              <li
                key={c.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                tabIndex={i === active ? 0 : -1}
                aria-label={describe(c)}
                onKeyDown={(e) => move(e, i)}
                onFocus={() => {
                  setActive(i);
                  setFocused(i);
                }}
                onBlur={() => setFocused(null)}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-sm focus-visible:outline-2 focus-visible:outline-mint-deep"
              >
                {c.mark && (
                  <span
                    aria-hidden
                    className="mb-0.5 text-[10px] leading-none text-warn-deep"
                  >
                    ▲
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    "block w-full origin-bottom rounded-t-sm motion-safe:animate-[rise_var(--t-story)_var(--e-out)_both]",
                    c.mark ? "bg-warn" : "bg-mint",
                  )}
                  style={{
                    height: c.value
                      ? `${Math.max(2, Math.round((c.value * 100) / top))}%`
                      : 0,
                  }}
                />
              </li>
            ))}
          </ol>
          <div
            aria-hidden
            className="mt-1 flex justify-between gap-2 text-[11px] text-ink-3"
          >
            <span>{columns[0]!.label}</span>
            {columns.length > 2 && (
              <span className="hidden sm:inline">
                {columns[Math.floor(last / 2)]!.label}
              </span>
            )}
            {last > 0 && <span>{columns[last]!.label}</span>}
          </div>
          <p aria-hidden className="mt-1 min-h-5 text-[12.5px] text-ink-2">
            {focused !== null ? describe(columns[focused]!) : ""}
          </p>
          {marked && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-2">
              <span aria-hidden className="text-warn-deep">
                ▲
              </span>
              {markLegend}
            </p>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Move the existing Usage cards onto BarList (R10)**

In `components/admin/usage-view.tsx`, import
`import { BarList } from "../ui/charts/bar-list";`, delete the `top`
constant, and replace the bodies of the two cards:

```tsx
            <Card title="Result confidence">
              {mix ? (
                <BarList
                  max={100}
                  items={CONFIDENCE_ORDER.map((k) => {
                    const { Icon, bar, text } = LEVEL[k];
                    return {
                      key: k,
                      label: RESULT_LABEL[k],
                      value: mix[k],
                      text: `${mix[k]}%`,
                      icon: <Icon aria-hidden className={cn("size-4", text)} />,
                      barClass: bar,
                    };
                  })}
                />
              ) : (
                <p className="text-[13px] text-ink-3">
                  No consultations in this period.
                </p>
              )}
            </Card>
            <Card title="By specialty">
              <BarList
                items={u.by_specialty.map((s) => ({
                  key: s.specialty,
                  label: s.specialty,
                  value: s.consultations,
                  text: countLabel(s.consultations),
                }))}
              />
            </Card>
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/ui/charts components/admin/usage-view.test.tsx lib/motion.test.ts && npm run lint && npm run typecheck`
Expected: PASS. The Usage tests pass unchanged ("High confidence62%",
"Internal Medicine412", "Nothing to show yet."), and the motion scan accepts
the token-based `grow` and `rise` animations.

- [ ] **Step 7: Commit**

```bash
git add components/ui/charts app/globals.css components/admin/usage-view.tsx
git commit -m "Add reusable BarList and ColumnChart; use BarList on Usage"
```

---

### Task 3: The Patient alerts group with What changed

**Files:**

- Create: `lib/admin/alert-usage.ts`, `lib/admin/alert-usage.test.ts`,
  `components/admin/usage-parts.tsx`, `components/admin/usage-alerts.tsx`,
  `components/admin/usage-alerts.test.tsx`
- Modify: `components/admin/usage-view.tsx`,
  `components/admin/usage-view.test.tsx`,
  `components/notifications/chips.tsx`, `lib/labels.ts`
- Test: `lib/admin/alert-usage.test.ts`,
  `components/admin/usage-alerts.test.tsx`,
  `components/admin/usage-view.test.tsx`

**Interfaces:**

- Consumes: the Task 1 types, `mockAdminWith`, `sampleAlerts`, `mockAdminAs`,
  `ADMIN_NOW`; `FEWER_THAN_5`, `SMALL_GROUP_MIN`, `isSmallCount`
  (`lib/small-groups.ts`); `BarList`, `ColumnChart`, `Column` (Task 2);
  `countLabel`, `hoursLabel`, `percentLabel` (`lib/admin/report.ts`);
  `SEVERITY`, `DISMISS_REASONS`, `NOT_STANDARDISED`, `locationLabel`
  (`lib/notifications/alert-view.ts`); `Banner`, `Button`, `cn`.
- Produces (`lib/admin/alert-usage.ts`):
  - constants `TOP_MAX = 5`, `ALERTS_INTRO`, `ALERTS_FAILED`,
    `NOTHING_UNUSUAL`, `NOT_ENOUGH_TO_COMPARE`, `NO_DATA`, `UNUSUALLY_BUSY`,
    `SEVERITY_ORDER: readonly AlertSeverity[]`;
  - `type MeasureKind = "count" | "minutes" | "share"`;
  - `type Shown = { kind: "value"; value: number } | { kind: "hidden" } | { kind: "none" }`;
  - `type AlertsState = { state: "off" } | { state: "failed" } | { state: "ready"; alerts: UsageAlertsOut }`;
  - `type Better = "lower" | "higher" | null`;
  - `type ChangeItem = { key: string; kind: "worse" | "busy" | "rising"; text: string }`;
  - `type WhatChanged = { kind: "no_previous" } | { kind: "nothing" } | { kind: "items"; items: ChangeItem[] }`;
  - `readAlerts(u: Pick<UsageOut, "alerts">): AlertsState`;
  - `shown(m: GuardedOut | null | undefined, kind: MeasureKind): Shown`;
  - `valueText(s: Shown, kind: MeasureKind): string`;
  - `minutesLabel(m: number): string`;
  - `compareLabel(p: UsagePeriod): string`;
  - `changeFor(m: MeasureOut | null | undefined, kind: MeasureKind, hasPrevious: boolean): ChangeOut | null`;
  - `changeText(c: ChangeOut, kind: MeasureKind, p: UsagePeriod): string`;
  - `verdict(c: ChangeOut, better: Better): "better" | "worse" | null`;
  - `criticalTargetLabel(min: number): string`;
  - `dayLabel(start: string): string`, `bucketLabel(start: string, bucket: "day" | "week"): string`;
  - `alertCount(n: number): string`;
  - `seriesSummary(s: AlertSeriesOut): string`;
  - `usualMark(b: SeriesBucketOut): string | null`;
  - `unusualLine(b: SeriesBucketOut, bucket: "day" | "week"): string`;
  - `findingLabel(g: { name: string | null; flag: string | null }): string`;
  - `placeLabel(l: AlertLocationOut | null | undefined): string`;
  - `risingLine(r: RisingOut): string`;
  - `worseningLine(w: WorseningOut, target: number): string`;
  - `whatChanged(a: UsageAlertsOut): WhatChanged`;
  - `columnsOf(a: UsageAlertsOut): Column[]`.
- Produces (`components/admin/usage-parts.tsx`):
  `Tile({ label, value }: { label: string; value: string })` and
  `Card({ title, level, children }: { title: string; level?: 3 | 4; children: ReactNode })`.
- Produces (`components/admin/usage-alerts.tsx`):
  `UsageAlerts({ usage, onRetry }: { usage: UsageOut; onRetry: () => void }): JSX.Element | null`.
- Produces (`components/notifications/chips.tsx`): `export const SEVERITY_ICON`.

- [ ] **Step 1: Write the failing tests for the rules**

Create `lib/admin/alert-usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  ChangeOut,
  MeasureOut,
  UsageAlertsOut,
} from "@/lib/api/admin-contract";
import { sampleAlerts } from "@/tests/admin";
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
    const { total: _gone, ...noTotal } = a;
    expect(
      readAlerts({ alerts: noTotal as unknown as UsageAlertsOut }).state,
    ).toBe("failed");
    expect(
      readAlerts({
        alerts: { ...a, series: null } as unknown as UsageAlertsOut,
      }).state,
    ).toBe("failed");
    expect(readAlerts({ alerts: a })).toEqual({ state: "ready", alerts: a });
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
    const w = whatChanged({
      ...a,
      critical_within_target: m(null, null, true),
    });
    expect(w.kind === "items" && w.items.map((i) => i.kind)).toEqual([
      "busy",
      "rising",
      "rising",
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/admin/alert-usage.test.ts`
Expected: FAIL with "Failed to resolve import './alert-usage'".

- [ ] **Step 3: Write the rules**

Create `lib/admin/alert-usage.ts`:

```ts
import type {
  AlertSeriesOut,
  ChangeOut,
  GuardedOut,
  MeasureOut,
  RisingOut,
  SeriesBucketOut,
  UsageAlertsOut,
  UsageOut,
  UsagePeriod,
  WorseningOut,
} from "../api/admin-contract";
import type { AlertLocationOut, AlertSeverity } from "../api/alerts-contract";
import { NOT_STANDARDISED, locationLabel } from "../notifications/alert-view";
import { FEWER_THAN_5, SMALL_GROUP_MIN, isSmallCount } from "../small-groups";
import type { Column } from "@/components/ui/charts/column-chart";
import { countLabel, hoursLabel, percentLabel } from "./report";

// The usage alerts wording and guards (Plan 5b). The backend computes every
// number, change and flag; this file only reads, guards and words them.

/** Top findings and locations shown at most (spec §3). */
export const TOP_MAX = 5;
export const ALERTS_INTRO =
  "Counts for your hospital only. Groups of fewer than 5 are hidden.";
export const ALERTS_FAILED = "Couldn't load patient alerts";
export const NOTHING_UNUSUAL = "Nothing unusual this period";
export const NOT_ENOUGH_TO_COMPARE = "Not enough data to compare";
export const NO_DATA = "No data yet";
export const UNUSUALLY_BUSY = "Unusually busy";
export const SEVERITY_ORDER: readonly AlertSeverity[] = [
  "critical",
  "urgent",
  "info",
];

export type MeasureKind = "count" | "minutes" | "share";
export type Shown =
  { kind: "value"; value: number } | { kind: "hidden" } | { kind: "none" };
export type AlertsState =
  | { state: "off" }
  | { state: "failed" }
  | { state: "ready"; alerts: UsageAlertsOut };
export type Better = "lower" | "higher" | null;
export type ChangeItem = {
  key: string;
  kind: "worse" | "busy" | "rising";
  text: string;
};
export type WhatChanged =
  | { kind: "no_previous" }
  | { kind: "nothing" }
  | { kind: "items"; items: ChangeItem[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const isGuarded = (v: unknown) => isObj(v) && typeof v.suppressed === "boolean";
const GUARDED_KEYS = [
  "total",
  "unhandled",
  "median_ack_minutes",
  "median_ack_minutes_critical",
  "critical_within_target",
  "acknowledged_share",
  "dismissed_share",
] as const;
const LIST_KEYS = [
  "dismiss_reasons",
  "top_findings",
  "top_locations",
  "rising",
] as const;

/**
 * Off when null or absent (R1). Failed when unavailable or unreadable: the
 * group then says so and never shows zeros (R2, Review Focus 1).
 */
export function readAlerts(u: Pick<UsageOut, "alerts">): AlertsState {
  const a: unknown = u.alerts;
  if (a === null || a === undefined) return { state: "off" };
  if (!isObj(a) || a.unavailable === true) return { state: "failed" };
  const sev = a.by_severity;
  const series = a.series;
  const ok =
    typeof a.critical_target_minutes === "number" &&
    typeof a.has_previous === "boolean" &&
    GUARDED_KEYS.every((k) => isGuarded(a[k])) &&
    isObj(sev) &&
    SEVERITY_ORDER.every((k) => isGuarded(sev[k])) &&
    LIST_KEYS.every((k) => Array.isArray(a[k])) &&
    isObj(series) &&
    Array.isArray(series.points);
  return ok
    ? { state: "ready", alerts: a as unknown as UsageAlertsOut }
    : { state: "failed" };
}

/**
 * The small-group guard (R3): suppressed reads hidden whatever `value` says;
 * a count from 1 to 4 reads hidden too; 0 is shown.
 */
export function shown(
  m: GuardedOut | null | undefined,
  kind: MeasureKind,
): Shown {
  if (!m) return { kind: "none" };
  if (m.suppressed) return { kind: "hidden" };
  if (m.value === null || !Number.isFinite(m.value)) return { kind: "none" };
  if (kind === "count" && isSmallCount(m.value)) return { kind: "hidden" };
  return { kind: "value", value: m.value };
}

export const minutesLabel = (m: number) =>
  m < 60 ? `${Math.round(m)} min` : hoursLabel(m / 60);

export function valueText(s: Shown, kind: MeasureKind): string {
  if (s.kind === "hidden") return FEWER_THAN_5;
  if (s.kind === "none") return NO_DATA;
  if (kind === "minutes") return minutesLabel(s.value);
  if (kind === "share") return percentLabel(s.value);
  return countLabel(s.value);
}

const COMPARE: Record<UsagePeriod, string> = {
  this_month: "vs last month",
  last_month: "vs the month before",
  last_90_days: "vs the 90 days before",
};
export const compareLabel = (p: UsagePeriod) => COMPARE[p];

const DIRECTIONS = new Set(["up", "down", "same"]);

/** The backend's change, only when it can honestly be shown (R4, R5). */
export function changeFor(
  m: MeasureOut | null | undefined,
  kind: MeasureKind,
  hasPrevious: boolean,
): ChangeOut | null {
  const c = m?.change;
  if (!hasPrevious || !c || shown(m, kind).kind !== "value") return null;
  if (!DIRECTIONS.has(c.direction) || !Number.isFinite(c.amount)) return null;
  if (!Number.isFinite(c.previous)) return null;
  if (kind === "count" && isSmallCount(c.previous)) return null;
  return c;
}

export function changeText(
  c: ChangeOut,
  kind: MeasureKind,
  p: UsagePeriod,
): string {
  const n = Math.round(Math.abs(c.amount));
  if (c.direction === "same" || n === 0) return `no change ${compareLabel(p)}`;
  const amount =
    kind === "count"
      ? `${n}%`
      : kind === "minutes"
        ? minutesLabel(n)
        : `${n} ${n === 1 ? "point" : "points"}`;
  return `${c.direction} ${amount} ${compareLabel(p)}`;
}

/** Only response times read better or worse; volumes and outcomes are neutral (R4). */
export function verdict(
  c: ChangeOut,
  better: Better,
): "better" | "worse" | null {
  if (!better || c.direction === "same") return null;
  return (c.direction === "down") === (better === "lower") ? "better" : "worse";
}

export const criticalTargetLabel = (min: number) =>
  `Critical handled within ${min} min`;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "14 Oct" from "2026-10-14": the hospital's calendar day, as sent. */
export function dayLabel(start: string): string {
  const d = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? start
    : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const bucketLabel = (start: string, bucket: "day" | "week") =>
  bucket === "week" ? `Week of ${dayLabel(start)}` : dayLabel(start);

export const alertCount = (n: number) =>
  n === 1 ? "1 alert" : `${countLabel(n)} alerts`;

/** The chart's one-line summary: the busiest bucket (display, not statistics). */
export function seriesSummary(s: AlertSeriesOut): string {
  let top: SeriesBucketOut | null = null;
  for (const p of s.points) if (p.total > (top?.total ?? 0)) top = p;
  if (!top) return "No alerts in this period";
  return s.bucket === "week"
    ? `Most alerts in the week of ${dayLabel(top.start)}: ${countLabel(top.total)}`
    : `Most alerts on ${dayLabel(top.start)}: ${countLabel(top.total)}`;
}

/** "about 3× the usual" for a flagged bucket (R7); null when not flagged. */
export function usualMark(b: SeriesBucketOut): string | null {
  const x = b.usual_multiple;
  if (x === null || !Number.isFinite(x) || x <= 1) return null;
  const n = x >= 2 ? String(Math.round(x)) : x.toFixed(1);
  return `about ${n}× the usual`;
}

export function unusualLine(b: SeriesBucketOut, bucket: "day" | "week") {
  const mark = usualMark(b);
  const head = `${bucketLabel(b.start, bucket)}: ${alertCount(b.total)}`;
  return mark ? `${head}, ${mark}` : head;
}

const FLAG_WORD: Record<string, string> = {
  low: "low",
  high: "high",
  abnormal: "abnormal",
};

/** "Potassium · low"; unmapped findings are one "Not standardised" row (R8). */
export function findingLabel(g: {
  name: string | null;
  flag: string | null;
}): string {
  const name = g.name?.trim();
  if (!name) return NOT_STANDARDISED;
  if (!g.flag) return name;
  return `${name} · ${Object.hasOwn(FLAG_WORD, g.flag) ? FLAG_WORD[g.flag] : FLAG_WORD.abnormal}`;
}

/** Ward level at most: a bed is never shown on Usage (R8). */
export const placeLabel = (l: AlertLocationOut | null | undefined) =>
  locationLabel(l?.kind === "admitted" ? { ...l, bed: null } : l);

export const risingLine = (r: RisingOut) =>
  `${r.kind === "finding" ? findingLabel(r) : placeLabel(r.location)}: ${countLabel(r.count)}, up from ${countLabel(r.previous)}`;

export const worseningLine = (w: WorseningOut, target: number) =>
  `Critical within ${target} min: ${percentLabel(w.value)}, down from ${percentLabel(w.previous)}`;

const bigEnough = (r: RisingOut) =>
  Number.isFinite(r.count) &&
  Number.isFinite(r.previous) &&
  r.count >= SMALL_GROUP_MIN &&
  r.previous >= SMALL_GROUP_MIN;

/** The What changed list (R5, R6). Only called once the block is ready. */
export function whatChanged(a: UsageAlertsOut): WhatChanged {
  if (!a.has_previous) return { kind: "no_previous" };
  const items: ChangeItem[] = [];
  const w = a.worsening;
  if (
    w &&
    Number.isFinite(w.value) &&
    Number.isFinite(w.previous) &&
    shown(a.critical_within_target, "share").kind === "value"
  )
    items.push({
      key: "worsening",
      kind: "worse",
      text: worseningLine(w, a.critical_target_minutes),
    });
  for (const b of a.series.points)
    if (usualMark(b))
      items.push({
        key: `busy-${b.start}`,
        kind: "busy",
        text: unusualLine(b, a.series.bucket),
      });
  for (const kind of ["finding", "location"] as const)
    a.rising
      .filter((r) => r.kind === kind && bigEnough(r))
      .forEach((r, i) =>
        items.push({
          key: `rising-${kind}-${i}`,
          kind: "rising",
          text: risingLine(r),
        }),
      );
  return items.length ? { kind: "items", items } : { kind: "nothing" };
}

/** The chart's columns; marks only when there's a previous period (R5). */
export const columnsOf = (a: UsageAlertsOut): Column[] =>
  a.series.points.map((b) => ({
    key: b.start,
    label: bucketLabel(b.start, a.series.bucket),
    value: Number.isFinite(b.total) ? b.total : 0,
    mark: a.has_previous ? usualMark(b) : null,
  }));
```

(The `Column` import is type-only, so `lib/` takes no runtime dependency on
`components/`.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run lib/admin/alert-usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing screen tests**

Create `components/admin/usage-alerts.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UsageAlertsOut, UsageOut } from "@/lib/api/admin-contract";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { mockAdminAs, mockAdminWith } from "@/tests/admin";
import { UsageAlerts } from "./usage-alerts";

const usage = (p: UsageOut["period"] = "this_month") =>
  mockAdminAs(null).getUsage(p);
const withAlerts = async (
  over: (a: UsageAlertsOut) => Partial<UsageAlertsOut>,
  p: UsageOut["period"] = "this_month",
): Promise<UsageOut> => {
  const u = await usage(p);
  const a = u.alerts as UsageAlertsOut;
  return { ...u, alerts: { ...a, ...over(a) } };
};
const tile = (label: string) =>
  screen.getByText(label, { selector: "span" }).closest("div")!;
const group = () => screen.getByRole("region", { name: "Patient alerts" });
const changed = () => screen.getByRole("region", { name: "What changed" });
const items = (name: string) =>
  within(screen.getByRole("region", { name }))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("UsageAlerts", () => {
  it("shows this month's alerts, with what changed at the top", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    expect(
      within(group()).getByText(
        "Counts for your hospital only. Groups of fewer than 5 are hidden.",
      ),
    ).toBeInTheDocument();
    expect(
      within(changed())
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Critical within 15 min: 71%, down from 88%",
      "14 Oct: 23 alerts, about 3× the usual",
      "Potassium · low: 31, up from 9",
      "Ward 3: 34, up from 12",
    ]);
    // What changed comes first in the group.
    expect(group().querySelector("section")).toBe(changed());
    expect(tile("Alerts")).toHaveTextContent("128");
    expect(tile("Alerts")).toHaveTextContent("up 35% vs last month");
    expect(tile("Alerts")).not.toHaveTextContent(/better|worse/);
    expect(tile("Critical")).toHaveTextContent("17");
    expect(tile("Critical").querySelector("svg")).not.toBeNull();
    expect(tile("Still unhandled")).toHaveTextContent("9");
    expect(tile("Still unhandled")).not.toHaveTextContent(/vs last month/);
    expect(tile("Median time to acknowledge")).toHaveTextContent("22 min");
    expect(tile("Median time to acknowledge")).toHaveTextContent(
      "up 6 min vs last month · worse",
    );
    expect(tile("Median for Critical alerts")).toHaveTextContent(
      "up 3 min vs last month · worse",
    );
    expect(tile("Critical handled within 15 min")).toHaveTextContent("71%");
    expect(tile("Critical handled within 15 min")).toHaveTextContent(
      "down 17 points vs last month · worse",
    );
    expect(items("Outcomes")).toEqual(["Acknowledged82%", "Dismissed18%"]);
    expect(items("Top findings")).toEqual([
      "Potassium · low31",
      "Sodium · low24",
      "Platelets · low18",
      "Not standardised11",
      "Haemoglobin · lowFewer than 5",
    ]);
    expect(items("Top locations")).toEqual([
      "Ward 334",
      "Emergency department29",
      "Ward 521",
      "Location not recorded8",
      "Outpatient · Cardiology clinicFewer than 5",
    ]);
  });

  it("hides small groups as Fewer than 5, with no bar", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    const reasons = screen.getByRole("region", { name: "Dismissal reasons" });
    const rows = within(reasons).getAllByRole("listitem");
    expect(rows.map((li) => li.textContent)).toEqual([
      "Not clinically relevant9",
      "Already known7",
      "Wrong patientFewer than 5",
      "OtherFewer than 5",
    ]);
    expect(rows[2]!.querySelector("[aria-hidden]")).toBeNull();
    expect(rows[0]!.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("charts the days, marking the busy one", async () => {
    render(<UsageAlerts usage={await usage()} onRetry={vi.fn()} />);
    const chart = screen.getByRole("region", { name: "Alerts over time" });
    expect(within(chart).getByText("Most alerts on 14 Oct: 23")).toBeVisible();
    expect(
      within(chart).getByRole("listitem", {
        name: "14 Oct: 23 alerts, about 3× the usual",
      }),
    ).toBeInTheDocument();
    expect(within(chart).getByText("Unusually busy")).toBeVisible();
    await userEvent.click(
      within(chart).getByRole("button", { name: "Show as table" }),
    );
    expect(within(chart).getAllByRole("columnheader")[0]).toHaveTextContent(
      "Day",
    );
  });

  it("says Nothing unusual this period when nothing is flagged, and shows a real 0", async () => {
    render(<UsageAlerts usage={await usage("last_month")} onRetry={vi.fn()} />);
    expect(
      within(changed()).getByText("Nothing unusual this period"),
    ).toBeInTheDocument();
    expect(tile("Still unhandled")).toHaveTextContent(/^0Still unhandled$/);
    expect(tile("Median time to acknowledge")).toHaveTextContent(
      "down 2 min vs the month before · better",
    );
    expect(screen.queryByText("Unusually busy")).toBeNull();
  });

  it("says Not enough data to compare, with no changes or flags, without a previous period (Review Focus 3)", async () => {
    // The backend wrongly still sends changes and flags: none may show.
    const tm = (await usage()).alerts as UsageAlertsOut;
    render(
      <UsageAlerts
        usage={await withAlerts(
          () => ({
            has_previous: false,
            total: tm.total,
            rising: tm.rising,
            worsening: tm.worsening,
            series: tm.series,
          }),
          "last_90_days",
        )}
        onRetry={vi.fn()}
      />,
    );
    expect(
      within(changed()).getByText("Not enough data to compare"),
    ).toBeInTheDocument();
    expect(within(changed()).queryByRole("listitem")).toBeNull();
    expect(screen.queryByText(/ vs (last month|the )/)).toBeNull();
    expect(screen.queryByText("Unusually busy")).toBeNull();
  });

  it("never reads as zero or Nothing unusual when alerts couldn't load (Review Focus 1)", async () => {
    const onRetry = vi.fn();
    const u = await mockAdminWith("unavailable").getUsage("this_month");
    const { container } = render(<UsageAlerts usage={u} onRetry={onRetry} />);
    expect(
      within(group()).getByText("Couldn't load patient alerts"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing unusual this period")).toBeNull();
    expect(screen.queryByText("Fewer than 5")).toBeNull();
    expect(screen.queryByRole("region", { name: "What changed" })).toBeNull();
    expect(container.textContent).not.toMatch(/\b0\b/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows nothing when alerts aren't switched on", async () => {
    const u = await usage();
    const { container, rerender } = render(
      <UsageAlerts usage={{ ...u, alerts: null }} onRetry={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    const { alerts: _gone, ...older } = u;
    rerender(<UsageAlerts usage={older} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows a small number or its change, even if one is sent (Review Focus 2)", async () => {
    render(
      <UsageAlerts
        usage={await withAlerts((a) => ({
          by_severity: {
            critical: {
              value: 3,
              suppressed: false,
              change: { direction: "up", amount: 50, previous: 2 },
            },
            urgent: {
              value: 40,
              suppressed: true,
              change: { direction: "up", amount: 10, previous: 36 },
            },
            info: a.by_severity.info,
          },
          top_findings: [
            {
              name: "Sodium",
              flag: "low",
              count: { value: 2, suppressed: true },
            },
          ],
          rising: [
            {
              kind: "finding",
              name: "Sodium",
              flag: "low",
              count: 3,
              previous: 9,
            },
          ],
        }))}
        onRetry={vi.fn()}
      />,
    );
    expect(tile("Critical")).toHaveTextContent(/^Fewer than 5Critical$/);
    expect(tile("Urgent")).toHaveTextContent(/^Fewer than 5Urgent$/);
    expect(tile("Info")).toHaveTextContent("up 44% vs last month");
    expect(items("Top findings")).toEqual(["Sodium · lowFewer than 5"]);
    expect(within(changed()).queryByText(/Sodium/)).toBeNull();
  });

  it("uses the hospital's own target in the labels", async () => {
    render(
      <UsageAlerts
        usage={await withAlerts(() => ({ critical_target_minutes: 10 }))}
        onRetry={vi.fn()}
      />,
    );
    expect(tile("Critical handled within 10 min")).toHaveTextContent("71%");
    expect(
      within(changed()).getByText("Critical within 10 min: 71%, down from 88%"),
    ).toBeInTheDocument();
  });

  it("uses no backend terms and no lab wording", async () => {
    const { container } = render(
      <UsageAlerts usage={await usage()} onRetry={vi.fn()} />,
    );
    const text = container.textContent ?? "";
    for (const t of FORBIDDEN_TERMS) expect(text).not.toContain(t);
    expect(text).not.toMatch(/\blab\b/i);
  });
});
```

In `components/admin/usage-view.test.tsx`, change the import to
`import { mockAdminAs, mockAdminWith, screenAdminAs } from "@/tests/admin";`
and add after the existing `describe`:

```tsx
describe("UsageView: patient alerts", () => {
  beforeEach(() => {
    holder.client = mockAdminAs(DEMO_EMAILS.director);
  });

  it("shows the Patient alerts group below the numbers", async () => {
    renderAdmin(<UsageView />);
    const group = await screen.findByRole("region", { name: "Patient alerts" });
    expect(
      within(group).getByRole("region", { name: "What changed" }),
    ).toHaveTextContent("Critical within 15 min: 71%, down from 88%");
    const bySpecialty = screen.getByRole("region", { name: "By specialty" });
    expect(
      bySpecialty.compareDocumentPosition(group) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("follows the period picker", async () => {
    renderAdmin(<UsageView />);
    await screen.findByRole("region", { name: "Patient alerts" });
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "last_90_days",
    );
    expect(
      await screen.findByText("Not enough data to compare"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Most alerts in the week of 3 Oct: 45"),
    ).toBeInTheDocument();
  });

  it("shows no alerts group when alerts aren't switched on (Review Focus 5)", async () => {
    holder.client = mockAdminWith("off");
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(screen.queryByText(/patient alerts/i)).toBeNull();
  });

  it("offers Try again, not zeros, when alerts couldn't load (Review Focus 1)", async () => {
    const good = await mockAdminAs(DEMO_EMAILS.director).getUsage("this_month");
    holder.client = mockAdminWith("unavailable");
    renderAdmin(<UsageView />);
    const group = await screen.findByRole("region", { name: "Patient alerts" });
    expect(
      within(group).getByText("Couldn't load patient alerts"),
    ).toBeInTheDocument();
    expect(within(group).queryByText("Nothing unusual this period")).toBeNull();
    // The rest of Usage is unaffected.
    expect(screen.getByText("1,284")).toBeInTheDocument();
    vi.spyOn(holder.client, "getUsage").mockResolvedValue(good);
    await userEvent.click(
      within(group).getByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByText("Critical within 15 min: 71%, down from 88%"),
    ).toBeInTheDocument();
  });

  it("shows no alerts group when Usage itself fails", async () => {
    vi.spyOn(holder.client, "getUsage").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<UsageView />);
    expect(await screen.findByText("You can't do this")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(screen.queryByText("Nothing unusual this period")).toBeNull();
  });
});
```

(The page's existing banner for a 403 reads "You can't do this", from
`adminError`, and a 403 isn't retried, so the test doesn't wait on retries;
it pins only that the alerts group stays away.)

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run components/admin/usage-alerts.test.tsx components/admin/usage-view.test.tsx`
Expected: FAIL with "Failed to resolve import './usage-alerts'"; the new
UsageView tests fail because there is no Patient alerts group.

- [ ] **Step 7: Shared parts, the severity icon and the forbidden codes**

Create `components/admin/usage-parts.tsx` (moved from `usage-view.tsx`;
`Card` gains a heading level, R14):

```tsx
import { useId, type ReactNode } from "react";

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-v3 px-5 py-4">
      <b className="block font-display text-[34px] font-black leading-none">
        {value}
      </b>
      <span className="mt-1 block text-[12.5px] text-ink-3">{label}</span>
    </div>
  );
}

export function Card({
  title,
  level = 3,
  children,
}: {
  title: string;
  level?: 3 | 4;
  children: ReactNode;
}) {
  const id = useId();
  const H = level === 3 ? "h3" : "h4";
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <H id={id} className="mb-3 text-[14px] font-semibold">
        {title}
      </H>
      {children}
    </section>
  );
}
```

In `components/admin/usage-view.tsx`, delete the local `Tile` and `Card` and
add `import { Card, Tile } from "./usage-parts";`. Remove `type ReactNode`
from the React import; `useId` stays (`periodId`, `loadingId`).

In `components/notifications/chips.tsx`, change `const SEVERITY_ICON` to
`export const SEVERITY_ICON`.

In `lib/labels.ts`, add at the end of `FORBIDDEN_TERMS`:

```ts
  "critical_target_minutes",
  "critical_within_target",
  "median_ack_minutes",
  "usual_multiple",
  "has_previous",
```

- [ ] **Step 8: The Patient alerts group**

Create `components/admin/usage-alerts.tsx`:

```tsx
"use client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useId } from "react";
import type {
  GuardedOut,
  MeasureOut,
  UsageAlertsOut,
  UsageOut,
  UsagePeriod,
} from "@/lib/api/admin-contract";
import {
  ALERTS_FAILED,
  ALERTS_INTRO,
  NOT_ENOUGH_TO_COMPARE,
  NOTHING_UNUSUAL,
  SEVERITY_ORDER,
  TOP_MAX,
  UNUSUALLY_BUSY,
  alertCount,
  changeFor,
  changeText,
  columnsOf,
  criticalTargetLabel,
  findingLabel,
  placeLabel,
  readAlerts,
  seriesSummary,
  shown,
  valueText,
  verdict,
  whatChanged,
  type Better,
  type ChangeItem,
  type MeasureKind,
} from "@/lib/admin/alert-usage";
import { DISMISS_REASONS, SEVERITY } from "@/lib/notifications/alert-view";
import { SEVERITY_ICON } from "../notifications/chips";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { BarList, type BarItem } from "../ui/charts/bar-list";
import { ColumnChart } from "../ui/charts/column-chart";
import { cn } from "../ui/cn";
import { Card } from "./usage-parts";

type Icon = typeof ArrowUp;

function AlertTile({
  label,
  icon: TileIcon,
  m,
  kind,
  better = null,
  period,
  hasPrevious,
}: {
  label: string;
  icon?: Icon;
  m: MeasureOut;
  kind: MeasureKind;
  better?: Better;
  period: UsagePeriod;
  hasPrevious: boolean;
}) {
  const s = shown(m, kind);
  const c = changeFor(m, kind, hasPrevious);
  const v = c ? verdict(c, better) : null;
  const Arrow =
    c?.direction === "up"
      ? ArrowUp
      : c?.direction === "down"
        ? ArrowDown
        : ArrowRight;
  return (
    <div className="card-v3 px-5 py-4">
      <b
        className={cn(
          "block font-display font-black leading-none",
          s.kind === "value" ? "text-[30px]" : "text-[18px] text-ink-2",
        )}
      >
        {valueText(s, kind)}
      </b>
      <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
        {TileIcon && <TileIcon aria-hidden className="size-3.5 shrink-0" />}
        {label}
      </span>
      {c && (
        <span
          className={cn(
            "mt-1.5 flex items-center gap-1 text-[12px]",
            v === "worse"
              ? "text-bad-deep"
              : v === "better"
                ? "text-ok-deep"
                : "text-ink-2",
          )}
        >
          <Arrow aria-hidden className="size-3.5 shrink-0" />
          {changeText(c, kind, period)}
          {v && ` · ${v}`}
        </span>
      )}
    </div>
  );
}

const barItem = (
  key: string,
  label: string,
  g: GuardedOut | undefined,
  kind: MeasureKind,
): BarItem => {
  const s = shown(g, kind);
  return {
    key,
    label,
    value: s.kind === "value" ? s.value : null,
    text: valueText(s, kind),
    hidden: s.kind === "hidden",
  };
};

const CHANGE_ICON: Record<ChangeItem["kind"], { Icon: Icon; tone: string }> = {
  worse: { Icon: TriangleAlert, tone: "text-bad-deep" },
  busy: { Icon: CalendarDays, tone: "text-warn-deep" },
  rising: { Icon: TrendingUp, tone: "text-ink-2" },
};

function WhatChangedCard({ a }: { a: UsageAlertsOut }) {
  const w = whatChanged(a);
  return (
    <Card title="What changed" level={4}>
      {w.kind === "items" ? (
        <ul className="flex flex-col gap-2">
          {w.items.map((i) => {
            const { Icon, tone } = CHANGE_ICON[i.kind];
            return (
              <li key={i.key} className="flex items-start gap-2 text-[13px]">
                <Icon
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", tone)}
                />
                <span className="[overflow-wrap:anywhere]">{i.text}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          {w.kind === "nothing" ? (
            <CheckCircle2 aria-hidden className="size-4 text-ok-deep" />
          ) : (
            <CircleHelp aria-hidden className="size-4" />
          )}
          {w.kind === "nothing" ? NOTHING_UNUSUAL : NOT_ENOUGH_TO_COMPARE}
        </p>
      )}
    </Card>
  );
}

function AlertsBody({ a, period }: { a: UsageAlertsOut; period: UsagePeriod }) {
  const common = { period, hasPrevious: a.has_previous };
  return (
    <>
      <WhatChangedCard a={a} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AlertTile label="Alerts" m={a.total} kind="count" {...common} />
        {SEVERITY_ORDER.map((k) => (
          <AlertTile
            key={k}
            label={SEVERITY[k].label}
            icon={SEVERITY_ICON[k]}
            m={a.by_severity[k]}
            kind="count"
            {...common}
          />
        ))}
        <AlertTile
          label="Still unhandled"
          m={a.unhandled}
          kind="count"
          {...common}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <AlertTile
          label="Median time to acknowledge"
          m={a.median_ack_minutes}
          kind="minutes"
          better="lower"
          {...common}
        />
        <AlertTile
          label="Median for Critical alerts"
          m={a.median_ack_minutes_critical}
          kind="minutes"
          better="lower"
          {...common}
        />
        <AlertTile
          label={criticalTargetLabel(a.critical_target_minutes)}
          m={a.critical_within_target}
          kind="share"
          better="higher"
          {...common}
        />
      </div>
      <ColumnChart
        title="Alerts over time"
        level={4}
        columns={columnsOf(a)}
        summary={seriesSummary(a.series)}
        valueText={alertCount}
        headers={[a.series.bucket === "week" ? "Week" : "Day", "Alerts"]}
        markLegend={UNUSUALLY_BUSY}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Outcomes" level={4}>
          <BarList
            max={1}
            items={[
              barItem("ack", "Acknowledged", a.acknowledged_share, "share"),
              barItem("dismissed", "Dismissed", a.dismissed_share, "share"),
            ]}
          />
        </Card>
        <Card title="Dismissal reasons" level={4}>
          <BarList
            items={DISMISS_REASONS.map((r) =>
              barItem(
                r.code,
                r.label,
                a.dismiss_reasons.find((x) => x.reason === r.code)?.count,
                "count",
              ),
            )}
          />
        </Card>
        <Card title="Top findings" level={4}>
          <BarList
            items={a.top_findings
              .slice(0, TOP_MAX)
              .map((f, i) =>
                barItem(`f${i}`, findingLabel(f), f.count, "count"),
              )}
          />
        </Card>
        <Card title="Top locations" level={4}>
          <BarList
            items={a.top_locations
              .slice(0, TOP_MAX)
              .map((l, i) =>
                barItem(`l${i}`, placeLabel(l.location), l.count, "count"),
              )}
          />
        </Card>
      </div>
    </>
  );
}

/**
 * The Patient alerts group on Usage (Plan 5b). Hidden when alerts are off;
 * says so, never zeros, when they couldn't load (R1, R2).
 */
export function UsageAlerts({
  usage,
  onRetry,
}: {
  usage: UsageOut;
  onRetry: () => void;
}) {
  const id = useId();
  const s = readAlerts(usage);
  if (s.state === "off") return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div>
        <h3
          id={id}
          className="font-display text-[22px] font-black leading-tight"
        >
          Patient alerts
        </h3>
        <p className="mt-1 text-[12.5px] text-ink-3">{ALERTS_INTRO}</p>
      </div>
      {s.state === "failed" ? (
        <Banner tone="bad" title={ALERTS_FAILED}>
          The other usage numbers are up to date. Try again in a moment.
          <span className="mt-2 block">
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          </span>
        </Banner>
      ) : (
        <AlertsBody a={s.alerts} period={usage.period} />
      )}
    </section>
  );
}
```

In `components/admin/usage-view.tsx`, import
`import { UsageAlerts } from "./usage-alerts";` and, inside the
`flex flex-col gap-4` wrapper, after the cards' grid, add:

```tsx
<UsageAlerts usage={u} onRetry={() => void q.refetch()} />
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx vitest run lib/admin components/admin components/ui/charts lib/motion.test.ts && npm run lint && npm run typecheck`
Expected: PASS, including every existing UsageView test (the group adds no
"Consultations", "1,284" or "Median review time" text, and the CSV test's
line check still holds: alert measure names contain no commas, see Task 4).

- [ ] **Step 10: Commit**

```bash
git add lib/admin/alert-usage.ts lib/admin/alert-usage.test.ts \
  components/admin components/notifications/chips.tsx lib/labels.ts
git commit -m "Show patient alert numbers and What changed on Usage"
```

---

### Task 4: The alert numbers in the Usage CSV

**Files:**

- Modify: `lib/admin/csv.ts`, `lib/admin/csv.test.ts`,
  `components/admin/usage-view.test.tsx`
- Test: `lib/admin/csv.test.ts`, `components/admin/usage-view.test.tsx`

**Interfaces:**

- Consumes: `readAlerts`, `shown`, `criticalTargetLabel`, `findingLabel`,
  `placeLabel`, `TOP_MAX`, `MeasureKind` (Task 3); `FEWER_THAN_5` (Task 1);
  `SEVERITY`, `DISMISS_REASONS`; `sampleAlerts`, `mockAdminAs`,
  `mockAdminWith` (Task 1).
- Produces (`lib/admin/csv.ts`):
  `ALERTS_CSV_FAILED = "Couldn't load"` and
  `alertsCsvRows(u: Pick<UsageOut, "alerts">): Cell[][]`; `usageCsv`
  appends those rows after the specialties.

- [ ] **Step 1: Write the failing tests**

In `lib/admin/csv.test.ts`, add to the imports `alertsCsvRows`,
`mockAdminAs`, `mockAdminWith` (from `@/tests/admin`) and
`type UsageAlertsOut` (from `@/lib/api/admin-contract`), then add:

```ts
describe("usage CSV: patient alerts", () => {
  const usage = (
    p: "this_month" | "last_month" | "last_90_days" = "this_month",
  ) => mockAdminAs(null).getUsage(p);
  const lines = (csv: string) => csv.slice(1).trim().split("\r\n");

  it("adds the alert numbers under the small-group rule", async () => {
    const out = lines(usageCsv(await usage(), "Sample Hospital"));
    for (const l of [
      "Alerts: total,128",
      "Alerts: Critical,17",
      "Alerts: Urgent,46",
      "Alerts: Info,65",
      "Alerts: still unhandled,9",
      "Alerts: median time to acknowledge (minutes),22",
      "Alerts: median for Critical alerts (minutes),11",
      "Alerts: Critical handled within 15 min (%),71",
      "Alerts: acknowledged (%),82",
      "Alerts: dismissed (%),18",
      "Alerts: dismissed as Not clinically relevant,9",
      "Alerts: dismissed as Wrong patient,Fewer than 5",
      "Alerts: finding Potassium · low,31",
      "Alerts: finding Not standardised,11",
      "Alerts: location Location not recorded,8",
      "Alerts: location Outpatient · Cardiology clinic,Fewer than 5",
      "Alerts on 2026-10-14,23",
    ])
      expect(out).toContain(l);
    // After the existing rows, and no changes or flags in the file.
    expect(out.indexOf("Alerts: total,128")).toBeGreaterThan(
      out.findIndex((l) => l.startsWith("Specialty:")),
    );
    expect(out.join("\n")).not.toMatch(/vs last month|up from|the usual/);
  });

  it("writes weeks for the last 90 days", async () => {
    const out = lines(usageCsv(await usage("last_90_days"), "Sample Hospital"));
    expect(out).toContain("Alerts in the week of 2026-07-18,38");
    expect(
      out.filter((l) => l.startsWith("Alerts in the week of")),
    ).toHaveLength(13);
  });

  it("never writes a small number or a hidden value (Review Focus 2)", async () => {
    const u = await usage();
    const a = u.alerts as UsageAlertsOut;
    const rows = alertsCsvRows({
      alerts: {
        ...a,
        by_severity: {
          ...a.by_severity,
          critical: { value: 3, suppressed: false, change: null },
          urgent: { value: 46, suppressed: true, change: null },
        },
      },
    });
    expect(rows).toContainEqual(["Alerts: Critical", "Fewer than 5"]);
    expect(rows).toContainEqual(["Alerts: Urgent", "Fewer than 5"]);
  });

  it("leaves a missing median empty, never 0", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const rows = alertsCsvRows({
      alerts: {
        ...a,
        median_ack_minutes: { value: null, suppressed: false, change: null },
      },
    });
    expect(rows).toContainEqual([
      "Alerts: median time to acknowledge (minutes)",
      null,
    ]);
  });

  it("says Couldn't load instead of leaving the alerts out (Review Focus 1)", async () => {
    const u = await mockAdminWith("unavailable").getUsage("this_month");
    expect(alertsCsvRows(u)).toEqual([["Alerts", "Couldn't load"]]);
    expect(usageCsv(u, "Sample Hospital")).toContain(
      "Alerts,Couldn't load\r\n",
    );
    expect(usageCsv(u, "Sample Hospital")).not.toContain("Alerts: total");
  });

  it("writes no alert rows when alerts are off (Review Focus 5)", async () => {
    const u = await mockAdminWith("off").getUsage("this_month");
    expect(alertsCsvRows(u)).toEqual([]);
    expect(alertsCsvRows({})).toEqual([]);
    expect(usageCsv(u, "Sample Hospital")).not.toMatch(/Alerts/);
  });
});
```

In `components/admin/usage-view.test.tsx`, in "exports only the counts
shown", replace

```tsx
expect(csv).not.toMatch(/question|patient|@/i);
```

with

```tsx
expect(csv).not.toMatch(/question|@/i);
// "Wrong patient" is a dismissal reason; nothing else may say patient.
expect(csv.replaceAll("Wrong patient", "")).not.toMatch(/patient/i);
```

and add to `describe("UsageView: patient alerts")`:

```tsx
it("exports the alert numbers with the small-group rule", async () => {
  renderAdmin(<UsageView />);
  await screen.findByRole("region", { name: "Patient alerts" });
  await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  const csv = download.mock.calls[0][1] as string;
  expect(csv).toContain("Alerts: total,128\r\n");
  expect(csv).toContain("Alerts: dismissed as Other,Fewer than 5\r\n");
  expect(localStorage.length + sessionStorage.length).toBe(0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/admin/csv.test.ts components/admin/usage-view.test.tsx`
Expected: FAIL: `alertsCsvRows` is not exported and the export has no
"Alerts" rows.

- [ ] **Step 3: Write the rows**

In `lib/admin/csv.ts`, change the first import to
`import type { ActivityEventOut, GuardedOut, UsageOut } from "../api/admin-contract";`
and add:

```ts
import { DISMISS_REASONS, SEVERITY } from "../notifications/alert-view";
import { FEWER_THAN_5 } from "../small-groups";
import {
  SEVERITY_ORDER,
  TOP_MAX,
  criticalTargetLabel,
  findingLabel,
  placeLabel,
  readAlerts,
  shown,
  type MeasureKind,
} from "./alert-usage";

/** The one row a failed alerts block leaves, so the file never reads as none (R2). */
export const ALERTS_CSV_FAILED = "Couldn't load";

/** "Fewer than 5" for a hidden value, empty for nothing measured (R11). */
function alertCell(g: GuardedOut | undefined, kind: MeasureKind): Cell {
  const s = shown(g, kind);
  if (s.kind === "hidden") return FEWER_THAN_5;
  if (s.kind === "none") return null;
  if (kind === "share") return Math.round(s.value * 100);
  if (kind === "minutes") return Math.round(s.value);
  return s.value;
}

/**
 * The alert numbers for the Usage export (spec §7): counts only, the
 * small-group rule, no changes or flags, and no commas in measure names.
 */
export function alertsCsvRows(u: Pick<UsageOut, "alerts">): Cell[][] {
  const s = readAlerts(u);
  if (s.state === "off") return [];
  if (s.state === "failed") return [["Alerts", ALERTS_CSV_FAILED]];
  const a = s.alerts;
  return [
    ["Alerts: total", alertCell(a.total, "count")],
    ...SEVERITY_ORDER.map((k): Cell[] => [
      `Alerts: ${SEVERITY[k].label}`,
      alertCell(a.by_severity[k], "count"),
    ]),
    ["Alerts: still unhandled", alertCell(a.unhandled, "count")],
    [
      "Alerts: median time to acknowledge (minutes)",
      alertCell(a.median_ack_minutes, "minutes"),
    ],
    [
      "Alerts: median for Critical alerts (minutes)",
      alertCell(a.median_ack_minutes_critical, "minutes"),
    ],
    [
      `Alerts: ${criticalTargetLabel(a.critical_target_minutes)} (%)`,
      alertCell(a.critical_within_target, "share"),
    ],
    ["Alerts: acknowledged (%)", alertCell(a.acknowledged_share, "share")],
    ["Alerts: dismissed (%)", alertCell(a.dismissed_share, "share")],
    ...DISMISS_REASONS.map((r): Cell[] => [
      `Alerts: dismissed as ${r.label}`,
      alertCell(
        a.dismiss_reasons.find((x) => x.reason === r.code)?.count,
        "count",
      ),
    ]),
    ...a.top_findings
      .slice(0, TOP_MAX)
      .map((f): Cell[] => [
        `Alerts: finding ${findingLabel(f)}`,
        alertCell(f.count, "count"),
      ]),
    ...a.top_locations
      .slice(0, TOP_MAX)
      .map((l): Cell[] => [
        `Alerts: location ${placeLabel(l.location)}`,
        alertCell(l.count, "count"),
      ]),
    ...a.series.points.map((p): Cell[] => [
      a.series.bucket === "week"
        ? `Alerts in the week of ${p.start.slice(0, 10)}`
        : `Alerts on ${p.start.slice(0, 10)}`,
      Number.isFinite(p.total) ? p.total : null,
    ]),
  ];
}
```

In `usageCsv`, after the `by_specialty` rows, add `...alertsCsvRows(u),` and
change its comment to:

```ts
/** Counts only: nothing clinical, and alert groups under the small-group rule (spec §5.6). */
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/admin components/admin && npm run lint && npm run typecheck`
Expected: PASS. The existing "exports usage as counts only" test still
expects exactly its lines: its `UsageOut` has no `alerts`, so no rows are
added. The existing "exports only the counts shown" line check
(`/^[^,]+,("[^"]*"|[^,]*)$/`) passes because no alert measure name or sample
label contains a comma.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/csv.ts lib/admin/csv.test.ts components/admin/usage-view.test.tsx
git commit -m "Export the patient alert numbers with the small-group rule"
```

---

### Task 5: End to end, the README and the CHANGELOG

**Files:**

- Modify: `tests/e2e/hospital-admin.spec.ts`, `README.md`,
  `tests/readme.test.ts`, `CHANGELOG.md`
- Test: `tests/e2e/hospital-admin.spec.ts` (desktop and mobile projects),
  `tests/readme.test.ts`

**Interfaces:**

- Consumes: `signIn`, `openAdmin`, `DEMO_EMAILS`, `expectNoStorage`,
  `expectNoForbiddenWords` (`tests/e2e/helpers.ts`); `asHospitalAdmin` (in
  the spec file); every screen from Tasks 2–4; the sample numbers (Task 1).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/hospital-admin.spec.ts`, add `import { readFileSync } from "node:fs";`
at the top, and add at the end:

```ts
/** The sample's alert numbers are written for this moment (R12). */
const SAMPLE_DAY = new Date("2026-10-16T10:00:00Z");

async function openUsageOnSampleDay(page: Page) {
  await page.clock.install({ time: SAMPLE_DAY });
  await asHospitalAdmin(page);
  await openAdmin(page, "Usage");
  await expect(page).toHaveURL(/\/admin\/usage$/);
  const group = page.getByRole("region", { name: "Patient alerts" });
  await expect(group).toBeVisible();
  return group;
}

test("usage shows patient alerts, what changed and hidden small groups", async ({
  page,
}) => {
  const group = await openUsageOnSampleDay(page);
  await expect(
    group.getByRole("region", { name: "What changed" }).getByRole("listitem"),
  ).toHaveText([
    "Critical within 15 min: 71%, down from 88%",
    "14 Oct: 23 alerts, about 3× the usual",
    "Potassium · low: 31, up from 9",
    "Ward 3: 34, up from 12",
  ]);
  await expect(group.getByText("up 35% vs last month")).toBeVisible();
  await expect(
    group.getByText("up 6 min vs last month · worse", { exact: false }),
  ).toBeVisible();
  await expect(
    group
      .getByRole("region", { name: "Dismissal reasons" })
      .getByRole("listitem")
      .filter({ hasText: "Wrong patient" }),
  ).toHaveText("Wrong patientFewer than 5");

  const chart = group.getByRole("region", { name: "Alerts over time" });
  await expect(chart.getByText("Most alerts on 14 Oct: 23")).toBeVisible();
  await chart.getByRole("button", { name: "Show as table" }).click();
  await expect(
    chart.getByRole("row", { name: "14 Oct 23 about 3× the usual" }),
  ).toBeVisible();
  await chart.getByRole("button", { name: "Show as chart" }).click();
  await expect(
    chart.getByRole("listitem", {
      name: "14 Oct: 23 alerts, about 3× the usual",
    }),
  ).toBeVisible();

  await page.getByLabel("Period").selectOption("last_month");
  await expect(group.getByText("Nothing unusual this period")).toBeVisible();
  await page.getByLabel("Period").selectOption("last_90_days");
  await expect(group.getByText("Not enough data to compare")).toBeVisible();
  await expect(group.getByText(/vs the 90 days before/)).toHaveCount(0);
});

test("the usage CSV carries the alert numbers, with small groups hidden", async ({
  page,
}) => {
  await openUsageOnSampleDay(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = readFileSync((await (await download).path())!, "utf8");
  expect(csv).toContain("Alerts: total,128\r\n");
  expect(csv).toContain("Alerts: Critical handled within 15 min (%),71\r\n");
  expect(csv).toContain("Alerts: dismissed as Wrong patient,Fewer than 5\r\n");
  expect(csv).toContain("Alerts on 2026-10-14,23\r\n");
  expect(csv).not.toMatch(/MRN|@|\bBed\b/);
  await expect(page.getByText("Usage exported")).toBeVisible();
});
```

In `tests/readme.test.ts`, add:

```ts
it("documents the patient alerts on Usage and the small-group rule", () => {
  expect(readme).toMatch(/\*\*Patient alerts on Usage\.\*\*/);
  expect(readme).toMatch(/What\s+changed/);
  expect(readme).toMatch(/"Fewer\s+than\s+5"/);
  expect(readme).toMatch(/Plan\s+6\s+Analysis/);
  expect(readme).not.toMatch(/\blab\b/i);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/readme.test.ts && npx playwright test tests/e2e/hospital-admin.spec.ts`
Expected: the README test FAILS (no paragraph yet). The two new e2e tests
should already pass, because Tasks 1–4 built everything they drive; if one
fails, fix it in the owning task's files (and that task's unit test) before
going on.

- [ ] **Step 3: The README and the CHANGELOG**

In `README.md`, under "Run on mock data", after the **Hospital admin.**
paragraph, add:

```markdown
**Patient alerts on Usage.** Usage also gives a short summary of the
hospital's patient alerts, in counts only: how many and how serious, how
quickly they were acknowledged (with "Critical handled within 15 min"), how
they ended and why, the top findings and locations, a column chart over time
(with a table view), and a **What changed** list against the period before.
Any group of fewer than 5 shows "Fewer than 5", in the CSV export too. In
the sample, This month has a busy day, a rising finding and ward, and slower
Critical handling; Last month has nothing unusual; Last 90 days has no
earlier period to compare with. The sample numbers are written for 16
October; on other dates the columns are a cut of the same sample. Deeper
trends and drill-down come with Plan 6 Analysis.
```

In `CHANGELOG.md`, under _Unreleased_ → **Added**, add:

```markdown
- Patient alerts on Usage for hospital admins, when alerts are switched on:
  volumes by severity, still unhandled, median time to acknowledge (overall
  and for Critical), the share of Critical alerts handled within the
  hospital's target, outcomes and dismissal reasons, the top findings and
  locations, and a column chart over time with a table view. A **What
  changed** summary lists slower Critical handling, unusually busy days or
  weeks and rising findings or locations, or says "Nothing unusual this
  period" or "Not enough data to compare". Every number shows its change
  against the previous period. Groups of fewer than 5 show "Fewer than 5",
  on screen and in the CSV export, which now includes the alert numbers.
  If the alert numbers can't load, Usage says so with Try again instead of
  showing zeros.
```

Under **Changed**, add:

```markdown
- Usage's Result confidence and By specialty bars use the new shared bar
  list (no visible change).
```

- [ ] **Step 4: Run everything**

Run: `npx prettier --write README.md CHANGELOG.md tests docs && npm test && npm run lint && npm run typecheck && npm run format:check && npm run build && npx playwright test`
Expected: every unit test passes, the build is clean, and every e2e spec
passes on the desktop and mobile projects (on phones, `openAdmin` opens the
menu first, the chart's toggle is full width, and the e2e word check finds
none of the new codes on screen).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/hospital-admin.spec.ts tests/readme.test.ts README.md CHANGELOG.md
git commit -m "Test usage alert analytics end to end; document the demo"
```

---

## Self-review notes

- **Spec coverage (usage alert analytics design):**
  - §2 where it sits: below the numbers, same period picker and request
    (Task 3), switched off on `null` or an absent field (Tasks 1, 3; R1),
    couldn't load with Try again and never zeros (Tasks 3, 4; R2), Usage
    failing (Task 3), loading and offline unchanged (the existing view);
  - §3 what it shows: volumes, response times with the backend's target,
    the chart, outcomes, reasons, top findings and locations (Tasks 1, 3;
    R8), "No data yet" for a missing median (Task 3);
  - §4 small-group rule: server contract and sample (Task 1), UI guard and
    no bar (Tasks 2, 3; R3), changes and flags (Task 3; R4, R6), series
    exception (Tasks 1, 3), CSV (Task 4);
  - §5 What changed: changes with period words and better/worse for
    response times only (Task 3; R4), the summary's order and its two empty
    states (Task 3; R5, R6, R7);
  - §6 charts: `ColumnChart` and `BarList`, generic, keyboard, table, phone,
    reduced motion, the existing cards moved (Task 2; R9, R10);
  - §7 CSV (Task 4; R11); §8 wording and `FORBIDDEN_TERMS` (Task 3); §9
    accessibility (Tasks 2, 3); §10 privacy (Tasks 1, 3, 4); §11 many EMR
    systems (Tasks 1, 3); §12 not here (Not in this plan, README);
  - §13 the contract: types (Task 1) and spec §10 item 21 (Task 1);
  - §14 demo: every state in the sample, deterministic (Task 1; R12).
- **ADR 0003 frontend rules:** no vendor names; normalised labels only;
  "Not standardised" and "Location not recorded"; nothing mapped or guessed
  in the UI (Tasks 1, 3).
- **Review Focus:** each of the five has named tests in its owning tasks
  (see the Review Focus section).
- **Exact strings** match the spec's §8 table and the tests: "Patient
  alerts", "Counts for your hospital only. Groups of fewer than 5 are
  hidden.", "What changed", "Nothing unusual this period", "Not enough data
  to compare", "Couldn't load patient alerts", "Try again", "Fewer than 5",
  "No data yet", "Alerts", "Still unhandled", "Median time to acknowledge",
  "Median for Critical alerts", "Critical handled within 15 min", "Alerts
  over time", "Show as table", "Show as chart", "Unusually busy",
  "Outcomes", "Acknowledged", "Dismissed", "Dismissal reasons", "Top
  findings", "Top locations", "Nothing to show yet.", "Most alerts on 14
  Oct: 23", "14 Oct: 23 alerts, about 3× the usual", "Potassium · low: 31,
  up from 9", "Ward 3: 34, up from 12", "Critical within 15 min: 71%, down
  from 88%", "up 35% vs last month", "Alerts,Couldn't load".
- **Names used across tasks:** `SMALL_GROUP_MIN`, `FEWER_THAN_5`,
  `isSmallCount`, `GuardedOut`, `ChangeDirection`, `ChangeOut`,
  `MeasureOut`, `FindingGroupOut`, `LocationGroupOut`,
  `DismissReasonCountOut`, `SeriesBucketOut`, `AlertSeriesOut`, `RisingOut`,
  `WorseningOut`, `UsageAlertsOut`, `UsageAlertsUnavailableOut`,
  `MockAlertsMode`, `mockAdminWith`, `sampleAlerts`, `BarItem`, `BarList`,
  `Column`, `ColumnChart`, `TOP_MAX`, `ALERTS_INTRO`, `ALERTS_FAILED`,
  `NOTHING_UNUSUAL`, `NOT_ENOUGH_TO_COMPARE`, `NO_DATA`, `UNUSUALLY_BUSY`,
  `SEVERITY_ORDER`, `MeasureKind`, `Shown`, `AlertsState`, `Better`,
  `ChangeItem`, `WhatChanged`, `readAlerts`, `shown`, `valueText`,
  `minutesLabel`, `compareLabel`, `changeFor`, `changeText`, `verdict`,
  `criticalTargetLabel`, `dayLabel`, `bucketLabel`, `alertCount`,
  `seriesSummary`, `usualMark`, `unusualLine`, `findingLabel`, `placeLabel`,
  `risingLine`, `worseningLine`, `whatChanged`, `columnsOf`, `Tile`, `Card`,
  `UsageAlerts`, `SEVERITY_ICON`, `ALERTS_CSV_FAILED`, `alertsCsvRows`. Each
  is defined once and used with the same spelling after.
- **Still open (for the spec owners):**
  - the whole contract (spec §10 item 21) is assumed, especially the
    `{ unavailable: true }` marker, the change units and the thresholds for
    "noticeably" and "well above usual";
  - whether 0 should also read "Fewer than 5" (this design shows 0);
  - whether the CSV should carry the previous period's values too (this
    design keeps changes on screen only);
  - whether the series should be suppressed after all for very small
    hospitals (the product owner's decision: not suppressed);
  - the sample hospital keeps its existing name from Plans 2–4, which is the
    same word ADR 0003 uses for the first EMR system; spec §11 already asks
    whether demos should use a placeholder name. This plan adds no new use
    of it (the CSV tests use "Sample Hospital").
