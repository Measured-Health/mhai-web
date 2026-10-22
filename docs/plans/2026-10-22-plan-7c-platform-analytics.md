# Plan 7c: Analytics across hospitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an **Analytics** page in the platform admin app. It opens on "What changed" across all hospitals, with:

- a detail panel for the selected change: the chart against the median of the other hospitals, the hospital's size, its admins to contact, follow-ups, and a link to the hospital;
- four tabs: Use, Alert safety, Answer quality and Hospitals;
- a CSV download.

It runs on sample data, under the small-group rule. The bell and email are Plan 7d.

**Architecture:**

- **Shared charts and CSV.** The hospital Usage page's charts (`BarList`, `ColumnChart`, the chart types), the small-group constants and the generic CSV helpers move into `@mhai/ui`, so both apps use one copy. The clinical app is rewired with no behaviour change.
- **Data.** The platform app gets an analytics contract, sample data and live client, with the proxy accepting the new paths. Pure rules live in `apps/platform/lib/analytics/`:
  - reading and guarding the payload, failing closed;
  - the Critical guard;
  - ranking, wording and CSV.
- **UI.** The components live in `apps/platform/components/analytics/`. The page sits at `app/(app)/analytics/page.tsx`. The query hooks live in `lib/queries/analytics.ts`.

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64.

**Spec:** `docs/specs/2026-10-22-platform-analytics-design.md` (approved 22 Oct 2026). Background:

- `docs/specs/2026-10-17-usage-alert-analytics-design.md` (Plan 5b), for the fail-closed rules;
- `docs/specs/2026-10-17-platform-admin-design.md`.

## Global Constraints

- **Counts only.** No patient names, no MRNs, no question or answer text, nothing per person.
- **The small-group rule** (spec §5):
  - any count **1–4** shows **"Fewer than 5"**, with no bar, on screen and in the CSV; **0** is shown;
  - across hospitals this covers every count: questions, active clinicians, confidence counts, review counts and alerts;
  - a rate, share, median or change computed over a hidden count is hidden too;
  - a set that adds up (severities, the confidence mix) hides the whole set when exactly one member is hidden, or when hidden members could be worked out from the total (the Plan 5b rule);
  - a value the server sent that it should have hidden fails the whole area closed ("Couldn't load {area}").
- **What changed:**
  - it always compares **the last 7 days with the 4 weeks before**, whatever period is picked;
  - the period picker (**Last 7 days**, **Last 30 days**, **Last 90 days**; default 30) changes only the charts, the tabs and the CSV;
  - a change keeps its `id` for as long as it lasts, and a follow-up stays with that id.
- **Ranking:**
  - serious (Critical-type) changes first, then by size of change;
  - rows already followed up drop below rows that aren't;
  - the top **5** show, then **Show all ({n})**.
- **The Critical guard (anti-goal 2).** A hospital whose `critical_overdue` is above 0 or hidden, with no serious change for it in the list, makes the What changed area show **"Couldn't load what changed"**. It never shows "Nothing unusual this period" in that case.
- **Fairness.** Comparisons with other hospitals use rates and the median of the others, never totals. The hospital's size always shows ("{staff} staff · {n} questions this period").
- **Roles:**
  - platform admins can mark a change followed up, add or edit a note (**500** characters at most; only the author edits it) and undo a follow-up;
  - auditors see everything, including who followed up, and change nothing;
  - the proxy refuses auditor writes (existing rule).
- **Copy:**
  - plain words;
  - "What changed", "Nothing unusual this period", "Not enough data to compare yet", "Couldn't load {area}" with **Try again**, "Updated {time}";
  - "Followed up by {name} · {date}";
  - "Show all ({n})";
  - signs: ⚠ worse, ↑ rising, ↓ falling, always with words, never colour alone.
- **States.** Each area has its own "Updated {time}" and fails on its own:
  - an area that fails never shows zeros and never takes the others down;
  - offline disables Mark followed up, notes and Download CSV, with the reason.
