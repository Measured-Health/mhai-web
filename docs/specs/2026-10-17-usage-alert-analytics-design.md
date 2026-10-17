# Patient alert analytics on the Usage page (hospital admin side)

- **Status:** Approved design (product owner, 17 Oct 2026). Plan 5b.
- **Builds on:** [UI design v3](2026-10-13-ui-design-v3.md) (§5.6 Usage, §6 wording,
  §7 accessibility, §10 backend), the [notifications design](2026-10-17-notifications-design.md)
  (severity, dismissal reasons, findings and locations), the analysis design's small-group
  rule, and [ADR 0003](../adr/0003-many-emr-systems.md).
- **Scope:** a short summary of the hospital's patient alerts on the existing Usage page, on
  sample data now and ready for the real API. Usage stays a quick summary: deeper trends,
  filters and drill-down belong to **Plan 6 Analysis**, not here.

## 1. Goal

Hospital admins already see consultations, clinicians and review times on Usage. Once
patient alerts are switched on, they also need to know, at a glance:

- how many alerts the hospital had and how serious they were;
- how quickly they were handled, especially Critical ones;
- how they ended (acknowledged or dismissed, and why);
- which findings and places raise the most alerts;
- what changed compared with the period before.

Counts only, for the admin's own hospital. No patient names, MRNs or individual alerts.

## 2. Where it sits

- A new **Patient alerts** group on the Usage page, below the existing numbers, driven by the
  same period picker (This month, Last month, Last 90 days) and the same request
  (`GET /hospital/usage`).
- It starts with one line: "Counts for your hospital only. Groups of fewer than 5 are
  hidden."
- **Switched off:** when the API sends `alerts: null`, or no `alerts` field at all (a backend
  that predates this design), the group is not shown. Nothing on the page mentions alerts.
- **Couldn't load:** when the API sends `alerts: { "unavailable": true }`, or a block the app
  can't read, the group shows "Couldn't load patient alerts" with **Try again** (which reloads
  Usage). It never shows zeros, and it never says "Nothing unusual this period".
- **Usage itself fails:** the page's existing error banner with Try again; the group is not
  shown.
- **Loading and offline:** as the rest of Usage (one skeleton; the offline line).

## 3. What it shows

Order, top to bottom:

1. **What changed** (§5).
2. **Volumes:** tiles for **Alerts** (the total), **Critical**, **Urgent**, **Info** and
   **Still unhandled**. Severity tiles carry the severity word and its icon (the same icons as
   the alert cards).
