# Plan 12: Analysis across hospitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an **Analysis** page in the platform admin app. It shows disease and population patterns:

- in two scopes, **All hospitals** and **One hospital**;
- in the five Plan 6 views: Prevalence and trends, Who is affected, Co-occurring conditions, Findings and alerts, MHAI quality;
- with a fair comparison against the median of similar hospitals (One hospital scope only), a CSV of what is on screen, and an **Analysis access** trail in Activity that auditors read.

Plan 7c's **Analytics** page is renamed **Usage** first. In 12b, a platform admin named in a hospital's cleared letter can open the de-identified patient list behind a number, for that hospital only. Everything runs on sample data; in live mode both switches stay off until full sign-off.

**Delivery:**

- **Plan 12a** (Tasks 1–9): the rename, the page, the views, the comparison, the CSV and the access trail. Its own PR. Task 1 can also go as its own small PR first.
- **Plan 12b** (Tasks 10–11): the per-hospital drill-down. **It needs Plan 11 merged**, including the two additions in "Needs from Plan 11" below. Its own PR.

**Architecture:**

- **Shared guards.** The fail-closed helpers in Plan 7c's `apps/platform/lib/analytics/read.ts` (shape checks, `guardedOk`, `setGivesAway`, `numeratorLeaks`, `scrub`) move to `@mhai/ui/guards`, beside `@mhai/ui/small-groups`. Usage, Analysis and the clinical app's Plan 6 guards all use one copy.
- **Data.** A new analysis contract, sample data, a mock that hides values the way the server must, and a live client. The proxy accepts exactly the new paths, refuses auditors on `platform/analysis/*`, and returns 404 for those paths unless the deployment is signed off. Pure rules live in `apps/platform/lib/analysis/`:
  - reading and guarding each reply, failing closed;
  - filters, periods and scope;
  - labels and the comparison wording;
  - the CSV;
  - the access trail.
- **UI.** The components live in `apps/platform/components/analysis/`. The page sits at `app/(app)/analysis/page.tsx`. The hooks live in `lib/queries/analysis.ts`. The access trail is a tab of the Activity page.

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64.

**Spec:** `docs/specs/2026-10-22-platform-analysis-design.md` (approved 22 Oct 2026; the product owner accepted every suggested default as the decision). Background:

- `docs/specs/2026-10-17-analysis-design.md` and the Plan 6 plan (`docs/plans/2026-10-22-plan-6-analysis.md`), for the views, the bands and the de-identified list;
- `docs/specs/2026-10-22-platform-analytics-design.md` and Plan 7c's `lib/analytics/read.ts`, for the fail-closed guards;
- `docs/specs/2026-10-22-clearance-letters-design.md` (Plan 11), for letters;
- `docs/adr/0003-many-emr-systems.md`.

## Global Constraints

- **Sample data only.** Clinical, privacy and legal sign-off is pending. The page shows a **Sample data** sign while `status.sample` is true, both in the header and on its sidebar entry.
- **Two switches, both from the server** (spec §9): `aggregates_enabled` (the page) and `patient_views_enabled` (the 12b drill-down).
  - Sample data always has both on.
  - In live mode, both stay off until full sign-off. The deployment adds its own gate: the proxy returns 404 `not_found` for every `platform/analysis/*` shape unless `ANALYSIS_SIGNED_OFF` is exactly `"true"`, and for the patients path unless `ANALYSIS_PATIENT_VIEWS_SIGNED_OFF` is also exactly `"true"`. It checks this before reading the session. The gate can only keep things off: it never turns on what the server has off.
  - The sidebar entry and the page appear only when the status says `aggregates_enabled`. While the status is loading or failed, they stay hidden.
- **Roles:**
  - platform admins see the page, the comparison and the CSV;
  - auditors never see the page. The sidebar hides it, `/analysis` sends them to `/activity?tab=analysis-access`, and the proxy refuses their `platform/analysis/*` reads with 403 `forbidden` before upstream;
  - both platform admins and auditors read and export the access trail.
- **Aggregates only across hospitals.**
  - In All hospitals scope, no number is ever a link to patients.
  - In 12b, the de-identified list opens for one hospital only. It needs that hospital's verified, unexpired letter naming the signed-in platform admin, and the patient-views switch on.
  - The platform app never shows a name, MRN, date of birth or address, letter or no letter.
- **The small-group rule** (spec §5.1):
  - any count of **1–4** shows **"Fewer than 5"**, with no bar, on screen, in tables and in the CSV. This covers every count: cases, patients seen, pairs, findings, alerts, reviews and reviewers. **0** shows as "0";
  - a rate, share, median or change hides when its numerator, its denominator or its complement is 1–4 or hidden;
  - in a set that adds up, a hidden member that the others give away fails the view closed;
  - a value the server should have hidden fails the whole view closed: "Couldn't load {view}".
- **Combining** (spec §5.2):
  - In All hospitals scope, the shown hospital rows and the all-hospitals figure must never leave a remainder of 1–4, or exactly one hidden row. Either fails the view closed.
  - An all-hospitals figure from fewer than **3** hospitals with any cases reads **"Too few hospitals to show"**. A shown all-hospitals figure with fewer than 3 contributing rows fails closed.
  - In All hospitals scope a condition with no standard name appears at most once, as "Not standardised", never by a local name.
- **Periods and filters** (spec §4.1, §4.2):
  - the periods are **Last 3 months**, **Last 6 months** and **Last 12 months** (default 12), whole calendar months ending with the last complete month. There are no custom ranges;
  - All hospitals: condition (3-character ICD-10), age band in 20-year bands (0–19, 20–39, 40–59, 60–79, 80 and over), sex, setting and specialty. Never ward or clinic, and never source;
  - One hospital: the Plan 6 bands (0–17, 18–39, 40–64, 65–79, 80 and over), plus ward or clinic, and source when the hospital has more than one;
  - at most **3** filters at once across hospitals and **4** for one hospital;
  - filters, scope, hospital, period and view live in React state only: never the URL, browser storage, the title or logs.
- **Fair comparison** (spec §5.3), One hospital scope only, on Prevalence, Findings and Quality:
  - rates only;
  - at least **5** similar hospitals (`peers`), never named;
  - the hospital's own previous period comes first, then the median;
  - the context line always shows: size, kind and coverage;
  - the words are "Higher than similar hospitals", "Lower than similar hospitals" or "About the same as similar hospitals". Never "worse" or "sicker".
- **Copy:**
  - "Analysis", "Sample data", "All hospitals", "One hospital", "Last 3 months" / "Last 6 months" / "Last 12 months";
  - "{n} of {m} hospitals included", "See which aren't", "Not covered by its agreement", "Not enough data yet";
  - "Fewer than 5", "Too few hospitals to show", "Not standardised", "Partly standardised";
  - "Not enough similar hospitals to compare", "Not compared: partly standardised", "Not compared: under 3 months of data", "Not compared: too few patients";
  - "Last period", "Median of {n} similar hospitals";
  - "Up to 3 filters at a time across all hospitals. Remove one to add another." and "Up to 4 filters at a time for one hospital. Remove one to add another.";
  - "Filters cleared for the new scope";
  - "Couldn't load {view}" (view title lower-cased) with **Try again**, "Updated {time}", **Download CSV**, **Chart** / **Table**, "See alert handling on Usage";
  - "Analysis isn't available yet";
  - "Couldn't record the download, so it didn't start. Try again.";
  - 12b: "Patient lists need a clearance letter from this hospital", **See patients**, "De-identified: no names or record numbers".
- **States:**
  - each view has loading, empty ("No patients match these filters"), "Couldn't load {view}" and "Updated {time}";
  - a failed view never shows zeros and never takes the others down;
  - offline keeps the loaded numbers and disables the filters, the scope, **Download CSV** and **See patients**, each with "You're offline".
- **Phone.** At 390 px:
  - the filters open in a sheet;
  - the view picker is a select;
  - tables become cards;
  - nothing scrolls sideways;
  - targets are 44 px;
  - every chart has its numbers as text and a Table view.
- **No change to existing behaviour** beyond the rename. Record the platform and clinical unit and e2e counts before Task 1. Only tests this plan names may change their assertions.
- **Repo rules:**
  - no AI attribution;
  - never `git add -f` under `.superpowers/`;
  - heavy commands run on the build server;
  - no vendor names;
  - ids are opaque `[A-Za-z0-9_-]+`.

## Rulings made while planning

- **The rename is user-facing only.** These change:
  - the route `/analytics` becomes `/usage`;
  - the title, the sidebar label, the bell's link and the e2e names;
  - `next.config.ts` redirects `/analytics` to `/usage`, keeping the query, so 7d emails and bookmarks still work.

  Module names (`components/analytics/`, `lib/analytics/`, `analytics-contract.ts`, `queryKeys.analytics`) and the API paths `platform/analytics/*` stay as they are. Plan 7d and the backend §14.7 already use them, and renaming them would only churn files that are in flight.

- **The sidebar order** after this plan is Hospitals · Usage · Analysis · Team · Activity · Account. Other in-flight plans add entries. The merged order is: Hospitals · Usage · Analysis · Clearances (Plan 11b) · Legal holds · System · Settings (Plan 8) · Team · Activity · Audit log (Plan 9) · Account. Whichever plan merges second resolves `nav.ts` to this order.
- **The shared guards go in `@mhai/ui/guards`.** It is a plain TypeScript file beside `@mhai/ui/small-groups`, which it builds on.
  - It does not go in `@mhai/api-client`: that package handles transport, not small groups.
  - It does not get a package of its own: that would mean new workspace, `transpilePackages` and tsconfig wiring for one file.
  - If Plan 6 has merged before Task 2, Task 2 also turns `apps/clinical/lib/analysis/guards.ts` into re-exports of the package. If it hasn't, Plan 6's Task 4 imports from the package instead.