- **Phone.** At 390 px the list and the detail stack: tapping a row opens the detail, with a **Back** link. Targets are 44 px.
- **No change to the clinical app's behaviour.** Its unit tests (1368) and e2e (119 passed, 1 skipped) pass with their assertions unchanged; tests that move into `@mhai/ui` keep their assertions.
- **Repo rules:**
  - no AI attribution;
  - never `git add -f` under `.superpowers/`;
  - heavy commands run on the build server;
  - no vendor names;
  - the ids are opaque `[A-Za-z0-9_-]+`.

## Rulings made while planning

- **Shared code moves to `@mhai/ui`:**
  - `@mhai/ui/charts/bar-list`, `@mhai/ui/charts/column-chart`;
  - the types in `@mhai/ui/charts/types`;
  - `@mhai/ui/small-groups`;
  - `@mhai/ui/csv` (`csvCell`, `toCsv`, `downloadCsv`, `CSV_MAX_ROWS`).

  The clinical app's alert-specific CSV rows and `readAlerts` stay in the clinical app.

- **The hospital admins contact.** The backend contract adds `admins: {name, email}[]` (active hospital admins) to `Hospital`. The mock seeds it; a hospital in set-up has `admins: []`.
- **The CSV** covers every area for the chosen period plus the changes list, whatever tab is open. An unavailable area writes "Couldn't load" (as in Plan 5b).
- **Follow-up writes** send the change's `version`. If someone else changed the follow-up meanwhile, the result is 409 `conflict`: "Changed by someone else", and the page reloads it.

## Review Focus

1. **A hospital with 0 of something next to one with 1–4.** 0 must show as "0", and 1–4 as "Fewer than 5". Neither may leak through a rate, a median or the CSV. Task 3 tests both, plus the CSV.
2. **A new hospital with no previous period.** It must show "Not enough data to compare yet", not a change and not a crash. Task 2's fixtures include one; Task 3 tests it.
3. **Two admins following up the same change at once.** The second gets 409 `conflict`, then "Changed by someone else" and a reload, never a silent overwrite. Tasks 2 and 4 test it.
4. **Every area unavailable at once.** The page still renders the header and each area's "Couldn't load", and the CSV writes "Couldn't load" lines. Tasks 3 and 4 test it.
5. **A hospital with no active admin and an expired first-admin invite.** It shows "No active hospital admin" with "Invite expired" and the hospital link, never someone who can't act. Task 4 tests it.

---

## File structure

```text
packages/ui/src/charts/bar-list.tsx column-chart.tsx types.ts charts.test.tsx   (moved)
packages/ui/src/small-groups.ts csv.ts csv.test.ts                              (moved)
apps/platform/lib/api/analytics-contract.ts        types (§Task 2)
apps/platform/lib/api/analytics-fixtures.ts        sample changes and measures
apps/platform/lib/api/mock.ts · live.ts · contract.ts (PlatformClient gains analytics methods; Hospital gains admins)
apps/platform/app/api/v1/[...path]/route.ts        new shapes
apps/platform/lib/analytics/read.ts                readAnalytics + guards
apps/platform/lib/analytics/changes.ts             rankChanges, changeLine, followUpLine, the Critical guard
apps/platform/lib/analytics/measures.ts            measure labels, value text, compare measures
apps/platform/lib/analytics/csv.ts                 analyticsCsv
apps/platform/lib/queries/analytics.ts             hooks
apps/platform/components/analytics/*.tsx           page parts
apps/platform/app/(app)/analytics/page.tsx
apps/platform/components/shell/nav.ts              Analytics link
apps/platform/tests/e2e/analytics.spec.ts
```

---

### Task 1: Shared charts, small-group constants and CSV helpers in `@mhai/ui`

**Files:**

- Move (`git mv`, with their tests):
  - `apps/clinical/components/ui/charts/{bar-list,column-chart}.tsx` and `charts.test.tsx` go to `packages/ui/src/charts/`;
  - `apps/clinical/lib/charts.ts` goes to `packages/ui/src/charts/types.ts`;
  - `apps/clinical/lib/small-groups.ts` (and its test) goes to `packages/ui/src/small-groups.ts`.
