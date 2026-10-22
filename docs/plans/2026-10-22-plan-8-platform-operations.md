# Plan 8: Legal holds and operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** three new areas in the platform admin app, on sample data:

- **Legal holds (8a):** place, view, edit and lift (two people, then a 7-day grace period with undo) a hold on a hospital's records. A hold blocks the hospital's removal. The hospital page gets a Legal holds section and the hospitals list a "Hold" tag;
- **System (8b):** a Health tab that fails closed, and a Failed jobs tab with retry and cancel;
- **Settings (8c):** records retention (shortening needs a preview and two people), the triage gate (switching on needs two people), and clearing unapproved learning data. The optional pause and health banner come last.

**Architecture:**

- **One plan, four PRs.** Task 1 is a small foundations PR. 8a, 8b and 8c then each get their own PR, as spec §10 asks. Once Task 1 is merged, the three groups can be built in parallel worktrees (see Parallel work).
- **Data per area.** Each area gets its own contract file, client interface, fixtures, mock module and label file, so the three PRs touch the shared files (`contract.ts`, `mock.ts`, `live.ts`, `route.ts`, `nav.ts`) by one or two lines each:
  - contracts: `lib/api/holds-contract.ts`, `ops-contract.ts`, `settings-contract.ts`;
  - mock modules: `lib/api/mock-holds.ts`, `mock-ops.ts`, `mock-settings.ts`. Each is built on a `MockCore` that Task 1 exposes from `mock.ts`.
- **Pure rules** live in `lib/holds/`, `lib/ops/` and `lib/settings/`, with hooks in `lib/queries/{holds,ops,settings}.ts` and components in `components/{holds,system,settings}/`.
- **Pages:**
  - `/legal-holds` and `/legal-holds/[id]`;
  - `/system/health` and `/system/jobs`; `/system` redirects to Health;
  - `/settings`.

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64.

**Spec:** `docs/specs/2026-10-22-platform-operations-design.md` (approved 22 Oct 2026; the product owner accepted every suggested default in §13, so treat them as decisions). Background:

- `docs/specs/2026-10-17-platform-admin-design.md` §4 (step-up, roles) and §7.6 (two-person removal);
- `docs/specs/2026-10-22-platform-analytics-design.md` (the sidebar).

**Starting point:** `main` after Plans 7c and 7d have merged.

## Global Constraints

- **Roles:**
  - platform admins do everything here;
  - auditors read everything, including a hold's reason, reference and note, and change nothing. Controls are hidden on screen, and the proxy refuses their writes before anything goes upstream (`AUDITOR_WRITES` is unchanged).
- **Step-up** uses the person's own two-step or backup code. It is needed for:
  - placing a hold;
  - requesting, approving and undoing a lift;
  - cancelling failed jobs;
  - every settings change, including the learning-data reset.

  Step-up is **not** needed for: retrying failed jobs, editing a hold's review date or note, and cancelling a two-person request. A wrong code shows "That code didn't work. Try again."; a locked one shows "Too many wrong codes. Try again in 15 minutes."
