# Plan 6: Analysis on sample data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an **Analysis** page in the clinical app, for hospital admins and for clinicians with the new **Analyst** role, each for their own hospital. It has:

- filters: date range, condition (by name or ICD-10), age band, sex, ward or clinic, admitted/outpatient/emergency, specialty and source;
- five views: Prevalence and trends, Who is affected, Co-occurring conditions, Findings and alerts, MHAI quality;
- charts with the numbers as text, a table view, and a CSV built on the device;
- a de-identified list of the patients behind a number;
- the Analyst role, granted and removed by a hospital admin in the staff panel, and audited.

It runs on sample data, under the small-group rule. In live mode it stays switched off until clinical, privacy and legal sign-off.

**Not in this plan (later plans):**

- named drill-down and clearance letters (upload, platform verification, expiry, revocation, the named-access audit). No UI for them is built, but the drill-down is designed so a "named" level can be added;
- the platform admin app's Analysis across hospitals;
- real EMR data (the EMR/EHR integration plan).

**Architecture:**

- **Access.** A new role, `analyst`, and a feature switch, `features.analysis`, on the signed-in user. One rule, `canUseAnalysis`, decides the nav entries, the page gate and the proxy. Live mode needs both the backend's switch and the deployment's `ANALYSIS_SIGNED_OFF=true`; neither is set until sign-off. The demo sets it on.
- **Data.** An analysis contract, sample data built from a seeded synthetic cohort, a mock that hides small groups the way the server must, and a live client, with the proxy accepting exactly the new paths. Pure rules live in `apps/clinical/lib/analysis/`:
  - reading and guarding each reply, failing closed;
  - labels, summaries and filters;
  - the CSV.