- Create: `packages/ui/src/csv.ts` and `csv.test.ts`, holding `csvCell`, `toCsv`, `downloadCsv` and `CSV_MAX_ROWS`, taken out of `apps/clinical/lib/admin/csv.ts`.
- Modify: every clinical importer, and `apps/clinical/lib/admin/csv.ts`, which re-exports the moved helpers so its callers don't change. Also `packages/ui/package.json` exports, if a new pattern is needed.

**Interfaces:**

- Produces:
  - `@mhai/ui/charts/bar-list` (`BarList`);
  - `@mhai/ui/charts/column-chart` (`ColumnChart`);
  - `@mhai/ui/charts/types` (`Column`, `BarItem`);
  - `@mhai/ui/small-groups` (`SMALL_GROUP_MIN = 5`, `FEWER_THAN_5 = "Fewer than 5"`, `isSmallCount`);
  - `@mhai/ui/csv` (`Cell`, `csvCell`, `toCsv(header, rows)`, `downloadCsv(filename, csv)`, `CSV_MAX_ROWS = 10_000`).

  Same behaviour and props as today.

- [ ] **Step 1: Move and rewire.** Keep the `@/lib/…` paths that remain re-exporting where that keeps callers unchanged. Imports inside the package are relative. `lucide-react` is already a peer.
- [ ] **Step 2: Verify.**
  - `npm test`: the clinical count drops by exactly the number of tests moved, and `@mhai/ui` gains the same number. Record both.
  - lint, typecheck, build, `check:bundle` and `check:platform-marker` pass.
  - The clinical e2e gives 119 passed, 1 skipped.
  - The motion test in the clinical app still passes; it scans `packages/ui/src`.
- [ ] **Step 3: Commit:** "Share the usage charts, the small-group rule and CSV helpers".

---

### Task 2: The analytics contract, sample data, live client and proxy paths

**Files:**

- Create: `apps/platform/lib/api/analytics-contract.ts`, `analytics-fixtures.ts`, and tests in `mock-analytics.test.ts`.
- Modify:
  - `lib/api/contract.ts`: `Hospital.admins`, and the analytics methods on `PlatformClient`;
  - `lib/api/mock.ts`, `lib/api/fixtures.ts` (admins), `lib/api/live.ts`, `live.test.ts`;
  - `app/api/v1/[...path]/route.ts` and `proxy.test.ts`.

**Interfaces (`analytics-contract.ts`):**

```ts
type Period = "7d" | "30d" | "90d";
type Guarded = { value: number | null; suppressed: boolean };
type Area = "use" | "alerts" | "quality";
type Direction = "worse" | "better" | "rising" | "falling";
type MeasureId =
  | "questions_per_clinician"
  | "questions"
  | "active_clinicians"
  | "critical_median_ack_minutes"
  | "critical_within_target"
  | "unhandled_alerts"
  | "alerts_total"
  | "needs_review_share"
  | "agreement_rate"
  | "median_review_hours";
type FollowUp = {
  by: Person;
  at: string;
  note: string | null;
  version: number;
};
type Change = {
  id: string;
  hospital: Person | null;
  area: Area;
  measure: MeasureId;
  direction: Direction;
  serious: boolean;
  previous: Guarded;
  current: Guarded;
  summary: string;
  follow_up: FollowUp | null;
  version: number;
};
type Unavailable = { unavailable: true };
type HospitalSize = {
  staff: number;
  active_clinicians: Guarded;
  questions: Guarded;
};
type UseRow = {
  hospital: Person;
  questions: Guarded;
  active_clinicians: Guarded;
  questions_per_clinician: Guarded;
};
type AlertsRow = {
  hospital: Person;
  by_severity: Record<"critical" | "urgent" | "info", Guarded>;
  total: Guarded;
  unhandled: Guarded;
  median_ack_minutes: Guarded;
  critical_median_ack_minutes: Guarded;
  critical_within_target: Guarded;
  critical_target_minutes: number;
  critical_overdue: Guarded;
};
type QualityRow = {
  hospital: Person;
  answers: Guarded;
  needs_review_share: Guarded;
  confidence: Record<"high" | "medium" | "low", Guarded>;
  agreement_rate: Guarded;
  median_review_hours: Guarded;
};
type AreaBlock<R> = {
  updated_at: string;
  rows: R[];
  median: Omit<R, "hospital">;
  trend: { start: string; value: number }[];
};
type AnalyticsOut = {
  period: Period;
  from: string;
  to: string;
  changes:
    | {
        updated_at: string;
        window: { from: string; to: string };
        items: Change[];
      }
    | Unavailable;
  use: AreaBlock<UseRow> | Unavailable;
  alerts: AreaBlock<AlertsRow> | Unavailable;
  quality: AreaBlock<QualityRow> | Unavailable;
  hospitals:
    | { updated_at: string; rows: { hospital: Person; size: HospitalSize }[] }
    | Unavailable;
};
type SeriesOut = {
  measure: MeasureId;
  hospital: Person;
  points: { start: string; value: Guarded; median: number | null }[];
};
```