- **Two people:**
  - **Which changes:** lifting a hold, shortening a retention period and switching triage on.
  - **How:** a request, then a **different** platform admin's approval, each with step-up. The server's `requested_by_you` decides who may approve, never a name comparison.
  - **Who can cancel:** either platform admin, with no step-up.
  - **Lapse:** a request lapses after **7 days**.
  - **Wording:** the requester sees "Waiting for a different platform admin to approve" (the removal panel's own words).
  - **Refusals:** a second approval by the requester is refused 409 `same_person`; an approval after the lapse is refused 409 `expired`.
- **Holds:**
  - **What a hold covers:**
    - one hospital: **All records**, or records **from** a date **to** a date (inclusive, in the hospital's time zone; To may be empty, meaning "until lifted");
    - a hospital in any status except Removed;
    - several holds can cover the same hospital.
  - **Lifecycle:**
    - placing takes effect at once, with one person;
    - the review date defaults to **6 months** after placing. On that date the hold shows **Review due**; nothing else happens;
    - a hold never expires and is never deleted;
    - a lifted hold keeps its records for **7 more days**, then they are released. **Undo lift** in that time takes one person with step-up.
  - **Edits:** only the review date and the note can change. Scope, reason and reference can never be edited.
  - **Limits:**
    - reference **1–100** characters;
    - asked-for-by **1–200**;
    - note **≤ 500**;
    - lift authority **1–200**.
  - **Which holds keep records:** a hold that is Active, Review due or Lift requested, or Lifted before its `released_on`, keeps its records. It counts in the removal's `checks.legal_holds` and blocks the removal.
  - **Privacy hint:** every free-text field on a hold or lift shows **"Don't include patient names, hospital numbers or dates of birth."**
  - **Activity** shows a hold's reference, never its note.
- **Failed jobs:**
  - **Batch size:** at most **50** at once, whether retrying or cancelling.
  - **Old questions:** when the chosen jobs include an "Answer a question" job first tried more than **24 hours** ago, the retry dialog says "{n} of these questions were asked more than a day ago. The clinicians may have asked again or no longer need the answer." and focuses **Don't retry**.
  - **Defaults:** the cancel dialog's safe default is **Keep**. The status filter defaults to Failed.
  - **Display:** a job shows its opaque id with **Copy**, never its subject, user or error message.
- **Health:**
  - it refreshes every **30 s**, only while the tab is visible and online, plus **Refresh now**. The refresh is not activity: it never extends the session;
  - a failed call, or an `updated_at` more than **2 minutes** old, shows the overall status **Couldn't check** with "Last good reading {time}". It never shows green from old data, and never zeros where loading failed;
  - the overall words are **Working normally**, **Slower than usual**, **Having problems** and **Couldn't check**, always with an icon;
  - answer times read "Half within {x} s · 95 in 100 within {y} s".
- **Settings:**
  - every change asks for a reason and step-up, and sends `version`. A clash is 409 `conflict`: "Changed by someone else", then a reload;
  - a retention period is never offered below its `minimum_days`;
  - the audit log is never kept under 6 years (the server's minimum);
  - triage can be switched on only when `ready`.
- **Plain words** (UI design v3 §6): no internal names, job types, queue names, error classes or model names on screen. Each area's code-to-words mapping lives in exactly one label file: `lib/holds/labels.ts`, `lib/ops/labels.ts` or `lib/settings/labels.ts`. An enum value the app doesn't know fails its block closed ("Couldn't load {block}"); it is never printed raw.
- **Counts only.** No patient, clinician, question or answer content anywhere. Record counts are whole-hospital or platform totals.
- **States:**
  - every list and block has loading, empty ("No legal holds", "No failed jobs"), "Couldn't load {what}" with **Try again**, and offline (actions disabled with "You're offline. This needs a connection.");
  - nothing is stored in the browser, and the URL carries only opaque ids and filter values.
- **Accessibility:**
  - statuses use words and icons, never colour alone;
  - destructive dialogs focus the safe choice;
  - everything is keyboard reachable;
  - tables become cards below `md`, with **44 px** targets on phones.
- **No change to the clinical app's behaviour.** Its unit and e2e suites pass with their assertions unchanged. The existing platform e2e pass unchanged, except the removal panel's "Legal holds are managed in a later release." line, which Task 5 replaces.
- **Repo rules:**
  - no AI attribution;
  - never `git add -f` under `.superpowers/`;
  - heavy commands run on the build server;
  - no vendor names;
  - ids are opaque `[A-Za-z0-9_-]+`.

## Rulings made while planning

- **Delivery.** One plan, delivered as four PRs:
  - Task 1 (foundations) merges first;
  - then 8a, 8b and 8c, each its own PR, in parallel worktrees;
  - merge order 8a → 8b → 8c, each rebased on the one before for the shared lines.
- **The mock seam.** `mock.ts` exposes `MockCore` (`read`, `write`, `log`, `you`, `checkCode`, `findHospital`, `now`, `newId`). `createMockPlatform` spreads `holdsMock(core, opts)`, `opsMock(core, opts)` and `settingsMock(core, opts)`. `PlatformClient` becomes `HospitalsClient & HoldsClient & OpsClient & SettingsClient`; each extra interface lives in its own contract file.
- **Shared unions are added once, in Task 1.** That covers every Plan 8 `ActivityAction` with its words, the new error codes in `lib/errors.ts`, and `TwoPersonRequest`, so the three PRs never collide on those unions.
- **`StepUpDialog` grows; it does not move.** It stays in `components/hospitals/step-up-dialog.tsx` and gains:
  - `extra` (one more required text field, returned as `extra`);
  - `hint` (shown under every free-text field);
  - `dismissLabel` (default "Cancel").
- **Place a hold takes two steps.** First a form (`PlaceHoldDialog`), then **Continue**, which opens `StepUpDialog` with a one-line summary. The dialog itself is unchanged.
- **Hold edits** (the review date and the note) send `version` with no step-up, since spec §3 doesn't list them.
- **The holds list filters:**
  - status is one of `open` (Active, Review due, Lift requested; the default), `active`, `review_due`, `lift_requested`, `lifted` or `all`;
  - the filters live in the URL query, so the removal panel's **View holds** opens `/legal-holds?hospital={id}&status=all`.
- **Hold dates** are calendar dates (`YYYY-MM-DD`). The scope reads:
  - "All records";
  - "Records from 1 Jan 2025 to 30 Jun 2025";
  - "Records from 1 Jan 2025, until lifted".
- **The clinical sign-off** for triage is one required field, "Clinical sign-off (who approved it and their reference)", up to 200 characters, sent as `clinical_signoff`.
- **Contract additions to spec §9.** Task 1 writes them into the spec so §9 is complete:
  - holds:
    - `status` filter values as above;
    - `hold.stopped_removal: boolean`;
    - lift reasons `case_closed | withdrawn | mistake | other`;
  - health:
    - `clean_up.paused_by` and `paused_at`;
    - `steps[].step` is one of `privacy | guidelines | answer | evidence`;
  - jobs:
    - `retry` and `cancel` return id arrays;
    - cancel reasons `no_longer_needed | cant_succeed | other`;
  - settings:
    - retention `type` is one of `records | documents | pending_corrections | audit_log`;
    - `retention.confirmed: boolean`;
    - `triage.not_ready_reason` is one of `missing_report | missing_files | checksum_mismatch`;
    - `feedback_buffer.running` and `feedback_buffer.failed_job_id`;
    - every settings write returns the whole `SettingsOut`, whether the answer is 200 or 202.
- **A stale health reading counts as a failed one.** Everything shows Couldn't check or Couldn't load, with the last good time. Old figures are never shown.
- **Health polling sends `X-MHAI-Background: 1`.** For a GET carrying it, the proxy skips `touchSession`. The bell (7d) can adopt it later; that is not in this plan.
- **The demo health switch.** The Health tab shows a "Sample data: Normal · Slower · Problems" control only when `NEXT_PUBLIC_USE_MOCK=true`, as the demo hint does. It calls `setDemoHealth(mode)` from `mock-ops.ts`.
- **Cancel effect words** for job types the spec doesn't word: "The work won't be done. Nothing is deleted."
- **Retention periods:**
  - the offered periods are 1–11 months (`months × 30` days) and 1–10 years (`years × 365` days), never below `minimum_days`;
  - `daysLabel` shows years for multiples of 365, months for multiples of 30, and days otherwise;
  - while `confirmed` is false, the page says "These periods are not yet confirmed by Measured Health's compliance lead."
- **Settings history** links to `/activity`, which has no setting filter.
- **The bell is left out of Plan 8.** That covers a request waiting for you, a review date reached and health problems. 7d's notification shape is analytics-only, so they wait for a follow-up.
- **The optional extras** (pause clean-up and the health banner) are Task 13, built last. They can be dropped without touching anything else.
- **`useTabVisible`** is imported from `lib/queries/notifications.ts` (7d), not moved.
- **The backend contract.** Spec §9 goes to mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as §14.9, filed by the controller with 8a, covering all of §9 (numbering across plans: 6 is §14.8, 8 is §14.9, 9 is §14.10, 11 is §14.11, 12 is §14.12).

## Review Focus

1. **A hold placed on a hospital mid-removal.**
   - Removal pending: the request becomes blocked.
   - Removal scheduled: the hospital goes back to Removal pending (blocked), and the hold's page says so.
   - Removal started: refused with "This hospital's removal has already started. Act outside the app now."

   Task 2 tests the mock; Tasks 3 and 5 test the screens.
2. **The requester approving their own request after signing out and back in, in the same tab, under a name that matches someone else's.** Only `requested_by_you` decides; a forced approve gets `same_person` and its words. Tasks 2, 4 and 11 test it.
3. **A request that lapses while the approver's dialog is open.** The result is 409 `expired`, then "This request lapsed after 7 days. Make a new request." and a reload, never a silent success. Tasks 2, 4 and 11 test it.
4. **The Health tab left open in a hidden tab for 20 minutes, then shown again.** The first paint reads Couldn't check (stale) until a fresh reading arrives; no poll ran while it was hidden; the session idles out as normal. Tasks 6 and 7 test it.
5. **A batch retry or cancel where some jobs changed meanwhile.** It succeeds in part with "{m} were already retried or finished", and the rows refresh. There is no error banner and nothing is done twice. Tasks 6 and 8 test it.

---

## File structure

```text
apps/platform/lib/api/contract.ts            PlatformClient split; TwoPersonRequest; ActivityAction (+19); HospitalSummary.legal_holds_active; Hospital.legal_holds
apps/platform/lib/api/mock.ts                MockCore seam; spreads the three area mocks
apps/platform/lib/api/live.ts                spreads holdsLive/opsLive/settingsLive
apps/platform/lib/api/{holds,ops,settings}-contract.ts
apps/platform/lib/api/{holds,ops,settings}-fixtures.ts
apps/platform/lib/api/mock-{holds,ops,settings}.ts (+ tests)
apps/platform/lib/api/fixtures.ts            HospitalRecord.legal_holds becomes holds (8a)
apps/platform/app/api/v1/[...path]/route.ts  new SHAPES; X-MHAI-Background
apps/platform/lib/errors.ts                  new codes
apps/platform/lib/activity-labels.ts         new actions
apps/platform/components/shared/two-person.tsx
apps/platform/components/hospitals/step-up-dialog.tsx   extra, hint, dismissLabel
apps/platform/lib/{holds,ops,settings}/*.ts  labels and rules
apps/platform/lib/queries/{holds,ops,settings}.ts
apps/platform/components/holds/*  system/*  settings/*
apps/platform/app/(app)/legal-holds/page.tsx  legal-holds/[id]/page.tsx
apps/platform/app/(app)/system/{layout,page}.tsx  system/health/page.tsx  system/jobs/page.tsx
apps/platform/app/(app)/settings/page.tsx
apps/platform/components/shell/nav.ts        three links
apps/platform/components/hospitals/{hospital-view,removal-panel,hospital-table,hospital-cards}.tsx
apps/platform/tests/e2e/{holds,system,settings}.spec.ts, helpers.ts (openNav names)
```

**Files shared with other in-flight plans.** The controller sequences these merges:

| File                                                     | Also changed by                                                       | Kind of clash                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `components/shell/nav.ts`                                | Plan 9 (Audit log after Activity), Plan 11 (Clearances after Analytics), Plan 12 (Analysis) | **Order:** Plan 11 also wants the slot after Analytics; the controller picks the final order |
| `app/api/v1/[...path]/route.ts` SHAPES                   | 7d, 9, 11, 12                                                         | appended rows; `RESERVED` is derived, so check no new word collides with an `{id}` |
| `lib/api/contract.ts` (`ActivityAction`, `PlatformClient`, `Hospital*`) | 7d, 9, 11, 12                                          | union and interface lines                                                          |
| `lib/api/mock.ts`, `lib/api/fixtures.ts`                 | 7d, 9, 11, 12                                                         | Task 1's seam keeps Plan 8 to a few lines                                          |
| `lib/activity-labels.ts`, `lib/errors.ts`                | 9, 11                                                                 | switch cases                                                                       |
| `tests/e2e/helpers.ts` (`openNav` names)                 | 9, 11, 12                                                             | the union                                                                          |
| `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md` §5, `apps/clinical/tests/readme.test.ts` | every plan                               | sections and pins                                                                  |

---

## Task 1 (8·0): Foundations: the mock seam, shared unions and the step-up and two-person parts

**Files:**

- Modify:
  - `apps/platform/lib/api/contract.ts`;
  - `lib/api/mock.ts` and `mock.test.ts`;
  - `lib/errors.ts` and `errors.test.ts`;
  - `lib/activity-labels.ts` and `activity-labels.test.ts`;
  - `components/hospitals/step-up-dialog.tsx` and `step-up-dialog.test.tsx`;
  - `components/hospitals/removal-panel.tsx`, to import `WAITING`;
  - `docs/specs/2026-10-22-platform-operations-design.md` §9: the contract additions from the Rulings.
- Create: `components/shared/two-person.tsx` and `two-person.test.tsx`.

**Interfaces:**

- **`contract.ts`:**

  ```ts
  type TwoPersonKind = "hold_lift" | "retention_shorten" | "triage_on";
  type TwoPersonRequest = {
    id: string;
    kind: TwoPersonKind;
    requested_by: Person;
    requested_at: string;
    reason: string;
    requested_by_you: boolean;
    expires_at: string;
  };
  interface HospitalsClient {
    /* today's PlatformClient methods, unchanged */
  }
  type PlatformClient = HospitalsClient; // 8a/8b/8c each add "& XClient"
  ```

  `ActivityAction` gains `hold_placed`, `hold_edited`, `hold_lift_requested`, `hold_lift_cancelled`, `hold_lift_lapsed`, `hold_lifted`, `hold_lift_undone`, `hold_released`, `jobs_retried`, `jobs_cancelled`, `retention_changed`, `setting_change_requested`, `setting_change_approved`, `setting_change_cancelled`, `setting_change_lapsed`, `clean_up_paused`, `clean_up_resumed`, `triage_switched_off` and `feedback_buffer_cleared`.

- **`mock.ts`:**
  - `export type MockCore = { now(): number; newId(prefix: string): string; read<T>(fn: (m: TeamMember) => T): Promise<T>; write<T>(opts: WriteOpts | undefined, fn: (m: TeamMember) => T | Promise<T>): Promise<T>; log(actor: Person, action: ActivityAction, extra?: { hospital?: Person | null; target?: string | null; detail?: string | null }): void; checkCode(m: TeamMember, body: unknown): Promise<void>; findHospital(id: string): HospitalRecord; hospitals(): HospitalRecord[] }`;
  - `createMockPlatform` builds the core once and returns `{ ...hospitalsPart, ...extensions.map(f => f(core)) }`. In this task the extensions list is empty.
- **`errors.ts`** words, by code:

  | Code               | Words                                                                  |
  | ------------------ | ---------------------------------------------------------------------- |
  | `hospital_removed` | "This hospital has been removed. There is nothing left to hold."       |
  | `removal_started`  | "This hospital's removal has already started. Act outside the app now." |
  | `invalid_range`    | "The end date must be on or after the start date."                     |
  | `expired`          | "This request lapsed after 7 days. Make a new request." (`stale: true`) |
  | `not_ready`        | "No longer ready to switch on." (`stale: true`)                        |
  | `below_minimum`    | "That's shorter than the minimum allowed."                             |

- **`activity-labels.ts`:** `t` is the event's `target`.

  | Action                     | Words                                                     |
  | -------------------------- | --------------------------------------------------------- |
  | `hold_placed`              | `placed legal hold ${t}`                                  |
  | `hold_edited`              | `changed the review date or note on legal hold ${t}`      |
  | `hold_lift_requested`      | `asked to lift legal hold ${t}`                           |
  | `hold_lift_cancelled`      | `cancelled the request to lift legal hold ${t}`           |
  | `hold_lift_lapsed`         | `asked to lift legal hold ${t}; the request lapsed`       |
  | `hold_lifted`              | `approved lifting legal hold ${t}`                        |
  | `hold_lift_undone`         | `undid the lift of legal hold ${t}`                       |
  | `hold_released`            | `released the records under legal hold ${t}`              |
  | `jobs_retried`             | `retried ${t}` (t: "3 failed jobs")                       |
  | `jobs_cancelled`           | `cancelled ${t}`                                          |
  | `retention_changed`        | `changed records retention: ${t}` (t: "Documents to 7 years") |
  | `setting_change_requested` | `asked for a change: ${t}` (t: "Documents to 3 years", "Triage on") |
  | `setting_change_approved`  | `approved a change: ${t}`                                 |
  | `setting_change_cancelled` | `cancelled a change request: ${t}`                        |
  | `setting_change_lapsed`    | `asked for a change that lapsed: ${t}`                    |
  | `clean_up_paused`          | "paused the records clean-up"                             |
  | `clean_up_resumed`         | "resumed the records clean-up"                            |
  | `triage_switched_off`      | "switched triage off"                                     |
  | `feedback_buffer_cleared`  | `cleared ${t} of unapproved learning data`                |

  Each has a target-less fallback. The `detail` field is shown as today.

- **`StepUpDialogProps`** gains:
  - `extra?: { label: string; max: number; hint?: string }`: a required text field, sent back as `StepUpInput.extra`;
  - `hint?: string`: shown under every free-text field;
  - `dismissLabel?: string`, default "Cancel".
- **`two-person.tsx`:**
  - `export const WAITING = "Waiting for a different platform admin to approve"`;
  - `TwoPersonActions({ request, canAct, approveLabel, onApprove, onCancel, busy, offlineProps })` renders:
    - "Requested by {name} · {d MMM} · lapses {d MMM}";
    - **{approveLabel}**, or `WAITING` when `requested_by_you`;
    - **Cancel request**;
    - with `canAct` false, the request line only.

- [ ] **Step 1: Write the failing tests**
  - `mock.test.ts`:
    - "an extension's write refuses an auditor with 403";
    - "an extension's write replays the same Idempotency-Key";
    - "the core's log shows in listActivity".
  - `errors.test.ts`: the six words above, and `expired` and `not_ready` are `stale`.
  - `activity-labels.test.ts`: each new action with and without a target.
  - `step-up-dialog.test.tsx`:
    - "extra is required and sent back as extra";
    - "the hint shows under every free-text field";
    - "dismissLabel names the safe button".
  - `two-person.test.tsx`:
    - "the requester sees Waiting for a different platform admin to approve and no Approve";
    - "another admin sees Approve and Cancel request";
    - "an auditor sees the request line only";
    - "the lapse date shows".
- [ ] **Step 2: Implement.** Existing `mock.test.ts` and `removal.test.tsx` pass unchanged.
- [ ] **Step 3: Run** the platform tests, lint and typecheck (remote).
- [ ] **Step 4: Commit:** "Prepare the platform app for legal holds and operations". Open the foundations PR.

---

## Plan 8a: Legal holds (PR `agent/plan-8a-legal-holds`)

### Task 2: The holds contract, sample data, mock, live client and proxy

**Files:**

- Create:
  - `lib/api/holds-contract.ts`;
  - `holds-fixtures.ts`;
  - `mock-holds.ts` and `mock-holds.test.ts`.
- Modify:
  - `lib/api/contract.ts`: `& HoldsClient`; `HospitalSummary.legal_holds_active: number`; `Hospital.legal_holds: HoldShort[]`;
  - `lib/api/fixtures.ts`: `HospitalRecord.legal_holds: number` becomes `holds: LegalHold[]`, seeded from `holds-fixtures.ts`;
  - `lib/api/mock.ts`: `blocksOf` and `checks.legal_holds` count `keepsRecords(hold, now)`; the summary carries `legal_holds_active`; the extension is registered;
  - `lib/api/live.ts` and `live.test.ts`;
  - `app/api/v1/[...path]/route.ts` and `proxy.test.ts`.

**Interfaces (`holds-contract.ts`):**

```ts
type HoldReason =
  | "court_case"
  | "regulator"
  | "complaint"
  | "investigation"
  | "other";
type HoldStatus = "active" | "review_due" | "lift_requested" | "lifted";
type HoldStatusFilter = "open" | HoldStatus | "all";
type LiftReason = "case_closed" | "withdrawn" | "mistake" | "other";
type HoldLift = TwoPersonRequest & {
  kind: "hold_lift";
  reason: LiftReason;
  note: string | null;
  authority: string;
  records_due: number;
  due_after: string;
  approved_by: Person | null;
  approved_at: string | null;
  released_on: string | null;
};
type LegalHold = {
  id: string;
  hospital: Person;
  scope: { from: string | null; to: string | null };
  reason: HoldReason;
  reference: string;
  asked_by: string;
  note: string | null;
  placed_by: Person;
  placed_at: string;
  review_on: string;
  status: HoldStatus;
  lift: HoldLift | null;
  stopped_removal: boolean;
  version: number;
};
type HoldEvent = {
  at: string;
  actor: Person;
  action:
    | "placed"
    | "edited"
    | "lift_requested"
    | "lift_cancelled"
    | "lift_lapsed"
    | "lifted"
    | "lift_undone"
    | "released";
  detail: string | null;
};
type LegalHoldDetail = LegalHold & { history: HoldEvent[] };
type HoldShort = Pick<
  LegalHold,
  "id" | "scope" | "reference" | "status" | "review_on"
>;
type HoldQuery = {
  status?: HoldStatusFilter;
  hospital?: string;
  q?: string;
  cursor?: string;
};
type PlaceHoldIn = {
  hospital_id: string;
  from?: string;
  to?: string;
  reason: HoldReason;
  note?: string;
  reference: string;
  asked_by: string;
  review_on: string;
} & StepUp;
interface HoldsClient {
  listHolds(q: HoldQuery): Promise<{ holds: LegalHold[]; next_cursor: string | null }>;
  getHold(id: string): Promise<LegalHoldDetail>;
  placeHold(body: PlaceHoldIn, opts: WriteOpts): Promise<LegalHoldDetail>;
  editHold(id: string, body: { review_on?: string; note?: string | null; version: number }, opts: WriteOpts): Promise<LegalHoldDetail>;
  requestLift(id: string, body: { reason: LiftReason; note?: string; authority: string } & StepUp, opts: WriteOpts): Promise<LegalHoldDetail>;
  approveLift(id: string, body: StepUp, opts: WriteOpts): Promise<LegalHoldDetail>;
  cancelLift(id: string, opts: WriteOpts): Promise<LegalHoldDetail>;
  undoLift(id: string, body: StepUp, opts: WriteOpts): Promise<LegalHoldDetail>;
}
/** Active, review due, lift requested, or lifted before released_on. */
function keepsRecords(h: LegalHold, now: number): boolean;
export const HOLD_GRACE_DAYS = 7;
export const LAPSE_DAYS = 7;
export const REVIEW_MONTHS = 6;
```

**Proxy shapes and live paths:**

| Method | Path                                         |
| ------ | -------------------------------------------- |
| GET    | `platform/legal-holds`                       |
| POST   | `platform/legal-holds`                       |
| GET    | `platform/legal-holds/{id}`                  |
| PATCH  | `platform/legal-holds/{id}`                  |
| POST   | `platform/legal-holds/{id}/lift`             |
| POST   | `platform/legal-holds/{id}/lift/approve`     |
| POST   | `platform/legal-holds/{id}/lift/cancel`      |
| POST   | `platform/legal-holds/{id}/lift/undo`        |

**Mock rules:**

- **Places:** a write with step-up (`checkCode`).
  - A Removed hospital gives 409 `hospital_removed`.
  - `to` before `from` gives 422 `invalid_range`.
  - A field over its limit, a missing reference or asked-by, or `other` without a note gives 422 `invalid`.
  - On a `removal_pending` hospital, the removal's `blocking` gains `legal_hold`.
  - On a `removal_scheduled` hospital still inside the mock's 60-second delay, the hospital goes back to `removal_pending` (approval cleared, blocked), and the hold has `stopped_removal: true`.
  - The mock option `removalStarted: string[]` (hospital ids) gives 409 `removal_started`.
- **Edits:**
  - `review_on` and `note` only, against `version`, else 409 `conflict`;
  - any other key gives 422 `invalid`;
  - a Lifted hold gives 409 `conflict`.
- **Lift:**
  - **Request:** step-up; `authority` 1–200 characters; status `lift_requested`.
    - `records_due` is a fixed per-hospital sample count, and `due_after` is the next clean-up.
    - `expires_at` is `requested_at` + 7 days.
  - **Approve:**
    - the requester gets 409 `same_person`;
    - past `expires_at` it gives 409 `expired`;
    - on success the hold is `lifted`, with `released_on` = approval + 7 days.
  - **Cancel:** any platform admin.
  - **Undo:** before `released_on`, it puts the hold back to `active` or `review_due`; after, it gives 409 `conflict`.
- **`settle(now)`** runs on every read:
  - `review_on` reached makes `active` into `review_due`;
  - a lapsed request goes back with history `lift_lapsed` and an Activity event `hold_lift_lapsed`;
  - passing `released_on` writes history `released` and an Activity event `hold_released`.
- **Activity** for every event: `target` is the reference, `detail` the reason's words, never the note.
- **Lists:**
  - `listHolds`: newest first; filters `status` (default `open`), `hospital` and `q` (a reference substring, case-insensitive);
  - `getHospital(...).legal_holds` lists the holds that keep records, in short form;
  - `listHospitals` items carry `legal_holds_active`.

**Fixtures** (`holds-fixtures.ts`; the people are Ada and Tunde):

| id        | Hospital      | Scope                    | Reason        | Reference       | State                                                                                                                   |
| --------- | ------------- | ------------------------ | ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `hold_hv` | Harbour View  | All records              | court_case    | `HC/2026/0412`  | active; placed by Ada 40 days ago. It blocks the existing Removal pending request                                        |
| `hold_ng` | Northgate     | 1 Jan 2025 – 30 Jun 2025 | regulator     | `REG-INSP-2291` | review_due (review_on yesterday)                                                                                         |
| `hold_rc` | Riverside     | All records              | complaint     | `CMP-0193`      | lift_requested by Tunde 2 days ago; authority "Counsel's letter 14 Oct 2026, ref ABC-123"; `records_due` 1240            |
| `hold_wf` | Westfield     | from 1 Mar 2024, until lifted | investigation | `INV-77`   | lifted 3 days ago (requested by Tunde, approved by Ada); `released_on` in 4 days                                         |
| `hold_hh` | Havana        | All records              | other         | `BRD-2026-03`   | lifted 40 days ago and released; note "Board request pending legal review"                                               |

Southpoint (Removal pending, nothing blocking) keeps no hold, so the demo and e2e can place one there.

- [ ] **Step 1: Write the failing tests**
  - `mock-holds.test.ts`:
    - "open is the default filter: active, review due and lift requested";
    - "keepsRecords counts lifted holds until released_on";
    - "placing on Southpoint blocks its removal with legal_holds 1" (Review Focus 1);
    - "placing on a scheduled removal returns it to Removal pending and sets stopped_removal" (Review Focus 1);
    - "removalStarted refuses with removal_started" (Review Focus 1);
    - "placing on a removed hospital is hospital_removed";
    - "to before from is invalid_range";
    - "a reference over 100 characters, or an asked-by over 200, is invalid";
    - "only review_on and note can be edited; a stale version is conflict";
    - "an auditor can't place, edit or lift";
    - "every step-up action refuses a wrong code with mfa_invalid";
    - "the requester's approval is same_person" (Review Focus 2);
    - "an approval after 7 days is expired, and the hold is back to active with lift_lapsed in its history" (Review Focus 3);
    - "approve sets released_on 7 days on; undo before then restores active; after, it's conflict";
    - "passing released_on writes hold_released";
    - "Activity carries the reference and never the note";
    - "hospitals carry legal_holds_active and legal_holds".
  - `live.test.ts`: the eight methods use the paths and methods above, with an Idempotency-Key on writes and `status`, `hospital`, `q` and `cursor` in the list query.
  - `proxy.test.ts`:
    - the eight shapes pass;
    - auditor writes to each are refused before upstream;
    - `platform/legal-holds/x/lift/approve/extra` is 404.
- [ ] **Step 2: Implement.** The existing removal tests and e2e still pass: Harbour View's count is now derived from `hold_hv`.
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the legal holds contract, sample data and live client".

---

### Task 3: The Legal holds page and Place a hold

**Files:**

- Create:
  - `lib/holds/labels.ts` and `labels.test.ts`;
  - `lib/holds/rules.ts` and `rules.test.ts`;
  - `lib/queries/holds.ts`;
  - `components/holds/{holds-view,holds-table,holds-cards,hold-status,place-hold-dialog,hospital-picker}.tsx` and their tests;
  - `app/(app)/legal-holds/page.tsx`.
- Modify:
  - `components/shell/nav.ts`: **Legal holds**, `/legal-holds`, the `Scale` icon, after Analytics;
  - `lib/queries/keys.ts`: a `holds` root;
  - `tests/e2e/helpers.ts`: `openNav` gains "Legal holds".

**Interfaces:**

- **`labels.ts`:**
  - `holdReasonLabel(r)`: Court case or claim · Regulator or inspector request · Complaint · Internal investigation · Other;
  - `liftReasonLabel(r)`: The case is closed · The request was withdrawn · Placed by mistake · Other;
  - `holdStatusLabel(s)`: Active · Review due · Lift requested · Lifted;
  - `HOLD_HINT = "Don't include patient names, hospital numbers or dates of birth."`.
- **`rules.ts`:**
  - `scopeLabel(scope)` (the three forms in Rulings);
  - `liftedLine(h, now)` gives "Lifted · records released on {d MMM yyyy}" before `released_on`, else "Lifted by {name} · {d MMM yyyy}";
  - `defaultReviewOn(today: string): string` (+6 months);
  - `validatePlace(f: PlaceForm): Partial<Record<keyof PlaceForm, string>>`, with the messages "Choose a hospital.", "Choose a reason.", "Add a note.", "Enter the reference.", "Enter who asked for it.", "The end date must be on or after the start date.", "Choose a review date after today." and "Keep it under {n} characters.";
  - `type PlaceForm = { hospital: Person | null; scope: "all" | "dates"; from: string; to: string; reason: HoldReason | ""; reference: string; asked_by: string; note: string; review_on: string }`.
- **Hooks:**
  - `useHolds(filter: HoldQuery)`: infinite, with Load more;
  - `useHold(id)`;
  - `usePlaceHold()`, keyed with `gcTime: 0`. It invalidates `holds`, `hospitals` and `activity`.
- **`PlaceHoldDialog({ open, hospital?: Person, onClose, onPlaced(hold) })`:**
  - **The form step** (Dialog, or Sheet on phones) has these fields:
    - **Hospital:** `HospitalPicker`, searching name or short code through `useHospitals({q})` and leaving Removed out; read-only when given;
    - **What it covers:** All records, or From–To;
    - **Reason:** radios;
    - **Reference**, **Asked for by**, **Note** and **Review date**.

    `HOLD_HINT` sits under each free-text field. **Continue** validates.
  - **The confirm step** is `StepUpDialog`:
    - title "Place a legal hold on {hospital}?";
    - intro: the scope line and "Records it covers are kept until the hold is lifted.";
    - confirm label **Place hold**.

    Refusals show with `platformError`; `removal_started` and `hospital_removed` close the confirm and show on the form.
- **The page `HoldsView`:**
  - the header reads "Legal holds", with **Place a hold** for platform admins;
  - the filters are a status select (Open, Active, Review due, Lift requested, Lifted, All), a hospital select and a reference search, all synced to the URL query;
  - the table has the columns Hospital · What it covers · Reason · Reference · Placed · Review date · Status. Each row links to `/legal-holds/{id}`;
  - Review due shows the `CalendarClock` icon with the words;
  - the states are as in Global Constraints. Empty reads "No legal holds".
- **`HoldStatus({ hold })`:** the icon and words, with Lifted using `liftedLine`.

- [ ] **Step 1: Write the failing tests**
  - `labels.test.ts` and `rules.test.ts`:
    - the three scope forms;
    - `liftedLine` before and after `released_on`;
    - `defaultReviewOn("2026-10-22")` is `"2027-04-22"`;
    - each `validatePlace` message;
    - "Other needs a note".
  - `holds-view.test.tsx`:
    - "opens on Open: Harbour View, Northgate and Riverside, not Westfield or Havana";
    - "Lifted shows Westfield's 'Lifted · records released on …' and Havana's 'Lifted by Ada Bakare · …'";
    - "the hospital filter and reference search narrow the list and sit in the URL";
    - "Review due shows the word and an icon";
    - "an auditor sees no Place a hold";
    - "Couldn't load legal holds with Try again";
    - "offline disables Place a hold with the reason";
    - "at phone width rows are cards".
  - `place-hold-dialog.test.tsx`:
    - "every free-text field shows the hint";
    - "Continue with empty fields shows each message and sends nothing";
    - "dates out of order show the range message";
    - "the confirm step asks for the code and places the hold, then onPlaced";
    - "a wrong code shows That code didn't work";
    - "removal_started shows This hospital's removal has already started. Act outside the app now." (Review Focus 1);
    - "the picker leaves out Removed hospitals".
  - `app-shell.test.tsx`: "the sidebar shows Legal holds after Analytics".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Legal holds page and placing a hold".

---

### Task 4: A hold's page: edit, lift (two people), grace period and undo

**Files:**

- Create:
  - `components/holds/{hold-view,hold-facts,hold-history,edit-hold-dialog,lift-panel}.tsx` and their tests;
  - `app/(app)/legal-holds/[id]/page.tsx`.
- Modify: `lib/queries/holds.ts`, adding `useEditHold(id)`, `useRequestLift(id)`, `useApproveLift(id)` (both `gcTime: 0`), `useCancelLift(id)` and `useUndoLift(id)`. Each writes the reply into `holdKey(id)` and invalidates the `holds`, `hospitals` and `activity` lists.

**Interfaces:**

- **`HoldView({ id })`:**
  - the TopBar shows the reference, with the hospital beneath;
  - `HoldFacts`: hospital (linked), what it covers, reason, reference, asked for by, note, placed by and date, review date, status;
  - after placing, it says "Active · placed by {name} · {date}";
  - with `stopped_removal`, a warn banner says "This hold stopped {hospital}'s removal. It is back to Removal pending and blocked.";
  - a 404 shows "This was removed or no longer exists." with Back to Legal holds.
- **`EditHoldDialog`** (platform admins; not on Lifted):
  - review date and note (with the hint, 500 characters), sending `version`;
  - 409 `conflict` gives "Changed by someone else" and a reload.
- **`LiftPanel({ hold })`:**
  - **Active or Review due:** **Request lift** opens `StepUpDialog`:
    - lift reasons, with `noteFor: "other"`;
    - `extra = { label: "Authority for lifting", max: 200, hint: "For example: Counsel's letter 14 Oct 2026, ref ABC-123" }`;
    - `hint: HOLD_HINT`;
    - confirm label **Request lift**.
  - **Lift requested:**
    - the text "The hold stays active until a different platform admin approves.";
    - the effect: "When this hold is lifted, records it alone was keeping become due for the daily clean-up. About {records_due} records are already past their retention period and would be deleted in the clean-up after {due_after}.";
    - `TwoPersonActions`. Approve opens `StepUpDialog`, with the effect as the intro and the confirm label **Approve lift** in the danger tone.
  - **Lifted before `released_on`:** `liftedLine`, plus **Undo lift**, which opens `StepUpDialog` ("Put the hold back? Its records stay kept.").
  - **Released:** the line only.
  - **Refusals:** `expired`, `same_person` and `conflict` show their words and reload the hold.
- **`HoldHistory`:** events newest first, with the actor, the date and the words. History details show the reason or authority, never the note.

- [ ] **Step 1: Write the failing tests**
  - `hold-view.test.tsx`:
    - "shows every field, including the note, to an auditor, with no controls";
    - "stopped_removal shows the banner";
    - "edit changes the review date; scope, reason and reference have no edit control";
    - "a stale edit shows Changed by someone else and reloads".
  - `lift-panel.test.tsx`:
    - "Request lift needs a reason, the authority and the code; Other needs a note";
    - "the hint shows under the note and the authority";
    - "Riverside, as Tunde, shows Waiting for a different platform admin to approve and no Approve" (Review Focus 2);
    - "Riverside, as Ada, shows the effect with 1240 records, then Approve lift with the code makes it 'Lifted · records released on …'";
    - "an approval refused as same_person shows A different platform admin must approve this." (Review Focus 2);
    - "an approval refused as expired shows This request lapsed after 7 days. Make a new request. and reloads" (Review Focus 3);
    - "either admin can Cancel request";
    - "Westfield shows Undo lift; undo with the code makes it Active";
    - "Havana shows no lift controls";
    - "offline disables every action with the reason".
  - `hold-history.test.tsx`: "events newest first, and the note never appears".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add a hold's page: edit, two-person lift and undo".

---

### Task 5: Holds on the hospital pages, the removal link, end to end and docs

**Files:**

- Create:
  - `components/holds/hospital-holds-section.tsx` and its test;
  - `tests/e2e/holds.spec.ts`.
- Modify:
  - `components/hospitals/hospital-view.tsx`: the section after `RemovalPanel`;
  - `removal-panel.tsx` and `removal.test.tsx`;
  - `hospital-table.tsx`, `hospital-cards.tsx` and `hospitals-view.test.tsx`;
  - `tests/e2e/removal.spec.ts`: the one changed line;
  - `README.md`, `apps/clinical/tests/readme.test.ts`, `ARCHITECTURE.md` §5 and `CHANGELOG.md`.

**Interfaces:**

- **`HospitalHoldsSection({ hospital })`:**
  - the title "Legal holds";
  - each hold in `hospital.legal_holds`: the scope, reference and status, linked;
  - "No legal holds" when there are none;
  - **Place a hold** (platform admins, and not when Removed). It opens `PlaceHoldDialog` with the hospital filled in and goes to the new hold on success.
- **The removal panel:**
  - `HOLDS_LATER` is removed;
  - when `legal_holds > 0`, the holds check line ends with " · " and a **View holds** link to `/legal-holds?hospital={id}&status=all`;
  - the approve button's `aria-describedby` drops `removal-holds-later`.
- **The hospitals list:** a "Hold" chip with the `Scale` icon beside the name when `legal_holds_active > 0`, on both the table and the cards.

- [ ] **Step 1: Write the failing tests**
  - `hospital-holds-section.test.tsx`:
    - "Harbour View lists HC/2026/0412 as Active, linked";
    - "Place a hold opens with the hospital filled in";
    - "a removed hospital offers no Place a hold";
    - "an auditor sees the holds and no button".
  - `removal.test.tsx`:
    - "Harbour View reads '1 legal hold is active · View holds', and the link filters by hospital";
    - "the later-release line is gone".
  - `hospitals-view.test.tsx`: "Harbour View, Northgate, Riverside and Westfield show Hold; Havana and Southpoint don't".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Write the e2e tests** (`holds.spec.ts`), on desktop and mobile, with `expectNoStorage` after each test and the CSP check on `/legal-holds`:
  - "Legal holds opens on Open holds; Lifted shows the grace period";
  - "Ada places a hold on Southpoint from its page, and its removal shows 1 legal hold is active · View holds";
  - "Tunde asked to lift Riverside's hold; Ada approves with her code and sees Lifted · records released on …";
  - "Ada undoes Westfield's lift";
  - "the auditor sees holds, notes and history but no controls";
  - "Activity shows the reference but not the note";
  - "phone: the list as cards, open a hold, back".

  In `removal.spec.ts`, the legal-hold test now asserts the View holds link.
- [ ] **Step 4: Write the docs.**
  - The README platform section gains "**Legal holds.**": what a hold does, the sample holds, and the two-person lift. Pin it with `"documents the legal holds demo"`, matching `/\*\*Legal holds\.\*\*/`.
  - ARCHITECTURE §5: the sidebar line.
  - CHANGELOG, under Unreleased › Added.
- [ ] **Step 5: Verify** the full suite: `npm test`, `npm run e2e` (both apps), lint, `format:check`, typecheck, build, `check:bundle` and `check:platform-marker`.
- [ ] **Step 6: Commit:** "Show legal holds on hospitals and in removal; test end to end". Open the 8a PR.

---

## Plan 8b: System health and failed jobs (PR `agent/plan-8b-system`)

### Task 6: The operations contract, sample data, mock, live client and proxy

**Files:**

- Create:
  - `lib/api/ops-contract.ts`;
  - `ops-fixtures.ts`;
  - `mock-ops.ts` and `mock-ops.test.ts`.
- Modify:
  - `lib/api/contract.ts` (`& OpsClient`), `mock.ts` (register), `live.ts` and `live.test.ts`;
  - `app/api/v1/[...path]/route.ts` and `proxy.test.ts`.

**Interfaces (`ops-contract.ts`):**

```ts
type PartStatus = "ok" | "slow" | "problem";
type PartKey =
  "app" | "workers" | "evidence" | "documents" | "guidelines" | "clean_up";
type StepKey = "privacy" | "guidelines" | "answer" | "evidence";
type ErrorKind = "timeout" | "unreachable" | "unreadable" | "invalid" | "other";
type Timing = { p50_ms: number; p95_ms: number };
type TimingBlock = { overall: Timing; steps: ({ step: StepKey } & Timing)[] };
type HealthOut = {
  updated_at: string;
  overall: PartStatus;
  parts: { key: PartKey; status: PartStatus; since: string }[];
  queue: { waiting: number; oldest_wait_s: number | null };
  failed_jobs: { now: number; last_24h: number };
  timing: { last_hour: TimingBlock; last_24h: TimingBlock };
  errors: { kind: ErrorKind; last_hour: number; last_24h: number }[];
  versions: { part: PartKey; label: string }[];
  triage: { enabled: boolean };
  clean_up: {
    last_run_at: string | null;
    ok: boolean | null;
    paused: boolean;
    paused_by: Person | null;
    paused_at: string | null;
  };
};
type JobType =
  | "run_query"
  | "submit_feedback"
  | "approve_correction"
  | "ingest_document"
  | "run_triage"
  | "kb_search"
  | "feedback_buffer_reset"
  | "retention_purge";
type JobStatus = "failed" | "retrying" | "retried" | "cancelled";
type Job = {
  id: string;
  type: JobType;
  hospital: Person | null;
  created_at: string;
  failed_at: string;
  attempts: number;
  kind: ErrorKind;
  status: JobStatus;
  cancelled_by: Person | null;
  cancelled_at: string | null;
};
type JobQuery = {
  status?: JobStatus | "all";
  type?: JobType;
  hospital?: string;
  kind?: ErrorKind;
  cursor?: string;
};
type CancelReason = "no_longer_needed" | "cant_succeed" | "other";
interface OpsClient {
  getHealth(opts?: { background?: boolean }): Promise<HealthOut>;
  listJobs(q: JobQuery): Promise<{ jobs: Job[]; next_cursor: string | null }>;
  retryJobs(body: { ids: string[] }, opts: WriteOpts): Promise<{ retried: string[]; skipped: string[] }>;
  cancelJobs(body: { ids: string[]; reason: CancelReason; note?: string } & StepUp, opts: WriteOpts): Promise<{ cancelled: string[]; skipped: string[] }>;
}
export const JOBS_MAX = 50;
export const OLD_QUESTION_MS = 24 * 60 * 60_000;
```

**Proxy shapes:**

- `GET platform/health`;
- `GET platform/jobs`;
- `POST platform/jobs/retry`;
- `POST platform/jobs/cancel`.

The proxy also gains a rule: a GET with `X-MHAI-Background: 1` skips `touchSession`; every other check runs as before. `live.ts` sends that header when `getHealth` is called with `background: true`.

**Mock rules:**

- **Health modes:** `opts.health` is one of `"normal" | "slow" | "problem" | "stale" | "unavailable"`, default `"normal"`. The exported `setDemoHealth(mode)` changes the running demo's mode.
  - `slow` makes the workers and evidence `slow`, with longer timings;
  - `problem` makes documents `problem`, with unreadable and timeout errors;
  - `stale` returns `updated_at` 5 minutes old;
  - `unavailable` throws 503.
  - `failed_jobs.now` matches the job list.
- **Jobs:** the fixtures hold one job of every type, and every error kind at least once:
  - an old question, `run_query` first tried 2 days ago, at Northgate;
  - two platform jobs (hospital `null`): `retention_purge` and `feedback_buffer_reset`;
  - one `retried` and one `cancelled` (by Tunde) job;
  - an `ingest_document` · `unreadable` job that fails again on retry (attempts + 1, back to `failed`).
- **Retry:**
  - 1–50 ids, else 422 `invalid`;
  - ids not `failed` go in `skipped`;
  - the rest become `retried`, except the unreadable document;
  - no step-up;
  - it logs `jobs_retried`.
- **Cancel:** step-up; 1–50 ids; `other` needs a note; jobs not `failed` are skipped; it logs `jobs_cancelled`.
- **Auditors** may read both, but every write is refused.

- [ ] **Step 1: Write the failing tests**
  - `mock-ops.test.ts`:
    - "each health mode gives its statuses";
    - "stale is 5 minutes old";
    - "unavailable is 503";
    - "health never names a hospital or person" (scan the JSON for fixture names);
    - "jobs default to failed, newest first; the filters narrow";
    - "retry of 51 is invalid";
    - "retry without a code works";
    - "retry skips a job retried meanwhile and returns both lists" (Review Focus 5);
    - "the unreadable document comes back failed with one more attempt";
    - "cancel needs the code; Other needs a note; skipped as for retry" (Review Focus 5);
    - "an auditor can read but not retry or cancel";
    - "retry and cancel log activity".
  - `live.test.ts`:
    - the four paths;
    - the filters in the query;
    - Idempotency-Key on writes;
    - `X-MHAI-Background: 1` only for `getHealth({background: true})`.
  - `proxy.test.ts`:
    - the four shapes pass;
    - auditor POSTs are refused;
    - "a background GET leaves the session's lastSeenAt unchanged; a normal GET moves it" (Review Focus 4);
    - "the background header on a POST still touches".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the health and failed jobs contract, sample data and live client".

---

### Task 7: The System page and the Health tab

**Files:**

- Create:
  - `lib/ops/labels.ts`, `lib/ops/health.ts` and their tests;
  - `lib/queries/ops.ts`;
  - `components/system/{system-tabs,health-view,overall-status,parts-list,timing-block,errors-block,versions-block,demo-health-switch}.tsx` and their tests;
  - `app/(app)/system/layout.tsx` (TopBar "System", then `SystemTabs`);
  - `system/page.tsx`, which redirects to `/system/health`;
  - `system/health/page.tsx`.
- Modify:
  - `components/shell/nav.ts`: **System**, `/system`, the `HeartPulse` icon, after Legal holds. It is active for every `/system/*`;
  - `lib/queries/keys.ts`: an `ops` root;
  - `tests/e2e/helpers.ts`: `openNav` gains "System".

**Interfaces:**

- **`labels.ts`:**
  - `partLabel`: Sign-in and the app · Answering questions · Checking evidence · Reading documents · Finding guidelines · Records clean-up;
  - `stepLabel`: Protecting patient privacy · Finding guidelines · Writing the answer · Checking evidence;
  - `errorKindLabel`: Took too long · Couldn't reach a service · Unreadable document · Request refused as invalid · Other;
  - `statusWords`: `ok` gives Working normally, `slow` gives Slower than usual, `problem` gives Having problems; there is also `COULDNT_CHECK = "Couldn't check"`;
  - `jobTypeLabel` and `jobStatusLabel` (used by Task 8): Answer a question · Save feedback · Approve a correction · Read a document · Triage · Search guidelines · Reset learning data · Records clean-up, and Failed · Retrying · Retried · Cancelled.
- **`health.ts`:**
  - `export const STALE_MS = 120_000`;
  - `readHealth(out: HealthOut | undefined, { failed, now }: { failed: boolean; now: number }): HealthState`:
    - `HealthState = { overall: PartStatus | "couldnt_check"; lastGood: string | null; blocks: { parts: Block<...>; queue: Block<...>; failedJobs: Block<...>; timing: Block<...>; errors: Block<...>; versions: Block<...> } }`;
    - each `Block<T> = { status: "ok"; value: T } | { status: "failed" }`;
    - a failed call, a stale `updated_at` (`now − updated_at > STALE_MS`) or a missing `out` gives `couldnt_check`, with every block failed and `lastGood` = `out?.updated_at ?? null`;
    - a block whose shape is wrong, or that holds an unknown enum value, fails alone.
  - `answerTimeLine(t: Timing): string` gives "Half within {x} s · 95 in 100 within {y} s". Below 10 s it shows one decimal ("2.4"); from 10 s it shows whole seconds;
  - `waitLabel(s: number): string` gives "{n} s", "{n} min" or "{h} h {m} min".
- **Hooks:**
  - `useHealth()`: `refetchInterval` is 30 000 while `useTabVisible()` and `useOnline()`, else `false`, with `refetchIntervalInBackground: false`. It calls `getHealth({ background: true })`. A refetch on becoming visible is allowed, and the stale rule covers the first paint;
  - `refreshHealth()` (Refresh now) uses `background: false`.
- **`HealthView`:**
  - `OverallStatus` with an icon (`CheckCircle2`, `Clock`, `OctagonAlert`, `CircleHelp`) and the words. Couldn't check adds "Last good reading {time}", or "No reading yet";
  - "Updated {time}" from the server, plus **Refresh now**;
  - the parts list: one row each, with the words and "since {time}". Records clean-up shows "Last run {time} · finished" or "didn't finish", and while paused, "Records clean-up paused by {name} since {date}". Triage shows "On" or "Off" (Off is not a problem);
  - "Questions waiting: {n} · oldest {waitLabel}";
  - "Failed jobs: {now} · {last_24h} new in the last 24 hours", with a **View failed jobs** link;
  - the answer times for the last hour and the last 24 hours, overall and by step;
  - the recent errors, by kind, for the last hour and the last 24 hours;
  - the versions, collapsed (`<details>`);
  - each block's own "Couldn't load {block}" with Try again.
- **`DemoHealthSwitch`:** rendered only when `process.env.NEXT_PUBLIC_USE_MOCK === "true"`; a labelled radio group "Sample data" with Normal, Slower and Problems.
- **`SystemTabs`:** links with `aria-current="page"` for **Health** and **Failed jobs**.

- [ ] **Step 1: Write the failing tests**
  - `health.test.ts`:
    - "ok, slow and problem map to their words";
    - "a failed call is couldnt_check with every block failed and lastGood kept";
    - "a reading 2 min 1 s old is couldnt_check" (Review Focus 4);
    - "one at 1 min 59 s is shown";
    - "an unknown part key fails the parts block alone";
    - "an unknown error kind fails the errors block alone";
    - `answerTimeLine({p50_ms: 2400, p95_ms: 11800})` is "Half within 2.4 s · 95 in 100 within 12 s";
    - the `waitLabel` cases.
  - `health-view.test.tsx`:
    - "normal shows Working normally with an icon, every part, the queue, failed jobs, times, errors";
    - "problem shows Having problems and Reading documents · Having problems";
    - "stale shows Couldn't check with Last good reading and no figures" (Review Focus 4);
    - "unavailable shows Couldn't check and No reading yet, never zeros";
    - "it polls every 30 s while visible and not while hidden" (fake timers, `visibilitychange`) (Review Focus 4);
    - "polls send background; Refresh now doesn't";
    - "the demo switch shows only in the demo and changes the status";
    - "versions are collapsed";
    - "an auditor sees the same page".
  - `app-shell.test.tsx`: "System after Legal holds; active on /system/jobs".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the System page and the Health tab".

---

### Task 8: The Failed jobs tab: list, retry and cancel

**Files:**

- Create:
  - `lib/ops/jobs.ts` and `jobs.test.ts`;
  - `components/system/{jobs-view,jobs-table,jobs-cards,retry-dialog,cancel-jobs-dialog}.tsx` and their tests;
  - `app/(app)/system/jobs/page.tsx`.
- Modify: `lib/queries/ops.ts`, adding `useJobs(filter)` (infinite), `useRetryJobs()` and `useCancelJobs()` (`gcTime: 0`). Both writes invalidate `ops` and `activity`.

**Interfaces:**

- **`jobs.ts`:**
  - `oldQuestions(jobs: Job[], now: number): number` counts `run_query` jobs whose `created_at` is older than `OLD_QUESTION_MS`;
  - `cancelEffects(jobs: Job[]): string[]` gives the distinct effect lines, in this order:
    - `run_query`: "The clinician will see 'Couldn't complete' and can ask again.";
    - `ingest_document`: "The document won't be read; the clinician can upload it again.";
    - `approve_correction`: "The correction stays waiting and can be approved again.";
    - `retention_purge`: "The records clean-up runs again tomorrow. Nothing is deleted.";
    - other types: "The work won't be done. Nothing is deleted.";
  - `resultLine(done: number, skipped: number, verb: "Retried" | "Cancelled"): string` gives "{verb} {n} jobs", plus " · {m} were already retried or finished" when any were skipped.
- **`JobsView`:**
  - **Filters** (in the URL): status (Failed by default, Retrying, Retried, Cancelled, All), what, hospital, why;
  - **Rows**, newest first, with the columns What · Hospital (or "Platform") · Failed · First tried · Attempts · Why · Reference (with **Copy**) · Status. Cancelled reads "Cancelled by {name} · {date}";
  - **Selection:**
    - only Failed rows have a checkbox, for platform admins;
    - "Select all shown" takes the first 50 Failed rows;
    - more than 50 is refused with "Choose up to 50 at a time.";
  - **The bar:** "{n} chosen", with **Retry** and **Cancel jobs**;
  - **Copy** puts the id on the clipboard and says "Reference copied".
- **`RetryDialog({ jobs, onClose })`:**
  - the title "Retry {n} jobs?";
  - when `oldQuestions > 0`, the warning, with initial focus on **Don't retry**. Otherwise **Retry** has the focus;
  - the success toast is `resultLine`; the selection clears and the rows refetch.
- **`CancelJobsDialog`:** `StepUpDialog` with:
  - the title "Cancel {n} jobs?";
  - the intro: the `cancelEffects` lines and "Cancelled jobs are kept as a record.";
  - the reasons No longer needed · Can't succeed · Other, with `noteFor: "other"`;
  - `dismissLabel` "Keep", and the confirm label **Cancel jobs** in the danger tone.

- [ ] **Step 1: Write the failing tests**
  - `jobs.test.ts`: `oldQuestions` at 23 h 59 min and at 24 h 1 min; `cancelEffects` order and dedup; `resultLine` with and without skipped jobs.
  - `jobs-view.test.tsx`:
    - "opens on Failed, newest first, with Platform for platform work";
    - "never shows a message, subject or user";
    - "Copy copies the reference";
    - "the filters narrow and sit in the URL";
    - "Select all shown stops at 50";
    - "an auditor sees no checkboxes or actions";
    - "No failed jobs";
    - "Couldn't load failed jobs with Try again";
    - "offline disables Retry and Cancel jobs with the reason".
  - `retry-dialog.test.tsx`:
    - "with the old Northgate question it warns and focuses Don't retry";
    - "Don't retry sends nothing";
    - "retry asks for no code";
    - "a partly skipped result says Retried 2 jobs · 1 were already retried or finished and refetches" (Review Focus 5).
  - `cancel-jobs-dialog.test.tsx`:
    - "shows each chosen type's effect";
    - "Keep is the safe button";
    - "it needs a reason and the code";
    - "a wrong code shows That code didn't work".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Failed jobs tab with retry and cancel".

---

### Task 9: System end to end and docs

**Files:**

- Create: `tests/e2e/system.spec.ts`.
- Modify: `README.md`, `apps/clinical/tests/readme.test.ts`, `ARCHITECTURE.md` §5 and `CHANGELOG.md`.

- [ ] **Step 1: Write the e2e tests** on desktop and mobile, with `expectNoStorage` after each test and the CSP check on `/system/health` and `/system/jobs`:
  - "System opens on Health: Working normally, the parts, times and errors";
  - "the demo switch to Problems shows Having problems";
  - "View failed jobs opens the Failed jobs tab";
  - "Ada retries the old question after the warning";
  - "Ada cancels a job with a reason and her code; it shows Cancelled by Ada Bakare";
  - "the auditor sees both tabs and no actions";
  - "phone: jobs as cards with 44 px controls".
- [ ] **Step 2: Write the docs.**
  - The README gains "**System.**": what Health and Failed jobs show, and the demo switch. Pin it with `"documents the platform system demo"`, matching `/\*\*System\.\*\*/`.
  - ARCHITECTURE §5: the sidebar line.
  - CHANGELOG.
- [ ] **Step 3: Verify** the full suite, as in Task 5 Step 5.
- [ ] **Step 4: Commit:** "Test System end to end; document the demo". Open the 8b PR.

---

## Plan 8c: Platform settings (PR `agent/plan-8c-settings`)

### Task 10: The settings contract, sample data, mock, live client and proxy

**Files:**

- Create:
  - `lib/api/settings-contract.ts`;
  - `settings-fixtures.ts`;
  - `mock-settings.ts` and `mock-settings.test.ts`.
- Modify: `lib/api/contract.ts` (`& SettingsClient`), `mock.ts`, `live.ts` and `live.test.ts`, the proxy route and `proxy.test.ts`.

**Interfaces (`settings-contract.ts`):**

```ts
type RetentionType =
  "records" | "documents" | "pending_corrections" | "audit_log";
type RetentionItem = {
  type: RetentionType;
  days: number;
  minimum_days: number;
  last_run: {
    at: string;
    ok: boolean;
    deleted: number;
    kept_for_holds: number;
  } | null;
  next_run_at: string | null;
  changed_by: Person | null;
  changed_at: string | null;
  version: number;
};
type NotReadyReason = "missing_report" | "missing_files" | "checksum_mismatch";
type SettingsRequest = TwoPersonRequest &
  (
    | { kind: "retention_shorten"; type: RetentionType; from: number; to: number }
    | { kind: "triage_on"; from: false; to: true; clinical_signoff: string }
  );
type SettingsOut = {
  retention: {
    confirmed: boolean;
    paused: boolean;
    paused_by: Person | null;
    paused_at: string | null;
    items: RetentionItem[];
  };
  triage: {
    enabled: boolean;
    ready: boolean;
    not_ready_reason: NotReadyReason | null;
    changed_by: Person | null;
    changed_at: string | null;
    version: number;
  };
  feedback_buffer: {
    waiting: number;
    last_reset: { by: Person; at: string; reason: string; cleared: number } | null;
    running: { job_id: string; started_at: string } | null;
    failed_job_id: string | null;
  };
  pending: SettingsRequest[];
};
interface SettingsClient {
  getSettings(): Promise<SettingsOut>;
  previewRetention(type: RetentionType, days: number): Promise<{ would_delete: number }>;
  setRetention(type: RetentionType, body: { days: number; reason: string; version: number } & StepUp, opts: WriteOpts): Promise<SettingsOut>;
  setCleanUpPaused(body: { paused: boolean; reason: string } & StepUp, opts: WriteOpts): Promise<SettingsOut>;
  setTriage(body: { enabled: boolean; reason: string; clinical_signoff?: string; version: number } & StepUp, opts: WriteOpts): Promise<SettingsOut>;
  approveRequest(id: string, body: StepUp, opts: WriteOpts): Promise<SettingsOut>;
  cancelRequest(id: string, opts: WriteOpts): Promise<SettingsOut>;
  resetFeedbackBuffer(body: { reason: string } & StepUp, opts: WriteOpts): Promise<{ job_id: string }>;
}
```

**Proxy shapes and live paths:**

| Method | Path                                              |
| ------ | ------------------------------------------------- |
| GET    | `platform/settings`                               |
| GET    | `platform/settings/retention/{id}/preview`        |
| PUT    | `platform/settings/retention/{id}`                |
| PUT    | `platform/settings/retention-pause`               |
| PUT    | `platform/settings/triage`                        |
| POST   | `platform/settings/requests/{id}/approve`         |
| POST   | `platform/settings/requests/{id}/cancel`          |
| POST   | `platform/settings/feedback-buffer/reset`         |

**Mock rules:**

- **Fixtures:** placeholders, `confirmed: false`; the last run yesterday at 02:00 (ok, 312 deleted, 1840 kept for holds); the next run tomorrow at 02:00.

  | Type                  | `days` | `minimum_days` |
  | --------------------- | ------ | -------------- |
  | `records`             | 2190   | 365            |
  | `documents`           | 2190   | 365            |
  | `pending_corrections` | 365    | 30             |
  | `audit_log`           | 2190   | 2190           |

  - Triage is off. `opts.triage` is `"ready" | "not_ready"`, default `"ready"`; with `not_ready` the reason is `missing_report`.
  - The feedback buffer has `waiting` 37, and its last reset was by Tunde 60 days ago, "Test run data from a training session", 112 cleared.
- **Preview:** `would_delete = 0` when `days ≥ current`; otherwise `round((current − days) / 365 × 4100)`.
- **`setRetention`:** step-up and `version` (else 409 `conflict`).
  - Below the minimum gives 422 `below_minimum`.
  - A longer period applies at once and logs `retention_changed`.
  - A shorter one adds a `retention_shorten` request (lapsing in 7 days) and logs `setting_change_requested`. Until it is approved, `days` is unchanged.
- **`setTriage`:**
  - off applies at once and logs `triage_switched_off`;
  - on needs `ready` (else 409 `not_ready`) and a `clinical_signoff` of 1–200 characters, and adds a `triage_on` request.
- **`approveRequest`:**
  - the requester gets 409 `same_person`;
  - a lapsed request gives 409 `expired`;
  - for triage it re-checks `ready` (409 `not_ready`);
  - it applies the change and logs `setting_change_approved`.
- **`cancelRequest`:** either admin; it logs `setting_change_cancelled`. A lapse logs `setting_change_lapsed` on read.
- **`setCleanUpPaused`:** step-up; it sets `paused_by` and `paused_at` and logs `clean_up_paused` or `clean_up_resumed`. It also feeds `mock-ops` health `clean_up.paused` when 8b is present, via `core`, as shared state on the record.
- **`resetFeedbackBuffer`:** step-up. It sets `running`. After 3 s of mock time `running` clears, `last_reset` updates with `cleared = waiting`, `waiting` becomes 0, and `feedback_buffer_cleared` is logged. `opts.resetFails` instead sets `failed_job_id`.

- [ ] **Step 1: Write the failing tests**
  - `mock-settings.test.ts`:
    - "longer applies at once";
    - "shorter makes a pending request and keeps the old period";
    - "the preview counts and is 0 for longer";
    - "below the minimum is below_minimum";
    - "a stale version is conflict";
    - "the requester's approval is same_person" (Review Focus 2);
    - "approval after 7 days is expired" (Review Focus 3);
    - "triage on needs ready and a sign-off; approval re-checks ready";
    - "triage off is at once";
    - "the reset runs, then clears; resetFails sets failed_job_id";
    - "every write needs the code";
    - "an auditor reads but can't write";
    - "every change logs activity".
  - `live.test.ts`: the eight paths, the `days` query on preview, and Idempotency-Key on writes.
  - `proxy.test.ts`: the eight shapes pass; auditor writes are refused; `platform/settings/requests/x/approve/y` is 404.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the settings contract, sample data and live client".

---

### Task 11: The Settings page: records retention and pending changes

**Files:**

- Create:
  - `lib/settings/labels.ts`, `lib/settings/rules.ts` and their tests;
  - `lib/queries/settings.ts`;
  - `components/settings/{settings-view,pending-requests,retention-section,retention-change-dialog,changed-line}.tsx` and their tests;
  - `app/(app)/settings/page.tsx`.
- Modify:
  - `components/shell/nav.ts`: **Settings**, `/settings`, the `Settings` icon, after System;
  - `lib/queries/keys.ts`: a `settings` root;
  - `tests/e2e/helpers.ts`: "Settings".

**Interfaces:**

- **`labels.ts`:**
  - `retentionTypeLabel`: Questions and answers · Documents · Waiting corrections · Audit log;
  - `notReadyLabel`:
    - `missing_report` gives "Not ready: the validation report is missing";
    - `missing_files` gives "Not ready: the scoring files are missing";
    - `checksum_mismatch` gives "Not ready: the scoring files don't match their validation report";
  - `requestLabel(r: SettingsRequest)` gives "{type} to {period}" or "Triage on".
- **`rules.ts`:**
  - `daysLabel(days)` ("6 years", "6 months", "45 days");
  - `periodOptions(minimum_days: number, current: number): number[]`, per the Rulings, ascending, including `current`;
  - `previewLine(days, n)` gives "With {period}, about {n} records would be deleted in the next clean-up. Records under a legal hold are kept.";
  - `isShorter(days, current)`.
- **Hooks:**
  - `useSettings()` refetches every 5 s while `feedback_buffer.running`;
  - `useRetentionPreview(type, days, enabled)`;
  - the mutations, each writing the returned `SettingsOut` into the cache. The step-up ones use `gcTime: 0`.
- **`SettingsView`:** the TopBar reads "Settings", then:
  1. `PendingRequests`;
  2. the retention section;
  3. the triage section (Task 12);
  4. the learning data section (Task 12).

  Each section has its own Couldn't load.
- **`PendingRequests`:**
  - each request: `requestLabel` and `TwoPersonActions`;
  - retention Approve first fetches a **fresh** preview, then opens `StepUpDialog`, with `previewLine` as the intro and the confirm label **Approve change**;
  - triage Approve shows the clinical sign-off in the intro;
  - `expired`, `same_person` and `not_ready` show their words and reload.
- **`RetentionSection`:**
  - the note "These periods are not yet confirmed by Measured Health's compliance lead." while `!confirmed`;
  - a table: What's kept · How long · Minimum · Last clean-up ("{date} · {n} deleted · {n} kept for legal holds · finished" or "didn't finish") · Next;
  - `ChangedLine` ("Changed by {name} · {date}", with a **History** link to `/activity`);
  - **Change** for platform admins. With a pending request for that type, the row says "Change to {period} waiting for a different platform admin" and offers no Change.
- **`RetentionChangeDialog`:**
  1. A select of `periodOptions`. **Continue**.
  2. Longer: `StepUpDialog`, with a free reason and the confirm label **Keep for {period}**.
  3. Shorter: the fetched `previewLine` in the intro, then `StepUpDialog` with the confirm label **Ask to shorten** in the danger tone. The result reads "Waiting for a different platform admin to approve".
  4. 409 `conflict` gives "Changed by someone else" and a reload.

- [ ] **Step 1: Write the failing tests**
  - `rules.test.ts`:
    - `daysLabel` for 2190, 365, 180 and 45 days;
    - "periodOptions never goes below the minimum, and audit log offers 6–10 years only";
    - the `previewLine` words.
  - `retention-section.test.tsx`:
    - "shows each type, its period, minimum, last and next clean-up, and kept for legal holds";
    - "shows the not-yet-confirmed note";
    - "longer asks for a reason and the code, then applies";
    - "shorter shows the preview, then asks, and the row shows the waiting words";
    - "below-minimum periods aren't offered";
    - "a stale version shows Changed by someone else and reloads";
    - "an auditor sees no Change".
  - `pending-requests.test.tsx`:
    - "the requester sees Waiting for a different platform admin to approve" (Review Focus 2);
    - "another admin's Approve shows a freshly fetched preview" (the preview is called again with the request's `to`);
    - "expired shows This request lapsed after 7 days. Make a new request. and reloads" (Review Focus 3);
    - "either admin can cancel".
  - `app-shell.test.tsx`: "Settings after System".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Settings page with records retention and pending changes".

---

### Task 12: The triage gate and clearing unapproved learning data

**Files:**

- Create: `components/settings/{triage-section,learning-data-section}.tsx` and their tests.
- Modify: `settings-view.tsx`.

**Interfaces:**

- **`TriageSection`:**
  - "Triage: On" or "Off", with an icon;
  - "Ready to switch on" or `notReadyLabel`;
  - `ChangedLine`;
  - **Switch off** (when on): `StepUpDialog`, with a free reason and the confirm label **Switch off**;
  - **Ask to switch on** (when off and ready, with no pending request): `StepUpDialog` with:
    - a free reason;
    - `extra = { label: "Clinical sign-off (who approved it and their reference)", max: 200 }`;
    - the confirm label **Ask to switch on**.
  - Not ready: no switch-on control, and the reason in words.
- **`LearningDataSection`:**
  - the title "Clear unapproved learning data";
  - "{waiting} items waiting";
  - the last reset: "Cleared by {name} · {date} · {cleared} items · {reason}";
  - **Clear** opens `StepUpDialog`:
    - the intro: "This clears {n} items of unapproved feedback. Approved corrections and guidelines are not touched. This can't be undone.";
    - a free reason;
    - `dismissLabel` "Cancel", and the confirm label **Clear {n} items** in the danger tone.
  - While `running`, it shows "Clearing…". When done: "Cleared {n} items · {time}".
  - With `failed_job_id`: "Couldn't clear · **View in Failed jobs**", linking to `/system/jobs`.

- [ ] **Step 1: Write the failing tests**
  - `triage-section.test.tsx`:
    - "off and ready offers Ask to switch on, which needs a reason, the sign-off and the code, then shows the pending request";
    - "not ready shows Not ready: the validation report is missing and no switch-on";
    - "on offers Switch off, at once";
    - "an approval refused as not_ready shows No longer ready to switch on.";
    - "an auditor sees the state only".
  - `learning-data-section.test.tsx`:
    - "the dialog states the count and that it can't be undone; Cancel is the safe button";
    - "it needs a reason and the code";
    - "shows Clearing… then Cleared 37 items";
    - "a failed reset links to Failed jobs";
    - "offline disables Clear with the reason".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the triage gate and clearing unapproved learning data".

---

### Task 13 (optional): Pause clean-up and the service-problems banner

Build it if wanted. Leaving it out changes nothing else.

**Files:**

- Create: `components/settings/pause-clean-up.tsx`, `components/shell/health-banner.tsx` and their tests.
- Modify:
  - `retention-section.tsx`;
  - `components/shell/app-shell.tsx` (shared with 7d's bell; it adds one line above `OfflineStrip`).

**Interfaces:**

- **`PauseCleanUp`:**
  - **Pause clean-up** or **Resume clean-up**, for platform admins;
  - `StepUpDialog`, with a free reason;
  - while paused: "Records clean-up paused by {name} since {date}" on Settings. Health shows the same words, from Task 7's parts list.
- **`HealthBanner`:**
  - it uses `useHealth()`, so the same poll and the same stale rule apply;
  - only when `readHealth(...).overall === "problem"` does a warn banner show: "The service is having problems · **View health**";
  - never on Couldn't check, and never on `/system/health` itself.

- [ ] **Step 1: Write the failing tests**
  - "pause needs a reason and the code; the line shows on Settings and Health";
  - "resume clears it";
  - "the banner shows on Having problems, links to Health, and hides on Working normally, on Couldn't check and on the Health page".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add pausing the clean-up and the service-problems banner".

---

### Task 14: Settings end to end and docs

**Files:**

- Create: `tests/e2e/settings.spec.ts`.
- Modify:
  - `README.md` and `apps/clinical/tests/readme.test.ts`;
  - `ARCHITECTURE.md` §5 and `CHANGELOG.md`;
  - spec §9, if the contract changed while building.

- [ ] **Step 1: Write the e2e tests** on desktop and mobile, with `expectNoStorage` after each test and the CSP check on `/settings`:
  - "Ada lengthens Documents to 7 years at once";
  - "Ada asks to shorten Questions and answers to 3 years with the preview; as Tunde, the fresh preview, then approve";
  - "Tunde asks to switch triage on with a sign-off; Ada approves";
  - "Ada clears the learning data and sees Cleared 37 items";
  - "the auditor sees every setting and no controls".
  - If Task 13 was built: "pause shows on Health".
- [ ] **Step 2: Write the docs.**
  - The README gains "**Settings.**": retention, triage and the reset, and the two-person changes. Pin it with `"documents the platform settings demo"`, matching `/\*\*Settings\.\*\*/`.
  - ARCHITECTURE §5: the sidebar line.
  - CHANGELOG.
- [ ] **Step 3: Verify** the full suite, as in Task 5 Step 5.
- [ ] **Step 4: Commit:** "Test settings end to end; document the demo". Open the 8c PR.

---

## Parallel work

- **Task 1** comes first, alone, and merges before anything else.
- **The three groups after Task 1** can each run in its own worktree, up to three agents at once:
  - **8a:** Task 2, then Task 3, then **Tasks 4 and 5 in parallel**. Task 5 uses `PlaceHoldDialog` from Task 3; neither touches the other's files.
  - **8b:** Task 6, then **Tasks 7 and 8 in parallel** (Task 7 owns `system/layout.tsx` and `SystemTabs`; Task 8 only adds `system/jobs/page.tsx` and its components), then Task 9.
  - **8c:** Task 10, then Task 11, Task 12, the optional Task 13, then Task 14. These are sequential, since they share `settings-view.tsx`.
- **Contract tasks across groups (2, 6 and 10)** can run at the same time. Each adds one line to `contract.ts`, `mock.ts` and `live.ts`, and appended rows to `SHAPES`.
- **Merge order 8a → 8b → 8c.** Each later PR rebases and resolves:
  - `nav.ts` (the order is Legal holds, System, Settings);
  - `SHAPES`;
  - the `openNav` union;
  - README, CHANGELOG and ARCHITECTURE.

  Task 13's health banner needs 8b merged first.
- **The backend contract.** With 8a's PR, the controller files spec §9 (as updated by Task 1) in mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as the next free §14 item, through its own PR.

## Self-review notes

- **Spec coverage:**

  | Spec section                                    | Task(s)                                  |
  | ----------------------------------------------- | ---------------------------------------- |
  | §3 roles, step-up, two people, sidebar          | 1, 3, 7, 11 (nav), every task's tests    |
  | §4.1–4.4 holds, place, edit                     | 2, 3, 4                                  |
  | §4.5 lift, grace, undo                          | 2, 4                                     |
  | §4.6 removal, hospital page, Hold tag           | 2, 5                                     |
  | §4.7 audit                                      | 1 (labels), 2, 5 (e2e)                   |
  | §5 health and its rules                         | 6, 7, 13 (banner)                        |
  | §6 failed jobs                                  | 6, 8                                     |
  | §7.1 retention, preview, pause                  | 10, 11, 13                               |
  | §7.2 triage                                     | 10, 12                                   |
  | §7.3 learning-data reset                        | 10, 12                                   |
  | §7.4 pending changes                            | 1 (`TwoPersonActions`), 11               |
  | §8 plain words, counts, states, accessibility   | Global Constraints; every UI task        |
  | §8 bell                                         | not in Plan 8 (Rulings)                  |
  | §9 contract                                     | 1 (spec additions), 2, 6, 10, then the controller's §14 PR |
  | §10 delivery                                    | 8a: Tasks 2–5; 8b: 6–9; 8c: 10–14        |
  | §11 tests                                       | 2–14                                     |

- **Names used across tasks:**
  - contract and mock: `TwoPersonRequest`, `MockCore`, `HoldsClient`, `OpsClient`, `SettingsClient`, `LegalHold`, `LegalHoldDetail`, `HoldShort`, `keepsRecords`, `HealthOut`, `Job`, `JOBS_MAX`, `OLD_QUESTION_MS`, `SettingsOut`, `SettingsRequest`, `setDemoHealth`;
  - rules and labels: `readHealth`, `STALE_MS`, `answerTimeLine`, `waitLabel`, `oldQuestions`, `cancelEffects`, `resultLine`, `scopeLabel`, `liftedLine`, `defaultReviewOn`, `validatePlace`, `HOLD_HINT`, `daysLabel`, `periodOptions`, `previewLine`;
  - hooks: `useHolds`, `useHold`, `usePlaceHold`, `useHealth`, `useJobs`, `useRetryJobs`, `useCancelJobs`, `useSettings`, `useRetentionPreview`;
  - components: `PlaceHoldDialog`, `TwoPersonActions`, `WAITING`, `StepUpDialog` (`extra`, `hint`, `dismissLabel`).

## Across plans (controller, 22 Oct 2026)

- **Platform sidebar order** once every plan has merged: Hospitals · Usage · Analysis · Clearances · Legal holds · System · Settings · Team · Activity · Audit log · Account. Whichever plan merges second fixes `nav.ts` to match.
- **Backend requirements numbering:** Plan 6 is §14.8, Plan 8 is §14.9, Plan 9 is §14.10, Plan 11 is §14.11, and Plan 12 is §14.12.
- **Audit kinds:** Plans 8 and 11 add their event kinds to Plan 9's `lib/audit/kinds.ts` if Plan 9 has merged first; otherwise Plan 9 adds theirs.
- **Binary pass-through:** Plans 9 and 11 share one helper in `route.ts`. Whichever lands second reuses it.