- **One filters endpoint, not `conditions?q`.** `GET platform/analysis/filters?scope&hospital` returns conditions, specialties, wards or clinics and sources in one reply. Condition search runs on the device, as in Plan 6. The ward and source lists need an endpoint anyway. The controller updates spec §11.
- **Hospitals to pick from.** `status.hospitals` gains `list: Person[]`, the included hospitals only, and `included` must equal its length. Excluded hospitals can't be picked.
- **Comparison only on Prevalence (cases per 1,000), Findings (abnormal findings per 1,000) and Quality (agreement rate).** Who is affected and Co-occurring have no comparison: comparing a hospital's age or sex mix with others' would compare patient mix, which anti-goal 2 forbids. `comparison` is null in those views, and anything else fails closed.
- **"Too few hospitals"** comes as a hidden value with a reason: `{value: null, suppressed: true, why: "too_few_hospitals"}`. `why` is allowed only on a hidden value, and only in All hospitals scope.
- **Switching scope clears every filter**, with the note "Filters cleared for the new scope". Bands, wards and sources don't carry across.
- **The CSV is audited before it is made.** The app first sends `POST platform/analysis/downloads` with what is on screen. Only on success does it build the file on the device. On failure or offline, no file is made.
- **Visits are recorded by the server.** It records one trail entry for each view request, so the app sends nothing extra.
- **The trail export is built by the server.** `GET platform/audit/analysis-access/export` returns a file (a zip of the trail plus the cited letters, once Plan 11 exists). The live client reads it as a Blob, and the proxy passes it through with its `Content-Type`. The mock returns the trail as CSV.
- **Two new Activity actions**, written by the backend when Measured Health flips a switch: `analysis_switched` and `patient_views_switched`, with `detail` either `"on"` or `"off"`.
- **The sample hospitals grow by three** general hospitals in `fixtures.ts`: Ridgeway General Hospital (`h_ridgeway`), Marlow District Hospital (`h_marlow`) and Fairhaven General Hospital (`h_fairhaven`). Without them no hospital has 5 fair peers. Tests that count hospitals update their count only.
- **Platform pseudonyms (12b)** look like `M-7F3K2`. Hospital-side ones are `P-…` (Plan 6). The reader refuses any `P-` id, so a hospital-side list can never show here by mistake.
- **The 12b drill-down switch is separate from Plan 11's named-access switch.** Different powers need different sign-offs. 12b reads only `status.patient_views_enabled`, plus its own clearances in `status.my_clearances`.
- **Ending access on an open list (12b)** follows Plan 11 §8:
  - the list carries `until` and disappears at that time;
  - while it is open, the app checks the status every **30 seconds**;
  - a 403 `no_clearance`, `clearance_ended` or `patient_views_off` removes it at once.
- **Backend contract:** the controller adds spec §11, with the changes above, to mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as §14.11, through its own PR. It also changes the 7d email link to `/usage?change=` in §14.7.

## Needs from Plan 11

12b can't start until Plan 11 merges with these two additions. If the Plan 11 plan doesn't already include them, the controller adds them there:

1. **A letter can cover Measured Health platform admins** as well as hospital staff. Platform-side letters carry `covered_platform: Person[]`.
2. **Verify refuses a covered platform admin** with **409** `same_person`, and `verifiable_by_you` is false for them. The sample letter at Havana Hospital covers Ada Bakare and is verified by Tunde Okafor, in the shared platform mock's clearance store. Northgate has no letter.

## Review Focus

1. **Switching scope with filters set.** Take One hospital with Ward 4, source "Results system", 18–39, female, then switch to All hospitals. Every filter clears, with the note, and no request goes out with a ward, a source, a hospital band or a 4th filter. Tasks 4 and 5 test it.
2. **A hospital-row remainder from a server bug.** For example, an all-hospitals total of 812 with shown rows summing to 809 and one or two hidden rows. Another: exactly one hidden row whatever the gap. Another: a shown total from 2 hospitals. The view fails closed and never shows the table. Task 4 tests all three.
3. **A comparison the app can't vouch for.** For example, `available: true` with `peers: 4`; a median with `available: false`; a `peers` list of names; a comparison in Who is affected. Each fails the view closed. "Not enough similar hospitals to compare" shows only for `too_few_peers`. Task 4 tests these; Task 6 shows the reasons.
4. **The switch turned off while the page is open.** A view or status call gets 403 `analysis_off`. The page replaces everything with "Analysis isn't available yet", the analysis queries are removed, and the sidebar entry goes. Task 5 tests it.
5. **Download CSV when the audit call fails or the device goes offline.** No file is made, and the reason shows. Task 5 tests it.

---

## File structure

```text
packages/ui/src/guards.ts · guards.test.ts                 shared fail-closed helpers (Task 2)
apps/platform/app/(app)/usage/page.tsx                      renamed from analytics/ (Task 1)
apps/platform/next.config.ts                                /analytics → /usage redirect
apps/platform/components/shell/nav.ts · sidebar.tsx · mobile-drawer.tsx   Usage, Analysis
apps/platform/lib/server/features.ts                        analysisSignedOff, patientViewsSignedOff
apps/platform/lib/api/analysis-contract.ts                  types (Task 3)
apps/platform/lib/api/analysis-fixtures.ts                  hospital profiles, seeded cohorts, planted cases
apps/platform/lib/api/mock-analysis.ts                      computes and suppresses like the server
apps/platform/lib/api/contract.ts · mock.ts · live.ts · fixtures.ts
apps/platform/app/api/v1/[...path]/route.ts                 shapes, auditor reads, sign-off gate
apps/platform/lib/analysis/read.ts · filters.ts · labels.ts · csv.ts · access.ts
apps/platform/lib/queries/analysis.ts · keys.ts
apps/platform/app/(app)/analysis/page.tsx
apps/platform/components/analysis/*.tsx
apps/platform/components/activity/activity-view.tsx · access-trail.tsx
apps/platform/tests/e2e/usage.spec.ts · analysis.spec.ts
```

**Files shared with in-flight plans** (the controller sequences these merges):