**`PlatformClient` gains:**

- `getAnalytics(period: Period): Promise<AnalyticsOut>`;
- `getChangeSeries(changeId: string, period: Period): Promise<SeriesOut>`;
- `getHospitalSeries(hospitalId: string, measure: MeasureId, period: Period): Promise<SeriesOut>`;
- `followUp(changeId: string, body: { note?: string; version: number }, opts: { idempotencyKey: string }): Promise<Change>`;
- `undoFollowUp(changeId: string, body: { version: number }, opts: { idempotencyKey: string }): Promise<Change>`.

`Hospital` gains `admins: { name: string; email: string }[]`.

**Proxy shapes:**

| Method | Path                                        |
| ------ | ------------------------------------------- |
| GET    | `platform/analytics`                        |
| GET    | `platform/analytics/changes/{id}/series`    |
| GET    | `platform/analytics/hospitals/{id}/series`  |
| PUT    | `platform/analytics/changes/{id}/follow-up` |
| DELETE | `platform/analytics/changes/{id}/follow-up` |

**Live paths:** the same. `undoFollowUp` sends DELETE with the `{version}` body.

**Mock rules** (`createMockPlatform` gains the analytics methods; the `delayMs`, `me()` and clock are as today):

- The changes for the fixed window come from `analytics-fixtures.ts`. They are the same whatever `period` is, and their ids are stable.
- `followUp`:
  - a platform admin only; an auditor gets 403 `forbidden`;
  - a `note` over 500 characters gives 422 `invalid`;
  - a stale `version` gives 409 `conflict`;
  - setting a note on someone else's follow-up gives 403 `forbidden`, since only the author edits;
  - it logs an Activity event.
- `undoFollowUp`: any platform admin, with a version check.
- Every count is suppressed as `{value: null, suppressed: true}` when it is 1–4.
- **The fixtures cover every rule:**
  - Northgate: a serious "Critical acknowledged 2× slower" change;
  - Riverside: questions down 41%, already followed up by Tunde with a note;
  - all hospitals: "Low potassium" alerts rising;
  - a small hospital with counts of 1–4, so values are hidden;
  - a hospital with zeros;
  - Eastbrook (set-up incomplete): no previous period, `admins: []`, first admin invite expired;
  - Harbour View: `critical_overdue` of 3 (hidden), with **no** serious change. This proves the guard, so give the mock an option `analytics: "normal" | "guard"`. "guard" removes Northgate's serious change and keeps Harbour View's overdue. Default "normal".
  - an `analytics: "unavailable"` option makes every area `{unavailable: true}`.