- **UI.** The components live in `apps/clinical/components/analysis/`. The page sits at `app/(clinical)/analysis/page.tsx`. The query hooks live in `lib/analysis-queries.ts`.
- **Shared code.** Charts, the small-group constants and the CSV helpers come from `@mhai/ui` (Plan 7c, PR #39).

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64.

**Spec:** `docs/specs/2026-10-17-analysis-design.md` (approved 17 Oct 2026; scope narrowed by the product owner on 22 Oct 2026: sample data only, no named drill-down). Background:

- `docs/adr/0003-many-emr-systems.md`, for sources and "Not standardised";
- `docs/specs/2026-10-17-usage-alert-analytics-design.md` (Plan 5b) and Plan 7c's `apps/platform/lib/analytics/read.ts`, for the fail-closed rules.

## Global Constraints

- **Sample data only.** Clinical, privacy and legal sign-off is pending.
- **The live gate.** The page, its nav entries and its API paths exist only when `canUseAnalysis(user)` is true. `user.features.analysis` is true only when:
  - in the demo (`NEXT_PUBLIC_USE_MOCK=true`): always;
  - in live mode: the API's user says `features.analysis: true` **and** the server's `ANALYSIS_SIGNED_OFF` is exactly `"true"`.

  Both are unset by default, so live mode hides the page. The proxy checks `ANALYSIS_SIGNED_OFF` on every call as well as at sign-in. When it is off, `analysis/*` gives 404 `not_found` before the session is read.

- **Who:**
  - hospital admins, and clinicians with the `analyst` role, each for their own hospital only;
  - the hospital is never sent from the browser: the server scopes by session;
  - platform accounts never see it;
  - both need two-step, as admin access does. A 403 `mfa_required` sends the person to the setup step.
- **The small-group rule** (spec §4):
  - any count of **1–4** shows **"Fewer than 5"**, with no bar or column, on screen, in tables and in the CSV;
  - it covers every count on the page: patients, cases, consultations, results, alerts and corrections;
  - **0** is shown as "0";
  - a share, rate or median over a hidden count is hidden too;
  - a share of a shown count must not give away a numerator, or its complement, of 1–4;
  - in a set that adds up (a breakdown and its total; new plus existing; severities; the confidence mix; correction outcomes), exactly one hidden member, or hidden members the total gives away (total minus the shown ones under 5), fails the view closed;
  - a count arrives as a whole number; a median may be a half (12.5);
  - a hidden trend point reads "Fewer than 5", draws no column, is never drawn as 0, and is left out of the scale;
  - a summary sentence never states a number worked out from a hidden one ("the other 3", a remainder, a percentage of a hidden total);
  - a value the server should have hidden fails the whole view closed: "Couldn't load {view}".
- **The de-identified drill-down** (spec §5, level 1):
  - each row shows only the pseudonymous ID, age band, sex, location type, and the relevant findings and conditions;
  - never a name, MRN, date of birth or address. A row with any field outside that list fails the list closed;
  - it opens only from a shown count of 5 or more that carries a `drill` key. A hidden count is never a link;
  - at most **200** rows, then "Showing the first 200 of {n}";
  - it is never exported, printed (`print:hidden`) or kept: its query has `gcTime: 0`;
  - every opening is logged in the hospital's activity, unflagged;
  - requests and replies carry `level: "deidentified"`. The type is a union with one member, so a `"named"` level can be added later; the reader refuses any other level.
- **Sources (ADR 0003):**
  - the **Source** filter shows only when the hospital has more than one source, and lists the hospital's own `label`;
  - no vendor or product name appears in the UI, the code, the sample data or the API types;
  - records whose codes couldn't be standardised are counted under **"Not standardised"** (a condition or finding whose `name` is null), never dropped or guessed. A missing location reads "Location not recorded".
- **Privacy (spec §6):**
  - nothing from the page goes in browser storage, the page URL, the page title or logs. The filters and the chosen view live in React state;
  - the filters go to the API as the BFF request's query string, which is not logged;
  - the analysis queries are removed on sign-out;
  - exports are aggregates only.
- **Accessibility (spec §7):**
  - every chart has its numbers as text and a **Table** view;
  - status words come with icons;
  - everything is reachable by keyboard; targets are 44 px;
  - condition names are as clinicians know them, with ICD-10 shown beside them when present.
- **Copy:**
  - "Analysis";
  - the view titles: "Prevalence and trends", "Who is affected", "Co-occurring conditions", "Findings and alerts", "MHAI quality";
  - "Fewer than 5", "Not standardised", "Location not recorded", "No patients match these filters";
  - "Couldn't load {view}" (lower-case title) with **Try again**, "Couldn't load the filters", "Updated {time}";
  - **Chart** / **Table**, **Download CSV**, **See patients**, "De-identified: no names or record numbers";
  - "Filters", "Clear filters", "All sources";
  - the periods: "Last 30 days", "Last 90 days" (default), "Last 12 months", "Custom".
- **States:**
  - each view fails on its own; a failure never shows zeros;
  - filters that fail leave the date range working and disable the rest, with the reason;
  - offline keeps the loaded numbers and the CSV, and disables the filters and **See patients**, with the reason.
- **Phone.** At 390 px:
  - the filters open in a sheet ("Filters ({n})");
  - the view picker is a select;
  - tables become cards;
  - the patient list opens as a sheet;
  - there is no horizontal page scroll.
- **No change to existing behaviour.** The clinical unit and e2e suites pass with their assertions unchanged, except the tests this plan names (the sidebar, the access editor, roles and the proxy). Record the counts before Task 1.
- **Repo rules:**
  - no AI attribution;
  - never `git add -f` under `.superpowers/`;
  - heavy commands run on the build server;
  - no vendor names;
  - the ids are opaque `[A-Za-z0-9_-]+`.

## Rulings made while planning

- **The branch** is updated from `main` after PR #39 (Plan 7c) merges, before Task 1. Every import below uses the post-7c paths:
  - `@mhai/ui/charts/bar-list` and `@mhai/ui/charts/column-chart`;
  - `@mhai/ui/charts/types` (`Column` with optional `hidden`, `BarItem`);
  - `@mhai/ui/small-groups`;
  - `@mhai/ui/csv`.
- **The route** is `/analysis`, outside `/admin`, because analysts aren't admins.
  - A hospital admin sees it in the "Hospital admin" group, after Usage, with the line "Conditions and trends".
  - An analyst who isn't an admin sees it in the clinical sidebar, under Review.
  - A medical director (clinician and admin) sees it once, in the admin group.
- **The Analyst role:**
  - it needs the Clinician role. Like review rights, the box is disabled without it, and it is dropped from the patch when Clinician is unticked;
  - the box shows only when the signed-in admin's `features.analysis` is on;
  - granting and removing log their own kinds, `analyst_granted` and `analyst_removed`. Other role changes still log `roles_changed`.
- **Small groups** apply to every count, not just patient counts (see the PO questions).
- **The drill-down audit** is an activity event: `analysis_patients_viewed`, type `security`, flag null, with `count`. In the demo, the mock analysis client writes it to a shared in-memory audit list that the mock admin's `listActivity` merges in.
- **Age bands** are 0–17, 18–39, 40–64, 65–79 and 80+. Sex is female, male, other or not recorded. Location type (setting) is admitted, outpatient or emergency.
- **The date range** offers the presets, or a custom range of up to 24 months. Buckets are weeks up to 90 days, and months beyond.
- **"New"** means first recorded for that patient in the period; "existing" means recorded before it. The server decides; the UI says "New in this period".
- **The guard code** lives in `apps/clinical/lib/analysis/guards.ts`, modelled on Plan 7c's `read.ts`. Sharing it between the apps is a later clean-up.
- **The mock suppresses the way the server must**, with secondary suppression in sets that add up. A test checks that the readers accept every reply the mock gives over a grid of filters.
- **Backend contract:** the controller adds it to mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as the next §14 item, through its own PR.

## Review Focus

1. **A breakdown that gives away a hidden group.** For example: female 212, male hidden, total 215. Or new shown and existing hidden when cases minus new is 3. The view must fail closed, never show the set. Task 4 tests both; Task 3's mock never sends either.
2. **Filters that narrow to a handful of patients.** For example: one ward, 80+, female. Every number reads "Fewer than 5", with no bars, no **See patients**, nothing reading "0", and no summary number. The CSV writes "Fewer than 5". Tasks 4 and 5 test it.
3. **A hidden trend point beside real zeros.** The hidden week reads "Fewer than 5", with no column, in the chart and the table, and the scale ignores it. A real 0 reads "0". Task 5 tests it.
4. **A drill-down row with a forbidden or unknown field.** For example: `name`, `mrn`, `dob`, `address`, an extra key, or `level: "named"`. The list fails closed and shows no row. Task 4 tests the reader; Task 7 tests the panel.
5. **Live mode with the backend's switch on but no sign-off.** The API says `features.analysis: true`, but `ANALYSIS_SIGNED_OFF` is unset. There must be no nav entry and no Analyst box; `/analysis` sends the person home; the proxy gives 404 before upstream. Task 1 tests it.

---

## File structure

```text
apps/clinical/lib/auth/types.ts                    Role "analyst", User.features, canUseAnalysis, Area "analysis"
apps/clinical/lib/auth/auth-context.tsx            stepsOwed covers analysts
apps/clinical/lib/auth/mock.ts                     analyst sample, features on
apps/clinical/lib/server/map-user.ts · features.ts analysisSignedOff, features from the API
apps/clinical/app/api/v1/[...path]/route.ts        analysis area + shapes
apps/clinical/app/(clinical)/analysis/layout.tsx · page.tsx
apps/clinical/components/shell/admin-nav.tsx · sidebar.tsx   nav entries
apps/clinical/components/admin/access-editor.tsx · staff-list.tsx   Analyst box and chip
apps/clinical/lib/admin/staff.ts · activity.ts     role label, activity wording
apps/clinical/lib/api/admin-contract.ts            StaffRole "analyst", new ActivityKinds
apps/clinical/lib/api/mock-admin.ts · mock-audit.ts
apps/clinical/lib/api/analysis-contract.ts         types (Task 3)
apps/clinical/lib/api/analysis-fixtures.ts         seeded synthetic cohort
apps/clinical/lib/api/analysis.ts · mock-analysis.ts · live-analysis.ts
apps/clinical/lib/analysis/guards.ts · read.ts     fail-closed readers
apps/clinical/lib/analysis/labels.ts · filters.ts · summary.ts · csv.ts
apps/clinical/lib/analysis-queries.ts              hooks
apps/clinical/components/analysis/*.tsx            page parts
apps/clinical/tests/e2e/analysis.spec.ts
```

---

### Task 1: Access, the live gate and the route

**Before you start:** merge `origin/main` once PR #39 is in. Check that `packages/ui/src/charts/bar-list.tsx` and `packages/ui/src/csv.ts` exist, then record the unit and e2e counts.

**Files:**

- Create:
  - `apps/clinical/lib/server/features.ts` (+ test);
  - `app/(clinical)/analysis/layout.tsx`;
  - `app/(clinical)/analysis/page.tsx`: the heading "Analysis" only. Task 5 fills it.
- Modify:
  - `lib/auth/types.ts`, `roles.test.ts`;
  - `lib/auth/auth-context.tsx` and its test;
  - `lib/auth/mock.ts`, `mock.test.ts`;
  - `lib/api/auth-contract.ts`;
  - `lib/server/map-user.ts` and its test;
  - `components/auth/auth-gate.tsx` and its test;
  - `components/auth/two-step-required.tsx`;
  - `app/api/v1/[...path]/route.ts`, `proxy.test.ts`;
  - `components/shell/admin-nav.tsx`, `sidebar.tsx`, `sidebar.test.tsx`.

**Interfaces:**

- Produces:
  - `Role` gains `"analyst"`;
  - `User.features?: { analysis: boolean }`, where absent means off;
  - `ApiUser.features?: { analysis?: boolean }`;
  - `analysisOn(u: User | null): boolean`;
  - `canUseAnalysis(u: User | null): boolean`, which is true when all hold:
    - not a platform account;
    - `analysisOn`;
    - a hospital admin, or a clinician with `analyst`;
  - `Area = "clinical" | "admin" | "analysis"`, with `canUse(u, "analysis")` the same as `canUseAnalysis`;
  - `analysisSignedOff(env = process.env): boolean`, true only for `ANALYSIS_SIGNED_OFF === "true"` (server only);
  - `ANALYSIS_KEYS = { all: ["analysis"] }`, declared here in `lib/analysis-queries.ts` so `TwoStepRequired` can watch it;
  - `ANALYSIS_HREF = "/analysis"`;
  - the demo's `DEMO_EMAILS.analyst = "analyst.adeyemi@havanahospital.org"`: Dr. Kemi Adeyemi, Consultant physician, Internal Medicine, roles `["clinician", "analyst"]`, two-step on. It is listed in `SAMPLE_ACCOUNTS` as "Analyst", with the note "Clinician with Analysis".
- **Proxy:**
  - `ALLOWED` gains `analysis`;
  - shapes: GET `analysis/filters`; GET `analysis/{view}` for `prevalence`, `affected`, `co-occurring`, `findings` and `quality`; GET `analysis/patients`. Anything else is 404;
  - area rule:
    - `analysisSignedOff()` false gives 404 `not_found` before the session;
    - `!canUseAnalysis(user)` gives 403;
    - `mfaEnabled !== true` gives 403 `mfa_required`;
  - reads forward the query string, as today.
- `stepsOwed` adds `"mfa"` when `(isHospitalAdmin(u) || canUseAnalysis(u)) && !u.mfaEnabled`.
- `TwoStepRequired` watches both `ADMIN_KEYS.all` and `ANALYSIS_KEYS.all`.
- The analysis layout is `<AuthGate need="analysis"><TwoStepRequired>…`.

- [ ] **Step 1: Write the failing tests**
  - `features.test.ts`: "off unless ANALYSIS_SIGNED_OFF is exactly 'true'" (unset, `"1"`, `"TRUE"` are all off).
  - `map-user.test.ts`:
    - "analysis is on only when the API says so and it is signed off" (Review Focus 5);
    - "an unknown features value reads off";
    - "analyst is a known role".
  - `roles.test.ts`:
    - "a clinician with analyst and the feature can use analysis";
    - "without the feature nobody can";
    - "a hospital admin can";
    - "analyst without clinician can't";
    - "a platform account can't".
  - `auth-context.test.tsx`: "an analyst without two-step owes the setup step"; "an analyst's home is /".
  - `mock.test.ts`: "every demo user has analysis on; the analyst sample is clinician and analyst with two-step".
  - `auth-gate.test.tsx`: "/analysis sends a clinician without analyst home"; "the feature off sends everyone home" (Review Focus 5).
  - `sidebar.test.tsx`:
    - "an analyst sees Analysis under Review";
    - "a hospital admin sees Analysis after Usage";
    - "a director sees it once";
    - "with the feature off nobody sees it" (Review Focus 5).
  - `proxy.test.ts`:
    - "the seven analysis shapes are accepted";
    - "POST, `analysis/x` and `analysis/patients/1` are 404";
    - "ANALYSIS_SIGNED_OFF unset gives 404 before upstream, even when the session says on" (Review Focus 5);
    - "a clinician without analyst gets 403";
    - "an analyst without two-step gets mfa_required".
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the clinical tests, lint and typecheck (remote). Only the tests named above changed.
- [ ] **Step 5: Commit:** "Add the Analyst role and the Analysis gate, off in live mode".

---

### Task 2: The Analyst role in the staff panel

**Files:**

- Modify:
  - `lib/api/admin-contract.ts`;
  - `lib/admin/staff.ts`, `lib/admin/activity.ts` and their tests;
  - `components/admin/access-editor.tsx`, `staff-list.tsx`, `staff-panel.test.tsx`;
  - `lib/api/mock-admin.ts`, `mock-admin.test.ts`.
- Create: `lib/api/mock-audit.ts` (+ test).

**Interfaces:**

- Consumes: `analysisOn` and `User.features` (Task 1).
- Produces:
  - `StaffRole` gains `"analyst"`;
  - `ActivityKind` gains `"analyst_granted" | "analyst_removed" | "analysis_patients_viewed"`;
  - `ROLE_LABEL.analyst = "Analyst"`;
  - the access editor's `ROLES` is `["clinician", "analyst", "hospital_admin"]`. Analyst has the hint "Sees Analysis for this hospital: counts and de-identified patients.";
  - `mock-audit.ts`: `recordAudit(e: Omit<ActivityEventOut, "id">): void`, `auditEvents(): ActivityEventOut[]` and `resetAudit()`. These are in memory only. Mock `listActivity` merges `auditEvents()` in time order.
- **Activity wording:**
  - "{actor} gave {target} Analyst access";
  - "{actor} removed Analyst access from {target}";
  - "{actor} opened {count} de-identified patients in Analysis".
- **Mock:**
  - the sample staff gain Dr. Kemi Adeyemi (clinician and analyst);
  - a roles patch that adds or drops `analyst` logs its kind, and other role changes still log `roles_changed`;
  - `analyst` without `clinician` gives 422 `invalid`.

- [ ] **Step 1: Write the failing tests**
  - "the Analyst box shows only with the feature on";
  - "Analyst is disabled without Clinician and dropped from the patch when Clinician is unticked";
  - "granting Analyst saves and logs 'gave Kemi Adeyemi Analyst access'";
  - "removing logs 'removed Analyst access'";
  - "the staff list shows an Analyst chip";
  - mock: "analyst without clinician is 422"; "audit events appear in Activity";
  - activity: the three sentences, exactly.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint.
- [ ] **Step 4: Commit:** "Let hospital admins grant and remove the Analyst role".

---

### Task 3: The analysis contract, sample data, mock and live client

**Files:**

- Create:
  - `apps/clinical/lib/api/analysis-contract.ts`, `analysis-fixtures.ts`, `analysis.ts`, `mock-analysis.ts`, `live-analysis.ts`;
  - tests: `mock-analysis.test.ts`, `live-analysis.test.ts`.

**Interfaces (`analysis-contract.ts`; `GuardedOut`, `ConfidenceLevel`, `AlertSeverity`, `DismissReason` and `FindingFlag` are imported from the existing contracts):**

```ts
type ViewId =
  "prevalence" | "affected" | "co-occurring" | "findings" | "quality";
type AgeBand = "0-17" | "18-39" | "40-64" | "65-79" | "80+";
type Sex = "female" | "male" | "other" | "not_recorded";
type Setting = "admitted" | "outpatient" | "emergency";
type PatientLevel = "deidentified"; // "named" is a later plan
type ConditionRef = { id: string; name: string | null; icd10: string | null }; // name null: "Not standardised"
type LocationRef = { id: string; label: string; setting: Setting | null };
type AnalysisFilters = {
  from: string;
  to: string; // "YYYY-MM-DD", the hospital's days
  condition: string | null;
  age_band: AgeBand | null;
  sex: Sex | null;
  location: string | null;
  setting: Setting | null;
  specialty: string | null;
  source: string | null;
};
type Drillable = GuardedOut & { drill: string | null }; // drill only on a shown count ≥ 5
type FilterOptionsOut = {
  updated_at: string;
  conditions: ConditionRef[];
  locations: LocationRef[];
  specialties: string[];
  sources: { id: string; label: string }[];
};
type Meta = {
  updated_at: string;
  from: string;
  to: string;
  bucket: "week" | "month";
  patients: GuardedOut;
};
type PrevalenceOut = Meta & {
  total: { cases: GuardedOut; new: GuardedOut; existing: GuardedOut };
  by_condition: {
    condition: ConditionRef;
    cases: Drillable;
    new: GuardedOut;
    existing: GuardedOut;
  }[];
  series: { start: string; cases: GuardedOut; new: GuardedOut }[];
};
type AffectedOut = Meta & {
  by_age: { band: AgeBand; patients: Drillable }[];
  by_sex: { sex: Sex; patients: Drillable }[];
  by_setting: { setting: Setting | null; patients: Drillable }[];
  by_location: { location: LocationRef | null; patients: Drillable }[];
  by_specialty: { specialty: string | null; patients: Drillable }[];
};
type CoOccurringOut = Meta & {
  pairs: {
    a: ConditionRef;
    b: ConditionRef;
    a_patients: GuardedOut;
    patients: Drillable;
    share_of_a: GuardedOut;
  }[]; // top 20
};
type FindingsOut = Meta & {
  findings: {
    name: string | null;
    flag: FindingFlag | null;
    patients: Drillable;
    results: GuardedOut;
  }[];
  alerts: {
    total: GuardedOut;
    by_severity: Record<AlertSeverity, GuardedOut>;
    median_ack_minutes: GuardedOut;
    critical_median_ack_minutes: GuardedOut;
    dismissed: GuardedOut;
    dismiss_reasons: { reason: DismissReason; count: GuardedOut }[];
  };
};
type QualityOut = Meta & {
  by_condition: {
    condition: ConditionRef;
    consultations: GuardedOut;
    confidence: Record<ConfidenceLevel, GuardedOut>;
    agreement_rate: GuardedOut; // 0–1 of rated
    rated: GuardedOut;
    corrections: {
      total: GuardedOut;
      approved: GuardedOut;
      rejected: GuardedOut;
      waiting: GuardedOut;
    };
  }[];
};
type ViewOut = {
  prevalence: PrevalenceOut;
  affected: AffectedOut;
  "co-occurring": CoOccurringOut;
  findings: FindingsOut;
  quality: QualityOut;
};
type PatientRowOut = {
  pid: string; // pseudonymous, stable within the hospital, never the MRN
  age_band: AgeBand;
  sex: Sex;
  setting: Setting | null;
  conditions: ConditionRef[];
  findings: {
    name: string | null;
    flag: FindingFlag | null;
    source_label: string | null;
  }[];
};
type PatientsOut = {
  level: PatientLevel;
  count: number;
  patients: PatientRowOut[];
}; // patients ≤ 200
```

**`AnalysisClient` (`analysis.ts`, with `getAnalysisClient()` choosing mock or live like `getAdminClient`):**

- `getFilterOptions(): Promise<FilterOptionsOut>`;
- `getView<V extends ViewId>(view: V, f: AnalysisFilters): Promise<ViewOut[V]>`;
- `listPatients(q: { drill: string; level: PatientLevel; filters: AnalysisFilters }): Promise<PatientsOut>`.

**Live paths:**

- `GET analysis/filters`;
- `GET analysis/{view}?{filterParams}`;
- `GET analysis/patients?drill=…&level=deidentified&{filterParams}`.

`filterParams(f)` drops nulls and sends `source` only when set.

**Sample data and mock rules:**

- **The cohort.** `analysis-fixtures.ts` builds about 600 synthetic patients at Havana Hospital over 12 months from a fixed seed (a small PRNG, no dependency). The same seed gives the same cohort, and `pid`s look like `P-7F3K2`. It has:
  - conditions: Type 2 diabetes (E11), Hypertension (I10), Malaria (B54), Pneumonia (J18.9), Sickle cell disease (D57), Chronic kidney disease (N18), Asthma (J45), and Tuberculosis (A15) with 3 patients;
  - about 12 records whose codes are "Not standardised";
  - pairs: diabetes with hypertension, and kidney disease with hypertension;
  - two sources, "Main record" and "Results system";
  - locations: "Ward 4 (Medical)", "Ward 7 (Paediatrics)", "Outpatient clinic" and "Emergency", plus some with none;
  - findings as in the Plan 5a sample (Potassium, Haemoglobin, Glucose…), and alerts by severity with ack times and dismiss reasons.
- **The mock computes every view from the cohort and the filters, then suppresses:**
  - counts of 1–4 become `{value: null, suppressed: true}`;
  - sets that add up get secondary suppression: hide the next-smallest member until no member can be worked out;
  - shares and medians over a hidden count are hidden;
  - `drill` only on shown counts of 5 or more.
- **`listPatients`:**
  - an unknown or hidden `drill` gives 422 `too_small`;
  - it returns at most 200 rows;
  - it calls `recordAudit` with `analysis_patients_viewed` and the count.
- **Options:** `analysis?: "normal" | "unavailable" | { failView: ViewId }`. "unavailable" makes every call reject with 503.
- **Delays** use `delayMs`, as the other mocks do.

- [ ] **Step 1: Write the failing tests**
  - mock:
    - "the cohort is the same every time";
    - "counts 1–4 are suppressed, 0 is not";
    - "Tuberculosis reads hidden";
    - "Not standardised is counted, not dropped";
    - "two sources, labelled 'Main record' and 'Results system'";
    - "no vendor name anywhere in the fixtures" (scan the serialised cohort against the word list in `mock-alerts.test.ts`);
    - "no patient row has a name, MRN, date of birth or address";
    - "drill only on shown counts of 5 or more";
    - "listPatients caps at 200 and logs one audit event";
    - "a hidden drill is 422 too_small";
    - "failView fails only that view".
  - live: the three paths, with nulls dropped from the query.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the analysis contract, sample cohort, mock and live client".

---

### Task 4: The analysis rules: reading, guards, wording, filters and CSV

**Files:**

- Create, each with a test: `apps/clinical/lib/analysis/guards.ts`, `read.ts`, `labels.ts`, `filters.ts`, `summary.ts`, `csv.ts`.

**Interfaces:**

- **`guards.ts`:**
  - `guardedOk(v: unknown, kind: "count" | "share" | "minutes", loose = false): boolean`. Counts must be whole and not 1–4 when shown; shares are 0–1; medians may be halves.
  - `setGivesAway(total: GuardedOut | null, members: GuardedOut[]): boolean`.
  - `numeratorLeaks(total: GuardedOut, share: GuardedOut): boolean`. It checks both `n` and `total − n`.
  - `scrub<T>(v: T): T`.
- **`read.ts`:**
  - `type ViewState<T> = { status: "ok"; data: T } | { status: "failed" }`;
  - `readView<V extends ViewId>(view: V, raw: unknown): ViewState<ViewOut[V]>`;
  - `readFilterOptions(raw: unknown): ViewState<FilterOptionsOut>`;
  - `readPatients(raw: unknown): ViewState<PatientsOut>`.

  A view fails closed on:
  - a wrong shape;
  - an unhidden 1–4;
  - a non-whole count;
  - a share or median over a hidden count;
  - a numerator or complement leak;
  - a set that gives away a member. The sets are: each `by_*` against `patients`; new plus existing against cases (total and per condition); severities against total; dismiss reasons against dismissed; confidence against consultations; correction outcomes against total;
  - a `drill` on a hidden count or a count under 5;
  - a series point that isn't a real day.

  Patients fail closed on a level other than `"deidentified"`, any key outside `PatientRowOut`, a `pid` outside `^P-[A-Z0-9]{4,12}$`, or more than 200 rows.

- **`labels.ts`:**
  - `VIEW_TITLE: Record<ViewId, string>` and `VIEWS: readonly ViewId[]` in page order;
  - `failedText(view: ViewId): string`, e.g. "Couldn't load who is affected";
  - `AGE_LABEL` ("80 and over"), `SEX_LABEL`, `SETTING_LABEL`;
  - `conditionText(c: ConditionRef): string`, e.g. "Type 2 diabetes · E11", or "Not standardised";
  - `locationText(l: LocationRef | null)`, which gives "Location not recorded" for null;
  - `countText(g: GuardedOut)`, `shareText`, `minutesText` (reusing `minutesLabel` from `@/lib/admin/alert-usage`). A hidden value gives `FEWER_THAN_5`.
- **`filters.ts`:**
  - `PERIODS`;
  - `defaultFilters(today: string): AnalysisFilters`, the last 90 days;
  - `rangeFor(preset, today)`;
  - `customRangeProblem(from, to): string | null`, which allows 24 months at most and `from` on or before `to`;
  - `matchCondition(c: ConditionRef, q: string): boolean`, matching the name or the ICD-10 code, case-insensitive;
  - `showSource(o: FilterOptionsOut): boolean`, true when there are more than one source;
  - `activeCount(f: AnalysisFilters): number`, counting everything but dates.
- **`summary.ts`:** `viewSummary<V>(view: V, data: ViewOut[V]): string`, a single sentence built only from shown values. For example: "1,204 cases across 9 conditions; 312 new in this period." A hidden value is written "fewer than 5", and no remainder or percentage is derived from one. When the patient count is 0, it says "No patients match these filters".
- **`csv.ts`:** `analysisCsv<V>(view: V, data: ViewOut[V], ctx: { hospital: string; filters: AnalysisFilters; options: FilterOptionsOut | null }): string` and `csvFilename(view, f)`, e.g. `mhai-analysis-prevalence-2026-07-24-to-2026-10-22.csv`.
  - The first rows give the view title, the hospital, the period and each active filter by its label (the source by its label).
  - Then come the view's tables. Hidden values read "Fewer than 5" and conditions use `conditionText`.
  - There are no `pid`s, no drill keys and no patient rows. It uses `toCsv` and `CSV_MAX_ROWS` from `@mhai/ui/csv`.

- [ ] **Step 1: Write the failing tests**
  - read:
    - "0 shows, 1–4 hidden";
    - "an unsuppressed 3 fails the view closed";
    - "a count of 12.5 fails; a median of 12.5 minutes reads";
    - "female 212, male hidden, total 215 fails who is affected" (Review Focus 1);
    - "new shown, existing hidden, cases − new = 3 fails prevalence" (Review Focus 1);
    - "one hidden severity fails findings";
    - "an agreement rate over a hidden count fails";
    - "a share of a shown count that gives away 1–4, or its complement, fails";
    - "a drill on a hidden count fails";
    - "everything hidden still reads, with no drill" (Review Focus 2);
    - "the mock's replies all read, over a grid of filters" (Task 3's mock, every view × age band × sex × setting).
  - patients:
    - "a row with name, mrn, dob, address or an unknown key fails" (Review Focus 4);
    - "level named fails";
    - "a pid shaped like an MRN fails";
    - "201 rows fail".
  - labels: "Not standardised", "Location not recorded", "Type 2 diabetes · E11", "80 and over".
  - filters:
    - "E11 finds Type 2 diabetes; 'diab' finds it by name";
    - "source shows only with two or more";
    - "a custom range over 24 months is refused";
    - "activeCount".
  - summary:
    - "a summary never states a number worked out from a hidden one";
    - "all hidden gives 'Fewer than 5 patients match these filters'" (Review Focus 2);
    - "0 gives 'No patients match these filters'".
  - csv:
    - "filters are listed by label";
    - "hidden values read Fewer than 5" (Review Focus 2);
    - "Not standardised is a row";
    - "no pid, no drill key, no patient fields";
    - "the source is written by its label".
- [ ] **Step 2: Implement.** Reuse `@mhai/ui/small-groups` and `@mhai/ui/csv`.
- [ ] **Step 3: Run the tests.**
- [ ] **Step 4: Commit:** "Add the analysis rules: guards, wording, filters and CSV".

---

### Task 5: The Analysis page: filters, CSV, Prevalence and Who is affected

**Files:**

- Create:
  - `components/analysis/analysis-view.tsx`, `analysis-filters.tsx`, `condition-search.tsx`, `view-frame.tsx`, `data-table.tsx`, `prevalence-view.tsx`, `affected-view.tsx`;
  - `lib/analysis-queries.ts` (extending Task 1's keys);
  - tests.
- Modify: `app/(clinical)/analysis/page.tsx` (`metadata.title = "Analysis · MHAI"`).

**Interfaces:**

- Consumes: Task 3's client and Task 4's readers, labels, filters, summary and CSV.
- **Hooks:**
  - `useFilterOptions()`;
  - `useAnalysisView(view, filters)`, which returns `ViewState` through `readView`, with key `ANALYSIS_KEYS.view(view, filters)`;
  - `usePatients(q | null)`, which Task 7 uses, with `gcTime: 0`.

  All keys sit under `["analysis"]`. Sign-out removes them, as it removes the admin keys.

- **`ViewFrame({ view, state, updatedAt, onRetry, summary, chart, table })`:**
  - the title, the summary line and **Chart** / **Table** buttons (`aria-pressed`);
  - "Updated {time}";
  - failed: `failedText(view)` with **Try again**, and nothing else.
- **`DataTable({ caption, columns, rows })`:** a `<table>` with a caption and header row on `md` and up; label-and-value cards below it. Hidden cells read "Fewer than 5".
- **`AnalysisView`:**
  - the header: "Analysis", the hospital name, **Download CSV** (`analysisCsv`, `downloadCsv`) and "Updated {time}";
  - the filters bar;
  - the view picker: buttons with `role="tablist"` on `md` and up, a "View" select below it. Default Prevalence and trends;
  - the active view. The filters and the view live in `useState` only.
- **The filters:**
  - the period select, with Custom revealing two date inputs and `customRangeProblem`;
  - `ConditionSearch`, a combobox (`role="combobox"`, a listbox, arrow keys) over `matchCondition`;
  - selects for age band, sex, ward or clinic, setting and specialty;
  - Source only when `showSource`, listing "All sources" and each label;
  - **Clear filters**;
  - on phone, a "Filters ({n})" button opening `@mhai/ui/sheet`;
  - if the options fail: "Couldn't load the filters", with the period still working and the rest disabled.
- **Prevalence and trends:**
  - a `ColumnChart` of cases per bucket, with hidden points as `Column.hidden`;
  - a `BarList` by condition (cases, with "{n} new in this period" as the note when shown);
  - a table of condition, ICD-10, cases, new and existing.
- **Who is affected:** five `BarList`s (age band, sex, setting, location, specialty), each with a table.
- **Zero patients:** "No patients match these filters", with no charts. When the patient count is hidden, every number reads "Fewer than 5".
- Charts never show a bar for a hidden value.

- [ ] **Step 1: Write the failing tests**
  - "opens on Prevalence and trends for the last 90 days";
  - "the summary and every bar's number show as text";
  - "Table shows the same numbers in a table with a caption";
  - "a hidden week reads Fewer than 5, with no column, beside a real 0" (Review Focus 3);
  - "filtering to Ward 7, 80 and over, female shows Fewer than 5 everywhere, with no bars" (Review Focus 2);
  - "searching E11 picks Type 2 diabetes and reloads the views";
  - "Source shows with two sources and lists their labels only";
  - "Not standardised is listed as a condition";
  - "a failing view shows Couldn't load prevalence and trends with Try again, and no zeros";
  - "the filters failing keep the period working";
  - "Download CSV builds the file for the active view and filters";
  - "offline disables the filters with the reason and keeps Download CSV";
  - "nothing goes in the URL or storage" (the location is unchanged after filtering; storage is empty);
  - "at phone width the filters open in a sheet and the views are a select".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Analysis page: filters, CSV, prevalence and who is affected".

---

### Task 6: Co-occurring conditions, Findings and alerts, MHAI quality

**Files:**

- Create: `components/analysis/co-occurring-view.tsx`, `findings-view.tsx`, `quality-view.tsx` and their tests.
- Modify: `analysis-view.tsx`, to mount them.

**Interfaces:**

- Consumes: `ViewFrame`, `DataTable` and `useAnalysisView` (Task 5); labels (Task 4).
- **Co-occurring:**
  - a `BarList` of pairs, labelled "Type 2 diabetes + Hypertension", with the patient count and "{share} of people with Type 2 diabetes" as the note when shown;
  - a table of condition A, condition B, patients and share.
- **Findings and alerts:**
  - a `BarList` of findings by patients, with the flag word and icon ("High", "Low", "Abnormal") and "Not standardised" for a null name;
  - alerts by severity (Critical, Urgent, Info) with words and icons;
  - the median time to acknowledge, overall and for Critical;
  - the dismiss reasons;
  - a table for each.
- **MHAI quality:** per condition,
  - the confidence mix (High, Caution, Needs review, Couldn't complete; the labels from `lib/labels.ts`);
  - "Clinicians agreed {share} of {rated} rated";
  - corrections: approved, rejected and waiting;
  - a table.

- [ ] **Step 1: Write the failing tests**
  - "co-occurring lists pairs with the share of the first condition";
  - "a hidden share reads Fewer than 5";
  - "findings show flag words with icons, never colour alone";
  - "alerts by severity and the Critical median";
  - "quality shows the confidence mix, agreement and correction outcomes per condition";
  - "a median of 12.5 minutes reads 12.5 min";
  - "each view fails alone and the others keep working";
  - "each has a table view with the same numbers".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint.
- [ ] **Step 4: Commit:** "Add the co-occurring, findings and quality views".

---

### Task 7: The de-identified drill-down

**Files:**

- Create: `components/analysis/patients-panel.tsx` (+ test).
- Modify: `prevalence-view.tsx`, `affected-view.tsx`, `co-occurring-view.tsx`, `findings-view.tsx` (a **See patients** button on drillable rows) and their tests.

**Interfaces:**

- Consumes: `usePatients`, `readPatients`, `Drillable` and the labels.
- **`PatientsPanel({ drill, label, filters, level = "deidentified", onClose })`:**
  - `@mhai/ui/side-panel` on `md` and up, `@mhai/ui/sheet` below;
  - the heading "{n} patients · {label}" and the note "De-identified: no names or record numbers";
  - the rows: pseudonymous ID, age band, sex, location type ("Location not recorded" for null), conditions, and findings with the flag word and the source label;
  - "Showing the first 200 of {n}" when cut;
  - `print:hidden`, with no export;
  - closing returns focus to the button that opened it;
  - failed: "Couldn't load these patients" with **Try again**. A 422 `too_small` reads "This group is too small to list".

  The `level` prop is the only place a later named level plugs in.

- **See patients** appears only where `drill` is non-null and the count is shown. It is disabled offline, with the reason.

- [ ] **Step 1: Write the failing tests**
  - "See patients on a shown row opens the list with the de-identified note";
  - "a hidden count has no See patients" (Review Focus 2);
  - "rows show the pseudonymous ID, age band, sex and location type, and never a name or MRN";
  - "a reply with a name fails closed and shows no row" (Review Focus 4);
  - "200 of 214 shows Showing the first 200 of 214";
  - "too small reads This group is too small to list";
  - "closing returns focus";
  - "the list is gone from the cache after closing";
  - "opening logs an event that Activity shows: opened 37 de-identified patients in Analysis".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint.
- [ ] **Step 4: Commit:** "Add the de-identified patient list behind a number".

---

### Task 8: End to end and docs

**Files:**

- Create: `apps/clinical/tests/e2e/analysis.spec.ts`.
- Modify:
  - `README.md`, adding "**Analysis.**" under Run on mock data and a `### Analysis` sign-off section after `### Patient alerts`;
  - `apps/clinical/tests/readme.test.ts`;
  - `CONTRIBUTING.md`;
  - `ARCHITECTURE.md` (the sidebar and the gate);
  - `CHANGELOG.md`;
  - spec §9, only if the contract changed while building.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test and the CSP check on `/analysis`:
  - "the analyst signs in and opens Analysis from the sidebar";
  - "the hospital admin opens Analysis from the Hospital admin group";
  - "a clinician without Analyst sees no Analysis, and /analysis sends them home";
  - "filter to Type 2 diabetes, switch to Table and read the numbers";
  - "narrow to a tiny group and see Fewer than 5 everywhere";
  - "Download CSV saves a file whose hidden values read Fewer than 5 and which has no patient IDs";
  - "See patients opens the de-identified list; Activity shows the event";
  - "the admin grants Analyst to a clinician and Activity shows it";
  - "phone: filters in a sheet, the view select, the patient list as a sheet".
- [ ] **Step 2: Docs.**
  - The README's "**Analysis.**" says what it shows, the analyst sample (`analyst.adeyemi@…`), the sample cohort and the small-group rule.
  - The `### Analysis` section says it needs **clinical, privacy and legal sign-off before live use**. It stays off in live mode until `ANALYSIS_SIGNED_OFF=true` is set and the backend switches it on for the hospital. Named drill-down and clearance letters are a later plan.
  - Pin these with:
    - `"documents the analysis demo"`, matching `/\*\*Analysis\.\*\*/`;
    - `"says Analysis needs sign-off and stays off in live mode"`, matching `/clinical,\s+privacy\s+and\s+legal\s+sign-off\s+before\s+live\s+use/` and `/ANALYSIS_SIGNED_OFF=true/`.
  - CONTRIBUTING repeats the sign-off line.
  - CHANGELOG, under Unreleased › Added.
- [ ] **Step 3: Verify.** Run the full suite: `npm test`, `npm run e2e` (both apps), lint, `format:check`, typecheck, build, `check:bundle` and `check:platform-marker`. Compare the counts with Task 1's record.
- [ ] **Step 4: Commit:** "Test Analysis end to end; document the demo and the sign-off gate".

The controller then adds the analysis contract to mhai-multiagent's frontend requirements as the next §14 item, through its own PR.

---

## Parallel work

- Tasks 1 and 3 are independent and can run at once, in separate worktrees.
- Task 2 needs Task 1 (`User.features`, the `analyst` role). Task 4 needs Task 3. Tasks 2 and 4 can run at once.
- Task 5 needs Tasks 1 and 4.
- Tasks 6 and 7 both need Task 5 and can run at once. Task 7 touches only the four view files, adding a button; Task 6 creates three of them, so Task 7 merges after 6.
- Task 8 comes last.

## Self-review notes

- **Spec coverage:**

  | Spec section                                         | Task(s)                                |
  | ---------------------------------------------------- | -------------------------------------- |
  | §2 who (hospital admin, Analyst; Analyst audited)    | 1, 2                                   |
  | §2 platform admin                                    | out (later plan)                       |
  | §3 data, Source, Not standardised                    | 3, 4, 5                                |
  | §4 filters, the five views, small groups, CSV, table | 4, 5, 6                                |
  | §5 de-identified drill-down and its log              | 3, 7                                   |
  | §5 named drill-down, clearance, named audit          | out (later plan; `level` left open)    |
  | §6 privacy rules                                     | Global Constraints; 4, 5, 7            |
  | §7 accessibility and wording                         | 5, 6, 7                                |
  | §8 demo                                              | 3 (no clearance letters: out)          |
  | §9 contract                                          | 1 (proxy), 3, then the controller's PR |
  | sign-off before live use                             | 1 (the gate), 8 (docs)                 |

- **Names used across tasks:**
  - `canUseAnalysis`, `analysisOn`, `analysisSignedOff`, `ANALYSIS_KEYS`, `ANALYSIS_HREF`;
  - `ViewId`, `AnalysisFilters`, `FilterOptionsOut`, `ViewOut`, `Drillable`, `ConditionRef`, `LocationRef`, `PatientsOut`, `PatientRowOut`, `PatientLevel`;
  - `getAnalysisClient`, `getFilterOptions`, `getView`, `listPatients`;
  - `readView`, `readFilterOptions`, `readPatients`, `viewSummary`, `analysisCsv`, `csvFilename`, `conditionText`, `countText`, `failedText`, `matchCondition`, `showSource`;
  - `useFilterOptions`, `useAnalysisView`, `usePatients`;
  - `ViewFrame`, `DataTable`, `PatientsPanel`;
  - `recordAudit`, `auditEvents`.