| File                                                                                 | Also touched by             |
| ------------------------------------------------------------------------------------ | --------------------------- |
| `components/shell/nav.ts`, `sidebar.tsx`                                             | 8, 9, 11b                   |
| `app/api/v1/[...path]/route.ts` (`SHAPES`), `proxy.test.ts`                          | 7d, 8, 9, 11b               |
| `lib/api/contract.ts` (`PlatformClient`, `ActivityAction`)                           | 7d, 8, 9, 11b               |
| `lib/api/mock.ts`, `live.ts`, `live.test.ts`                                         | 7d, 8, 9, 11b               |
| `lib/api/fixtures.ts`                                                                | 8, 9, 11b                   |
| `components/notifications/bell.tsx`, `bell.test.tsx`                                 | 7d (Task 1 needs 7d merged) |
| `components/activity/activity-view.tsx`, `lib/activity-labels.ts`                    | 9                           |
| `lib/queries/keys.ts`, `tests/e2e/helpers.ts`, `security.spec.ts`                    | 8, 9, 11b                   |
| `packages/ui/package.json`, `apps/clinical/lib/analysis/guards.ts`                   | 6                           |
| `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `apps/clinical/tests/readme.test.ts` | all                         |

---

### Task 1: Rename Analytics to Usage

**Before you start:** branch from `main` after Plans 7c and 7d have merged. This task edits the bell 7d adds. Record the unit and e2e counts for both apps.

**Files:**

- Move: `git mv apps/platform/app/(app)/analytics apps/platform/app/(app)/usage`.
- Modify:
  - `usage/page.tsx`: `metadata.title = "Usage"`, component `UsagePage`;
  - `components/analytics/analytics-view.tsx`: TopBar title "Usage", and the tab list's `aria-label` "Usage areas";
  - `components/notifications/bell.tsx`: pushes `/usage?change={id}`;
  - `notifications-list.tsx`: list label "New usage changes";
  - `components/shell/nav.ts`: `{ href: "/usage", label: "Usage", Icon: ChartColumn }`;
  - `next.config.ts`: add `redirects()`;
  - tests: `app-shell.test.tsx`, `bell.test.tsx`, `analytics-view.test.tsx`, `contact-admins.test.tsx` (the `usePathname` mocks), `tests/e2e/helpers.ts` (the `openNav` union), and `security.spec.ts` (the CSP path list);
  - `git mv tests/e2e/analytics.spec.ts tests/e2e/usage.spec.ts`, with `openUsage` and `openNav(page, "Usage")`;
  - docs: `README.md` (the platform section's "**Analytics.**" becomes "**Usage across hospitals.**"), `apps/clinical/tests/readme.test.ts` (that pin), `ARCHITECTURE.md` (the table row and the sidebar line), `CHANGELOG.md` (Unreleased › Changed).

**Interfaces:**

- Produces: `NAV` with Usage at `/usage`, and the redirect `{ source: "/analytics", destination: "/usage", permanent: false }`.

- [ ] **Step 1: Write the failing tests**
  - `app-shell.test.tsx`: "the sidebar shows Usage between Hospitals and Team, linking to /usage"; "no sidebar entry says Analytics".
  - `bell.test.tsx`: "an item opens Usage with that change selected" (`/usage?change=chg_hav_review_time`); the list is named "New usage changes".
  - `readme.test.ts`: "documents the platform usage demo", matching `/\*\*Usage across hospitals\.\*\*/`. The clinical README already has "**Usage.**", so the pin needs the longer phrase.
  - e2e `security.spec.ts`: `/usage` in the CSP list, and "`/analytics?change=x` lands on `/usage?change=x`".
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.** Change no internal module names and no API paths (see Rulings).
- [ ] **Step 4: Verify** (remote): platform tests, lint, typecheck, build, and the platform e2e (`usage.spec.ts` passes with only the names changed). The counts match the record.
- [ ] **Step 5: Commit:** "Rename the platform Analytics page to Usage".

---

### Task 2: The shared fail-closed guards in `@mhai/ui/guards`

**Files:**

- Create: `packages/ui/src/guards.ts`, `guards.test.ts`.
- Modify:
  - `packages/ui/package.json`: `"./guards": "./src/guards.ts"`;
  - `apps/platform/lib/analytics/read.ts`: drop its private copies and import them;
  - `lib/analytics/measures.ts`: `MeasureKind` becomes an alias of `GuardKind`;
  - only if Plan 6 has merged: `apps/clinical/lib/analysis/guards.ts` re-exports the package's helpers and keeps its own extras.

**Interfaces (produces, `@mhai/ui/guards`):**

```ts
type GuardedValue = { value: number | null; suppressed: boolean };
type GuardKind = "count" | "rate" | "minutes" | "share" | "hours";
type Obj = Record<string, unknown>;
isObj(v: unknown): v is Obj;
isNum(v: unknown): v is number;
isCount(v: unknown): v is number;
isTime(v: unknown): v is string;
isId(v: unknown): v is string;                // [A-Za-z0-9_-]+
guardedOk(v: unknown, kind: GuardKind, loose?: boolean): boolean;
shows(g: GuardedValue): boolean;
isHiddenValue(g: GuardedValue): boolean;
numeratorLeaks(total: GuardedValue, share: GuardedValue): boolean;
setGivesAway(total: GuardedValue | null, members: GuardedValue[]): boolean;
remainderLeaks(total: GuardedValue, parts: GuardedValue[]): boolean;
hasOnlyKeys(o: Obj, allowed: readonly string[]): boolean;
scrub<T>(v: T): T;
```

- `guardedOk`, `numeratorLeaks`, `setGivesAway` and `scrub` keep 7c's behaviour exactly.
- `remainderLeaks` is the second-hiding check. It is true when:
  - the total shows and exactly one part is hidden;
  - the total shows, two or more parts are hidden, and the total minus the shown parts is under 5;
  - the total shows, no part is hidden, and the parts don't add up to the total.

  A hidden total is never a leak here: the rows are the same answers as each hospital's own scope.

- [ ] **Step 1: Write the failing tests** (`guards.test.ts`):
  - "a shown 1–4 count is not ok; 0 is";
  - "a loose count may be a half";
  - "a share is 0–1";
  - "numeratorLeaks checks n and total − n";
  - "setGivesAway: one hidden member; hidden members under 5";
  - "remainderLeaks: gap 3 leaks; gap 9 over two hidden rows doesn't; one hidden row always leaks; a hidden total never leaks; shown rows that don't add up leak";
  - "hasOnlyKeys refuses an extra key";
  - "scrub drops a hidden value's number".
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement and rewire.** Usage's `read.test.ts` passes unchanged.
- [ ] **Step 4: Verify** (remote): `npm test` (the counts go up only by the new tests), lint, typecheck, and `check:bundle`.
- [ ] **Step 5: Commit:** "Share the fail-closed guards in @mhai/ui".

---

### Task 3: The analysis contract, sample data, mock, live client and proxy

**Files:**

- Create:
  - `apps/platform/lib/api/analysis-contract.ts`, `analysis-fixtures.ts`, `mock-analysis.ts`, `mock-analysis.test.ts`;
  - `lib/server/features.ts`, `features.test.ts`.
- Modify:
  - `lib/api/contract.ts`: the `PlatformClient` methods, and `ActivityAction` gains `analysis_switched` and `patient_views_switched`;
  - `lib/api/mock.ts`: wires `mock-analysis.ts` and the `analysis` option;
  - `lib/api/fixtures.ts`: the three hospitals;
  - `lib/api/live.ts`, `live.test.ts`;
  - `app/api/v1/[...path]/route.ts`, `proxy.test.ts`.

**Interfaces (`analysis-contract.ts`; `Person` from `contract.ts`):**

```ts
type AnalysisPeriod = "3m" | "6m" | "12m";
type ScopeKind = "all" | "hospital";
type ViewId =
  "prevalence" | "affected" | "co-occurring" | "findings" | "quality";
type AGuarded = {
  value: number | null;
  suppressed: boolean;
  why?: "too_few_hospitals";
};
type Drillable = AGuarded & { drill: string | null }; // drill: 12b, one hospital only
type Rate = { count: AGuarded; base: AGuarded; per_1000: AGuarded };
type HospitalKind = "general" | "specialist" | "teaching";
type Coverage = "consultations" | "consultations_and_records";
type AllAgeBand = "0-19" | "20-39" | "40-59" | "60-79" | "80+";
type HospitalAgeBand = "0-17" | "18-39" | "40-64" | "65-79" | "80+";
type Sex = "female" | "male" | "other" | "not_recorded";
type Setting = "admitted" | "outpatient" | "emergency";
type ConditionRef = { id: string; name: string | null; icd10: string | null }; // null name: Not standardised
type LocationRef = { id: string; label: string; setting: Setting | null };
type AnalysisQuery = {
  scope: ScopeKind;
  hospital: string | null;
  period: AnalysisPeriod;
  condition: string | null;
  age_band: AllAgeBand | HospitalAgeBand | null;
  sex: Sex | null;
  setting: Setting | null;
  specialty: string | null;
  location: string | null;
  source: string | null;
};
type AnalysisStatus = {
  aggregates_enabled: boolean;
  patient_views_enabled: boolean;
  sample: boolean;
  hospitals: {
    included: number;
    total: number;
    list: Person[];
    excluded: {
      id: string;
      name: string;
      reason: "not_covered" | "not_enough_data";
    }[];
  };
  my_clearances: { hospital: Person; clearance_id: string; until: string }[]; // [] until 12b
};
type FilterOptionsOut = {
  updated_at: string;
  conditions: ConditionRef[];
  specialties: string[];
  locations: LocationRef[];
  sources: { id: string; label: string }[];
}; // last two: [] for all
type HospitalRow = {
  hospital: Person;
  size: AGuarded;
  kind: HospitalKind;
  coverage: Coverage;
  not_standardised_share: AGuarded;
  partly_standardised: boolean;
  headline: Rate;
};
type ComparisonReason =
  | "too_few_peers"
  | "partly_standardised"
  | "too_little_history"
  | "small_group";
type Comparison = {
  available: boolean;
  reason: ComparisonReason | null;
  peers: number | null;
  current: AGuarded;
  previous: AGuarded;
  median: AGuarded;
  verdict: "higher" | "lower" | "about_same" | null;
  context: { size: AGuarded; kind: HospitalKind; coverage: Coverage };
};
type Meta = {
  view: ViewId;
  scope: ScopeKind;
  hospital: Person | null;
  period: { from: string; to: string };
  updated_at: string;
  patients: AGuarded;
  headline: Rate;
  hospitals: HospitalRow[] | null; // all scope only
  comparison: Comparison | null;
}; // hospital scope, prevalence/findings/quality only
type PrevalenceData = {
  by_condition: {
    condition: ConditionRef;
    cases: Drillable;
    rate: Rate;
    new: AGuarded;
  }[];
  series: { month: string; rate: Rate; median: AGuarded | null }[];
}; // median: hospital scope
type Share = { patients: Drillable; share: AGuarded };
type AffectedData = {
  by_age: ({ band: string } & Share)[];
  by_sex: ({ sex: Sex } & Share)[];
  by_setting: ({ setting: Setting | null } & Share)[];
  by_specialty: ({ specialty: string | null } & Share)[];
  by_location: ({ location: LocationRef | null } & Share)[] | null;
}; // null for all
type CoOccurringData = {
  pairs: {
    a: ConditionRef;
    b: ConditionRef;
    patients: Drillable;
    share_of_a: AGuarded;
  }[];
}; // ≤ 20, hidden last
type FindingsData = {
  findings: {
    name: string | null;
    flag: "high" | "low" | "abnormal" | null;
    patients: Drillable;
    rate: Rate;
  }[];
  alerts: {
    total: AGuarded;
    by_severity: Record<"critical" | "urgent" | "info", AGuarded>;
  };
};
type QualityData = {
  by_condition: {
    condition: ConditionRef;
    consultations: AGuarded;
    confidence: Record<"high" | "medium" | "low", AGuarded>;
    rated: AGuarded;
    agreement_rate: AGuarded;
    reviewers: AGuarded;
    corrections: {
      total: AGuarded;
      approved: AGuarded;
      rejected: AGuarded;
      waiting: AGuarded;
    };
  }[];
};
type DataOf = {
  prevalence: PrevalenceData;
  affected: AffectedData;
  "co-occurring": CoOccurringData;
  findings: FindingsData;
  quality: QualityData;
};
type ViewOut<V extends ViewId> =
  (Meta & { data: DataOf[V] }) | { unavailable: true };