- [ ] **Step 1: Write the failing tests**
  - `mock-analytics.test.ts`:
    - "changes are the same for every period and keep their ids";
    - "counts 1–4 are suppressed, 0 is not";
    - "an auditor can't follow up";
    - "a stale version is 409 conflict";
    - "a note over 500 characters is 422";
    - "only the author edits a note; any platform admin can undo";
    - "follow-up writes log activity";
    - "Eastbrook has no admins and no previous period";
    - "the 'unavailable' option makes every area unavailable".
  - `live.test.ts`: the five methods use the paths and methods above, with an Idempotency-Key on writes.
  - `proxy.test.ts`: the five shapes are accepted, auditor PUT and DELETE are refused before upstream, and `platform/analytics/x` is 404.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the analytics contract, sample data and live client".

---

### Task 3: The analytics rules: reading, guards, ranking, wording and CSV

**Files:**

- Create, each with a test: `apps/platform/lib/analytics/read.ts`, `changes.ts`, `measures.ts`, `csv.ts`.

**Interfaces:**

- `readAnalytics(a: AnalyticsOut): AnalyticsState`. The state has one field per area, each `{ status: "ok", ...shown } | { status: "failed" }`, plus `changes` as `{status:"ok", items: RankedChange[]} | {status:"failed"}`. It fails an area closed when:
  - a value of 1–4 arrives unsuppressed;
  - a rate, share, median or change sits over a hidden count;
  - a set that adds up gives away a hidden member;
  - the shape is wrong.

  `changes` also fails, through the Critical guard, when a hospital in `alerts.rows` has `critical_overdue` (value > 0 or suppressed) with no `serious` change for it. If `alerts` itself is unavailable, the guard can't be checked, and changes fail closed too.

- `rankChanges(items: Change[]): RankedChange[]` orders serious first, then by |current − previous| ÷ previous, then follow-ups below; `TOP = 5`.
- `changeLine(c: Change): { sign: "⚠" | "↑" | "↓"; words: string }`. Signs: worse gives ⚠, rising gives ↑, falling gives ↓; better uses ↑ or ↓ by the value's movement.
- `followUpLine(f: FollowUp): string` gives "Followed up by {name} · {d MMM}".
- `measureLabel(m: MeasureId): string`, `valueText(g: Guarded, kind: "count" | "minutes" | "share" | "hours"): string` (hidden gives "Fewer than 5"), and `COMPARE_MEASURES: MeasureId[]`, which is `questions_per_clinician`, `critical_median_ack_minutes`, `critical_within_target` and `needs_review_share`.
- `analyticsCsv(a: AnalyticsOut, period: Period): string`. Its sections are What changed, Use, Alert safety, Answer quality and Hospitals; an unavailable area writes "Couldn't load".

- [ ] **Step 1: Write the failing tests**
  - read:
    - "0 shows, 1–4 hidden, never through a rate or median" (Review Focus 1);
    - "an unsuppressed 3 fails the area closed";
    - "a share over a hidden count fails closed";
    - "a severity set with one hidden member hides the set";
    - "each area fails alone";
    - "every area unavailable gives every area failed" (Review Focus 4);
    - "the Critical guard: overdue with no serious change fails changes";
    - "alerts unavailable fails changes too";
    - "no previous period gives 'Not enough data to compare yet'" (Review Focus 2).
  - changes:
    - "serious first, then by size";
    - "followed-up rows go below";
    - "top 5 then Show all";
    - the exact `changeLine` words for the four directions;
    - "Followed up by Tunde Okafor · 21 Oct".
  - measures: the labels and value text, including "Fewer than 5".
  - csv:
    - every section present;
    - hidden values written as "Fewer than 5";
    - an unavailable area written as "Couldn't load";
    - no patient fields.
- [ ] **Step 2: Implement.** Reuse `@mhai/ui/small-groups` and `@mhai/ui/csv`.
- [ ] **Step 3: Run the tests.**
- [ ] **Step 4: Commit:** "Add the analytics rules: guards, ranking, wording and CSV".

---

### Task 4: The Analytics page: What changed, the detail panel and follow-ups

**Files:**

- Create:
  - `apps/platform/app/(app)/analytics/page.tsx`;
  - `components/analytics/analytics-view.tsx`, `changes-list.tsx`, `change-detail.tsx`, `compare-chart.tsx`, `contact-admins.tsx`, `follow-up.tsx`;
  - `lib/queries/analytics.ts`;
  - tests.