3. **Response times:** **Median time to acknowledge** (all alerts), **Median for Critical
   alerts**, and **Critical handled within 15 min**: the share of Critical alerts
   acknowledged or dismissed within the hospital's target. The target comes from the backend
   (`critical_target_minutes`, 15 by default); the label always uses it ("Critical handled
   within 10 min" for a 10-minute target).
4. **Alerts over time:** a column chart (§6) of hospital-wide totals: one column per day for
   This month and Last month, one per week for Last 90 days. Unusually busy days or weeks are
   marked.
5. **Outcomes:** the share **Acknowledged** and **Dismissed** of handled alerts, as bars.
6. **Dismissal reasons:** Not clinically relevant · Already known · Wrong patient · Other,
   with counts, as bars.
7. **Top findings:** up to 5, as bars. Each is the finding's display label with its
   direction ("Potassium · low"). Findings whose codes aren't mapped yet are grouped into one
   row, **Not standardised**.
8. **Top locations:** up to 5, as bars: a ward ("Ward 3"), a clinic ("Outpatient ·
   Cardiology clinic"), **Emergency department**, or **Location not recorded**. Never a bed.

Every number has its change against the previous period (§5) beside it, when there is one.
A median with nothing to measure (no acknowledged alerts) reads "No data yet", never 0.

## 4. The small-group rule

The analysis design's rule applies: **any number that comes from a group of fewer than 5
shows "Fewer than 5"**.

- **The server applies it.** A hidden value arrives as `{ "value": null, "suppressed": true }`.
  Raw small numbers never reach the browser.
- **The server also stops a hidden value being worked out from the others.** When it hides
  one group in a set that adds up (severities, dismissal reasons, acknowledged and
  dismissed), it also hides enough other groups that the hidden ones together are at least 5.
- **Shares and medians** are hidden when the group they're computed over has fewer than 5
  (for example, "Median for Critical alerts" with 3 Critical alerts acknowledged).
- **Zero is shown.** 0 identifies no one ("Still unhandled: 0").
- **The UI shows "Fewer than 5" and no bar.** It never shows a number for a suppressed value,
  even if one is sent by mistake, and it shows any count from 1 to 4 as "Fewer than 5" as
  well (a second guard).
- **Changes and flags respect it:** a change is shown only when both periods' values are
  shown; a hidden group is never flagged as rising.
- **Exception: Alerts over time.** Its daily or weekly totals are hospital-wide, with no
  severity, finding or location split, so they are not suppressed.
- **The CSV export follows the same rule** ("Fewer than 5" in the cell).

## 5. What changed

The backend computes every comparison and flag; the frontend only displays them and never
computes statistics from raw numbers.

### 5.1 Change against the previous period

- The previous period has the same length: the same days of last month for This month, the
  month before for Last month, the 90 days before for Last 90 days.
- Written out, with an arrow icon:
  - counts: "up 35% vs last month";
  - times: "up 6 min vs last month";
  - shares: "down 17 points vs last month";
  - no change: "no change vs last month".
- The comparison words follow the period: "vs last month" (This month), "vs the month before"
  (Last month), "vs the 90 days before" (Last 90 days).
- **Only response times read as better or worse**, as a word after the change: "up 6 min vs
  last month · worse", "up 2 points vs the month before · better". Volumes and outcomes are
  neutral: more alerts is neither good nor bad.
- **No change is shown** when either period's value is hidden or missing, when the previous
  value was 0 (no percentage), or when there is no previous period.

### 5.2 The What changed summary

At the top of the group, a short list, most important first:

1. **Worsening response:** when the share of Critical alerts handled within the target drops
   noticeably: "Critical within 15 min: 71%, down from 88%".
2. **Unusual days or weeks:** buckets the backend flags as well above the usual level:
   "14 Oct: 23 alerts, about 3× the usual" (weekly: "Week of 3 Oct: 41 alerts, about 2× the
   usual"). They are also marked on the column chart.
3. **Rising findings:** "Potassium · low: 31, up from 9".
4. **Rising locations:** "Ward 3: 34, up from 12".

- With nothing flagged: **"Nothing unusual this period"**.
- With no previous period to compare with (a hospital whose alerts started recently): **"Not
  enough data to compare"**, and no changes or flags anywhere in the group, even if some are
  sent.
- When alerts couldn't load, the summary is not shown at all (§2).
- Rising needs at least 5 in both periods; suppressed groups are never flagged.

## 6. Charts

No new dependency. Two small components in `components/ui/charts/`, written so Plan 6
Analysis can reuse them: they know nothing about alerts or admins.

- **`ColumnChart`:** columns over time.
  - A visible title and a one-line text summary ("Most alerts on 14 Oct: 23"; weekly "Most
    alerts in the week of 3 Oct: 41"; "No alerts in this period" when every column is 0).
  - **Show as table** / **Show as chart** toggle; the table has the same rows (Day or Week,
    Alerts, and a Note for marked columns).
  - Keyboard: Tab reaches the columns as one stop; the arrow keys, Home and End move between
    them; each column's name says its date, value and mark ("14 Oct: 23 alerts, about 3× the
    usual"), and the focused column's text shows under the chart.
  - Marked columns carry a marker and the legend "Unusually busy", never colour alone.
  - Phone layout: a shorter plot, the first and last dates only, and a 44 px toggle.
- **`BarList`:** horizontal bars in the style the Usage page already uses.
  - The number is always written beside each bar.
  - A hidden group reads "Fewer than 5" and has no bar.
  - The existing Result confidence and By specialty cards move onto it, unchanged on screen.
- **Severity** always carries its word and icon, never colour alone.
- **Reduced motion:** bars and columns grow once with the motion tokens; under reduced motion
  they are simply there.

## 7. CSV export

- The Usage export gains the alert numbers, built on the device like the rest (counts only,
  nothing stored).
- Rows start with "Alerts", for example "Alerts: total", "Alerts: Critical", "Alerts: Critical
  handled within 15 min (%)", "Alerts: dismissed as Wrong patient", "Alerts: finding
  Potassium · low", "Alerts: location Ward 3", and one row per column of the chart ("Alerts on
  2026-10-14", or "Alerts in the week of 2026-10-03").
- A hidden value is written "Fewer than 5". A missing median is an empty cell, never 0.
- Changes and flags stay on screen; the file holds the period's numbers.
- Alerts switched off: no alert rows. Alerts couldn't load: one row, "Alerts, Couldn't load",
  so the file never reads as if there were none.

## 8. Wording

Plain words only; no backend terms (`suppressed`, `critical_target_minutes`,
`usual_multiple`, `has_previous` and the like never reach the screen). Severities "Critical",
"Urgent", "Info"; dismissal reasons as in the notifications design; "Not standardised" and
"Location not recorded" as in ADR 0003. No "lab" wording: findings are results. The exact
strings:

| Where              | Text                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Group heading      | Patient alerts                                                                           |
| Group intro        | Counts for your hospital only. Groups of fewer than 5 are hidden.                        |
| Summary heading    | What changed                                                                             |
| Nothing flagged    | Nothing unusual this period                                                              |
| No previous period | Not enough data to compare                                                               |
| Couldn't load      | Couldn't load patient alerts · Try again                                                 |
| Hidden value       | Fewer than 5                                                                             |
| Nothing to measure | No data yet                                                                              |
| Volume tiles       | Alerts · Critical · Urgent · Info · Still unhandled                                      |
| Response tiles     | Median time to acknowledge · Median for Critical alerts · Critical handled within 15 min |
| Chart              | Alerts over time · Show as table · Show as chart · Unusually busy                        |
| Cards              | Outcomes (Acknowledged, Dismissed) · Dismissal reasons · Top findings · Top locations    |
| Empty card         | Nothing to show yet.                                                                     |

## 9. Accessibility

- Severity, better/worse and marked columns always carry a word and an icon or marker.
- Every chart has a text summary and a table view; columns are reachable from the keyboard.
- Bars always have their number written beside them.
- 44 px targets on phones; the group stacks to one column on phones.
- Reduced motion is respected.

## 10. Privacy

- Counts only, for the admin's own hospital: no names, MRNs, beds or individual alerts reach
  the page or the export. The usage contract stays unable to carry them.
- The small-group rule (§4) is enforced by the server and guarded again by the UI.
- Nothing is kept beyond the query cache, as for the rest of Usage.

## 11. Many EMR systems

No vendor names anywhere (ADR 0003). Findings and locations come normalised with display
labels; unmapped findings group as "Not standardised" and missing locations as "Location not
recorded". Usage doesn't split by source system; a Source filter belongs to Plan 6 Analysis.

## 12. Not here: Plan 6 Analysis

Usage stays a quick summary of one period against the one before. Longer trends, filters by
severity, finding, location or source, drill-down from a bar or a column, and disease or
population analysis belong to Plan 6 Analysis, which reuses `ColumnChart` and `BarList`.

## 13. Backend this design needs (assumed contract)

Add to spec §10 of the UI design as item 21. `GET /hospital/usage?period=…` gains an
`alerts` field:

```ts
/** A number under the small-group rule. `suppressed: true` always comes with `value: null`. */
export interface GuardedOut {
  value: number | null;
  suppressed: boolean;
}

/** The backend's comparison with the previous period of the same length. */
export interface ChangeOut {
  direction: "up" | "down" | "same";
  /** Whole percent for counts, minutes for times, percentage points for shares. */
  amount: number;
  /** The previous period's value, in the measure's unit (0–1 for shares). Never hidden. */
  previous: number;
}

/** A number with its change; `change` is null when either period is hidden or missing. */
export interface MeasureOut extends GuardedOut {
  change: ChangeOut | null;
}

export interface FindingGroupOut {
  /** Display label, e.g. "Potassium"; null for the unmapped findings ("Not standardised"). */
  name: string | null;
  flag: "low" | "high" | "abnormal" | null;
  count: GuardedOut;
}

export interface LocationGroupOut {
  /** Ward level at most: `bed` is always null here. Null reads "Location not recorded". */
  location: AlertLocationOut | null;
  count: GuardedOut;
}

export interface SeriesBucketOut {
  /**
   * The hospital's calendar day, or the week's first day, "YYYY-MM-DD". Weeks start on
   * the period's first day (not a fixed weekday); the last week may be partial.
   */
  start: string;
  /** Hospital-wide; not suppressed. */
  total: number;
  /** About how many times the usual level, when the backend flags it as unusual; else null. */
  usual_multiple: number | null;
}

export type RisingOut =
  | {
      kind: "finding";
      name: string | null;
      flag: "low" | "high" | "abnormal" | null;
      count: number;
      previous: number;
    }
  | {
      kind: "location";
      location: AlertLocationOut | null;
      count: number;
      previous: number;
    };

export interface UsageAlertsOut {
  /** The hospital's target for handling a Critical alert, in minutes (15 by default). */
  critical_target_minutes: number;
  /** False when there's no earlier period of the same length: no changes, no flags. */
  has_previous: boolean;
  total: MeasureOut;
  by_severity: Record<"critical" | "urgent" | "info", MeasureOut>;
  unhandled: MeasureOut;
  /** Minutes from raised to acknowledged; value null when none was acknowledged. */
  median_ack_minutes: MeasureOut;
  median_ack_minutes_critical: MeasureOut;
  /** 0–1: Critical alerts acknowledged or dismissed within the target. */
  critical_within_target: MeasureOut;
  /** 0–1 of handled alerts. */
  acknowledged_share: MeasureOut;
  dismissed_share: MeasureOut;
  /** All four reasons, in this order: not_relevant, already_known, wrong_patient, other. */
  dismiss_reasons: { reason: DismissReason; count: GuardedOut }[];
  /** At most 5 each, largest first. */
  top_findings: FindingGroupOut[];
  top_locations: LocationGroupOut[];
  /** Days for this_month and last_month, weeks for last_90_days; oldest first. */
  series: { bucket: "day" | "week"; points: SeriesBucketOut[] };
  /** Rising findings and locations: at least 5 in both periods. */
  rising: RisingOut[];
  /** Set when critical_within_target dropped noticeably; shares 0–1. */
  worsening: { value: number; previous: number } | null;
}

export interface UsageOut {
  // …the existing fields…
  /** null (or absent): alerts aren't switched on. `{ unavailable: true }`: couldn't compute them. */
  alerts?: UsageAlertsOut | { unavailable: true } | null;
}
```

`AlertLocationOut` and `DismissReason` are the alert contract's (spec §10 item 20).

Rules for the backend:

- Scoped to the admin's own hospital; counts only. No patient, MRN, bed or alert id.
- Apply the small-group rule (§4) to every value except `series`, including complementary
  suppression, before the response leaves the server.
- Compute every change, flag and multiple. Send `change: null` when either period is hidden or
  missing or the previous count was 0. With `has_previous: false`, every `change` is null and
  `rising`, `worsening` and `usual_multiple` are empty or null.
- "Noticeably" and "well above usual" are the backend's thresholds to choose and document;
  the frontend shows whatever is flagged.
- `alerts: null` when alerts aren't switched on for the hospital; `{ "unavailable": true }`
  when the rest of usage is fine but the alert numbers can't be computed right now. There is
  no separate alerts route, so a 404 is never needed: an older backend that sends no `alerts`
  field reads as switched off.
- `Cache-Control: no-store`, as for the rest of usage.

## 14. Demo (sample data)

Deterministic, memory only, in the existing admin sample:

- **This month** (written for 16 Oct): 128 alerts, up 35%; slower response with a worsening
  notice (71%, down from 88%); 14 Oct flagged at about 3× the usual; Potassium · low and
  Ward 3 rising; two dismissal reasons and one clinic hidden as "Fewer than 5".
- **Last month:** a full month with nothing flagged ("Nothing unusual this period"), better
  response times, "Still unhandled" at 0, one hidden clinic and two hidden reasons.
- **Last 90 days:** weekly columns and no earlier period ("Not enough data to compare").
- The sample can also be set to `alerts: null` and to `{ unavailable: true }` for tests.

## 15. Decisions made with this design

- One request: the alert numbers ride on `GET /hospital/usage`; "switched off" is `null` or
  an absent field, and a separate "couldn't compute" marker gives the failed state without
  failing the rest of Usage.
- Zero is shown; 1 to 4 is hidden.
- Unmapped findings are one "Not standardised" row rather than one row per local label.
- Rising needs at least 5 in both periods, so "up from" never reveals a small number.
- With no previous period, no flags at all: the usual level needs history.
- The CSV holds the numbers, not the changes or flags.