type DownloadIn = { view: ViewId; query: AnalysisQuery };
type AccessKind = "visit" | "download" | "patient_list";
type FilterKey =
  | "condition"
  | "age_band"
  | "sex"
  | "setting"
  | "specialty"
  | "location"
  | "source";
type AccessEntry = {
  id: string;
  at: string;
  actor: Person;
  kind: AccessKind;
  scope: ScopeKind;
  hospital: Person | null;
  view: ViewId;
  period: AnalysisPeriod;
  filters: { key: FilterKey; label: string }[];
  count: number | null;
  clearance_id: string | null;
  flagged: boolean;
};
type AccessQuery = { hospital?: string; kind?: AccessKind; cursor?: string };
```

**`PlatformClient` gains:**

- `getAnalysisStatus(): Promise<AnalysisStatus>`;
- `getAnalysisFilters(scope: ScopeKind, hospital: string | null): Promise<FilterOptionsOut>`;
- `getAnalysisView<V extends ViewId>(view: V, q: AnalysisQuery): Promise<ViewOut<V>>`;
- `recordDownload(body: DownloadIn, opts: WriteOpts): Promise<void>`;
- `listAnalysisAccess(q: AccessQuery): Promise<{ entries: AccessEntry[]; next_cursor: string | null }>`;
- `exportAnalysisAccess(q: Omit<AccessQuery, "cursor">): Promise<{ filename: string; blob: Blob }>`.

**Proxy shapes** (live paths are the same; `analysisQueryParams(q)` drops nulls):

| Method | Path                                                  | Rule                                  |
| ------ | ----------------------------------------------------- | ------------------------------------- |
| GET    | `platform/analysis/status`                            | sign-off gate; auditors 403           |
| GET    | `platform/analysis/filters`                           | sign-off gate; auditors 403           |
| GET    | `platform/analysis/{view}` (the 5 literal view names) | sign-off gate; auditors 403           |
| POST   | `platform/analysis/downloads`                         | sign-off gate; platform admin only    |
| GET    | `platform/audit/analysis-access`                      | both roles                            |
| GET    | `platform/audit/analysis-access/export`               | both roles; body passed through as is |

- **`features.ts`:** `analysisSignedOff(env = process.env): boolean` and `patientViewsSignedOff(env = process.env): boolean`. Each is true only for exactly `"true"`, in `ANALYSIS_SIGNED_OFF` and `ANALYSIS_PATIENT_VIEWS_SIGNED_OFF` respectively. `.env.example` lists both, unset.
- **`route.ts`:** gains `ADMIN_ONLY_READS` (every `platform/analysis/*` shape) and `SIGNED_OFF_GATE` (the same set). The gate is checked right after the shape check, before the session.

**Sample data (`analysis-fixtures.ts`):**

- **Hospital profiles** by id:

  | Hospital             | Kind and coverage             | Analysis status                                   |
  | -------------------- | ----------------------------- | ------------------------------------------------- |
  | Havana               | general, full coverage        | the demo's main hospital; peers are exactly 5     |
  | Northgate            | general, full coverage        | no letter (12b)                                   |
  | Harbour View         | general, full coverage        |                                                   |
  | Westfield            | general, full coverage        |                                                   |
  | Ridgeway             | general, full coverage        | new                                               |
  | Marlow               | general, full coverage        | new                                               |
  | Fairhaven            | general, full coverage        | new; joined 2 months ago, so `too_little_history` |
  | Southpoint           | general                       | 14% "Not standardised", so Partly standardised    |
  | Lakeside             | general, `consultations` only | small; `too_few_peers`                            |
  | Riverside Children's | specialist                    | `too_few_peers`                                   |
  | Hilltop              | –                             | excluded: `not_covered`                           |
  | Eastbrook            | –                             | excluded: `not_enough_data`                       |

  "Full coverage" means `consultations_and_records`. The result is "10 of 12 hospitals included".

- **Cohorts.** A seeded synthetic cohort per included hospital, from 120 to 1,400 patients over 12 whole months. It uses a small PRNG with no dependency, and the same seed always gives the same cohort. It uses Plan 6's conditions, findings and settings. Havana and Northgate each have two sources ("Main record" and "Results system"). The cohorts live only in the mock's memory.
- **Planted cases:**
  - Sickle cell disease (D57): Lakeside 3 and Harbour View 6, so the server hides Harbour View too (second hiding);
  - Tuberculosis (A15): cases at only 2 hospitals, so the all-hospitals figure is "Too few hospitals to show";
  - a rare pair, Tuberculosis + Chronic kidney disease, with 2 patients;
  - Southpoint's unstandardised records.

**Mock rules (`mock-analysis.ts`, called from `createMockPlatform`):**

- It computes each view per hospital from the cohorts. Co-occurring pairs are found within each hospital and then added up. It then suppresses as the server must:
  - 1–4 hidden;
  - sets: hide the next smallest until nothing is given away;
  - second hiding over hospital rows;
  - the 3-hospital rule;
  - rates and shares over a hidden numerator, denominator or complement;
  - `drill` always null in 12a.
- It computes the comparison over peers of the same kind and coverage, leaving out partly standardised hospitals and any with under 3 months of data. It needs at least 5 peers that each show the measure. The verdict uses a ±10% band of the median.
- It uses the same suppressed answer for a hospital in both scopes.
- Refusals:
  - an auditor gets 403 `forbidden`;
  - over the filter limit gets 422 `too_many_filters`;
  - `location` or `source` across hospitals, a non-3-character condition across hospitals, a wrong band for the scope, or an excluded hospital gets 422 `invalid`.
- Each view call records a `visit` entry in an in-memory trail. `recordDownload` records a `download`. The trail is seeded with one entry of each kind by Ada and Tunde, plus a `patient_list` entry (flagged, with a count and a clearance id) so the trail reads fully before 12b.
- Activity is seeded with "Ada Bakare turned Analysis on" (`analysis_switched`, `"on"`, sample).
- `exportAnalysisAccess` returns `{ filename: "mhai-analysis-access-{date}.csv", blob }`.
- **Options:** `analysis?: "normal" | "unavailable" | "off" | "few_peers" | { failView: ViewId }`.
  - "unavailable": every view returns `{unavailable: true}`;
  - "off": the status says off and every view is 403 `analysis_off`;
  - "few_peers": drops Ridgeway, so Havana has 4 peers.
- `delayMs` and the clock work as today.

- [ ] **Step 1: Write the failing tests**
  - `mock-analysis.test.ts`:
    - "the cohorts are the same every time";
    - "10 of 12 included; Hilltop not covered; Eastbrook not enough data";
    - "counts 1–4 are hidden, 0 is not";
    - "Sickle cell disease hides Lakeside and Harbour View" (second hiding);
    - "Tuberculosis across hospitals reads too_few_hospitals";
    - "the rare pair is hidden and listed after the shown pairs";
    - "a hospital's value is the same in both scopes";
    - "Havana compares with 5 peers; few_peers gives too_few_peers; Southpoint partly_standardised; Fairhaven too_little_history; Riverside too_few_peers";
    - "a 4th filter across hospitals is 422 too_many_filters; a 5th for one hospital too";
    - "location across hospitals is 422 invalid";
    - "an auditor is 403";
    - "off makes views 403 analysis_off";
    - "each view call adds a visit; recordDownload adds a download";
    - "no patient field anywhere in any reply" (deep scan for `pid`, `mrn`, `dob`, `address`, `patient_name`);
    - "no vendor name in the fixtures" (the word list from the clinical `mock-alerts.test.ts`, copied).
  - `features.test.ts`: "off unless exactly 'true'" for both.
  - `live.test.ts`: the six methods' paths, the query built without nulls, the Idempotency-Key on `recordDownload`, and the export read as a Blob.
  - `proxy.test.ts`:
    - "the ten new shapes are accepted (status, filters, the five views, downloads, the trail, its export)";
    - "`platform/analysis/x` and POST `platform/analysis/status` are 404";
    - "ANALYSIS_SIGNED_OFF unset gives 404 on every analysis shape before the session, and the trail still works";
    - "an auditor's GET `platform/analysis/prevalence` is 403 before upstream";
    - "an auditor's POST downloads is 403";
    - "the export's Content-Type is passed through".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote). Only hospital-count assertions change in the existing tests.
- [ ] **Step 4: Commit:** "Add the analysis contract, sample cohorts, mock and live client".

---

### Task 4: The analysis rules: reading, filters, labels and CSV

**Files:**

- Create, each with a test: `apps/platform/lib/analysis/read.ts`, `filters.ts`, `labels.ts`, `csv.ts`.

**Interfaces:**

- Consumes: `@mhai/ui/guards` (Task 2); the contract (Task 3); `@mhai/ui/small-groups`; `@mhai/ui/csv`.
- **`read.ts`:**
  - `type ViewState<T> = { status: "ok"; data: T } | { status: "failed" }`;
  - `readStatus(raw: unknown): ViewState<AnalysisStatus>`;
  - `readFilterOptions(raw: unknown, scope: ScopeKind): ViewState<FilterOptionsOut>`;
  - `readView<V extends ViewId>(view: V, raw: unknown, q: AnalysisQuery): ViewState<Meta & { data: DataOf[V] }>`.

  A view fails closed on:
  - `{unavailable: true}`, or a wrong or extra-keyed shape;
  - a `scope`, `hospital` or `view` that doesn't match `q`;
  - a period that isn't whole months ending last month for `q.period` (3, 6 or 12 months);
  - any value `guardedOk` refuses;
  - `why` on a shown value, or anywhere in hospital scope;
  - a rate whose `per_1000` shows while its `count` or `base` is hidden, or whose count, base or base − count is 1–4;
  - a share that leaks its numerator;
  - a set that gives a member away. The sets are: each `by_*` against `patients`; severities against the alert total; confidence against consultations; correction outcomes against their total;
  - in All hospitals scope:
    - `remainderLeaks(headline.count, rows' headline.count)`;
    - a shown headline with fewer than 3 rows that have a shown count above 0 or a hidden count;
    - two hospital rows for the same hospital;
    - `partly_standardised` disagreeing with a shown `not_standardised_share` over 0.10;
    - more than one condition with a null name;
    - any non-null `drill`;
    - a non-null `comparison`;
    - `by_location` not null;
  - in One hospital scope:
    - a non-null `hospitals`;
    - a `comparison` in Who is affected or Co-occurring;
    - in the other views, a comparison with `available: true` and `peers` under 5 or not a whole number;
    - a shown median with `available: false`;
    - a verdict with `available: false`;
    - a `reason` that disagrees with `available`;
    - a `drill` on a hidden value or a count under 5;
  - more than 20 pairs, or a shown pair after a hidden one;
  - a key anywhere named `pid`, `mrn`, `dob`, `date_of_birth`, `address` or `patient_name`.

  The status fails closed when `included !== list.length`, an excluded reason is unknown, or `my_clearances` names a hospital that isn't included.

- **`filters.ts`:**
  - `PERIODS: AnalysisPeriod[]`, `DEFAULT_PERIOD = "12m"`;
  - `FILTER_LIMIT: Record<ScopeKind, number> = { all: 3, hospital: 4 }`;
  - `AGE_BANDS: Record<ScopeKind, readonly string[]>`;
  - `ALLOWED: Record<ScopeKind, readonly FilterKey[]>`. For `all`, there is no `location` or `source`;
  - `emptyQuery(scope: ScopeKind, hospital: string | null, period?: AnalysisPeriod): AnalysisQuery`;
  - `activeCount(q: AnalysisQuery): number`;
  - `atLimit(q: AnalysisQuery): boolean`;
  - `setFilter(q: AnalysisQuery, key: FilterKey, value: string | null): AnalysisQuery`. It throws on a key that isn't allowed, or past the limit;
  - `switchScope(q: AnalysisQuery, scope: ScopeKind, hospital: string | null): { query: AnalysisQuery; cleared: boolean }`, which keeps the period;
  - `limitText(scope: ScopeKind): string`;
  - `matchCondition(c: ConditionRef, s: string): boolean`;
  - `showSource(o: FilterOptionsOut): boolean`;
  - `analysisQueryParams(q: AnalysisQuery): string`, also used by `live.ts`.
- **`labels.ts`:**
  - `VIEWS` (page order) and `VIEW_TITLE`;
  - `failedText(view)`;
  - `periodLabel(p)`, and `monthsText(period: { from: string; to: string })` (e.g. "Oct 2025 to Sep 2026");
  - `AGE_LABEL` for both band sets ("80 and over");
  - `SEX_LABEL`, `SETTING_LABEL`;
  - `conditionText(c)`: "Type 2 diabetes · E11" or "Not standardised";
  - `locationText(l)`: "Location not recorded" for null;
  - `KIND_LABEL`: "General hospital", "Specialist hospital", "Teaching hospital";
  - `COVERAGE_LABEL`: "MHAI consultations only", "Consultations and connected records";
  - `EXCLUDED_TEXT`;
  - `valueText(g: AGuarded, kind: GuardKind)`: "Too few hospitals to show" for `why`, "Fewer than 5" for any other hidden value, `per_1000` as "12.4 per 1,000";
  - `comparisonLines(c: Comparison, kind: GuardKind): { previous: string; median: string | null; verdict: string | null; reason: string | null; context: string }`. For example, the context reads "2,140 patients seen · General hospital · Consultations and connected records";
  - `includedText(s: AnalysisStatus)`: "10 of 12 hospitals included".
- **`csv.ts`:**
  - `analysisCsv<V extends ViewId>(view: V, data: Meta & { data: DataOf[V] }, ctx: { status: AnalysisStatus; options: FilterOptionsOut | null }): string`;
  - `analysisCsvName(view: ViewId, q: AnalysisQuery, hospitalName: string | null): string`, e.g. `mhai-analysis-all-hospitals-prevalence-12m.csv`.

  The first rows are the view title, the scope (and hospital), the months, each active filter by its label, the included-hospitals line, and "Sample data" when sample. Then come the view's tables, the hospital rows (All hospitals scope) or the comparison lines (One hospital scope). Hidden values use `valueText`. The CSV has no drill keys and no ids. It uses `toCsv` and `CSV_MAX_ROWS`.

- [ ] **Step 1: Write the failing tests**
  - read:
    - "the mock's replies all read, over a grid": both scopes, every view, every band, sex, setting, the three periods, and the Task 3 planted conditions;
    - "an unsuppressed 3 fails the view";
    - "a rate shown over a hidden count fails";
    - "a rate whose base − count is 2 fails";
    - "female 212, male hidden, total 215 fails who is affected";
    - "total 812, shown rows 809, two hidden rows fails" (Review Focus 2);
    - "exactly one hidden row fails" (Review Focus 2);
    - "a shown total from 2 hospitals fails" (Review Focus 2);
    - "too_few_hospitals reads; `why` on a shown value fails";
    - "two 'Not standardised' conditions across hospitals fail";
    - "a drill across hospitals fails";
    - "available with peers 4 fails; a median with available false fails; a comparison in Who is affected fails" (Review Focus 3);
    - "a 21st pair fails; a shown pair after a hidden one fails";
    - "a period that isn't whole months fails";
    - "a `pid` key anywhere fails";
    - "status: included must equal the list".
  - filters:
    - "the limit is 3 across hospitals and 4 for one";
    - "setFilter refuses location across hospitals";
    - "switching One hospital (ward, source, 18–39, female) to All hospitals clears every filter and says so" (Review Focus 1);
    - "E11 and 'diab' find Type 2 diabetes";
    - "source shows only with two or more";
    - "query params drop nulls".
  - labels:
    - "Too few hospitals to show";
    - "Fewer than 5";
    - "12.4 per 1,000";
    - the four reason texts;
    - "Higher than similar hospitals", "About the same as similar hospitals";
    - "Median of 5 similar hospitals";
    - the context line;
    - "10 of 12 hospitals included";
    - "Oct 2025 to Sep 2026".
  - csv:
    - "the header rows list scope, months, filters by label and Sample data";
    - "hidden values read Fewer than 5 or Too few hospitals to show";
    - "hospital rows across hospitals; comparison lines for one";
    - "no ids, no drill keys, no patient fields".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the tests.**
- [ ] **Step 4: Commit:** "Add the analysis rules: guards, filters, wording and CSV".

---

### Task 5: The gate, the sidebar entry and the page frame

**Files:**

- Create:
  - `app/(app)/analysis/page.tsx` (`metadata.title = "Analysis"`);
  - `components/analysis/analysis-gate.tsx`, `analysis-view.tsx`, `analysis-header.tsx`, `analysis-filters.tsx`, `condition-search.tsx`, `view-frame.tsx`, `data-table.tsx`;
  - `lib/queries/analysis.ts`;
  - tests.
- Modify:
  - `components/shell/nav.ts`: add Analysis, `/analysis`, `Microscope` icon, after Usage, with `need: "analysis"`;
  - `sidebar.tsx`, `mobile-drawer.tsx`: use `visibleNav`, and show a "Sample data" chip on the Analysis entry when sample;
  - `lib/queries/keys.ts`: an `analysis` root;
  - `lib/auth/auth-context.tsx`: sign-out removes the analysis keys;
  - `app-shell.test.tsx`;
  - `tests/e2e/helpers.ts`: `openNav` gains "Analysis".

**Interfaces:**

- Consumes: Tasks 3 and 4.
- **Hooks:**
  - `useAnalysisStatus(enabled: boolean)`, read through `readStatus`;
  - `useAnalysisFilters(scope, hospital)`;
  - `useAnalysisView(view, query)`, which returns `ViewState`;
  - `useRecordDownload()`, a keyed mutation.

  Keys sit under `queryKeys.analysis`. A 403 `analysis_off` from any of them removes every analysis query and invalidates the status.

- **`visibleNav(user: User, status: ViewState<AnalysisStatus> | undefined): NavItem[]`** is pure, in `nav.ts`. It shows Analysis only for a platform admin, with the status ok and `aggregates_enabled`.
- **`AnalysisGate`:**
  - an auditor gets `useRedirect("/activity?tab=analysis-access")`;
  - while loading: `Loading`;
  - a failed status, `aggregates_enabled` false, or a 403 `analysis_off` gives "Analysis isn't available yet" and nothing else.
- **`AnalysisView`:**
  - holds `query`, `view` and `chartOrTable` in `useState`;
  - `AnalysisHeader`:
    - "Analysis", the "Sample data" chip, and the scope control (All hospitals / One hospital, then a hospital select from `status.hospitals.list`);
    - the period select;
    - `includedText` with **See which aren't**, a disclosure listing each excluded hospital and its reason;
    - **Download CSV**: `recordDownload` first, then `downloadCsv(analysisCsvName(…), analysisCsv(…))`. A failure shows "Couldn't record the download, so it didn't start. Try again.";
  - `AnalysisFilters`:
    - `ConditionSearch` (a combobox over `matchCondition`), age band (the scope's bands), sex, setting, specialty;
    - for One hospital only: ward or clinic, and Source when `showSource`;
    - **Clear filters**;
    - at the limit, the unset controls disable, with `limitText(scope)` shown;
    - on phone, "Filters ({n})" opens `@mhai/ui/sheet`;
  - the view picker: a `role="tablist"` on `md` and up, a "View" select below it. Default Prevalence and trends;
  - `ViewFrame({ view, state, onRetry, summary, chart, table, comparison?, hospitals? })`:
    - the title, **Chart** / **Table** (`aria-pressed`), and "Updated {time}";
    - failed: `failedText` with **Try again** only;
    - an empty patient count: "No patients match these filters";
  - `DataTable({ caption, columns, rows })`: a table on `md` and up, cards below. Hidden cells use `valueText`.
- **Offline** (`useNetwork` from `@mhai/api-client`): the filters, scope, period and **Download CSV** disable with "You're offline".

This task mounts a placeholder body for each view (title and summary only). Tasks 6 and 7 fill them in.

- [ ] **Step 1: Write the failing tests**
  - nav:
    - "a platform admin sees Analysis after Usage, with Sample data";
    - "an auditor never sees it";
    - "with the status loading, failed or off, nobody sees it".
  - gate:
    - "an auditor opening /analysis goes to the access trail";
    - "off shows Analysis isn't available yet";
    - "a 403 analysis_off mid-session swaps the page for Analysis isn't available yet, drops the analysis queries and hides the sidebar entry" (Review Focus 4).
  - page:
    - "opens on All hospitals, Last 12 months, Prevalence and trends";
    - "10 of 12 hospitals included lists Hilltop and Eastbrook with reasons";
    - "One hospital lists only included hospitals";
    - "across hospitals, no ward or source filter; the age bands are 20-year";
    - "a 4th filter across hospitals is disabled with the limit text";
    - "switching scope clears filters with the note" (Review Focus 1);
    - "Download CSV records first, then saves";
    - "a failed record makes no file and says why" (Review Focus 5);
    - "offline disables the filters and Download CSV with the reason" (Review Focus 5);
    - "nothing goes in the URL or storage" (the location is unchanged after filtering, and storage is empty);
    - "at phone width the filters open in a sheet and the views are a select";
    - "sign-out removes the analysis queries".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Analysis page frame, its gate and sidebar entry".

---

### Task 6: Prevalence, the hospital rows and the fair comparison

**Files:**

- Create: `components/analysis/prevalence-view.tsx`, `hospital-rows.tsx`, `comparison-panel.tsx`, and tests.
- Modify: `analysis-view.tsx`, to mount Prevalence.

**Interfaces:**

- Consumes: `ViewFrame` and `DataTable` (Task 5); `comparisonLines`, `valueText` and `conditionText` (Task 4); `ColumnChart`, `BarList` and `Column.hidden` from `@mhai/ui/charts/*`.
- **`HospitalRows({ rows, headlineLabel })`:** used by every view in All hospitals scope.
  - It is a table with Hospital, Patients seen, the headline rate (with its count beside it, never a count alone), Kind, Coverage and Not standardised.
  - A row over 10% gets a "Partly standardised" chip with an icon.
  - It is sortable, with `aria-sort`.
  - Hidden values read "Fewer than 5", or "Too few hospitals to show".
- **`ComparisonPanel({ comparison, kind })`:**
  - the context line first;
  - then "Last period: {value}", then "Median of {n} similar hospitals: {value}", then the verdict with an icon and words (never colour alone);
  - when not available, only the reason line and the context.
- **Prevalence:**
  - a `ColumnChart` of cases per 1,000 by month. Hidden months draw no column and read "Fewer than 5". In One hospital scope, the median shows as a second mark;
  - a `BarList` by condition, as rate per 1,000 with the count and "{n} new in this period" as the note;
  - a table of condition, ICD-10, cases, rate and new;
  - the summary sentence built only from shown values.

- [ ] **Step 1: Write the failing tests**
  - "All hospitals: the rate line, conditions, and one row per hospital with size, kind and coverage";
  - "Southpoint shows Partly standardised";
  - "counts always show beside rates across hospitals";
  - "Sickle cell disease: Lakeside and Harbour View read Fewer than 5";
  - "Tuberculosis across hospitals reads Too few hospitals to show";
  - "Havana: the previous period first, then the median of 5 similar hospitals, then the verdict in words";
  - "few_peers: Not enough similar hospitals to compare, with no median";
  - "Riverside, Southpoint and Fairhaven show their reasons";
  - "a hidden month reads Fewer than 5 with no column, beside a real 0";
  - "Table shows the same numbers";
  - "a failing prevalence shows Couldn't load prevalence and trends and no zeros".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Add prevalence, hospital rows and the fair comparison".

---

### Task 7: Who is affected, Co-occurring conditions, Findings and alerts, MHAI quality, and the links

**Files:**

- Create: `components/analysis/affected-view.tsx`, `co-occurring-view.tsx`, `findings-view.tsx`, `quality-view.tsx`, and tests.
- Modify:
  - `analysis-view.tsx`;
  - `components/hospitals/hospital-view.tsx`: links **Usage for this hospital** and **Analysis for this hospital**;
  - `components/analytics/analytics-view.tsx`: reads `?hospital=` once to open the Hospitals tab on that hospital, as it already does for `?change=`;
  - `lib/analysis/scope-handoff.ts` (+ test).

**Interfaces:**

- Consumes: `ViewFrame`, `DataTable`, `HospitalRows` and `ComparisonPanel`.
- **Who is affected:**
  - `BarList`s of shares for age band, sex, setting and specialty, plus ward or clinic in One hospital scope. Each has a table;
  - `HospitalRows` across hospitals;
  - no comparison.
- **Co-occurring:**
  - a `BarList` of up to 20 pairs ("Type 2 diabetes + Hypertension"), with "{share} of people with {a}" as the note;
  - hidden pairs read "Fewer than 5" and come last;
  - the note "Pairs are counted within each hospital, then added up";
  - no comparison.
- **Findings and alerts:**
  - findings by patients, with the flag word and icon, and "Not standardised" for a null name;
  - alerts by severity, in words and icons;
  - the link "See alert handling on Usage" (`/usage`). There are no acknowledgement times on this page;
  - the comparison on abnormal findings per 1,000.
- **MHAI quality:** per condition,
  - the confidence mix;
  - "Reviewers agreed {share} of {rated} rated";
  - the number of reviewers, never a name;
  - corrections: approved, rejected and waiting;
  - the comparison on the agreement rate.
- **`scope-handoff.ts`:** `handOffHospital(id: string): void` and `takeHandedOffHospital(): string | null`. This is a module variable read once on mount, so the hospital never goes in the URL. The Analysis link calls `handOffHospital` and then `router.push("/analysis")`.

- [ ] **Step 1: Write the failing tests**
  - "who is affected shows shares by band, sex, setting and specialty, with a hospital table across hospitals";
  - "ward or clinic only for one hospital";
  - "co-occurring: the rare pair reads Fewer than 5, after the shown pairs";
  - "findings link to Usage for alert handling and show no acknowledgement times";
  - "quality shows reviewers as a number and no names";
  - "a confidence set with one hidden member fails quality closed, and the others keep working";
  - "each view has a Table with the same numbers";
  - "the hospital page's Analysis link opens One hospital on that hospital, with nothing in the URL";
  - "the hospital page's Usage link opens the Hospitals tab on that hospital".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Add the remaining analysis views and the links between pages".

---

### Task 8: Analysis access in Activity

**Files:**

- Create: `apps/platform/lib/analysis/access.ts` (+ test), `components/activity/access-trail.tsx` (+ test).
- Modify:
  - `components/activity/activity-view.tsx`: tabs **Team actions** (today's list) and **Analysis access**, chosen by `?tab=analysis-access`;
  - `lib/activity-labels.ts` (+ test): the two switch actions;
  - `lib/queries/activity.ts`: `useAnalysisAccess(q)` and `useExportAnalysisAccess()`.

**Interfaces:**

- Consumes: `AccessEntry`, `listAnalysisAccess`, `exportAnalysisAccess` (Task 3), `VIEW_TITLE` and `periodLabel` (Task 4).
- **`readAccessPage(raw: unknown): ViewState<{ entries: AccessEntry[]; next_cursor: string | null }>`.** It fails closed when:
  - `flagged` is not exactly `kind === "patient_list"`;
  - `count` or `clearance_id` is set on another kind;
  - a filter key is unknown, or a label is over 80 characters;
  - an id is not opaque;
  - any patient key is present.
- **`accessLine(e: AccessEntry): string`:**
  - "Ada Bakare looked at Prevalence and trends · All hospitals · Last 12 months · Age 40–59, Female";
  - "Tunde Okafor downloaded Who is affected as CSV · Havana Hospital · Last 6 months";
  - "Ada Bakare opened 37 de-identified patients at Havana Hospital · Findings and alerts · letter CL_hav_01". This one has a **Security** chip with an icon.
- **Activity labels:** "{actor} turned Analysis on", "{actor} turned patient lists off".
- **`AccessTrail`:**
  - filters for hospital (the page's existing select) and kind (All, Visits, Downloads, Patient lists);
  - newest first, with **Load more**;
  - **Export for a legal request**, for both roles, saved through a Blob URL. Offline disables it, with the reason;
  - the note "Who looked at Analysis. Never the figures or patients."

- [ ] **Step 1: Write the failing tests**
  - "an auditor sees the Analysis access tab and the three kinds";
  - "a patient list entry is flagged with a Security chip and cites its letter";
  - "a visit with flagged true fails the page closed";
  - "the kind filter narrows the list";
  - "Export saves the file for both roles";
  - "a switch event reads 'turned Analysis on'";
  - "the Team actions tab is unchanged" (today's activity tests pass as they are).
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Show who used Analysis in Activity, for auditors and admins".

---

### Task 9: Plan 12a end to end and docs

**Files:**

- Create: `apps/platform/tests/e2e/analysis.spec.ts`.
- Modify:
  - `security.spec.ts`: `/analysis` in the CSP list;
  - `README.md`: "**Analysis across hospitals.**", plus a sign-off line;
  - `apps/clinical/tests/readme.test.ts`;
  - `ARCHITECTURE.md`: the sidebar, the page row, the gate and `@mhai/ui/guards`;
  - `CONTRIBUTING.md`: the sign-off line;
  - `CHANGELOG.md`;
  - spec §11, only if the contract changed while building.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test:
  - "Ada opens Analysis from the sidebar: All hospitals, 10 of 12 included, Sample data";
  - "filter Sickle cell disease and read Fewer than 5 for Lakeside and Harbour View";
  - "pick Havana Hospital: the comparison shows the previous period, then the median of 5, then the verdict";
  - "Riverside shows Not enough similar hospitals to compare";
  - "Download CSV saves a file whose hidden values read Fewer than 5, and the trail shows the download";
  - "Amara (auditor) sees no Analysis entry, /analysis lands on the access trail, and she exports it";
  - "the URL never changes while filtering";
  - "phone: the filters sheet, the view select, tables as cards".
- [ ] **Step 2: Docs.**
  - The README says what Analysis shows, the sample hospitals and their roles in the demo, and that it needs **clinical, privacy and legal sign-off before live use**. It stays off until the backend switch is on and `ANALYSIS_SIGNED_OFF=true`.
  - Pins:
    - "documents the platform analysis demo", matching `/\*\*Analysis across hospitals\.\*\*/`;
    - "says platform Analysis needs sign-off", matching `/ANALYSIS_SIGNED_OFF=true/` within the platform section.
  - CHANGELOG, under Unreleased › Added.
- [ ] **Step 3: Verify.** Run the full suite: `npm test`, `npm run e2e` (both apps), lint, `format:check`, typecheck, build, `check:bundle` and `check:platform-marker`. Compare the counts with Task 1's record.
- [ ] **Step 4: Commit:** "Test Analysis across hospitals end to end; document the demo".

The controller then opens the 12a PR and the backend contract PR (§14.11, and the §14.7 link change).

---

### Task 10 (12b): The drill-down contract, mock and reader

**Before you start:** Plan 12a and Plan 11 (with "Needs from Plan 11") are merged. Merge `origin/main`. Check that the platform mock has the clearance store and the sample Havana letter covering Ada.

**Files:**

- Modify:
  - `analysis-contract.ts`;
  - `contract.ts`, `mock-analysis.ts`, `mock.ts`, `live.ts`, `live.test.ts`;
  - `route.ts`, `proxy.test.ts`;
  - `lib/analysis/read.ts` and its test;
  - `mock-analysis.test.ts`.

**Interfaces:**

```ts
type PlatformPatientRow = {
  pid: string;
  age_band: HospitalAgeBand;
  sex: Sex;
  setting: Setting | null;
  findings: { name: string | null; flag: "high" | "low" | "abnormal" | null }[];
};
type PlatformPatientsOut = {
  level: "deidentified";
  count: number;
  patients: PlatformPatientRow[];
  until: string;
  clearance_id: string;
};
```

- **`PlatformClient` gains** `listHospitalPatients(hospitalId: string, q: { view: ViewId; drill: string; query: AnalysisQuery }): Promise<PlatformPatientsOut>`, at GET `platform/analysis/hospitals/{id}/patients?view&drill&…`.
- **Proxy:** that shape is admin-only, behind both sign-off flags. An auditor gets 403. With `ANALYSIS_PATIENT_VIEWS_SIGNED_OFF` unset, the proxy returns 404.
- **Mock:**
  - `status.my_clearances` comes from Plan 11's clearance store: a verified, unexpired letter at an included hospital whose `covered_platform` holds the caller;
  - `drill` is set only in One hospital scope, on shown counts of 5 or more, and only when the switch is on and the caller is covered there;
  - `listHospitalPatients`:
    - 403 `no_clearance` without a letter;
    - 403 `patient_views_off` when off;
    - 403 `clearance_ended` after `until`;
    - 422 `too_small` for a hidden or unknown drill;
    - at most 200 rows;
  - pids are `M-` plus a hash of (caller, hospital, letter, patient). They are stable for one admin, hospital and letter, and differ between admins;
  - each call records a flagged `patient_list` trail entry with the count and the letter.
  - The option `patientViews?: "on" | "off"` defaults to "on".
- **`readPatients(raw: unknown, now: number): ViewState<PlatformPatientsOut>`.** It fails closed on:
  - a level other than "deidentified";
  - any key outside the row type;
  - a `pid` not matching `^M-[A-Z0-9]{4,12}$` (so a `P-` id fails);
  - more than 200 rows;
  - an `until` in the past.

- [ ] **Step 1: Write the failing tests**
  - mock:
    - "Ada has a clearance at Havana; Tunde has none";
    - "drill only for Ada, at Havana, in One hospital scope, on shown counts ≥ 5";
    - "no drill anywhere across hospitals";
    - "Northgate is 403 no_clearance";
    - "patientViews off gives 403 patient_views_off and no drill";
    - "pids differ between Ada and Tunde, and are stable for Ada";
    - "each list adds a flagged trail entry citing the letter";
    - "no name, MRN, date of birth or address in any row".
  - read:
    - "a row with name, mrn, dob, address or an extra key fails";
    - "a P- pid fails";
    - "201 rows fail";
    - "an until in the past fails".
  - proxy:
    - "the patients shape is accepted for a platform admin";
    - "an auditor is 403 before upstream";
    - "ANALYSIS_PATIENT_VIEWS_SIGNED_OFF unset gives 404".
  - live: the path and query.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the per-hospital de-identified list contract, under a letter".

---

### Task 11 (12b): The drill-down on the page, end to end and docs

**Files:**

- Create: `components/analysis/patients-panel.tsx`, `drill-number.tsx`, and tests.
- Modify:
  - the four view files with drillable numbers (prevalence, affected, co-occurring, findings) and their tests;
  - `lib/queries/analysis.ts`: `useHospitalPatients(q | null)`, with `gcTime: 0` and no retry on 403;
  - `tests/e2e/analysis.spec.ts`, `README.md`, `readme.test.ts`, `CHANGELOG.md`.

**Interfaces:**

- **`DrillNumber({ value, drill, hospital, status })`:**
  - All hospitals scope: always plain text;
  - One hospital scope with `drill` set, the switch on, and the hospital in `status.my_clearances`: a **See patients** button. It is disabled offline, with the reason;
  - One hospital scope with the switch on but no clearance: plain text with `tabIndex={0}`, showing "Patient lists need a clearance letter from this hospital" on hover and focus, through `aria-describedby`;
  - switch off: plain text, with no hint.
- **`PatientsPanel({ hospital, view, drill, query, label, onClose })`:**
  - `@mhai/ui/side-panel` on `md` and up, `@mhai/ui/sheet` below;
  - the heading "{n} patients · {label} · {hospital}", and "De-identified: no names or record numbers";
  - the rows: ID, age band, sex, setting, and findings with the flag word;
  - "Showing the first 200 of {n}" when cut;
  - `print:hidden`, with no export, print or copy button;
  - while open, it re-reads the status every 30 s. It closes at `until`, when the hospital leaves `my_clearances`, or on a 403 `no_clearance`, `clearance_ended` or `patient_views_off`. It then shows "Patient list closed: the clearance letter is no longer in force";
  - leaving the page or closing the panel drops the list from the cache;
  - focus returns to the button that opened it.

- [ ] **Step 1: Write the failing tests**
  - "across hospitals no number is a button";
  - "Ada at Havana sees See patients on a shown count; a hidden count has none";
  - "at Northgate the number shows the clearance hint on focus";
  - "with the switch off, no hint and no button";
  - "the list shows M- ids and never a name or MRN";
  - "a reply with a name fails closed and shows no row";
  - "the list closes at until";
  - "a revocation seen within 30 s closes the list";
  - "a 403 clearance_ended closes it";
  - "the list is gone from the cache after closing";
  - "the trail shows the flagged entry with its letter".
  - e2e:
    - "Ada picks Havana, opens See patients, sees the de-identified list, closes it, and the trail shows it flagged";
    - "Tunde at Havana sees the hint, not the button";
    - "phone: the list opens as a sheet".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Docs.** The README adds the per-hospital list: who can open it and under which letter. It stays off until `ANALYSIS_PATIENT_VIEWS_SIGNED_OFF=true` and the backend switch. Pin it with "documents the platform patient list gate", matching `/ANALYSIS_PATIENT_VIEWS_SIGNED_OFF=true/`. CHANGELOG.
- [ ] **Step 4: Verify.** Run the full suite, as in Task 9.
- [ ] **Step 5: Commit:** "Open a hospital's de-identified list under its letter; test it end to end".

---

## Parallel work

- **Group A, start at once, in separate worktrees:** Task 1 (rename), Task 2 (shared guards) and Task 3 (contract and mock). They share no files, except that Tasks 1 and 3 both touch `proxy.test.ts` and `security.spec.ts` lightly. Merge Task 1 first.
- **Task 4** needs Tasks 2 and 3.
- **Group B, after Task 4:** Task 5 (it also needs Task 1's `nav.ts`) and Task 8. Task 8 needs only Task 3's access types and Task 4's labels, and touches only Activity files.
- **Task 6** needs Task 5. **Task 7** needs Task 6 (`HospitalRows`, `ComparisonPanel`).
- **Task 9** comes last in 12a.
- **12b:** Task 10 waits for Plan 11 and 12a to merge. Task 11 needs Task 10.
- **Merge order across plans:**
  - 7d merges before Task 1;
  - Task 1 merges before anything else that touches `nav.ts`;
  - Task 3 and the in-flight plans that add `SHAPES`, `PlatformClient` methods, `ActivityAction`s and mock options (7d, 8, 9, 11b) rebase in merge order. Each keeps the others' rows;
  - Task 2 merges before Plan 6's Task 4 if possible.

## Self-review notes

- **Spec coverage:**

  | Spec section                                              | Task(s)                         |
  | --------------------------------------------------------- | ------------------------------- |
  | §2 goals: five views, two scopes, comparison, CSV         | 3–7                             |
  | §3 roles; auditors kept out                               | 3 (proxy), 5 (nav, gate)        |
  | §4.1 header, periods, hospitals included                  | 4, 5                            |
  | §4.2 filters and limits; nothing in the URL               | 4, 5                            |
  | §4.3 views, Not standardised, Partly standardised, states | 4, 6, 7                         |
  | §5.1 small groups                                         | 2, 3, 4                         |
  | §5.2 second hiding, 3 hospitals, both scopes, CSV         | 2, 3, 4, 6                      |
  | §5.3 fair comparison                                      | 3, 4, 6                         |
  | §6 drill-down: none across, letter per hospital, no names | 4 (no drill across), 10, 11     |
  | §7 access trail and export                                | 3, 8                            |
  | §8 rename, sidebar, links, no notifications               | 1, 5, 7                         |
  | §9 switches                                               | 3 (env gate), 5, 10             |
  | §10 privacy                                               | Global Constraints; 4, 5, 11    |
  | §11 contract                                              | 3, 10, then the controller's PR |
  | §12 demo                                                  | 3, 10 (via Plan 11's store)     |
  | §14 tests                                                 | 2–11                            |

- **Names used across tasks:**
  - from `@mhai/ui/guards`: `GuardedValue`, `GuardKind`, `guardedOk`, `setGivesAway`, `numeratorLeaks`, `remainderLeaks`, `hasOnlyKeys`, `scrub`;
  - types: `AnalysisPeriod`, `ScopeKind`, `ViewId`, `AGuarded`, `Drillable`, `Rate`, `HospitalRow`, `Comparison`, `Meta`, `DataOf`, `ViewOut`, `AnalysisQuery`, `AnalysisStatus`, `FilterOptionsOut`, `AccessEntry`, `AccessKind`, `FilterKey`, `PlatformPatientsOut`;
  - client methods: `getAnalysisStatus`, `getAnalysisFilters`, `getAnalysisView`, `recordDownload`, `listAnalysisAccess`, `exportAnalysisAccess`, `listHospitalPatients`;
  - readers and helpers: `readStatus`, `readFilterOptions`, `readView`, `readAccessPage`, `readPatients`, `switchScope`, `setFilter`, `analysisQueryParams`, `valueText`, `comparisonLines`, `includedText`, `analysisCsv`, `analysisCsvName`, `accessLine`, `visibleNav`, `handOffHospital`;
  - hooks: `useAnalysisStatus`, `useAnalysisFilters`, `useAnalysisView`, `useRecordDownload`, `useAnalysisAccess`, `useExportAnalysisAccess`, `useHospitalPatients`;
  - components: `AnalysisGate`, `ViewFrame`, `DataTable`, `HospitalRows`, `ComparisonPanel`, `AccessTrail`, `DrillNumber`, `PatientsPanel`.

## Across plans (controller, 22 Oct 2026)

- **Platform sidebar order** once every plan has merged: Hospitals · Usage · Analysis · Clearances · Legal holds · System · Settings · Team · Activity · Audit log · Account. Whichever plan merges second fixes `nav.ts` to match.
- **Backend requirements numbering:** Plan 6 updates §10 (Analysis), Plan 8 is §14.8, Plan 9 is §14.9, Plan 11 is §14.10 (plus its hospital side in §10), and Plan 12 is §14.10.
- **Audit kinds:** Plans 8 and 11 add their event kinds to Plan 9's `lib/audit/kinds.ts` if Plan 9 has merged first; otherwise Plan 9 adds theirs.
- **Binary pass-through:** Plans 9 and 11 share one helper in `route.ts`. Whichever lands second reuses it.

## Rulings at start (controller, 23 Oct 2026)

These update the plan for what merged after it was written (Plans 6, 7d, 8, 9, 11 and 13). Where they conflict with the text above, they win.

- **Sidebar order** after this plan: Hospitals · Connections · Usage · Analysis · Clearances · Legal holds · System · Settings · Team · Activity · Audit log · Account. Plan 13 added Connections after Hospitals. Task 1 renames Analytics to Usage in place, and Task 5 inserts Analysis after Usage.
- **Backend section:** the contract is **§14.12**. §14.10 is Plan 11 and §14.11 is Plan 13's record connections. Read every "§14.11" or "§14.10" above that refers to this plan's contract as §14.12.
- **Plan 11 has merged,** with `covered_platform` and the 409 `same_person` refusal on verify and revoke. 12b (Tasks 10 and 11) no longer waits for it; it follows Task 9 as usual.
- **Plan 6 has merged.** Task 2 also turns `apps/clinical/lib/analysis/guards.ts` into re-exports of `@mhai/ui/guards`.
- **Plan 9 has merged.** Audit kinds live in `apps/platform/lib/audit/kinds.ts`, with an exhaustive test. Add this plan's kinds there. Activity actions and audit kinds use one name per event.
- **New sample hospitals** (Ridgeway, Marlow, Fairhaven) also appear in Plan 13's connections sample as "Not connected". Update any pinned counts in the connections tests.
- **The vendor-name guard** (`scripts/no-vendor-names.test.mjs`) and the "no lab wording" rule apply.
- **CI:** agents run lint, typecheck, `prettier --check .`, the unit tests, and only the e2e specs they add or change. CI runs the full e2e suite.

### Server requirement for §14.12: consistent hiding across scopes

From the Task 3 review (findings C1 to C3). The sample mock (`apps/platform/lib/api/mock-analysis.ts`, `familyOf` and `closeSums`) is the reference.

- **One cell, one answer.** A hospital's figure for a query is one cell. It reads the same (value and suppression) in its All hospitals row, in every One hospital view of the same query, and in every view. The same query in One hospital means the same period and filters, with the condition mapped to its 3-character code and only the "80 and over" band shared.
- **Hide over every sum together.** Over the all-hospitals query and each hospital's twin query, the server hides as one: each set and its total (age, sex, setting, specialty, ward or clinic, severities, confidence, corrections, rated and agreed over the conditions), figures that are the same under two names (patients seen and the group with no condition; the group, the headline count and the condition's cases with one), and each all-hospitals figure as the sum of the hospitals' own. Every published number is covered: headline count and base, `size` and `patients`, and each set total.
- **The rule for every sum:** either nothing is hidden, or at least two figures are and, while the total shows, the hidden parts add up to 0 or 5 or more. Otherwise, hide the next-smallest shown part (with none left, the total), and repeat over all sums until nothing changes. A pair or finding cut from a list of 20 counts as hidden.
- **Whole or part: the general rule.** Whenever two patient counts in one reply are a whole and a part of it, sending both publishes the rest (whole − part) by subtraction, and the rest is a group like any other: 0 or 5 or more. This holds whether or not a rate or share between them shows. The pairs are declared once, per view, in `PART_PAIR_BASE` (`apps/platform/lib/api/analysis-contract.ts`), including a ward inside its setting (`LocationRef.setting`). `PART_PAIRS` is their transitive closure: a part of a part is a part, so the rest is checked even when the middle figure is hidden. A setting less all its shown wards (its patients in no shown ward) is a rest too. They include every rate's base and count, the group and the headline, patients seen and each month's patients seen, the headline and each month, each condition, pair and flagged finding, cases and new, and consultations and rated or corrected. The server closes each rest as a sum of its own, inside the reply and across hospitals, by hiding its part (or its whole when the part is 0). The reader fails a view on any shown pair that leaves 1–4 (Task 4 fix rounds 1 to 3). A new figure added to a reply must be added to that table.
- **A total hidden for too few hospitals isn't secret when its rows add up to it.** Inside a reply, close its sets as under a shown total, with at least two hidden members that add up to 5 or more.
- **Too few hospitals** counts as shown in a sum across hospitals (each hospital's own figure is shown anyway), and as hidden inside one reply.
- **Known limit: containment across breakdowns in the data.** In real data a row can sit wholly inside a row of another breakdown with nothing in the contract to say so: a children's ward inside 0–17, a specialty seen by one sex, "no setting" inside "no ward". The two rows shown together leave the rest by subtraction. The app can't see this from a reply, so the server must detect it from its own counts for each query and close it as a whole-and-part pair. The sample does this (`containedSums` in `mock-analysis.ts`), and its fixtures put no ward or specialty wholly inside one age band or one sex.
- **Not covered here:** the same patients reached by a filter in one query and a breakdown row in another (for example "Sex: Other" as a filter against the Other row), and inference that combines several sums at once. Raise both with the backend before sign-off.