- Modify: `components/shell/nav.ts` (add **Analytics**, `/analytics`, `ChartColumn` icon, between Hospitals and Team), `lib/queries/keys.ts` (an `analytics` root).

**Interfaces:**

- **Hooks:**
  - `useAnalytics(period)`;
  - `useChangeSeries(changeId, period)`;
  - `useHospitalSeries(hospitalId, measure, period)`;
  - `useFollowUp()` and `useUndoFollowUp()`: keyed mutations that update the change in the cache and invalidate the analytics and activity queries.
- **`ComparePanel({ hospital, series, size })`:** a column chart for the hospital, with the median of the others as a second line or mark. It is used by both this task and Task 5, so it lives in `compare-chart.tsx`.
- **The header:** "Analytics", the period select, "Download CSV" (from `analyticsCsv`), and per-area "Updated {time}".
- **The left column: What changed.**
  - It lists the ranked items, top 5 then Show all.
  - The first item is selected on open.
  - Each row is a button, with `aria-current` on the selected one.
- **The right column: the detail.**
  - the change's words;
  - `ComparePanel` from `useChangeSeries`;
  - the size line;
  - `ContactAdmins`, which shows each active admin's name and email with **Copy email**. With none, it shows "No active hospital admin", the first-admin invite status ("Invite pending" or "Invite expired"), and **Open hospital** (Review Focus 5);
  - `FollowUp`:
    - platform admins: **Mark followed up** with an optional note (500 characters, with a counter); the author can edit the note; anyone can **Undo**;
    - 409 conflict gives "Changed by someone else" and a reload;
    - auditors see the line only.
  - **Open hospital**.
- **Phone:** below `md`, the list shows alone. Tapping a row shows the detail, with **Back**.

- [ ] **Step 1: Write the failing tests**
  - "opens on What changed with the most serious first and selected";
  - "Show all reveals the rest";
  - "the detail shows the chart, the size line and the hospital admins";
  - "Copy email copies";
  - "Eastbrook shows No active hospital admin and Invite expired";
  - "a platform admin marks followed up with a note, and it shows 'Followed up by Ada Bakare · …'";
  - "a 501-character note is refused";
  - "a stale follow-up shows Changed by someone else and reloads" (Review Focus 3);
  - "an auditor sees the follow-up line and no controls";
  - "the guard fixture shows Couldn't load what changed, never Nothing unusual";
  - "every area unavailable still renders the header and each Couldn't load";
  - "Download CSV builds the file for the chosen period";
  - "offline disables follow-up and CSV with the reason";
  - "at phone width the list then detail with Back";
  - "the sidebar shows Analytics between Hospitals and Team".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Analytics page: what changed, the detail and follow-ups".

---

### Task 5: The tabs: Use, Alert safety, Answer quality and Hospitals

**Files:**

- Create: `apps/platform/components/analytics/{analytics-tabs,use-tab,alerts-tab,quality-tab,hospitals-tab}.tsx` and their tests.
- Modify: `analytics-view.tsx`, to mount the tabs below the two columns.

**Interfaces:**

- **`AnalyticsTabs`** uses `LinkTabs`-style buttons with `role="tablist"`. The default tab is Use.
- **Use:**
  - a `BarList` per hospital of questions per active clinician, with the median line in the note;
  - a `ColumnChart` of the trend.
- **Alert safety:** per hospital,
  - severities (Critical, Urgent, Info);
  - the median to acknowledge, overall and for Critical;
  - Critical within target, with each hospital's target ("Target {n} min");
  - the unhandled count.
- **Answer quality:** per hospital,
  - the needs-review share;
  - the confidence mix (high, medium, low);
  - the agreement rate;
  - the median review hours.
- **Hospitals:**
  - a sortable table with a header row: Hospital, Staff, Questions, Questions per clinician, Critical median, Critical within target, Needs review;
  - `aria-sort` on the sorted column;
  - picking a row puts that hospital in the right-hand panel, with a measure select over `COMPARE_MEASURES`. It defaults to the first measure with a change for the hospital, else questions per clinician. The data comes from `useHospitalSeries`, rendered by `ComparePanel` from Task 4.
- **Every tab** has "Updated {time}" and its own "Couldn't load {area}" with Try again. Values go through `valueText`, so hidden ones read "Fewer than 5" with no bar.

- [ ] **Step 1: Write the failing tests**
  - "each tab shows its per-hospital numbers and the median";
  - "hidden values read Fewer than 5 with no bar";
  - "a tab's area failing shows its Couldn't load and leaves other tabs working";
  - "Hospitals sorts by a column and sets aria-sort";
  - "picking a hospital with no change shows the questions-per-clinician comparison";
  - "the measure select changes the comparison";
  - "Alert safety shows each hospital's target".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Add the analytics tabs and the hospital comparison".

---

### Task 6: End to end and docs

**Files:**

- Create: `apps/platform/tests/e2e/analytics.spec.ts`.
- Modify: `README.md` (the platform demo section), `apps/clinical/tests/readme.test.ts` (one pin), `ARCHITECTURE.md` §5 (the sidebar), `CHANGELOG.md`, and spec §7, only if the contract changed while building.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test and the CSP check on `/analytics`:
  - "Analytics opens on What changed with Northgate's Critical change selected";
  - "mark followed up with a note as Ada, then sign in as Tunde in the same tab and see it";
  - "the auditor sees follow-ups but no controls";
  - "Download CSV saves a file whose hidden values read Fewer than 5";
  - "the Hospitals tab compares Riverside with the rest";
  - "phone: tap a change, see the detail, Back".
- [ ] **Step 2: Docs.**
  - The README platform section gains "**Analytics.**": what it shows, the sample changes and follow-ups.
  - Pin it with `"documents the platform analytics demo"` matching `/\*\*Analytics\.\*\*/`.
  - CHANGELOG, under Unreleased › Added.
  - The ARCHITECTURE sidebar line.
- [ ] **Step 3: Verify.**
  - Full suite: `npm test`, `npm run e2e` (both apps), lint, `format:check`, typecheck, build, `check:bundle` and `check:platform-marker`.
- [ ] **Step 4: Commit:** "Test analytics end to end; document the demo".

The controller then adds the analytics contract to mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as §14.7, through its own PR.

---

## Parallel work

- Tasks 1 and 2 are independent and can run at once, in separate worktrees.
- Task 3 needs Task 2; it reuses the shared helpers and needs Task 1 merged first.
- Task 4 needs Task 3.
- Task 5 needs Task 4 (`ComparePanel`, the view).
- Task 6 comes last.

## Self-review notes

- **Spec coverage:**

  | Spec section                                                       | Task(s)                               |
  | ------------------------------------------------------------------ | ------------------------------------- |
  | §2 goals                                                           | 4, 5, 3/4 (CSV)                       |
  | §3 roles                                                           | 2, 4                                  |
  | §4 layout, What changed, the detail, the tabs, states, phone       | 4, 5                                  |
  | §5 small groups, the guard, fairness, change ids, the fixed window | 2, 3                                  |
  | §7 contract                                                        | 2, then the controller's PR for §14.7 |
  | §8 delivery (7c only)                                              | this plan                             |
  | §9 tests                                                           | 2–6                                   |

  §6 (getting told) is Plan 7d.

- **Names used across tasks:**
  - `AnalyticsOut`, `Change`, `FollowUp`, `Guarded`, `MeasureId`, `Period`, `SeriesOut`;
  - `readAnalytics`, `rankChanges`, `changeLine`, `followUpLine`, `valueText`, `measureLabel`, `COMPARE_MEASURES`, `analyticsCsv`;
  - `useAnalytics`, `useChangeSeries`, `useHospitalSeries`, `useFollowUp`, `useUndoFollowUp`;
  - `ComparePanel`, `ContactAdmins`.
