# Plan 5a: Notifications and patient alerts (clinical side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clinicians one notification centre for patient alerts and for
decisions on their corrections, on sample data now and ready for the real API:

- **one bell** in the top bar replaces Plan 3's decisions bell. Its badge is
  one count (new patient alerts plus decisions you haven't seen) and its
  accessible name says it ("Notifications, 3 unread"). Its panel shows the
  latest few items of both kinds and "See all";
- **the Notifications page** with two tabs: **Patient alerts** (filters New,
  Handled, Dismissed, severity and, when the hospital has more than one
  connected system, source) and **Corrections** (the decisions on your
  corrections, with a link to My feedback & corrections). Cards at every
  width, so phones work;
- **a patient alert card** in the spec's order: severity (word and icon), the
  finding with value, unit, normal range and time, up to three likely causes
  "Suggested by MHAI" with confidence words, the patient (full name, MRN,
  where they are), the hospital's own source label when it has several
  systems, and the actions **Acknowledge**, **Ask MHAI about it** (a
  consultation pre-filled without the name or MRN), **Open patient record**
  (the link the API gives) and **Dismiss** (required reason, optional note).
  Who handled it and when; an alert someone else handled meanwhile says so
  and its actions are disabled with that reason;
- **pop-ups** for new alerts and decisions: the first check after sign-in is a
  baseline, a polite live region (Critical: assertive), never stealing focus,
  capped so a burst can't flood the screen; **Notifications settings** on
  Profile & security with two switches; **Critical alerts always pop up**;
- **privacy:** alerts live in memory only, clear on sign-out, never reach the
  URL, storage, logs, a print-out or an export, and the clinical and privacy
  sign-off is recorded as a release gate;
- **EMR-agnostic** (ADR 0003): no vendor names anywhere; "Open patient
  record" follows the backend's `emr_link`; "Location not recorded" and "Not
  standardised" instead of hiding or guessing;
- admin-only and platform accounts see neither the bell nor the page.

**Architecture:**

- **Data.** A focused client like Plan 4's: `AlertsClient`
  (`lib/api/alerts.ts`), types in `lib/api/alerts-contract.ts`, the in-memory
  sample alerts in `lib/api/mock-alerts.ts` and the live client in
  `lib/api/live-alerts.ts`, which calls the BFF at `/api/v1/alerts*` and
  `/api/v1/me/notification-settings`. The BFF forwards exactly those shapes,
  for clinicians only. `AlertHandledError` (409 `already_handled`, with who
  and when) lives in `lib/api/errors.ts`. TanStack Query hooks live in
  `lib/notification-queries.ts`.
- **Pure rules** in `lib/notifications/*.ts`, unit-tested without React: the
  wording (`alert-view.ts`), the pop-up rules (`popups.ts`) and the "Ask MHAI
  about it" prefill with its in-memory hand-over (`ask.ts`).
- **State.** `NotificationsProvider` (in `AppShell`, clinicians only) wraps
  Plan 3's `DecisionsProvider` and the new `AlertsProvider`. The alerts
  provider polls the newest new alerts and the unread count, shows pop-ups by
  watching the query cache (like decisions), and remembers which alert a
  "View" asked to open. Both read the pop-up settings. Unmounting at sign-out
  clears every pop-up and the live-region text.
- **Screens** in `components/notifications/*`: `NotificationBell`,
  `NotificationsFrame`, `AlertsTab`/`AlertsView`, `AlertCard`, `DismissDialog`,
  `CorrectionsTab`, chips; `components/account/notifications-section.tsx`.
  They reuse `TopBar`, `MenuButton`, `Button`, `Chip`, `Banner`, `FilterChip`,
  `Dialog`, `Sheet`, `useKeyedMutation` and the toast, and two pieces moved to
  `components/ui` so both sides share them: `Switch` (from the hospital
  settings view) and `LinkTabs` (from the activity tabs).

**The assumed backend contract.** Base `/api/v1`. Errors are `problem+json`
with `code`. Nothing here exists in the backend yet: every row is
**assumed**, and Task 2 writes it into spec §10 as item 20 so the backend team
can match it or tell us what changed. Every route is for the signed-in
clinician, scoped to their hospital and routing (set by the hospital admin in
the later integration plan); nothing is ever sent to patients.

| Feature           | Endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Source                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Alert list        | `GET /alerts?status=new\|handled\|dismissed&severity=critical\|urgent\|info&source=<label>&cursor&limit` → `{alerts: AlertOut[], next_cursor, sources: string[]}`, newest first; `sources` lists the hospital's own labels for its connected systems                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **assumed** (spec §9; R10) |
| Alert shape       | `AlertOut`: `id`, `severity` (`critical`, `urgent`, `info`), `status` (`new`, `handled`, `dismissed`), `finding` (`name`, `value`, `unit`, `flag` `low`\|`high`\|`abnormal`\|null, `reference_range` as given by the source, `recorded_at`, `code_system`, `standardised`), `likely_causes[]` (`label`, `confidence` `high`\|`caution`\|`review`, at most 3), `patient` (`full_name`, `mrn`, `location`: `{kind: "admitted", ward, bed}`, `{kind: "outpatient", clinic}`, `{kind: "emergency"}`, `{kind: "not_recorded"}` or null), `age`, `sex`, `source_label` (hospital-chosen, never a vendor), `emr_link` (built by the backend), `handled_by` (`{display_name}`), `handled_at`, `dismiss_reason`, `created_at` | **assumed** (spec §9)      |
| Unread count      | `GET /alerts/unread-count` → `{count}`: new alerts for you that no one has handled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **assumed** (spec §9; R1)  |
| Acknowledge       | `POST /alerts/{id}/acknowledge` → the alert; `Idempotency-Key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **assumed** (spec §9)      |
| Dismiss           | `POST /alerts/{id}/dismiss {reason, note?}` → the alert; `reason` one of `not_relevant`, `already_known`, `wrong_patient`, `other`; `note` at most 500 characters; `Idempotency-Key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **assumed** (spec §9)      |
| Handled elsewhere | **409** `already_handled` on acknowledge or dismiss, with `status`, `handled_by: {display_name}` and `handled_at`; **404** `not_found`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **assumed** (spec §9; R7)  |
| Settings          | `GET /me/notification-settings` → `{alert_popups, correction_popups}`; `PATCH /me/notification-settings {alert_popups?, correction_popups?}` → the same; `Idempotency-Key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **assumed** (spec §9)      |
| Not switched on   | **404** (or **403**) on the alert routes for a hospital without alerts yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **assumed** (R12)          |
| Retry-safe writes | `Idempotency-Key` on every write above, kept as long as for `POST /feedback` (§10 items 15 and 19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **assumed**                |

**Rulings** (open points decided here so the build can go ahead; each is
recorded in the docs by the task named):

- **R1 · One unread count.** The badge is new alerts (the API's unread count:
  an alert counts until anyone acknowledges or dismisses it, because the
  clinical work isn't done until then) plus decisions you haven't seen
  (Plan 3's session count, cleared by opening the bell or the Corrections
  tab). Opening the bell doesn't clear alerts (Task 8).
- **R2 · Routes.** `/notifications` (Patient alerts) and
  `/notifications/corrections` (Corrections), link tabs like Plan 4's
  Activity, in the `(clinician)` group, so admin-only accounts are sent home
  and platform accounts get the 403 page. No sidebar entry: the bell and its
  "See all" reach the page (spec §2) (Tasks 10, 11).
- **R3 · Nothing in the URL.** Filters and the alert a "View" asked for are
  React state. "Ask MHAI about it" hands the pre-filled form over in memory;
  the URL carries only a random one-time token (`/?prefill=3f9c…`) that says
  nothing about the patient and opens nothing after a reload or sign-out
  (Tasks 4, 7, 12).
- **R4 · Pop-ups.** The first check after sign-in is a baseline. Critical
  alerts always pop up, use the assertive live region and stay until hidden;
  Urgent and Info pop up only when alert pop-ups are on (polite, 12 s);
  decisions only when decision pop-ups are on (polite, 8 s). At most 3 alert
  pop-ups per check, most severe first, and the rest become one "N more new
  patient alerts" pop-up; at most 4 pop-ups on screen, oldest expiring one
  first. The stack sits below the top bar so it never covers the bell.
  Pop-ups never take focus and are reachable from the bell. Sign-out clears
  them and the live-region text (Tasks 4, 6, 7).
- **R5 · Settings.** Saved through the API with the account. Until they load,
  or if they can't, pop-ups stay on: never silently muted. In the demo they
  are kept in memory (Tasks 5, 13).
- **R6 · After your own action** the card stays where it is, showing
  "Acknowledged by Dr. Reyes · 09:12" (focus moves to that line), and leaves
  the New list the next time the list loads. The unread count and the bell
  refresh at once (Tasks 5, 9).
- **R7 · Handled by someone else.** A 409 `already_handled` puts the
  colleague's who and when into the card, shows "Someone else handled this
  alert", and disables Acknowledge and Dismiss with that line as their
  description. The BFF passes only `status`, `handled_by.display_name` and
  `handled_at` from that reply, nothing else. "Ask MHAI about it" and "Open
  patient record" stay available on handled alerts (Tasks 2, 5, 9).
- **R8 · Open patient record** shows only for an `https:` `emr_link` from the
  API and opens it in a new tab with `noopener noreferrer`. The UI never
  builds a record URL (ADR 0003) (Tasks 3, 9).
- **R9 · Missing or unusual data degrades, never hides or guesses** (ADR
  0003): an unknown severity reads **Urgent** (never quietly downgraded to
  Info); a missing or unknown location reads "Location not recorded"; an
  unmapped finding shows the source's own label with "Not standardised";
  a missing value, unit, range or time is left out; an unknown confidence
  level reads "Needs review"; at most 3 causes, and no causes hides the
  section (Task 3).
- **R10 · Source label.** Each card shows the hospital's `source_label`, and
  the page offers a Source filter, only when the list's `sources` has more
  than one entry. `sources` is an assumed field on the list reply (Tasks 2,
  10).
- **R11 · Ask MHAI prefill:** age, sex, priority from severity (Critical →
  Emergency, Urgent → Urgent, Info → Routine), the finding as a symptom
  ("Abnormal result: …") and as the question. Never the name, MRN, location,
  source, record link, or MHAI's suggested causes: the consultation reasons on
  its own (Tasks 4, 12).
- **R12 · Alerts not switched on.** A 404 or 403 from the alert routes means
  the hospital has no alerts yet: the bell shows decisions only, the Patient
  alerts tab says "Patient alerts aren't switched on for your hospital yet",
  and polling stops (Tasks 5, 7, 10).
- **R13 · Cards at every width.** An alert carries too much for a table row.
  Below `sm` the actions stack full width at 44 px (Tasks 9, 10).
- **R14 · No print or export** of alerts: no such control exists, and the
  alerts content is `print:hidden` with a print-only line saying so (Task 10).
- **R15 · Shared pieces, no copies:** `Switch` and `LinkTabs` move to
  `components/ui` (the hospital settings view and the activity tabs use
  them); the toast gains a View action, live regions, persistent pop-ups, a
  cap and clearing by tag; `usePollEvery` moves to `lib/network.ts`;
  `eventClock` moves to `lib/time.ts` (Tasks 3, 5, 6).
- **R16 · Named constants:** `ALERT_POLL_MS` (30 s), `FEED_SIZE` (20),
  `ALERT_PAGE_SIZE` (20), `POPUP_MAX` (3), `ALERT_POPUP_MS` (12 s),
  `TOAST_MAX` (4), `SEEN_MAX` (500), `BELL_ALERTS` (4), `BELL_DECISIONS` (3),
  `CAUSE_MAX` (3), `DISMISS_NOTE_MAX` (500), `MOCK_ALERT_EVERY_MS` (120 s),
  `MOCK_ARRIVALS_MAX` (30).
- **R17 · The sample hospital's systems** are labelled "Main record" and
  "Results system", so the source label shows in the demo without any vendor
  name (Task 1).

**Tech Stack:** as Plans 2–4 (Next.js 16.4 App Router with `cacheComponents`,
React 19.3, TanStack Query 5, Tailwind 4, `lucide-react`, Vitest + React
Testing Library, Playwright 1.64.1). No new dependencies.

**Spec:** docs/specs/2026-10-17-notifications-design.md (every section),
docs/adr/0003-many-emr-systems.md (frontend rules),
docs/specs/2026-10-13-ui-design-v3.md §5.3 (decision toasts and bell), §6
(wording), §7 (accessibility), §8 (privacy) and §10 (backend asks),
ARCHITECTURE.md §4.

**Not in this plan:**

- **Connecting a hospital's EMR/EHR** (platform admin app) and **choosing
  which units and alerts to cover and who receives them** (hospital admin
  side): the later EMR/EHR integration plan.
- **Generated OpenAPI types.** `lib/api/alerts-contract.ts` is written by hand
  until the backend commits `openapi.json`, as in Plans 2–4.
- **Push delivery** (web push, SSE or long polling): polling every 30 s, like
  decisions, is enough at first.
- **Live use with real patients**, which waits for the clinical and privacy
  sign-off (spec §5; Task 14 records the gate).

**Sample data (mock):** memory only (a reload signs you out and resets
everything). Every name and MRN is synthetic.

- Eight alerts at sign-in, for any clinician: six new (two Critical, two
  Urgent, two Info), one handled by Dr. Okafor and one dismissed by Nurse
  Bello ("Already known"). They cover a ward bed, a ward without a bed, two
  outpatient clinics (one unnamed), the emergency department and one with no
  location; one finding is not standardised and one patient has a very long
  name. They come from "Main record" and "Results system";
- a new sample alert every 2 minutes (`MOCK_ALERT_EVERY_MS`), cycling Urgent
  (Emeka Nnamdi, platelets), Critical (Halima Garba, potassium) and Info
  (Joseph Eke, sodium), up to 30;
- notification settings start with both switches on.

## Global Constraints

- **Read the Next.js docs before coding.** This Next.js version has breaking
  changes (AGENTS.md). Before writing a page, read
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  and `route-groups.md`. Notes from Plans 1–4 still hold: route handlers use
  `RouteContext<'/path/[...param]'>` with params as a Promise; with
  `cacheComponents`, `useSearchParams` must sit inside `<Suspense>` (the home
  page already does). The Notifications pages read no search params.
- **Plain language; never backend terms (spec §6).** No `already_handled`,
  `not_relevant`, `already_known`, `wrong_patient`, `not_recorded`,
  `alert_popups`, `correction_popups`, `emr_link`, `source_label`,
  `code_system` or ids in UI text or accessible names. Severities read
  "Critical", "Urgent", "Info" (`SEVERITY`); statuses "New", "Handled",
  "Dismissed" (`ALERT_STATUS_LABEL`); confidence `RESULT_LABEL`; reasons
  `DISMISS_REASONS`. Task 3 adds these codes to `FORBIDDEN_TERMS`, so the
  e2e word check covers them. `FORBIDDEN_TERMS` holds backend-style codes
  only, never plain words the UI uses ("new", "critical", "other"). Say
  "two-step", never "MFA". Likely causes are always "Suggested by MHAI" with a
  confidence word, never a bare diagnosis.
- **EMR-agnostic; no vendor names anywhere** (ADR 0003): not in the UI, code,
  comments, types, tests, sample data, docs or commits. The UI shows
  "Open patient record" and follows `emr_link`; it never builds a record URL
  or maps codes; it shows the hospital's `source_label` only. Missing data
  reads "Location not recorded" / "Not standardised" (R9).
- **Privacy (spec §5, §8, CONTRIBUTING).** Patient names and MRNs live in
  memory only: the TanStack cache (cleared on sign-out by
  `SessionProvider.clear()`), React state and the toast stack (cleared when
  the shell unmounts at sign-out, R4). Never `localStorage`,
  `sessionStorage`, IndexedDB, cookies, the URL, the document title,
  `console.*` or analytics. "Ask MHAI about it" never copies identifiers into
  the consultation (R11). Nothing is printed or exported from the alerts page
  (R14). Every e2e test ends with `expectNoStorage`. This is the first place
  MHAI shows patient names: live use needs the clinical and privacy sign-off
  (Task 14 writes the gate into README and CONTRIBUTING).
- **Never send the caller's id from the client.** The API knows who you are;
  `handled_by` comes from the API.
- **Accessibility (spec §6–§7):**
  - severity, status, confidence and "Not standardised" always carry a word
    and an icon, never colour alone;
  - pop-ups use a polite live region, Critical an assertive one; they never
    move focus; each has a "View" button and a "Hide pop-up" button, and the
    bell lists the same alerts;
  - everything works from the keyboard with a visible focus ring; the bell
    panel closes with Esc and returns focus; dialogs trap focus and close with
    Esc;
  - a disabled action always says why (handled by someone, offline);
  - touch targets are at least 44 px below `sm` (`min-h-11`, `size-11`);
  - motion uses the tokens only and is off under reduced motion
    (`lib/motion.test.ts` scans `components/` and `app/`).
- **Tokens only.** Colours come from `app/globals.css` tokens through Tailwind
  classes (`text-bad-deep`, `bg-warn-wash`, `ring-warn-line`…). No hex values
  in new code (existing shadows excepted).
- **Names are never truncated away.** Patient names, MRNs, labels and
  finding names wrap (`[overflow-wrap:anywhere]`); no `truncate` on any of
  them.
- **Auth gating.** The Notifications pages sit in `app/(clinical)/(clinician)/`
  behind `AuthGate need="clinical"`. `NotificationsProvider` mounts in
  `AppShell` for clinicians only, so admin-only accounts run no alert query
  and get no bell. The BFF forwards the alert and settings routes only for a
  clinician who finished first sign-in. A 401 from any call goes through
  `reportUnauthorized()`, which signs out once with "Your session ended".
- **Writes.** Every write (acknowledge, dismiss, settings) carries a fresh
  `Idempotency-Key` per user action through `useKeyedMutation`, reused on its
  retries; retries are for network errors and 5xx only and never while
  offline. Acknowledge, Dismiss and the switches are disabled offline with
  "You're offline" next to them. Alert writes are never queued in the
  offline outbox.
- **Reuse, no duplicates.** `FilterChip`, `Dialog` (with `initialFocus` where
  a field comes first), `Sheet`, `Chip`, `Banner`, `Button`,
  `useKeyedMutation`, the toast, `Switch`, `LinkTabs`, `eventClock`,
  `usePollEvery`, `RESULT_LABEL`. Do not write a second switch, tab strip,
  toast or poll helper.
- **Tests.** Vitest unit and component tests in every task; Playwright e2e on
  the desktop and mobile projects (Task 14), driving time with `page.clock`.
  No fixed sleeps in any test: wait for what the screen shows. The demo
  session is memory only, so e2e tests navigate inside the app after signing
  in (never `page.goto` a signed-in page).
- **Docs.** `CHANGELOG.md` under _Unreleased_ in the task that makes the
  user-visible change; spec §10 item 20 and ARCHITECTURE §4.8 (Task 2);
  README's demo paragraph and the sign-off note in README and CONTRIBUTING
  (Task 14).
- **Commits.** Imperative subject of at most 72 characters, **no AI
  attribution** (no co-author trailers or "generated with" lines). Work on
  branch `agent/plan-5a-notifications`; humans merge. Never name or copy
  outside reference projects in code, comments, docs or commits. No "lab"
  wording anywhere: the sample systems are "Main record" and "Results
  system", and findings are "results".

## Review Focus

The five real-world failures this feature is most likely to meet that the
happy-path tests would miss. Each has a named test in its owning task.

1. **A colleague handles the alert while you're acting on it** (two
   clinicians on the same ward). Expected: your Acknowledge or Dismiss meets
   409 `already_handled`; the card shows "Acknowledged by Dr. Okafor · 09:00"
   and "Someone else handled this alert"; Acknowledge and Dismiss are disabled
   with that line as their description; an open Dismiss dialog says nothing
   will be sent; nothing is applied twice (one idempotency key per action).
   Tests: Task 1 ("refuses a second handling with who and when (409, Review
   Focus 1)"), Task 2 ("builds the who-and-when error from a 409 (Review
   Focus 1)", "keeps only who and when from a 409 already_handled (Review
   Focus 1)"), Task 5 ("puts the colleague's who and when into the cached
   lists on a 409 (Review Focus 1)"), Task 9 ("shows who handled it first and
   disables the actions with that reason (Review Focus 1)", "says in the
   dialog when someone else handled it meanwhile (Review Focus 1)").
2. **A Critical alert arrives while alert pop-ups are muted.** Expected: Urgent
   and Info stay quiet (the bell count still rises), but Critical pops up in
   the assertive live region and stays until hidden; the setting says
   "Critical alerts will still pop up." Tests: Task 4 ("pops up Critical even
   when alert pop-ups are off (Review Focus 2)"), Task 7 ("with alert pop-ups
   off, Urgent stays quiet but Critical pops up, assertively (Review Focus
   2)"), Task 13 ("turning alert pop-ups off saves it and says Critical
   alerts will still pop up (Review Focus 2)"), Task 14 ("with alert pop-ups
   off, Urgent stays quiet but Critical still pops up").
3. **A burst of alerts at once** (the feed catches up after a network gap, or
   a ward-wide event). Expected: at most 3 alert pop-ups, most severe first,
   plus one "5 more new patient alerts" pop-up; never more than 4 pop-ups on
   screen; nothing steals focus. Tests: Task 4 ("caps a burst and summarises
   the rest, most severe first (Review Focus 3)"), Task 6 ("keeps at most
   TOAST_MAX on screen, dropping the oldest that can expire (Review Focus
   3)"), Task 7 ("a burst of eight shows three pop-ups and one summary
   (Review Focus 3)").
4. **A missing or unstandardised field** (a source without locations, a
   local code not yet mapped, no reference range, an unknown severity or
   confidence from a newer backend). Expected: "Location not recorded", the
   source's label with "Not standardised", the parts that exist and nothing
   invented; unknown severity reads Urgent; no causes hides the section; no
   https link hides "Open patient record". Tests: Task 3 ("degrades missing
   and unusual data without guessing (Review Focus 4)"), Task 9 ("shows a
   sparse, unstandardised alert without guessing (Review Focus 4)").
5. **Sign-out while alerts are showing** (a pop-up with a patient's name on a
   shared ward computer). Expected: every pop-up and the hidden live-region
   text go with the shell; the query cache is cleared; nothing about the
   patient reaches storage, the URL or the sign-in page; a stale prefill
   token opens an empty form. Tests: Task 6 ("clears a tag's pop-ups and the
   live text (Review Focus 5)"), Task 7 ("signing out clears every pop-up
   and keeps nothing (Review Focus 5)"), Task 12 ("signing out forgets the
   prefill (Review Focus 5)"), Task 14 ("signing out while a Critical pop-up
   shows clears it and keeps nothing").

---

## File structure

```text
lib/api/alerts-contract.ts       AlertOut, FindingOut, AlertLocationOut, AlertQuery, AlertPageOut,
                                 DismissIn, AlertHandledOut, NotificationSettingsOut … (new)
lib/api/alerts.ts                AlertsClient, getAlertsClient() (new)
lib/api/errors.ts                + AlertHandledError, isAlertHandled
lib/api/mock-alerts.ts           createMockAlerts(): the sample alerts, memory only (new)
lib/api/live-alerts.ts           createLiveAlertsClient() (new)
app/api/v1/[...path]/route.ts    alert and settings shapes, clinicians only; 409 who-and-when
lib/time.ts                      + eventClock (moved from lib/admin/activity.ts)
lib/network.ts                   + usePollEvery (moved from lib/correction-queries.ts)
lib/labels.ts                    FORBIDDEN_TERMS + the alert codes
lib/notifications/alert-view.ts  SEVERITY, findingLine, locationLabel, likelyCauses, handledLine,
                                 DISMISS_REASONS, recordLink … (new)
lib/notifications/popups.ts      newAlerts, planPopups, alertPopup, moreAlertsPopup, routes (new)
lib/notifications/ask.ts         askFromAlert, stashPrefill, readPrefill, clearPrefill (new)
lib/notification-queries.ts      NOTIFY_KEYS, feed, unread, list, settings, acknowledge, dismiss (new)
lib/session-store.tsx            clear() also forgets the prefill
components/ui/toast.tsx          View action, live regions, persistent pop-ups, cap, clear(tag)
components/ui/switch.tsx         Switch (moved from components/admin/settings-view.tsx)
components/ui/link-tabs.tsx      LinkTabs (from components/admin/activity-tabs.tsx)
components/corrections/decisions-provider.tsx   reads the decision pop-up setting; View action
components/corrections/decision-bell.tsx        deleted (replaced by NotificationBell)
components/notifications/        alerts-provider, notifications-provider, notification-bell, chips,
                                 alert-card, dismiss-dialog, notifications-frame, alerts-view,
                                 corrections-tab (new)
components/account/notifications-section.tsx    the two switches (new)
components/account/account-view.tsx             + Notifications section for clinicians
components/shell/app-shell.tsx   NotificationsProvider for clinicians
components/shell/top-bar.tsx     NotificationBell
app/(clinical)/(clinician)/page.tsx                     reads `?prefill=`
app/(clinical)/(clinician)/notifications/page.tsx       (new)
app/(clinical)/(clinician)/notifications/corrections/page.tsx  (new)
tests/alerts.ts                  ALERT_NOW, at(), makeAlert(), mockAlerts() (new)
tests/e2e/notifications.spec.ts  (new)
tests/e2e/helpers.ts             + openNotifications()
```

---

### Task 1: The alerts contract, the client interface and the sample alerts

**Files:**

- Create: `lib/api/alerts-contract.ts`, `lib/api/alerts.ts`,
  `lib/api/mock-alerts.ts`, `lib/api/live-alerts.ts` (stub),
  `lib/api/mock-alerts.test.ts`, `tests/alerts.ts`
- Modify: `lib/api/errors.ts`
- Test: `lib/api/mock-alerts.test.ts`

**Interfaces:**

- Consumes: `Sex`, `WriteOpts` (`lib/api/contract.ts`), `ApiError`
  (`lib/api/errors.ts`), `getAuthClient` (`lib/auth/client.ts`).
- Produces (`lib/api/alerts-contract.ts`): `AlertSeverity`, `AlertStatus`,
  `FindingFlag`, `CauseConfidence`, `DismissReason`, `AlertLocationOut`,
  `FindingOut`, `LikelyCauseOut`, `AlertPatientOut`, `AlertOut`,
  `AlertQuery`, `AlertPageOut`, `UnreadCountOut`, `DismissIn`,
  `AlertHandledOut`, `NotificationSettingsOut`, `NotificationSettingsPatchIn`
  (exact shapes below).
- Produces (`lib/api/errors.ts`):
  `class AlertHandledError extends ApiError { readonly handled: AlertHandledOut }`
  (status 409, code `already_handled`) and
  `isAlertHandled(e: unknown): e is AlertHandledError`.
- Produces (`lib/api/alerts.ts`): `interface AlertsClient` (6 methods below)
  and `getAlertsClient(): AlertsClient` (mock when `NEXT_PUBLIC_USE_MOCK=true`,
  otherwise live; the live client comes in Task 2).
- Produces (`lib/api/mock-alerts.ts`): `MOCK_ALERT_EVERY_MS = 120_000`,
  `MOCK_ARRIVALS_MAX = 30`, `MOCK_SOURCES = ["Main record", "Results system"]`,
  `ALERT_PAGE_SIZE = 20`, `interface MockAlerts extends AlertsClient { handleElsewhere(id: string, by: string, status?: "handled" | "dismissed"): void }`,
  `createMockAlerts(opts?: { now?: () => number; me?: () => Promise<string | null>; delayMs?: number; arrivals?: boolean }): MockAlerts`.
  Seeded ids `al-101` … `al-108`; arrivals `al-n1`, `al-n2`, ….
- Produces (`tests/alerts.ts`): `ALERT_NOW`, `at(h: number, m: number): string`,
  `makeAlert(over?: Partial<AlertOut>): AlertOut`,
  `mockAlerts(o?: { now?: () => number; arrivals?: boolean }): MockAlerts`.

- [ ] **Step 1: Write the contract, the error and the interface**

Create `lib/api/alerts-contract.ts`:

```ts
// Patient alerts and notification settings, hand-written from Plan 5a's
// assumed contract (spec §10 item 20). To be replaced by types generated from
// the backend OpenAPI schema. EMR-agnostic (ADR 0003): the API sends MHAI's
// canonical shape with display labels; `emr_link` and `source_label` come
// from the backend as they are, and nothing here names a vendor.
import type { Sex } from "./contract";

export type AlertSeverity = "critical" | "urgent" | "info";
/** `handled` means acknowledged. The list filter uses the same three words. */
export type AlertStatus = "new" | "handled" | "dismissed";
export type FindingFlag = "low" | "high" | "abnormal";
/** The result labels' levels (spec §6): High confidence, Use with caution, Needs review. */
export type CauseConfidence = "high" | "caution" | "review";
export type DismissReason =
  "not_relevant" | "already_known" | "wrong_patient" | "other";

/** Where the patient is. Ward, bed and clinic come as display labels. */
export type AlertLocationOut =
  | { kind: "admitted"; ward: string; bed: string | null }
  | { kind: "outpatient"; clinic: string | null }
  | { kind: "emergency" }
  | { kind: "not_recorded" };

export interface FindingOut {
  /** Display label, e.g. "Potassium"; the source's own label when not standardised. */
  name: string;
  /** As recorded, e.g. "2.9" or "Positive". */
  value: string | null;
  /** e.g. "mmol/L". */
  unit: string | null;
  flag: FindingFlag | null;
  /** The source's reference range as given, e.g. "3.5–5.1". */
  reference_range: string | null;
  /** ISO 8601. */
  recorded_at: string | null;
  /** Kept for audit; never shown. */
  code_system: string | null;
  /** False while the source's code isn't mapped (ADR 0003): "Not standardised". */
  standardised: boolean;
}

export interface LikelyCauseOut {
  label: string;
  confidence: CauseConfidence;
}

export interface AlertPatientOut {
  full_name: string;
  /** The hospital's own MRN. */
  mrn: string;
  /** Null reads "Location not recorded". */
  location: AlertLocationOut | null;
}

export interface AlertOut {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  finding: FindingOut;
  /** At most three, strongest first. Suggestions, never a diagnosis. */
  likely_causes: LikelyCauseOut[];
  patient: AlertPatientOut;
  age: number | null;
  sex: Sex | null;
  /** The hospital's own label for the system it came from; never a vendor name. */
  source_label: string | null;
  /** Opens the patient's record in the hospital's system; built by the backend. */
  emr_link: string | null;
  /** Who acknowledged or dismissed it, and when (ISO 8601). */
  handled_by: { display_name: string } | null;
  handled_at: string | null;
  dismiss_reason: DismissReason | null;
  created_at: string;
}

export interface AlertQuery {
  status?: AlertStatus;
  severity?: AlertSeverity;
  /** One of the list's `sources`. */
  source?: string;
  cursor?: string;
  limit?: number;
}

export interface AlertPageOut {
  /** Newest first. */
  alerts: AlertOut[];
  next_cursor: string | null;
  /** The hospital's own labels for its connected systems (R10). */
  sources: string[];
}

export interface UnreadCountOut {
  /** New alerts for you that no one has handled yet (R1). */
  count: number;
}

export interface DismissIn {
  reason: DismissReason;
  /** At most 500 characters; omitted when empty. */
  note?: string;
}

/** The 409 `already_handled` reply: who handled it first, and how (R7). */
export interface AlertHandledOut {
  status: Exclude<AlertStatus, "new">;
  handled_by: { display_name: string } | null;
  handled_at: string | null;
}

export interface NotificationSettingsOut {
  alert_popups: boolean;
  correction_popups: boolean;
}
export type NotificationSettingsPatchIn = Partial<NotificationSettingsOut>;
```

Append to `lib/api/errors.ts`:

```ts
import type { AlertHandledOut } from "./alerts-contract";

/** 409 `already_handled`: someone else acknowledged or dismissed the alert first (R7). */
export class AlertHandledError extends ApiError {
  constructor(readonly handled: AlertHandledOut) {
    super(409, "already_handled");
    this.name = "AlertHandledError";
  }
}

export const isAlertHandled = (e: unknown): e is AlertHandledError =>
  e instanceof AlertHandledError;
```

(Move the `import type` line to the top of the file, above `ApiError`.)

Create `lib/api/alerts.ts`:

```ts
import type {
  AlertOut,
  AlertPageOut,
  AlertQuery,
  DismissIn,
  NotificationSettingsOut,
  NotificationSettingsPatchIn,
  UnreadCountOut,
} from "./alerts-contract";
import type { WriteOpts } from "./contract";
import { createLiveAlertsClient } from "./live-alerts";
import { createMockAlerts } from "./mock-alerts";

/** Patient alerts and the signed-in clinician's notification settings. */
export interface AlertsClient {
  listAlerts(q: AlertQuery): Promise<AlertPageOut>;
  getUnreadCount(): Promise<UnreadCountOut>;
  /** Throws `AlertHandledError` when someone else handled it first. */
  acknowledgeAlert(id: string, opts?: WriteOpts): Promise<AlertOut>;
  /** Throws `AlertHandledError` when someone else handled it first. */
  dismissAlert(id: string, d: DismissIn, opts?: WriteOpts): Promise<AlertOut>;
  getNotificationSettings(): Promise<NotificationSettingsOut>;
  updateNotificationSettings(
    p: NotificationSettingsPatchIn,
    opts?: WriteOpts,
  ): Promise<NotificationSettingsOut>;
}

let alerts: AlertsClient | undefined;

/** Sample alerts when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAlertsClient(): AlertsClient {
  return (alerts ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAlerts()
      : createLiveAlertsClient());
}
```

Create a stub `lib/api/live-alerts.ts` so the import resolves (Task 2
replaces it):

```ts
import type { AlertsClient } from "./alerts";

/** Replaced in Task 2. */
export function createLiveAlertsClient(): AlertsClient {
  throw new Error("The live alerts client arrives in Task 2");
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/alerts.ts`:

```ts
import type { AlertOut } from "@/lib/api/alerts-contract";
import { createMockAlerts, type MockAlerts } from "@/lib/api/mock-alerts";

/** "Now" in alert tests: 17 Oct 2026, 09:00 local time, so clock times read the same in any zone. */
export const ALERT_NOW = new Date(2026, 9, 17, 9, 0, 0).getTime();

/** An ISO time on the test day, at a local hour and minute. */
export const at = (h: number, m: number) =>
  new Date(2026, 9, 17, h, m).toISOString();

/** A new Critical alert for a synthetic patient on Ward 3. */
export function makeAlert(over: Partial<AlertOut> = {}): AlertOut {
  return {
    id: "al-test",
    severity: "critical",
    status: "new",
    finding: {
      name: "Potassium",
      value: "2.9",
      unit: "mmol/L",
      flag: "low",
      reference_range: "3.5–5.1",
      recorded_at: at(8, 42),
      code_system: "LOINC",
      standardised: true,
    },
    likely_causes: [
      { label: "Diuretic treatment", confidence: "high" },
      { label: "Vomiting or diarrhoea", confidence: "caution" },
      { label: "Low magnesium", confidence: "review" },
    ],
    patient: {
      full_name: "Maryam Abdullahi",
      mrn: "204817",
      location: { kind: "admitted", ward: "Ward 3", bed: "Bed 12" },
    },
    age: 67,
    sex: "female",
    source_label: "Main record",
    emr_link: "https://record.example/open/al-test",
    handled_by: null,
    handled_at: null,
    dismiss_reason: null,
    created_at: at(8, 44),
    ...over,
  };
}

/** The sample alerts on a fixed clock, no delay, acting as Dr. Reyes; no arrivals unless asked. */
export const mockAlerts = (
  o: { now?: () => number; arrivals?: boolean } = {},
): MockAlerts =>
  createMockAlerts({
    now: o.now ?? (() => ALERT_NOW),
    me: async () => "Dr. Reyes",
    delayMs: 0,
    arrivals: o.arrivals ?? false,
  });
```

Create `lib/api/mock-alerts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ALERT_NOW, mockAlerts } from "@/tests/alerts";
import { AlertHandledError, ApiError } from "./errors";
import {
  ALERT_PAGE_SIZE,
  MOCK_ALERT_EVERY_MS,
  MOCK_ARRIVALS_MAX,
  MOCK_SOURCES,
  createMockAlerts,
} from "./mock-alerts";

const NOW_ISO = new Date(ALERT_NOW).toISOString();

describe("sample alerts", () => {
  it("has new, handled and dismissed alerts across severities and places", async () => {
    const { alerts, sources, next_cursor } = await mockAlerts().listAlerts({});
    expect(alerts).toHaveLength(8);
    expect(next_cursor).toBeNull();
    expect(sources).toEqual([...MOCK_SOURCES]);
    expect(new Set(alerts.map((a) => a.severity))).toEqual(
      new Set(["critical", "urgent", "info"]),
    );
    expect(new Set(alerts.map((a) => a.status))).toEqual(
      new Set(["new", "handled", "dismissed"]),
    );
    expect(
      new Set(alerts.map((a) => a.patient.location?.kind ?? "none")),
    ).toEqual(new Set(["admitted", "outpatient", "emergency", "none"]));
    expect(alerts.some((a) => !a.finding.standardised)).toBe(true);
    expect(alerts.some((a) => a.likely_causes.length === 0)).toBe(true);
    const times = alerts.map((a) => Date.parse(a.created_at));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("uses the hospital's own labels and opaque record links, never a vendor", async () => {
    const { alerts } = await mockAlerts().listAlerts({});
    for (const a of alerts) {
      expect(MOCK_SOURCES).toContain(a.source_label);
      expect(a.emr_link).toMatch(
        /^https:\/\/record\.example\/open\/[a-z0-9-]+$/,
      );
      expect(a.emr_link).not.toContain(a.patient.mrn);
    }
    expect(JSON.stringify(alerts)).not.toMatch(/\blab\b/i);
  });

  it("filters by status, severity and source", async () => {
    const m = mockAlerts();
    const ids = async (q: Parameters<typeof m.listAlerts>[0]) =>
      (await m.listAlerts(q)).alerts.map((a) => a.id);
    expect(await ids({ status: "new" })).toEqual([
      "al-101",
      "al-102",
      "al-103",
      "al-104",
      "al-105",
      "al-106",
    ]);
    expect(await ids({ status: "handled" })).toEqual(["al-107"]);
    expect(await ids({ status: "dismissed" })).toEqual(["al-108"]);
    expect(await ids({ status: "new", severity: "critical" })).toEqual([
      "al-101",
      "al-102",
    ]);
    expect(await ids({ status: "new", source: "Main record" })).toEqual([
      "al-101",
      "al-104",
    ]);
  });

  it("counts the new alerts", async () => {
    expect(await mockAlerts().getUnreadCount()).toEqual({ count: 6 });
  });

  it("brings a new sample alert every two minutes, up to a limit", async () => {
    let t = ALERT_NOW;
    const m = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    expect((await m.getUnreadCount()).count).toBe(6);
    t += MOCK_ALERT_EVERY_MS - 1;
    expect((await m.getUnreadCount()).count).toBe(6);
    t += 1;
    const first = (await m.listAlerts({ status: "new" })).alerts[0]!;
    expect(first).toMatchObject({
      id: "al-n1",
      severity: "urgent",
      status: "new",
      patient: { full_name: "Emeka Nnamdi" },
    });
    expect(Date.parse(first.created_at)).toBe(ALERT_NOW + MOCK_ALERT_EVERY_MS);
    t += MOCK_ALERT_EVERY_MS;
    expect((await m.listAlerts({ status: "new" })).alerts[0]).toMatchObject({
      id: "al-n2",
      severity: "critical",
      patient: { full_name: "Halima Garba" },
    });
    t += 1000 * MOCK_ALERT_EVERY_MS;
    expect((await m.getUnreadCount()).count).toBe(6 + MOCK_ARRIVALS_MAX);
  });

  it("pages with a cursor", async () => {
    let t = ALERT_NOW;
    const m = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 40 * MOCK_ALERT_EVERY_MS;
    const one = await m.listAlerts({ status: "new" });
    expect(one.alerts).toHaveLength(ALERT_PAGE_SIZE);
    expect(one.next_cursor).toBe(String(ALERT_PAGE_SIZE));
    const two = await m.listAlerts({
      status: "new",
      cursor: one.next_cursor!,
    });
    expect(two.alerts).toHaveLength(6 + MOCK_ARRIVALS_MAX - ALERT_PAGE_SIZE);
    expect(two.next_cursor).toBeNull();
    await expect(
      m.listAlerts({ cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("acknowledges as the signed-in clinician", async () => {
    const m = mockAlerts();
    const a = await m.acknowledgeAlert("al-101");
    expect(a).toMatchObject({
      id: "al-101",
      status: "handled",
      handled_by: { display_name: "Dr. Reyes" },
      handled_at: NOW_ISO,
      dismiss_reason: null,
    });
    expect((await m.listAlerts({ status: "handled" })).alerts[0]?.id).toBe(
      "al-101",
    );
    expect((await m.getUnreadCount()).count).toBe(5);
  });

  it("dismisses with a reason", async () => {
    const m = mockAlerts();
    const a = await m.dismissAlert("al-105", {
      reason: "already_known",
      note: "Known kidney disease.",
    });
    expect(a).toMatchObject({
      status: "dismissed",
      handled_by: { display_name: "Dr. Reyes" },
      dismiss_reason: "already_known",
    });
    expect(
      (await m.listAlerts({ status: "dismissed" })).alerts.map((x) => x.id),
    ).toEqual(["al-105", "al-108"]);
  });

  it("refuses a second handling with who and when (409, Review Focus 1)", async () => {
    const m = mockAlerts();
    m.handleElsewhere("al-101", "Dr. Okafor");
    const e = await m.acknowledgeAlert("al-101").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AlertHandledError);
    expect(e).toMatchObject({
      status: 409,
      code: "already_handled",
      handled: {
        status: "handled",
        handled_by: { display_name: "Dr. Okafor" },
        handled_at: NOW_ISO,
      },
    });
    await expect(
      m.dismissAlert("al-101", { reason: "other" }),
    ).rejects.toBeInstanceOf(AlertHandledError);
    m.handleElsewhere("al-102", "Nurse Bello", "dismissed");
    await expect(m.acknowledgeAlert("al-102")).rejects.toMatchObject({
      handled: {
        status: "dismissed",
        handled_by: { display_name: "Nurse Bello" },
      },
    });
  });

  it("answers a retry with the same key with the first result", async () => {
    const m = mockAlerts();
    const first = await m.acknowledgeAlert("al-103", { idempotencyKey: "k1" });
    await expect(
      m.acknowledgeAlert("al-103", { idempotencyKey: "k1" }),
    ).resolves.toEqual(first);
    await expect(
      m.acknowledgeAlert("al-103", { idempotencyKey: "k2" }),
    ).rejects.toBeInstanceOf(AlertHandledError);
  });

  it("refuses an unknown id, an unknown reason and a long note", async () => {
    const m = mockAlerts();
    const missing = await m.acknowledgeAlert("nope").catch((x: unknown) => x);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).toMatchObject({ status: 404, code: "not_found" });
    await expect(
      m.dismissAlert("al-101", { reason: "bored" as never }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      m.dismissAlert("al-101", { reason: "other", note: "x".repeat(501) }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await m.getUnreadCount()).count).toBe(6);
  });

  it("keeps notification settings in memory, both on at first", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const m = mockAlerts();
    expect(await m.getNotificationSettings()).toEqual({
      alert_popups: true,
      correction_popups: true,
    });
    expect(await m.updateNotificationSettings({ alert_popups: false })).toEqual(
      { alert_popups: false, correction_popups: true },
    );
    expect(await m.getNotificationSettings()).toEqual({
      alert_popups: false,
      correction_popups: true,
    });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("returns copies, so callers can't change the samples", async () => {
    const m = mockAlerts();
    const { alerts } = await m.listAlerts({});
    alerts[0]!.patient.full_name = "Changed";
    expect((await m.listAlerts({})).alerts[0]!.patient.full_name).not.toBe(
      "Changed",
    );
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/api/mock-alerts.test.ts`
Expected: FAIL. `./mock-alerts` doesn't exist yet.

- [ ] **Step 4: Build the sample alerts**

Create `lib/api/mock-alerts.ts`:

```ts
import { getAuthClient } from "../auth/client";
import type { AlertsClient } from "./alerts";
import type {
  AlertLocationOut,
  AlertOut,
  AlertSeverity,
  CauseConfidence,
  DismissReason,
  FindingFlag,
  NotificationSettingsOut,
} from "./alerts-contract";
import type { Sex, WriteOpts } from "./contract";
import { AlertHandledError, ApiError } from "./errors";

/** In the demo a new sample alert arrives this often (spec §7). */
export const MOCK_ALERT_EVERY_MS = 120_000;
/** Arrivals stop after this many, so a long demo stays small. */
export const MOCK_ARRIVALS_MAX = 30;
/** The sample hospital's connected systems, by its own labels (R17, ADR 0003). */
export const MOCK_SOURCES = ["Main record", "Results system"] as const;
export const ALERT_PAGE_SIZE = 20;

const MIN = 60_000;
const NOTE_MAX = 500;
const REASONS = new Set<DismissReason>([
  "not_relevant",
  "already_known",
  "wrong_patient",
  "other",
]);

type Source = (typeof MOCK_SOURCES)[number];

/** One synthetic alert. Every name and MRN here is invented. */
interface Sample {
  severity: AlertSeverity;
  finding: {
    name: string;
    value: string | null;
    unit: string | null;
    flag: FindingFlag | null;
    range: string | null;
    standardised?: boolean;
  };
  causes: [string, CauseConfidence][];
  name: string;
  mrn: string;
  location: AlertLocationOut | null;
  age: number | null;
  sex: Sex | null;
  source: Source;
}

interface Seed extends Sample {
  id: string;
  minutesAgo: number;
  handled?: {
    status: "handled" | "dismissed";
    by: string;
    minutesAgo: number;
    reason?: DismissReason;
  };
}

const SEEDS: Seed[] = [
  {
    id: "al-101",
    minutesAgo: 18,
    severity: "critical",
    finding: {
      name: "Potassium",
      value: "2.9",
      unit: "mmol/L",
      flag: "low",
      range: "3.5–5.1",
    },
    causes: [
      ["Diuretic treatment", "high"],
      ["Vomiting or diarrhoea", "caution"],
      ["Low magnesium", "review"],
    ],
    name: "Maryam Abdullahi",
    mrn: "204817",
    location: { kind: "admitted", ward: "Ward 3", bed: "Bed 12" },
    age: 67,
    sex: "female",
    source: "Main record",
  },
  {
    id: "al-102",
    minutesAgo: 35,
    severity: "critical",
    finding: {
      name: "Lactate",
      value: "4.8",
      unit: "mmol/L",
      flag: "high",
      range: "0.5–2.2",
    },
    causes: [
      ["Sepsis", "caution"],
      ["Poor blood flow to the tissues", "review"],
    ],
    name: "Ibrahim Danladi",
    mrn: "377190",
    location: { kind: "emergency" },
    age: 59,
    sex: "male",
    source: "Results system",
  },
  {
    id: "al-103",
    minutesAgo: 52,
    severity: "urgent",
    finding: {
      name: "Haemoglobin",
      value: "7.1",
      unit: "g/dL",
      flag: "low",
      range: "12.0–15.5",
    },
    causes: [
      ["Bleeding", "caution"],
      ["Iron deficiency", "caution"],
      ["Long-term kidney disease", "review"],
    ],
    name: "Esther Okoye",
    mrn: "128844",
    location: { kind: "outpatient", clinic: "Cardiology clinic" },
    age: 74,
    sex: "female",
    source: "Results system",
  },
  {
    id: "al-104",
    minutesAgo: 70,
    severity: "urgent",
    finding: {
      name: "Heart rate",
      value: "128",
      unit: "/min",
      flag: "high",
      range: "60–100",
    },
    causes: [
      ["Fever", "caution"],
      ["Dehydration", "review"],
    ],
    name: "Oluwafunmilayo Adebayo-Ogunleye-Fashola",
    mrn: "559031",
    location: null,
    age: 38,
    sex: "female",
    source: "Main record",
  },
  {
    id: "al-105",
    minutesAgo: 95,
    severity: "info",
    finding: {
      name: "Creatinine",
      value: "168",
      unit: "µmol/L",
      flag: "high",
      range: "45–90",
    },
    causes: [
      ["Dehydration", "caution"],
      ["Medicine side effect", "review"],
    ],
    name: "Samuel Bassey",
    mrn: "640212",
    location: { kind: "admitted", ward: "Ward 5", bed: null },
    age: 81,
    sex: "male",
    source: "Results system",
  },
  {
    id: "al-106",
    minutesAgo: 120,
    severity: "info",
    finding: {
      name: "HS-TROP (local code)",
      value: "52",
      unit: "ng/L",
      flag: "high",
      range: "<14",
      standardised: false,
    },
    causes: [],
    name: "Blessing Uche",
    mrn: "702366",
    location: { kind: "outpatient", clinic: null },
    age: 63,
    sex: "female",
    source: "Results system",
  },
  {
    id: "al-107",
    minutesAgo: 180,
    severity: "urgent",
    finding: {
      name: "Sodium",
      value: "128",
      unit: "mmol/L",
      flag: "low",
      range: "135–145",
    },
    causes: [["Diuretic treatment", "caution"]],
    name: "Kemi Afolabi",
    mrn: "815540",
    location: { kind: "admitted", ward: "Ward 2", bed: "Bed 7" },
    age: 70,
    sex: "female",
    source: "Main record",
    handled: { status: "handled", by: "Dr. Okafor", minutesAgo: 150 },
  },
  {
    id: "al-108",
    minutesAgo: 300,
    severity: "info",
    finding: {
      name: "Glucose",
      value: "11.2",
      unit: "mmol/L",
      flag: "high",
      range: "3.9–7.8",
    },
    causes: [["Known diabetes", "high"]],
    name: "Peter Ogbu",
    mrn: "903117",
    location: { kind: "outpatient", clinic: "Diabetes clinic" },
    age: 52,
    sex: "male",
    source: "Main record",
    handled: {
      status: "dismissed",
      by: "Nurse Bello",
      minutesAgo: 280,
      reason: "already_known",
    },
  },
];

/** What arrives in the demo, in this order, again and again (spec §7). */
const ARRIVALS: Sample[] = [
  {
    severity: "urgent",
    finding: {
      name: "Platelets",
      value: "62",
      unit: "×10⁹/L",
      flag: "low",
      range: "150–400",
    },
    causes: [
      ["Medicine side effect", "caution"],
      ["Infection", "review"],
    ],
    name: "Emeka Nnamdi",
    mrn: "318552",
    location: { kind: "admitted", ward: "Ward 2", bed: "Bed 4" },
    age: 45,
    sex: "male",
    source: "Results system",
  },
  {
    severity: "critical",
    finding: {
      name: "Potassium",
      value: "6.7",
      unit: "mmol/L",
      flag: "high",
      range: "3.5–5.1",
    },
    causes: [
      ["Kidney injury", "caution"],
      ["Medicine side effect", "caution"],
      ["Sample damaged in handling", "review"],
    ],
    name: "Halima Garba",
    mrn: "401276",
    location: { kind: "emergency" },
    age: 72,
    sex: "female",
    source: "Results system",
  },
  {
    severity: "info",
    finding: {
      name: "Sodium",
      value: "132",
      unit: "mmol/L",
      flag: "low",
      range: "135–145",
    },
    causes: [["Medicine side effect", "review"]],
    name: "Joseph Eke",
    mrn: "512903",
    location: { kind: "outpatient", clinic: "Renal clinic" },
    age: 58,
    sex: "male",
    source: "Main record",
  },
];

const iso = (ms: number) => new Date(ms).toISOString();

function build(id: string, s: Sample, createdAt: number): AlertOut {
  return {
    id,
    severity: s.severity,
    status: "new",
    finding: {
      name: s.finding.name,
      value: s.finding.value,
      unit: s.finding.unit,
      flag: s.finding.flag,
      reference_range: s.finding.range,
      recorded_at: iso(createdAt - 4 * MIN),
      code_system: s.finding.standardised === false ? null : "LOINC",
      standardised: s.finding.standardised ?? true,
    },
    likely_causes: s.causes.map(([label, confidence]) => ({
      label,
      confidence,
    })),
    patient: { full_name: s.name, mrn: s.mrn, location: s.location },
    age: s.age,
    sex: s.sex,
    source_label: s.source,
    // An opaque link, as the backend would build it; never the MRN.
    emr_link: `https://record.example/open/${id}`,
    handled_by: null,
    handled_at: null,
    dismiss_reason: null,
    created_at: iso(createdAt),
  };
}

function seed(s: Seed, start: number): AlertOut {
  const a = build(s.id, s, start - s.minutesAgo * MIN);
  if (s.handled) {
    a.status = s.handled.status;
    a.handled_by = { display_name: s.handled.by };
    a.handled_at = iso(start - s.handled.minutesAgo * MIN);
    a.dismiss_reason = s.handled.reason ?? null;
  }
  return a;
}

const newest = (x: AlertOut, y: AlertOut) =>
  Date.parse(y.created_at) - Date.parse(x.created_at);

/** For tests: lets a colleague handle an alert first (Review Focus 1). */
export interface MockAlerts extends AlertsClient {
  handleElsewhere(
    id: string,
    by: string,
    status?: "handled" | "dismissed",
  ): void;
}

/**
 * The demo's patient alerts: memory only (a reload resets them), never
 * stored. A new one arrives every MOCK_ALERT_EVERY_MS while `arrivals` is on.
 * It enforces what the backend must: one handling per alert (409 with who
 * and when), idempotent retries, the reasons and the note limit.
 */
export function createMockAlerts({
  now = () => Date.now(),
  me: meOpt,
  delayMs = 150,
  arrivals = true,
}: {
  now?: () => number;
  me?: () => Promise<string | null>;
  delayMs?: number;
  arrivals?: boolean;
} = {}): MockAlerts {
  const start = now();
  const rows: AlertOut[] = SEEDS.map((s) => seed(s, start));
  const done = new Map<string, AlertOut>();
  let arrived = 0;
  let settings: NotificationSettingsOut = {
    alert_popups: true,
    correction_popups: true,
  };
  const me =
    meOpt ??
    (async () =>
      (await getAuthClient().getSession())?.user.displayName ?? null);

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };
  const copy = (a: AlertOut): AlertOut => structuredClone(a);
  const catchUp = () => {
    if (!arrivals) return;
    const due = Math.min(
      MOCK_ARRIVALS_MAX,
      Math.floor((now() - start) / MOCK_ALERT_EVERY_MS),
    );
    while (arrived < due) {
      arrived += 1;
      rows.push(
        build(
          `al-n${arrived}`,
          ARRIVALS[(arrived - 1) % ARRIVALS.length]!,
          start + arrived * MOCK_ALERT_EVERY_MS,
        ),
      );
    }
  };
  const find = (id: string) =>
    rows.find((a) => a.id === id) ?? fail(404, "not_found");

  async function handle(
    id: string,
    status: "handled" | "dismissed",
    reason: DismissReason | null,
    opts?: WriteOpts,
  ): Promise<AlertOut> {
    await wait();
    catchUp();
    const key = opts?.idempotencyKey;
    const before = key ? done.get(key) : undefined;
    if (before) return copy(before);
    const a = find(id);
    if (a.status !== "new")
      throw new AlertHandledError({
        status: a.status,
        handled_by: a.handled_by ? { ...a.handled_by } : null,
        handled_at: a.handled_at,
      });
    a.status = status;
    a.handled_by = { display_name: (await me()) ?? "You" };
    a.handled_at = iso(now());
    a.dismiss_reason = reason;
    if (key) done.set(key, copy(a));
    return copy(a);
  }

  return {
    async listAlerts(q) {
      await wait();
      catchUp();
      const all = rows
        .filter(
          (a) =>
            (!q.status || a.status === q.status) &&
            (!q.severity || a.severity === q.severity) &&
            (!q.source || a.source_label === q.source),
        )
        .sort(newest);
      const from = q.cursor === undefined ? 0 : Number(q.cursor);
      if (!Number.isInteger(from) || from < 0) fail(422, "invalid_cursor");
      const size = q.limit ?? ALERT_PAGE_SIZE;
      return {
        alerts: all.slice(from, from + size).map(copy),
        next_cursor: from + size < all.length ? String(from + size) : null,
        sources: [...MOCK_SOURCES],
      };
    },
    async getUnreadCount() {
      await wait();
      catchUp();
      return { count: rows.filter((a) => a.status === "new").length };
    },
    acknowledgeAlert: (id, opts) => handle(id, "handled", null, opts),
    async dismissAlert(id, d, opts) {
      if (!REASONS.has(d.reason)) fail(422, "invalid_reason");
      if (d.note !== undefined && d.note.length > NOTE_MAX)
        fail(422, "note_too_long");
      return handle(id, "dismissed", d.reason, opts);
    },
    async getNotificationSettings() {
      await wait();
      return { ...settings };
    },
    async updateNotificationSettings(p) {
      await wait();
      settings = {
        alert_popups: p.alert_popups ?? settings.alert_popups,
        correction_popups: p.correction_popups ?? settings.correction_popups,
      };
      return { ...settings };
    },
    handleElsewhere(id, by, status = "handled") {
      const a = rows.find((x) => x.id === id);
      if (!a) return;
      a.status = status;
      a.handled_by = { display_name: by };
      a.handled_at = iso(now());
      a.dismiss_reason = status === "dismissed" ? "other" : null;
    },
  };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/api/mock-alerts.test.ts`
Expected: PASS.

- [ ] **Step 6: Check and commit**

Run: `npx prettier --write lib/api tests/alerts.ts && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add lib/api/alerts-contract.ts lib/api/alerts.ts lib/api/errors.ts lib/api/mock-alerts.ts lib/api/mock-alerts.test.ts lib/api/live-alerts.ts tests/alerts.ts
git commit -m "Add the patient alerts contract and the sample alerts"
```

---

### Task 2: The live alerts client, the BFF routes and the backend asks

**Files:**

- Modify: `lib/api/live-alerts.ts` (replace the stub),
  `app/api/v1/[...path]/route.ts`, `app/api/v1/proxy.test.ts`,
  `docs/specs/2026-10-13-ui-design-v3.md` (§10 item 20),
  `ARCHITECTURE.md` (§1 diagram label, §4.8)
- Create: `lib/api/live-alerts.test.ts`
- Test: `lib/api/live-alerts.test.ts`, `app/api/v1/proxy.test.ts`

**Interfaces:**

- Consumes: `AlertsClient` (Task 1), `AlertHandledError`, `ApiError`
  (`lib/api/errors.ts`), `apiRequest`, `keyHeader` (`lib/api/request.ts`),
  `reportUnauthorized` (through `apiRequest`); the proxy's helpers and test
  helpers (`ctx`, `get`, `post`, `session`, `fetchMock`, `writeSession`,
  `TEST_USER`).
- Produces:
  - `createLiveAlertsClient({ fetchImpl }?: { fetchImpl?: typeof fetch }): AlertsClient`,
    calling `/api/v1/alerts*` and `/api/v1/me/notification-settings`;
  - in the proxy: `alertShape(method, path)` and `handledFields(body)`
    (module private); `alerts` and `me` in `ALLOWED`; both areas count as
    clinical, so `canUse(user, "clinical")` applies.

The proxy forwards exactly these shapes (anything else under `alerts` or `me`
is 404 without calling the API):

| Method  | Path                                                        |
| ------- | ----------------------------------------------------------- |
| `GET`   | `alerts`, `alerts/unread-count`, `me/notification-settings` |
| `POST`  | `alerts/{id}/acknowledge`, `alerts/{id}/dismiss`            |
| `PATCH` | `me/notification-settings`                                  |

- [ ] **Step 1: Write the failing tests**

Create `lib/api/live-alerts.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { AlertHandledError, ApiError } from "./errors";
import { createLiveAlertsClient } from "./live-alerts";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAlertsClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
const header = (n: number, name: string) =>
  (call(n)[1].headers as Record<string, string>)[name];
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

describe("live alerts client", () => {
  it("reads alerts, the count and the settings through the proxy", async () => {
    fetchImpl.mockImplementation(async () => Response.json({}));
    await client().listAlerts({});
    await client().listAlerts({
      status: "new",
      severity: "critical",
      source: "Main record",
      cursor: "20",
      limit: 20,
    });
    await client().getUnreadCount();
    await client().getNotificationSettings();
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/alerts",
      "/api/v1/alerts?status=new&severity=critical&source=Main+record&cursor=20&limit=20",
      "/api/v1/alerts/unread-count",
      "/api/v1/me/notification-settings",
    ]);
    expect(call()[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("acknowledges, dismisses and saves settings with the idempotency key", async () => {
    fetchImpl.mockImplementation(async () => Response.json({ id: "a 1" }));
    await client().acknowledgeAlert("a 1", { idempotencyKey: "k1" });
    await client().dismissAlert(
      "a 1",
      { reason: "already_known", note: "Known." },
      { idempotencyKey: "k2" },
    );
    await client().updateNotificationSettings(
      { alert_popups: false },
      { idempotencyKey: "k3" },
    );
    expect(call(0)[0]).toBe("/api/v1/alerts/a%201/acknowledge");
    expect(call(0)[1]).toMatchObject({ method: "POST" });
    expect(call(0)[1].body).toBeUndefined();
    expect(header(0, "Idempotency-Key")).toBe("k1");
    expect(call(1)[0]).toBe("/api/v1/alerts/a%201/dismiss");
    expect(JSON.parse(call(1)[1].body as string)).toEqual({
      reason: "already_known",
      note: "Known.",
    });
    expect(header(1, "Idempotency-Key")).toBe("k2");
    expect(call(2)[0]).toBe("/api/v1/me/notification-settings");
    expect(call(2)[1]).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(call(2)[1].body as string)).toEqual({
      alert_popups: false,
    });
    expect(header(2, "Idempotency-Key")).toBe("k3");
  });

  it("builds the who-and-when error from a 409 (Review Focus 1)", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json(
        {
          code: "already_handled",
          status: "dismissed",
          handled_by: { display_name: "Nurse Bello" },
          handled_at: "2026-10-17T08:59:00.000Z",
        },
        { status: 409 },
      ),
    );
    const e = await client()
      .acknowledgeAlert("al-1")
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AlertHandledError);
    expect(e).toMatchObject({
      status: 409,
      code: "already_handled",
      handled: {
        status: "dismissed",
        handled_by: { display_name: "Nurse Bello" },
        handled_at: "2026-10-17T08:59:00.000Z",
      },
    });
  });

  it("reads a sparse 409 as handled by someone unnamed", async () => {
    fetchImpl.mockImplementation(async () =>
      Response.json({ code: "already_handled" }, { status: 409 }),
    );
    await expect(
      client().dismissAlert("al-1", { reason: "other" }),
    ).rejects.toMatchObject({
      handled: { status: "handled", handled_by: null, handled_at: null },
    });
  });

  it("keeps only the code for other refusals, signs out on 401 and reports no network", async () => {
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "not_found", detail: "x" }, { status: 404 }),
    );
    const e = await client()
      .listAlerts({})
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).not.toBeInstanceOf(AlertHandledError);
    expect(e).toMatchObject({ status: 404, code: "not_found" });
    fetchImpl.mockImplementationOnce(
      async () => new Response(null, { status: 401 }),
    );
    await expect(client().getUnreadCount()).rejects.toMatchObject({
      status: 401,
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);
    fetchImpl.mockImplementationOnce(async () => {
      throw new TypeError("offline");
    });
    await expect(client().getUnreadCount()).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
  });
});
```

Append to `app/api/v1/proxy.test.ts`:

```ts
describe("patient alert and notification settings routes", () => {
  const as = (roles: Role[]) =>
    writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles },
      steps: [],
    });
  const write = (
    method: string,
    body?: string,
    origin = "http://demo.test",
    extra: Record<string, string> = {},
  ) =>
    new Request("http://demo.test/api/v1/alerts?x=1", {
      method,
      headers: {
        host: "demo.test",
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body,
    });
  const handlers = { GET, POST, PATCH, DELETE } as const;
  const send = (method: string, path: string[]) =>
    handlers[method as keyof typeof handlers](
      method === "GET"
        ? get()
        : write(method, method === "DELETE" ? undefined : "{}"),
      ctx(...path),
    );

  it.each([
    ["GET", ["alerts"]],
    ["GET", ["alerts", "unread-count"]],
    ["GET", ["me", "notification-settings"]],
    ["POST", ["alerts", "al-1", "acknowledge"]],
    ["POST", ["alerts", "al-1", "dismiss"]],
    ["PATCH", ["me", "notification-settings"]],
  ])("forwards %s %j for a clinician", async (method, path) => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res = await send(method, path);
    expect(res.status).toBe(200);
    // Writes never forward a query string.
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://api.test/api/v1/${path.join("/")}`,
    );
  });

  it.each([
    ["GET", ["alerts", "al-1"]],
    ["GET", ["alerts", "al-1", "acknowledge"]],
    ["POST", ["alerts"]],
    ["POST", ["alerts", "al-1"]],
    ["POST", ["alerts", "al-1", "delete"]],
    ["POST", ["alerts", "unread-count", "acknowledge"]],
    ["POST", ["alerts", "al-1", "dismiss", "x"]],
    ["POST", ["alerts", "al.1", "acknowledge"]],
    ["PATCH", ["alerts", "al-1"]],
    ["DELETE", ["alerts", "al-1"]],
    ["GET", ["me"]],
    ["GET", ["me", "profile"]],
    ["POST", ["me", "notification-settings"]],
    ["DELETE", ["me", "notification-settings"]],
  ])("refuses %s %j without calling the API", async (method, path) => {
    await session();
    const res = await send(method, path);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an admin-only or platform session, without calling the API", async () => {
    for (const roles of [
      ["hospital_admin"],
      ["admin"],
      ["auditor"],
    ] as Role[][]) {
      await as(roles);
      for (const [method, path] of [
        ["GET", ["alerts"]],
        ["GET", ["alerts", "unread-count"]],
        ["POST", ["alerts", "al-1", "acknowledge"]],
        ["PATCH", ["me", "notification-settings"]],
      ] as [string, string[]][])
        expect((await send(method, path)).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a medical director use them", async () => {
    await as(["clinician", "hospital_admin"]);
    fetchMock.mockResolvedValueOnce(Response.json({ count: 2 }));
    expect((await send("GET", ["alerts", "unread-count"])).status).toBe(200);
  });

  it("guards the writes from other sites and forwards the idempotency key", async () => {
    await session();
    expect(
      (
        await POST(
          write("POST", "{}", "http://evil.test"),
          ctx("alerts", "al-1", "acknowledge"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await PATCH(
          write("PATCH", "{}", "http://evil.test"),
          ctx("me", "notification-settings"),
        )
      ).status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await POST(
      write("POST", "{}", "http://demo.test", { "idempotency-key": "k-1" }),
      ctx("alerts", "al-1", "acknowledge"),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/alerts/al-1/acknowledge");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "k-1",
    );
  });

  it("passes the list filters through", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ alerts: [], next_cursor: null, sources: [] }),
    );
    await GET(
      get(
        "http://demo.test/api/v1/alerts?status=new&severity=critical&cursor=20",
      ),
      ctx("alerts"),
    );
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/alerts?status=new&severity=critical&cursor=20",
    );
  });

  it("keeps only who and when from a 409 already_handled (Review Focus 1)", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          code: "already_handled",
          status: "dismissed",
          handled_by: {
            display_name: "Nurse Bello",
            id: "u-9",
            email: "nurse.bello@hospital.example",
          },
          handled_at: "2026-10-17T08:59:00.000Z",
          patient: { full_name: "Someone Else" },
          detail: "upstream text",
        },
        { status: 409 },
      ),
    );
    const res = await POST(
      write("POST", "{}"),
      ctx("alerts", "al-1", "dismiss"),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "already_handled",
      status: "dismissed",
      handled_by: { display_name: "Nurse Bello" },
      handled_at: "2026-10-17T08:59:00.000Z",
    });
  });

  it("drops a malformed who-and-when, and keeps only the code for any other 409", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          code: "already_handled",
          status: "weird",
          handled_by: { display_name: 42 },
          handled_at: "not a date",
        },
        { status: 409 },
      ),
    );
    const odd = await POST(
      write("POST", "{}"),
      ctx("alerts", "al-1", "acknowledge"),
    );
    expect(await odd.json()).toEqual({
      code: "already_handled",
      status: "handled",
      handled_by: null,
      handled_at: null,
    });
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "already_decided", handled_by: { display_name: "X" } },
        { status: 409 },
      ),
    );
    const other = await POST(post("{}"), ctx("corrections", "c-1", "approve"));
    expect(await other.json()).toEqual({ code: "already_decided" });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/api/live-alerts.test.ts app/api/v1/proxy.test.ts`
Expected: FAIL. The live client is the Task 1 stub ("arrives in Task 2");
the proxy answers `alerts` and `me` with 404.

- [ ] **Step 3: The live client**

Replace `lib/api/live-alerts.ts` with:

```ts
import type { AlertsClient } from "./alerts";
import type { AlertHandledOut, AlertQuery } from "./alerts-contract";
import type { WriteOpts } from "./contract";
import { AlertHandledError, ApiError } from "./errors";
import { apiRequest, keyHeader } from "./request";

/** Who handled it first, read defensively from a 409 `already_handled` (R7). */
function handledFrom(d: Record<string, unknown> | null): AlertHandledOut {
  const by = d?.handled_by as { display_name?: unknown } | null | undefined;
  return {
    status: d?.status === "dismissed" ? "dismissed" : "handled",
    handled_by:
      typeof by?.display_name === "string"
        ? { display_name: by.display_name }
        : null,
    handled_at: typeof d?.handled_at === "string" ? d.handled_at : null,
  };
}

const query = (q: AlertQuery) => {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.severity) p.set("severity", q.severity);
  if (q.source) p.set("source", q.source);
  if (q.cursor) p.set("cursor", q.cursor);
  if (q.limit) p.set("limit", String(q.limit));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Patient alerts and notification settings through this app's /api/v1 proxy. */
export function createLiveAlertsClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AlertsClient {
  async function send<T>(
    path: string,
    method = "GET",
    body?: unknown,
    opts?: WriteOpts,
  ): Promise<T> {
    const { res, data } = await apiRequest(fetchImpl, path, {
      method,
      body,
      headers: keyHeader(opts),
    });
    if (res.ok) return data as T;
    const code = typeof data?.code === "string" ? data.code : "error";
    if (res.status === 409 && code === "already_handled")
      throw new AlertHandledError(handledFrom(data));
    throw new ApiError(res.status, code);
  }
  const id = encodeURIComponent;
  return {
    listAlerts: (q) => send(`/alerts${query(q)}`),
    getUnreadCount: () => send("/alerts/unread-count"),
    acknowledgeAlert: (a, o) =>
      send(`/alerts/${id(a)}/acknowledge`, "POST", undefined, o),
    dismissAlert: (a, d, o) => send(`/alerts/${id(a)}/dismiss`, "POST", d, o),
    getNotificationSettings: () => send("/me/notification-settings"),
    updateNotificationSettings: (p, o) =>
      send("/me/notification-settings", "PATCH", p, o),
  };
}
```

- [ ] **Step 4: The proxy: the alert and settings shapes, and the 409**

In `app/api/v1/[...path]/route.ts`, replace the `ALLOWED` set with:

```ts
const ALLOWED = new Set([
  "queries",
  "feedback",
  "corrections",
  "readyz",
  "hospital",
  "alerts",
  "me",
]);
```

Below `hospitalShape`, add:

```ts
const ALERT_ACTIONS = new Set(["acknowledge", "dismiss"]);

/** Patient alerts and your notification settings: exactly the shapes the alerts client uses (Plan 5a). */
function alertShape(method: string, path: string[]): boolean {
  const [first, second, third] = path;
  if (first === "me")
    return (
      path.length === 2 &&
      second === "notification-settings" &&
      (method === "GET" || method === "PATCH")
    );
  if (method === "GET")
    return (
      path.length === 1 || (path.length === 2 && second === "unread-count")
    );
  return (
    method === "POST" &&
    path.length === 3 &&
    second !== "unread-count" &&
    ALERT_ACTIONS.has(third ?? "")
  );
}

/**
 * A 409 `already_handled` keeps who handled the alert and when, so the card
 * can say so (R7). Nothing else from the API's reply is passed on.
 */
function handledFields(p: Record<string, unknown> | null) {
  const by = p?.handled_by as { display_name?: unknown } | null | undefined;
  const name =
    typeof by?.display_name === "string" ? by.display_name.slice(0, 200) : null;
  const at =
    typeof p?.handled_at === "string" && !Number.isNaN(Date.parse(p.handled_at))
      ? p.handled_at
      : null;
  return {
    status: p?.status === "dismissed" ? "dismissed" : "handled",
    handled_by: name === null ? null : { display_name: name },
    handled_at: at,
  };
}
```

In `shapeAllowed`, after the `hospital` line, add:

```ts
if (path[0] === "alerts" || path[0] === "me") return alertShape(method, path);
```

and change the doc comment above `shapeAllowed` to
`/** Only the shapes the clients use (Plans 3, 4 and 5a). */`.

Replace the `if (!res.ok) { … }` block in `handle` with:

```ts
if (!res.ok) {
  // Never echo upstream error text: keep only the problem code (and, for a
  // 409 already_handled on an alert, who and when).
  const p = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const code = typeof p?.code === "string" ? p.code : "error";
  return json(
    res.status,
    res.status === 409 && code === "already_handled" && path[0] === "alerts"
      ? { code, ...handledFields(p) }
      : { code },
  );
}
```

The area rule needs no change: everything outside `hospital` is clinical,
so alerts and settings need `canUse(user, "clinical")` and finished first
sign-in. Change the comment on `handle` to
`/** Same-origin proxy for clinical, alert and hospital admin calls: adds the token the browser never sees. */`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/api app/api`
Expected: PASS (the existing proxy, live and mock tests too, including
"refuses PATCH and DELETE on clinical routes").

- [ ] **Step 6: Tell the backend (spec §10 item 20; ARCHITECTURE)**

In `docs/specs/2026-10-13-ui-design-v3.md` §10, after item 19, add:

```markdown
20. **Patient alerts and notification settings.** **Assumed contract**
    (Plan 5a; notifications design §9). The frontend calls these until the
    backend defines them, so please match them or tell us what changed.
    Alerts are raised from the EMR/EHR feed on MHAI's canonical model (ADR 0003) with a clinician always in the loop, and nothing is sent to
    patients. Every route is for the signed-in clinician (clinicians only),
    scoped to their hospital and routing (set by the hospital admin later):
    - `GET /alerts?status=new|handled|dismissed&severity=critical|urgent|info&source=<label>&cursor&limit`
      → `{alerts, next_cursor, sources}`, newest first. `sources` lists the
      hospital's own labels for its connected systems; the UI shows
      `source_label` and a Source filter only when there is more than one;
    - each alert has `id`, `severity`, `status` (`new`, `handled` meaning
      acknowledged, or `dismissed`), `finding` (`name`: the display label, or
      the source's own label when unmapped; `value`; `unit`; `flag`: `low`,
      `high`, `abnormal` or null; `reference_range` as the source gives it;
      `recorded_at`; `code_system`; `standardised`), `likely_causes` (at most
      three: `label` and `confidence`, one of `high`, `caution` or `review`),
      `patient` (`full_name`; `mrn`, the hospital's own; `location`:
      `{kind: "admitted", ward, bed}`, `{kind: "outpatient", clinic}`,
      `{kind: "emergency"}`, `{kind: "not_recorded"}` or null, with display
      labels), `age`, `sex`, `source_label` (hospital-chosen, never a vendor
      name), `emr_link` (an `https` link the backend builds; the UI never
      builds one), `handled_by` (`{display_name}`), `handled_at`,
      `dismiss_reason` and `created_at`;
    - `GET /alerts/unread-count` → `{count}`: new alerts for this clinician
      that no one has acknowledged or dismissed;
    - `POST /alerts/{id}/acknowledge` → the alert;
    - `POST /alerts/{id}/dismiss {reason, note?}` → the alert; `reason` is one
      of `not_relevant`, `already_known`, `wrong_patient` or `other`, and
      `note` is up to 500 characters. The reason is kept to tune alerts;
    - **409** `already_handled` when someone else acknowledged or dismissed
      it first, with `status`, `handled_by: {display_name}` and `handled_at`
      (the frontend's proxy passes on only these three); **404** `not_found`
      for an unknown id. A hospital without alerts yet answers these routes
      with **404**, which the UI reads as "not switched on";
    - `GET /me/notification-settings` → `{alert_popups, correction_popups}`,
      both `true` for a new account; `PATCH /me/notification-settings` with
      either field → the same. Critical alerts pop up whatever
      `alert_popups` says (a UI rule, not a setting);
    - honour `Idempotency-Key` on acknowledge, dismiss and the settings
      `PATCH`, kept as long as for `POST /feedback` (items 15 and 19);
    - this is the first place MHAI shows patient names and MRNs: send
      `Cache-Control: no-store` on every alert response. Live use waits for
      the clinical and privacy sign-off (notifications design §5).
```

In `ARCHITECTURE.md` §1, change the edge label
`cside -- "queries, results, feedback, corrections" --> gw` to
`cside -- "queries, results, feedback, corrections, alerts" --> gw`. After
§4.7, add:

```markdown
### 4.8 Notifications and patient alerts

Spec: `docs/specs/2026-10-17-notifications-design.md`. Clinicians only.

- **One bell** in the top bar: new patient alerts plus decisions on your
  corrections, in one count. Its panel shows the latest of both and "See
  all".
- **Routes:** `/notifications` (Patient alerts: New, Handled, Dismissed,
  severity and, with more than one connected system, source) and
  `/notifications/corrections` (decisions on your corrections).
- **Calls:** through the same-origin proxy to `/api/v1/alerts*` and
  `/api/v1/me/notification-settings`, exactly the shapes the alerts client
  uses, for clinicians only. Until the backend defines them, they follow the
  assumed contract in the design spec §10 item 20. A 409 `already_handled`
  keeps only who and when.
- **Pop-ups:** the first check after sign-in is a baseline. Critical always
  pops up (assertive live region); Urgent, Info and decisions follow the two
  switches in Profile & security → Notifications.
- **EMR-agnostic** ([ADR 0003](docs/adr/0003-many-emr-systems.md)): the
  frontend never talks to an EMR, names a vendor or builds a record link; it
  follows the backend's `emr_link` ("Open patient record") and shows the
  hospital's `source_label`.
- **Privacy:** patient names and MRNs stay in memory (query cache, React
  state, pop-ups), never in storage or the URL, and clear on sign-out. "Ask
  MHAI about it" copies no identifiers into the consultation.
```

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write lib/api app/api docs/specs/2026-10-13-ui-design-v3.md ARCHITECTURE.md && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add lib/api/live-alerts.ts lib/api/live-alerts.test.ts app/api/v1 docs/specs/2026-10-13-ui-design-v3.md ARCHITECTURE.md
git commit -m "Forward the patient alert routes for clinicians only"
```

---

### Task 3: The alert wording and the alert codes

**Files:**

- Create: `lib/notifications/alert-view.ts`, `lib/notifications/alert-view.test.ts`
- Modify: `lib/time.ts`, `lib/time.test.ts`, `lib/admin/activity.ts`,
  `lib/labels.ts`, `lib/labels.test.ts`
- Test: `lib/notifications/alert-view.test.ts`, `lib/time.test.ts`,
  `lib/labels.test.ts`, `lib/admin/activity.test.ts` (unchanged, must still pass)

**Interfaces:**

- Consumes: the alert types (Task 1), `RESULT_LABEL` (`lib/labels.ts`),
  `makeAlert`, `ALERT_NOW`, `at` (`tests/alerts.ts`).
- Produces (`lib/time.ts`): `eventClock(iso: string, now: number): string`
  ("09:41" today, "12 Sep 09:41" before, "" when unreadable), moved from
  `lib/admin/activity.ts`, which re-exports it so its callers don't change.
- Produces (`lib/notifications/alert-view.ts`):
  - `SEVERITY: Record<AlertSeverity, { label: string; tone: "bad" | "warn" | "muted"; rank: number }>`;
  - `severityOf(s: string): AlertSeverity` (unknown → `"urgent"`, R9);
  - `ALERT_STATUS_LABEL: Record<AlertStatus, string>`;
  - `NOT_STANDARDISED`, `LOCATION_NOT_RECORDED`, `CAUSE_MAX = 3`,
    `DISMISS_NOTE_MAX = 500`;
  - `DISMISS_REASONS: readonly { code: DismissReason; label: string }[]`,
    `dismissReasonLabel(r: DismissReason | null): string | null`;
  - `findingLine(f: FindingOut): string`,
    `recordedLabel(f: Pick<FindingOut, "recorded_at">, now: number): string | null`,
    `locationLabel(l: AlertLocationOut | null | undefined): string`;
  - `interface CauseView { label: string; level: CauseConfidence; word: string }`,
    `likelyCauses(a: Pick<AlertOut, "likely_causes">): CauseView[]`;
  - `handledLine(a: Pick<AlertOut, "status" | "handled_by" | "handled_at" | "dismiss_reason">, now: number): string | null`;
  - `recordLink(url: string | null | undefined): string | null`;
  - `showSources(sources: readonly string[] | undefined): boolean`.
- Produces (`lib/labels.ts`): `FORBIDDEN_TERMS` + `already_handled`,
  `not_relevant`, `already_known`, `wrong_patient`, `not_recorded`,
  `alert_popups`, `correction_popups`, `emr_link`, `source_label`,
  `code_system`, `invalid_reason`, `note_too_long`.

- [ ] **Step 1: Write the failing tests**

Create `lib/notifications/alert-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ALERT_NOW, at, makeAlert } from "@/tests/alerts";
import { FORBIDDEN_TERMS } from "../labels";
import {
  ALERT_STATUS_LABEL,
  DISMISS_REASONS,
  LOCATION_NOT_RECORDED,
  NOT_STANDARDISED,
  SEVERITY,
  findingLine,
  handledLine,
  likelyCauses,
  locationLabel,
  recordLink,
  recordedLabel,
  severityOf,
  showSources,
} from "./alert-view";

const f = makeAlert().finding;

describe("alert wording", () => {
  it("writes the finding as in the spec's example", () => {
    expect(findingLine(f)).toBe("Potassium 2.9 mmol/L (low; normal 3.5–5.1)");
    expect(recordedLabel(f, ALERT_NOW)).toBe("08:42");
  });

  it("says where the patient is", () => {
    expect(
      locationLabel({ kind: "admitted", ward: "Ward 3", bed: "Bed 12" }),
    ).toBe("Ward 3 · Bed 12");
    expect(locationLabel({ kind: "admitted", ward: "Ward 5", bed: null })).toBe(
      "Ward 5",
    );
    expect(
      locationLabel({ kind: "outpatient", clinic: "Cardiology clinic" }),
    ).toBe("Outpatient · Cardiology clinic");
    expect(locationLabel({ kind: "outpatient", clinic: null })).toBe(
      "Outpatient",
    );
    expect(locationLabel({ kind: "emergency" })).toBe("Emergency department");
    expect(locationLabel({ kind: "not_recorded" })).toBe(
      "Location not recorded",
    );
  });

  it("gives likely causes the result labels' words, at most three", () => {
    expect(likelyCauses(makeAlert())).toEqual([
      { label: "Diuretic treatment", level: "high", word: "High confidence" },
      {
        label: "Vomiting or diarrhoea",
        level: "caution",
        word: "Use with caution",
      },
      { label: "Low magnesium", level: "review", word: "Needs review" },
    ]);
    const four = makeAlert({
      likely_causes: [
        ...makeAlert().likely_causes,
        { label: "Fourth", confidence: "high" },
      ],
    });
    expect(likelyCauses(four)).toHaveLength(3);
  });

  it("says who handled it and when", () => {
    expect(handledLine(makeAlert(), ALERT_NOW)).toBeNull();
    expect(
      handledLine(
        makeAlert({
          status: "handled",
          handled_by: { display_name: "Dr. Reyes" },
          handled_at: at(9, 12),
        }),
        ALERT_NOW,
      ),
    ).toBe("Acknowledged by Dr. Reyes · 09:12");
    expect(
      handledLine(
        makeAlert({
          status: "dismissed",
          handled_by: { display_name: "Nurse Bello" },
          handled_at: new Date(2026, 9, 16, 4, 20).toISOString(),
          dismiss_reason: "already_known",
        }),
        ALERT_NOW,
      ),
    ).toBe("Dismissed by Nurse Bello · 16 Oct 04:20 · Already known");
  });

  it("opens only an https record link from the API (R8)", () => {
    expect(recordLink("https://record.example/open/a1")).toBe(
      "https://record.example/open/a1",
    );
    for (const bad of [
      null,
      undefined,
      "",
      "http://record.example/open/a1",
      "javascript:alert(1)",
      "/open/a1",
      "not a url",
    ])
      expect(recordLink(bad)).toBeNull();
  });

  it("shows sources only with more than one connected system (R10)", () => {
    expect(showSources(["Main record"])).toBe(false);
    expect(showSources(["Main record", "Results system"])).toBe(true);
    expect(showSources(undefined)).toBe(false);
  });

  it("degrades missing and unusual data without guessing (Review Focus 4)", () => {
    expect(locationLabel(null)).toBe(LOCATION_NOT_RECORDED);
    expect(locationLabel({ kind: "ward-ish" } as never)).toBe(
      LOCATION_NOT_RECORDED,
    );
    expect(
      findingLine({
        ...f,
        value: null,
        flag: null,
        reference_range: null,
      }),
    ).toBe("Potassium");
    expect(findingLine({ ...f, reference_range: null })).toBe(
      "Potassium 2.9 mmol/L (low)",
    );
    expect(findingLine({ ...f, flag: null })).toBe(
      "Potassium 2.9 mmol/L (normal 3.5–5.1)",
    );
    expect(findingLine({ ...f, unit: null })).toBe(
      "Potassium 2.9 (low; normal 3.5–5.1)",
    );
    expect(findingLine({ ...f, flag: "sideways" as never })).toBe(
      "Potassium 2.9 mmol/L (normal 3.5–5.1)",
    );
    expect(recordedLabel({ recorded_at: null }, ALERT_NOW)).toBeNull();
    expect(recordedLabel({ recorded_at: "garbage" }, ALERT_NOW)).toBeNull();
    expect(severityOf("critical")).toBe("critical");
    expect(severityOf("catastrophic")).toBe("urgent");
    expect(severityOf("constructor")).toBe("urgent");
    expect(likelyCauses(makeAlert({ likely_causes: [] }))).toEqual([]);
    expect(
      likelyCauses(
        makeAlert({
          likely_causes: [
            { label: "Odd", confidence: "certain" as never },
            { label: "  ", confidence: "high" },
          ],
        }),
      ),
    ).toEqual([{ label: "Odd", level: "review", word: "Needs review" }]);
    expect(
      handledLine(
        makeAlert({ status: "handled", handled_by: null, handled_at: null }),
        ALERT_NOW,
      ),
    ).toBe("Acknowledged");
  });

  it("uses plain words only, and never 'lab'", () => {
    const shown = [
      ...Object.values(SEVERITY).map((s) => s.label),
      ...Object.values(ALERT_STATUS_LABEL),
      ...DISMISS_REASONS.map((r) => r.label),
      LOCATION_NOT_RECORDED,
      NOT_STANDARDISED,
    ].join(" ");
    for (const term of FORBIDDEN_TERMS)
      expect(shown.toLowerCase()).not.toContain(term.toLowerCase());
    expect(shown).not.toMatch(/\blab\b/i);
  });
});
```

In `lib/time.test.ts`, change the import to
`import { ageLabel, ago, eventClock } from "./time";` and add:

```ts
describe("eventClock", () => {
  it("shows the time today, the date before, and nothing when unreadable", () => {
    const now = new Date(2026, 9, 17, 9, 0).getTime();
    expect(eventClock(new Date(2026, 9, 17, 8, 42).toISOString(), now)).toBe(
      "08:42",
    );
    expect(eventClock(new Date(2026, 9, 16, 4, 20).toISOString(), now)).toBe(
      "16 Oct 04:20",
    );
    expect(eventClock("not a date", now)).toBe("");
  });
});
```

In `lib/labels.test.ts`, add inside `describe("labels")`:

```ts
it("forbids the alert and notification codes", () => {
  for (const code of [
    "already_handled",
    "not_relevant",
    "already_known",
    "wrong_patient",
    "not_recorded",
    "alert_popups",
    "correction_popups",
    "emr_link",
    "source_label",
    "code_system",
  ])
    expect(FORBIDDEN_TERMS).toContain(code);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/notifications lib/time.test.ts lib/labels.test.ts`
Expected: FAIL. `./alert-view` doesn't exist; `eventClock` isn't exported by
`./time`; the alert codes aren't in `FORBIDDEN_TERMS`.

- [ ] **Step 3: Move `eventClock` and add the codes**

Append to `lib/time.ts`:

```ts
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/** "09:41" today; "12 Sep 09:41" before; "" when unreadable. */
export function eventClock(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? CLOCK.format(d) : `${DATE.format(d)} ${CLOCK.format(d)}`;
}
```

In `lib/admin/activity.ts`, delete the `CLOCK` and `DATE` constants and the
`eventClock` function (with its doc comment), and add below the imports:

```ts
// Moved to lib/time.ts so the clinical side shares it (Plan 5a R15).
export { eventClock } from "../time";
```

In `lib/labels.ts`, add to the end of `FORBIDDEN_TERMS` (before
`] as const;`):

```ts
  "already_handled",
  "not_relevant",
  "already_known",
  "wrong_patient",
  "not_recorded",
  "alert_popups",
  "correction_popups",
  "emr_link",
  "source_label",
  "code_system",
  "invalid_reason",
  "note_too_long",
```

- [ ] **Step 4: Write the wording**

Create `lib/notifications/alert-view.ts`:

```ts
import type {
  AlertLocationOut,
  AlertOut,
  AlertSeverity,
  AlertStatus,
  CauseConfidence,
  DismissReason,
  FindingOut,
} from "../api/alerts-contract";
import { RESULT_LABEL } from "../labels";
import { eventClock } from "../time";

/**
 * Severity as a word; the icon is in components/notifications/chips.tsx.
 * `rank` orders pop-ups: most severe first.
 */
export const SEVERITY: Record<
  AlertSeverity,
  { label: string; tone: "bad" | "warn" | "muted"; rank: number }
> = {
  critical: { label: "Critical", tone: "bad", rank: 0 },
  urgent: { label: "Urgent", tone: "warn", rank: 1 },
  info: { label: "Info", tone: "muted", rank: 2 },
};

/** An unknown severity reads Urgent: never quietly downgraded to Info (R9). */
export const severityOf = (s: string): AlertSeverity =>
  Object.hasOwn(SEVERITY, s) ? (s as AlertSeverity) : "urgent";

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  new: "New",
  handled: "Handled",
  dismissed: "Dismissed",
};

export const NOT_STANDARDISED = "Not standardised";
export const LOCATION_NOT_RECORDED = "Location not recorded";
/** Likely causes shown at most (spec §3). */
export const CAUSE_MAX = 3;
/** The longest dismiss note the API takes (spec §10 item 20). */
export const DISMISS_NOTE_MAX = 500;

export const DISMISS_REASONS: readonly {
  code: DismissReason;
  label: string;
}[] = [
  { code: "not_relevant", label: "Not clinically relevant" },
  { code: "already_known", label: "Already known" },
  { code: "wrong_patient", label: "Wrong patient" },
  { code: "other", label: "Other" },
];

export const dismissReasonLabel = (r: DismissReason | null): string | null =>
  DISMISS_REASONS.find((x) => x.code === r)?.label ?? null;

const FLAG_WORD: Record<string, string> = {
  low: "low",
  high: "high",
  abnormal: "abnormal",
};

/**
 * "Potassium 2.9 mmol/L (low; normal 3.5–5.1)". The range is the source's,
 * as given. Missing parts are left out, never guessed (R9).
 */
export function findingLine(f: FindingOut): string {
  const name = f.name?.trim() || "Result";
  const value = f.value?.trim() || null;
  const unit = value ? f.unit?.trim() || null : null;
  const head = [name, value, unit].filter(Boolean).join(" ");
  const flag =
    f.flag && Object.hasOwn(FLAG_WORD, f.flag) ? FLAG_WORD[f.flag] : null;
  const range = f.reference_range?.trim()
    ? `normal ${f.reference_range.trim()}`
    : null;
  const extra = [flag, range].filter(Boolean).join("; ");
  return extra ? `${head} (${extra})` : head;
}

/** When it was recorded: "08:42" today, "16 Oct 08:42" before; null when missing or unreadable. */
export function recordedLabel(
  f: Pick<FindingOut, "recorded_at">,
  now: number,
): string | null {
  return f.recorded_at ? eventClock(f.recorded_at, now) || null : null;
}

/** "Ward 3 · Bed 12", "Outpatient · Cardiology clinic", "Emergency department" or "Location not recorded". */
export function locationLabel(l: AlertLocationOut | null | undefined): string {
  switch (l?.kind) {
    case "admitted":
      return (
        [l.ward?.trim(), l.bed?.trim()].filter(Boolean).join(" · ") ||
        "Admitted"
      );
    case "outpatient":
      return l.clinic?.trim()
        ? `Outpatient · ${l.clinic.trim()}`
        : "Outpatient";
    case "emergency":
      return "Emergency department";
    default:
      return LOCATION_NOT_RECORDED;
  }
}

const LEVELS = new Set<string>(["high", "caution", "review"]);

export interface CauseView {
  label: string;
  level: CauseConfidence;
  /** The result label (spec §6). */
  word: string;
}

/** At most three, with the result labels' words; an unknown level reads "Needs review" (R9). */
export function likelyCauses(a: Pick<AlertOut, "likely_causes">): CauseView[] {
  return (a.likely_causes ?? [])
    .filter((c) => c.label?.trim())
    .slice(0, CAUSE_MAX)
    .map((c) => {
      const level: CauseConfidence = LEVELS.has(c.confidence)
        ? c.confidence
        : "review";
      return { label: c.label.trim(), level, word: RESULT_LABEL[level] };
    });
}

/**
 * "Acknowledged by Dr. Reyes · 09:12";
 * "Dismissed by Nurse Bello · 16 Oct 04:20 · Already known"; null while new.
 */
export function handledLine(
  a: Pick<AlertOut, "status" | "handled_by" | "handled_at" | "dismiss_reason">,
  now: number,
): string | null {
  if (a.status === "new") return null;
  const verb = a.status === "dismissed" ? "Dismissed" : "Acknowledged";
  const name = a.handled_by?.display_name?.trim();
  return [
    name ? `${verb} by ${name}` : verb,
    a.handled_at ? eventClock(a.handled_at, now) || null : null,
    a.status === "dismissed" ? dismissReasonLabel(a.dismiss_reason) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The record link only when the API gave an https one; the UI never builds one (R8). */
export function recordLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The source label and filter only matter with more than one connected system (R10). */
export const showSources = (sources: readonly string[] | undefined) =>
  (sources?.length ?? 0) > 1;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/notifications lib/time.test.ts lib/labels.test.ts lib/admin components/admin`
Expected: PASS (the admin activity tests and screens still find
`eventClock` through the re-export).

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/alert-view.ts lib/notifications/alert-view.test.ts lib/time.ts lib/time.test.ts lib/admin/activity.ts lib/labels.ts lib/labels.test.ts
git commit -m "Word patient alerts plainly, degrading missing data"
```

---

### Task 4: The pop-up rules and the "Ask MHAI about it" prefill

**Files:**

- Create: `lib/notifications/popups.ts`, `lib/notifications/popups.test.ts`,
  `lib/notifications/ask.ts`, `lib/notifications/ask.test.ts`
- Test: `lib/notifications/popups.test.ts`, `lib/notifications/ask.test.ts`

**Interfaces:**

- Consumes: `SEVERITY`, `severityOf`, `findingLine`, `recordedLabel`
  (Task 3), `parseTime` (`lib/corrections.ts`), `emptyForm`, `FormValues`,
  `validate` (`lib/form-schema.ts`), `makeAlert`, `ALERT_NOW`.
- Produces (`lib/notifications/popups.ts`):
  - `NOTIFICATIONS_HREF = "/notifications"`,
    `CORRECTIONS_HREF = "/notifications/corrections"`,
    `NOTIFICATION_TAG = "notifications"`, `POPUP_MAX = 3`,
    `ALERT_POPUP_MS = 12_000`, `SEEN_MAX = 500`;
  - `newAlerts(seen: ReadonlySet<string> | null, next: AlertOut[], since: number): AlertOut[]`;
  - `interface PopupPlan { show: AlertOut[]; rest: AlertOut[] }`,
    `planPopups(fresh: AlertOut[], s: Pick<NotificationSettingsOut, "alert_popups">): PopupPlan`;
  - `interface AlertPopup { title: string; body: string; severity: AlertSeverity; live: "polite" | "assertive"; ms: number | null; viewName: string }`,
    `alertPopup(a: AlertOut): AlertPopup`,
    `moreAlertsPopup(rest: AlertOut[]): AlertPopup | null`.
- Produces (`lib/notifications/ask.ts`):
  `askFromAlert(a: AlertOut, now: number): FormValues`,
  `stashPrefill(values: FormValues): string`,
  `readPrefill(token: string | null): FormValues | null`,
  `clearPrefill(): void`.

- [ ] **Step 1: Write the failing tests**

Create `lib/notifications/popups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AlertSeverity } from "@/lib/api/alerts-contract";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
import {
  ALERT_POPUP_MS,
  POPUP_MAX,
  alertPopup,
  moreAlertsPopup,
  newAlerts,
  planPopups,
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
    expect(newAlerts(null, [fresh("a", "critical")], since)).toEqual([]);
  });

  it("finds alerts not seen before that arrived after sign-in", () => {
    const old = makeAlert({
      id: "old",
      created_at: new Date(since - 60_000).toISOString(),
    });
    const a = fresh("a", "urgent");
    expect(newAlerts(new Set(["x"]), [a, old], since)).toEqual([a]);
    expect(newAlerts(new Set(["a"]), [a], since)).toEqual([]);
  });

  it("skips handled ones, and counts an unreadable time as new", () => {
    const handled = { ...fresh("h", "critical"), status: "handled" as const };
    const odd = { ...fresh("o", "urgent"), created_at: "garbage" };
    expect(newAlerts(new Set(), [handled, odd], since)).toEqual([odd]);
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
```

Create `lib/notifications/ask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
import { validate } from "../form-schema";
import { askFromAlert, clearPrefill, readPrefill, stashPrefill } from "./ask";

describe("askFromAlert", () => {
  it("fills age, sex, priority, and the finding as a symptom and the question", () => {
    const v = askFromAlert(makeAlert(), ALERT_NOW);
    expect(v).toEqual({
      age: "67",
      sex: "female",
      urgency: "emergency",
      symptoms: ["Abnormal result: Potassium 2.9 mmol/L (low; normal 3.5–5.1)"],
      question:
        "Potassium 2.9 mmol/L (low; normal 3.5–5.1), recorded 08:42. What are the likely causes, and what should I check or do next?",
      specialty: "",
      history: "",
    });
    expect(validate(v).ok).toBe(true);
  });

  it("never copies the name, MRN, location, source, record link or suggested causes (R11)", () => {
    const a = makeAlert();
    const text = JSON.stringify(askFromAlert(a, ALERT_NOW));
    for (const s of [
      a.patient.full_name,
      "Maryam",
      "Abdullahi",
      a.patient.mrn,
      "Ward 3",
      "Bed 12",
      a.source_label!,
      a.emr_link!,
      "Diuretic",
      "magnesium",
    ])
      expect(text).not.toContain(s);
  });

  it("maps severity to priority and leaves unknowns blank", () => {
    expect(
      askFromAlert(makeAlert({ severity: "urgent" }), ALERT_NOW).urgency,
    ).toBe("urgent");
    expect(
      askFromAlert(makeAlert({ severity: "info" }), ALERT_NOW).urgency,
    ).toBe("routine");
    const sparse = askFromAlert(
      makeAlert({
        age: null,
        sex: null,
        finding: { ...makeAlert().finding, recorded_at: null },
      }),
      ALERT_NOW,
    );
    expect(sparse).toMatchObject({ age: "", sex: "" });
    expect(sparse.question).toBe(
      "Potassium 2.9 mmol/L (low; normal 3.5–5.1). What are the likely causes, and what should I check or do next?",
    );
    expect(askFromAlert(makeAlert({ age: 130 }), ALERT_NOW).age).toBe("");
  });

  it("keeps a long finding within the form's limits", () => {
    const v = askFromAlert(
      makeAlert({
        finding: { ...makeAlert().finding, name: "x".repeat(3000) },
      }),
      ALERT_NOW,
    );
    expect(v.symptoms[0]!.length).toBeLessThanOrEqual(200);
    expect(v.question.length).toBeLessThanOrEqual(2000);
  });
});

describe("the prefill hand-over", () => {
  it("is read by its token only, in memory, until replaced or cleared", () => {
    const v = askFromAlert(makeAlert(), ALERT_NOW);
    const t = stashPrefill(v);
    expect(t).toMatch(/^[a-z0-9]{12}$/);
    expect(readPrefill(t)).toEqual(v);
    // Reading twice is safe: React may run an initialiser twice.
    expect(readPrefill(t)).toEqual(v);
    expect(readPrefill("other")).toBeNull();
    expect(readPrefill(null)).toBeNull();
    const t2 = stashPrefill({ ...v, age: "1" });
    expect(readPrefill(t)).toBeNull();
    expect(readPrefill(t2)?.age).toBe("1");
    clearPrefill();
    expect(readPrefill(t2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/notifications/popups.test.ts lib/notifications/ask.test.ts`
Expected: FAIL. `./popups` and `./ask` don't exist.

- [ ] **Step 3: Write the pop-up rules**

Create `lib/notifications/popups.ts`:

```ts
import type {
  AlertOut,
  AlertSeverity,
  NotificationSettingsOut,
} from "../api/alerts-contract";
import { parseTime } from "../corrections";
import { SEVERITY, findingLine, severityOf } from "./alert-view";

export const NOTIFICATIONS_HREF = "/notifications";
export const CORRECTIONS_HREF = "/notifications/corrections";
/** Pop-ups from the notification centre share this tag, so sign-out clears them (R4). */
export const NOTIFICATION_TAG = "notifications";
/** At most this many alert pop-ups per check; the rest become one summary (R4). */
export const POPUP_MAX = 3;
/** How long a non-Critical alert pop-up stays. Critical stays until hidden. */
export const ALERT_POPUP_MS = 12_000;
/** Alert ids remembered between checks. */
export const SEEN_MAX = 500;

const isCritical = (a: AlertOut) => severityOf(a.severity) === "critical";
const createdAt = (a: AlertOut) => parseTime(a.created_at);

/**
 * New alerts since the last check. The first check (`seen` null) is a
 * baseline: alerts that already exist never pop up (spec §4). An unreadable
 * time counts as new.
 */
export function newAlerts(
  seen: ReadonlySet<string> | null,
  next: AlertOut[],
  since: number,
): AlertOut[] {
  if (!seen) return [];
  return next.filter(
    (a) =>
      a.status === "new" && !seen.has(a.id) && (createdAt(a) ?? since) >= since,
  );
}

export interface PopupPlan {
  show: AlertOut[];
  rest: AlertOut[];
}

/**
 * Which new alerts pop up: Critical always, the others only when alert
 * pop-ups are on (spec §4). Most severe first, newest first within a level;
 * at most POPUP_MAX, and the rest are summarised (Review Focus 3).
 */
export function planPopups(
  fresh: AlertOut[],
  s: Pick<NotificationSettingsOut, "alert_popups">,
): PopupPlan {
  const eligible = fresh
    .filter((a) => s.alert_popups || isCritical(a))
    .sort(
      (x, y) =>
        SEVERITY[severityOf(x.severity)].rank -
          SEVERITY[severityOf(y.severity)].rank ||
        (createdAt(y) ?? 0) - (createdAt(x) ?? 0),
    );
  return {
    show: eligible.slice(0, POPUP_MAX),
    rest: eligible.slice(POPUP_MAX),
  };
}

export interface AlertPopup {
  title: string;
  body: string;
  severity: AlertSeverity;
  /** Critical is assertive; everything else polite (spec §6). */
  live: "polite" | "assertive";
  /** Null stays until hidden. */
  ms: number | null;
  /** The View button's accessible name. */
  viewName: string;
}

/** "Critical patient alert" · "Halima Garba · Potassium 6.7 mmol/L (high; normal 3.5–5.1)". */
export function alertPopup(a: AlertOut): AlertPopup {
  const severity = severityOf(a.severity);
  const critical = severity === "critical";
  return {
    title: `${SEVERITY[severity].label} patient alert`,
    body: `${a.patient.full_name} · ${findingLine(a.finding)}`,
    severity,
    live: critical ? "assertive" : "polite",
    ms: critical ? null : ALERT_POPUP_MS,
    viewName: `View alert for ${a.patient.full_name}`,
  };
}

/** One pop-up for everything over the cap; null when nothing is left. */
export function moreAlertsPopup(rest: AlertOut[]): AlertPopup | null {
  if (!rest.length) return null;
  const critical = rest.filter(isCritical).length;
  const n = rest.length;
  return {
    title: `${n} more new patient ${n === 1 ? "alert" : "alerts"}`,
    body: critical
      ? `Including ${critical} Critical. See them all in Notifications.`
      : "See them all in Notifications.",
    severity: severityOf(rest[0]!.severity),
    live: critical ? "assertive" : "polite",
    ms: critical ? null : ALERT_POPUP_MS,
    viewName: "View all new patient alerts",
  };
}
```

- [ ] **Step 4: Write the prefill**

Create `lib/notifications/ask.ts`:

```ts
import type { AlertOut, AlertSeverity } from "../api/alerts-contract";
import type { Urgency } from "../api/contract";
import { emptyForm, type FormValues } from "../form-schema";
import { findingLine, recordedLabel, severityOf } from "./alert-view";

const PRIORITY: Record<AlertSeverity, Urgency> = {
  critical: "emergency",
  urgent: "urgent",
  info: "routine",
};
const SYMPTOM_MAX = 200;
const QUESTION_MAX = 2000;

/**
 * A consultation pre-filled from an alert (spec §3): age, sex, a priority
 * from the severity, and the finding as a symptom and as the question. Never
 * the patient's name, MRN or location, the source, the record link, or
 * MHAI's suggested causes: the consultation reasons on its own (R11, spec §5).
 */
export function askFromAlert(a: AlertOut, now: number): FormValues {
  const line = findingLine(a.finding);
  const when = recordedLabel(a.finding, now);
  const age =
    a.age !== null && Number.isInteger(a.age) && a.age >= 0 && a.age <= 120
      ? String(a.age)
      : "";
  return {
    ...emptyForm,
    age,
    sex: a.sex ?? "",
    urgency: PRIORITY[severityOf(a.severity)],
    symptoms: [`Abnormal result: ${line}`.slice(0, SYMPTOM_MAX)],
    question:
      `${line}${when ? `, recorded ${when}` : ""}. What are the likely causes, and what should I check or do next?`.slice(
        0,
        QUESTION_MAX,
      ),
  };
}

// One pre-filled form waiting for the consultation page, in memory only. The
// URL carries a random token that says nothing about the patient (R3).
let stash: { token: string; values: FormValues } | null = null;

/** Holds `values` for the next consultation form; returns the token for `/?prefill=`. */
export function stashPrefill(values: FormValues): string {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  stash = { token, values };
  return token;
}

/** The waiting form for this token, or null (unknown, replaced or cleared). Reading keeps it. */
export function readPrefill(token: string | null): FormValues | null {
  return token && stash?.token === token ? stash.values : null;
}

/** After the question is sent, and on sign-out. */
export function clearPrefill(): void {
  stash = null;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/notifications`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/popups.ts lib/notifications/popups.test.ts lib/notifications/ask.ts lib/notifications/ask.test.ts
git commit -m "Add the pop-up rules and the alert-to-consultation prefill"
```

---

### Task 5: Query hooks for alerts and settings

**Files:**

- Create: `lib/notification-queries.ts`, `lib/notification-queries.test.tsx`
- Modify: `lib/network.ts`, `lib/network.test.ts`, `lib/correction-queries.ts`
- Test: `lib/notification-queries.test.tsx`, `lib/network.test.ts`,
  `lib/correction-queries.test.tsx` (unchanged, must still pass)

**Interfaces:**

- Consumes: `getAlertsClient` (Task 1), `isAlertHandled`, `ApiError`,
  `useKeyedMutation` (`lib/keyed-mutation.ts`), `retryDelay`, `shouldRetry`
  (`lib/network.ts`), `mockAlerts` (`tests/alerts.ts`).
- Produces (`lib/network.ts`): `usePollEvery(ms: number): number | false`
  (moved from `lib/correction-queries.ts`: only while online, twice as long
  on 2G or data saver).
- Produces (`lib/notification-queries.ts`):
  - `ALERT_POLL_MS = 30_000`, `FEED_SIZE = 20`,
    `DEFAULT_SETTINGS: NotificationSettingsOut` (both on);
  - `type AlertFilter = Omit<AlertQuery, "cursor" | "limit">`;
  - `NOTIFY_KEYS = { alerts, feed, unread, lists, list(f), settings }`;
  - `alertsOff(e: unknown): boolean` (404 or 403, R12);
  - `useAlertFeed()` (new alerts, first `FEED_SIZE`, polled),
    `useUnreadAlerts()` (`data` is the count, polled),
    `useAlertList(f: AlertFilter)` (infinite, by cursor, keeping the previous
    filter's list while the next loads);
  - `putAlert(qc: QueryClient, a: Pick<AlertOut, "id"> & Partial<AlertOut>): void`;
  - `useAcknowledgeAlert()` (`mutate(id: string)`),
    `useDismissAlert()` (`mutate({ id, d }: { id: string; d: DismissIn })`),
    both keyed, both put the answer (or the 409's who and when) into the
    cache and refresh the count and the feed;
  - `useNotificationSettings()`, `usePopupSettings(): NotificationSettingsOut`
    (the saved settings, or `DEFAULT_SETTINGS` until they load, R5),
    `useUpdateNotificationSettings()` (`mutate(p: NotificationSettingsPatchIn)`).

- [ ] **Step 1: Write the failing tests**

In `lib/network.test.ts`, add `usePollEvery` to the import from `./network`
and add:

```ts
describe("usePollEvery", () => {
  it("polls only while online", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    expect(renderHook(() => usePollEvery(30_000)).result.current).toBe(30_000);
    online.mockReturnValue(false);
    expect(renderHook(() => usePollEvery(30_000)).result.current).toBe(false);
  });
});
```

Create `lib/notification-queries.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { createMockAlerts, MOCK_ALERT_EVERY_MS } from "@/lib/api/mock-alerts";
import { ALERT_NOW, mockAlerts } from "@/tests/alerts";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
import { ApiError } from "./api/errors";
import {
  DEFAULT_SETTINGS,
  NOTIFY_KEYS,
  alertsOff,
  useAcknowledgeAlert,
  useAlertFeed,
  useAlertList,
  useDismissAlert,
  useNotificationSettings,
  usePopupSettings,
  useUnreadAlerts,
  useUpdateNotificationSettings,
} from "./notification-queries";

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(() => {
  qc = new QueryClient();
  holder.client = mockAlerts();
});
afterEach(() => vi.restoreAllMocks());

const newList = () => ({
  list: useAlertList({ status: "new" }),
  unread: useUnreadAlerts(),
  ack: useAcknowledgeAlert(),
  dismiss: useDismissAlert(),
});

describe("alert queries", () => {
  it("reads the newest new alerts and the unread count", async () => {
    const { result } = renderHook(
      () => ({ feed: useAlertFeed(), unread: useUnreadAlerts() }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.feed.data?.alerts).toHaveLength(6),
    );
    await waitFor(() => expect(result.current.unread.data).toBe(6));
  });

  it("lists by filter and pages with the cursor", async () => {
    let t = ALERT_NOW;
    holder.client = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 40 * MOCK_ALERT_EVERY_MS;
    const { result } = renderHook(
      () => ({
        news: useAlertList({ status: "new" }),
        handled: useAlertList({ status: "handled" }),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(
        result.current.handled.data?.pages[0]?.alerts.map((a) => a.id),
      ).toEqual(["al-107"]),
    );
    await waitFor(() => expect(result.current.news.hasNextPage).toBe(true));
    await act(() => result.current.news.fetchNextPage());
    await waitFor(() =>
      expect(
        result.current.news.data?.pages.flatMap((p) => p.alerts),
      ).toHaveLength(36),
    );
    expect(result.current.news.hasNextPage).toBe(false);
  });

  it("sends one idempotency key per acknowledge, reused on its retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // shortest retry delay
    const ack = vi
      .spyOn(holder.client, "acknowledgeAlert")
      .mockRejectedValueOnce(new ApiError(503, "error"));
    const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });
    act(() => result.current.mutate("al-101"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 4000,
    });
    const keys = ack.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    act(() => result.current.mutate("al-102"));
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(3));
    expect(ack.mock.calls[2]![1]?.idempotencyKey).not.toBe(keys[0]);
  });

  it("puts your handled copy into the cached list at once and refreshes the count (R6)", async () => {
    const { result } = renderHook(newList, { wrapper });
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6),
    );
    act(() => result.current.ack.mutate("al-101"));
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts[0]).toMatchObject({
        id: "al-101",
        status: "handled",
        handled_by: { display_name: "Dr. Reyes" },
      }),
    );
    // It stays where it is until the list loads again.
    expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6);
    await waitFor(() => expect(result.current.unread.data).toBe(5));
  });

  it("puts the colleague's who and when into the cached lists on a 409 (Review Focus 1)", async () => {
    const ack = vi.spyOn(holder.client, "acknowledgeAlert");
    const { result } = renderHook(newList, { wrapper });
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6),
    );
    holder.client.handleElsewhere("al-102", "Dr. Okafor");
    const onError = vi.fn();
    act(() => result.current.ack.mutate("al-102", { onError }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.list.data?.pages[0]?.alerts[1]).toMatchObject({
      id: "al-102",
      status: "handled",
      handled_by: { display_name: "Dr. Okafor" },
    });
    // A 409 isn't retried.
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it("dismisses with the reason and the note", async () => {
    const dismiss = vi.spyOn(holder.client, "dismissAlert");
    const { result } = renderHook(newList, { wrapper });
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6),
    );
    act(() =>
      result.current.dismiss.mutate({
        id: "al-105",
        d: { reason: "already_known", note: "Known." },
      }),
    );
    await waitFor(() =>
      expect(
        result.current.list.data?.pages[0]?.alerts.find(
          (a) => a.id === "al-105",
        ),
      ).toMatchObject({ status: "dismissed", dismiss_reason: "already_known" }),
    );
    expect(dismiss).toHaveBeenCalledWith(
      "al-105",
      { reason: "already_known", note: "Known." },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("stops asking when alerts aren't switched on (R12)", async () => {
    expect(alertsOff(new ApiError(404, "not_found"))).toBe(true);
    expect(alertsOff(new ApiError(403, "forbidden"))).toBe(true);
    expect(alertsOff(new ApiError(503, "error"))).toBe(false);
    const list = vi
      .spyOn(holder.client, "listAlerts")
      .mockRejectedValue(new ApiError(404, "not_found"));
    const { result } = renderHook(() => useAlertFeed(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe("notification settings", () => {
  it("keeps pop-ups on until the settings load (R5), then follows them", async () => {
    let release!: () => void;
    vi.spyOn(holder.client, "getNotificationSettings").mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ alert_popups: false, correction_popups: true });
        }),
    );
    const { result } = renderHook(() => usePopupSettings(), { wrapper });
    expect(result.current).toEqual(DEFAULT_SETTINGS);
    act(() => release());
    await waitFor(() => expect(result.current.alert_popups).toBe(false));
  });

  it("keeps pop-ups on when the settings can't load", async () => {
    vi.spyOn(holder.client, "getNotificationSettings").mockRejectedValue(
      new ApiError(400, "error"),
    );
    const { result } = renderHook(
      () => ({ s: useNotificationSettings(), p: usePopupSettings() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.s.isError).toBe(true));
    expect(result.current.p).toEqual(DEFAULT_SETTINGS);
  });

  it("saves each change with its own key and caches the answer", async () => {
    const update = vi.spyOn(holder.client, "updateNotificationSettings");
    const { result } = renderHook(
      () => ({
        s: useNotificationSettings(),
        save: useUpdateNotificationSettings(),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
    );
    act(() => result.current.save.mutate({ alert_popups: false }));
    await waitFor(() =>
      expect(result.current.s.data?.alert_popups).toBe(false),
    );
    act(() => result.current.save.mutate({ correction_popups: false }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(qc.getQueryData(NOTIFY_KEYS.settings)).toEqual({
        alert_popups: false,
        correction_popups: false,
      }),
    );
    expect(update.mock.calls[0]![1]?.idempotencyKey).not.toBe(
      update.mock.calls[1]![1]?.idempotencyKey,
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/notification-queries.test.tsx lib/network.test.ts`
Expected: FAIL. `./notification-queries` doesn't exist and `usePollEvery`
isn't exported by `./network`.

- [ ] **Step 3: Move `usePollEvery`**

Append to `lib/network.ts`:

```ts
/** A poll interval: only while online, twice as long on 2G or data saver. */
export function usePollEvery(ms: number): number | false {
  const net = useNetwork();
  if (!net.online) return false;
  return net.slow || net.saveData ? ms * 2 : ms;
}
```

In `lib/correction-queries.ts`, delete the local `usePollEvery` function
(and its doc comment) and change the network import to:

```ts
import { retryDelay, shouldRetry, usePollEvery } from "./network";
```

- [ ] **Step 4: Write the hooks**

Create `lib/notification-queries.ts`:

```ts
"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { getAlertsClient } from "./api/alerts";
import type {
  AlertOut,
  AlertPageOut,
  AlertQuery,
  DismissIn,
  NotificationSettingsOut,
  NotificationSettingsPatchIn,
} from "./api/alerts-contract";
import { ApiError, isAlertHandled } from "./api/errors";
import { useKeyedMutation } from "./keyed-mutation";
import { retryDelay, shouldRetry, usePollEvery } from "./network";

/** How often new alerts and the count are checked, like decisions (Plan 3). */
export const ALERT_POLL_MS = 30_000;
/** The newest new alerts: what pop-ups and the bell look at. */
export const FEED_SIZE = 20;
/** Pop-ups stay on until the saved settings say otherwise (R5). */
export const DEFAULT_SETTINGS: NotificationSettingsOut = {
  alert_popups: true,
  correction_popups: true,
};

export type AlertFilter = Omit<AlertQuery, "cursor" | "limit">;

export const NOTIFY_KEYS = {
  alerts: ["alerts"] as const,
  feed: ["alerts", "feed"] as const,
  unread: ["alerts", "unread"] as const,
  lists: ["alerts", "list"] as const,
  list: (f: AlertFilter) => ["alerts", "list", f] as const,
  settings: ["notification-settings"] as const,
};

// A 4xx won't change on retry; a 401 has already signed out.
const READ = {
  retry: (n: number, e: unknown) => shouldRetry(n, e),
  retryDelay,
};

/** The hospital has no patient alerts yet (404, or 403 for the route): stop asking (R12). */
export const alertsOff = (e: unknown) =>
  e instanceof ApiError && (e.status === 404 || e.status === 403);

/** New alerts, newest first: the pop-ups and the bell (polled). */
export function useAlertFeed() {
  const every = usePollEvery(ALERT_POLL_MS);
  return useQuery({
    queryKey: NOTIFY_KEYS.feed,
    queryFn: () =>
      getAlertsClient().listAlerts({ status: "new", limit: FEED_SIZE }),
    refetchInterval: (q) => (alertsOff(q.state.error) ? false : every),
    ...READ,
  });
}

/** New alerts no one has handled (R1); `data` is the count (polled). */
export function useUnreadAlerts() {
  const every = usePollEvery(ALERT_POLL_MS);
  return useQuery({
    queryKey: NOTIFY_KEYS.unread,
    queryFn: () => getAlertsClient().getUnreadCount(),
    select: (d) => d.count,
    refetchInterval: (q) => (alertsOff(q.state.error) ? false : every),
    ...READ,
  });
}

/**
 * One filter's alerts, a page at a time. The last filter's list stays on
 * screen while the next loads, so the filters never jump.
 */
export function useAlertList(f: AlertFilter) {
  return useInfiniteQuery({
    queryKey: NOTIFY_KEYS.list(f),
    queryFn: ({ pageParam }) =>
      getAlertsClient().listAlerts({
        ...f,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: keepPreviousData,
    ...READ,
  });
}

type Pages = InfiniteData<AlertPageOut, string | null>;

/** The latest copy of an alert into every cached list and the feed, so cards show it at once (R6, R7). */
export function putAlert(
  qc: QueryClient,
  a: Pick<AlertOut, "id"> & Partial<AlertOut>,
): void {
  const patch = (x: AlertOut) => (x.id === a.id ? { ...x, ...a } : x);
  qc.setQueriesData<Pages>(
    { queryKey: NOTIFY_KEYS.lists },
    (d) =>
      d && {
        ...d,
        pages: d.pages.map((p) => ({ ...p, alerts: p.alerts.map(patch) })),
      },
  );
  qc.setQueryData<AlertPageOut>(
    NOTIFY_KEYS.feed,
    (d) => d && { ...d, alerts: d.alerts.map(patch) },
  );
}

const refreshCounts = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }),
    qc.invalidateQueries({ queryKey: NOTIFY_KEYS.feed }),
  ]);

/** Someone else handled it first: show who and when (R7). */
function handledElsewhere(qc: QueryClient, id: string, e: Error) {
  if (isAlertHandled(e)) putAlert(qc, { id, ...e.handled });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (id: string, key) =>
      getAlertsClient().acknowledgeAlert(id, { idempotencyKey: key }),
    {
      onSuccess: (a) => putAlert(qc, a),
      onError: (e, id) => handledElsewhere(qc, id, e),
      onSettled: () => void refreshCounts(qc),
    },
  );
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (v: { id: string; d: DismissIn }, key) =>
      getAlertsClient().dismissAlert(v.id, v.d, { idempotencyKey: key }),
    {
      onSuccess: (a) => putAlert(qc, a),
      onError: (e, v) => handledElsewhere(qc, v.id, e),
      onSettled: () => void refreshCounts(qc),
    },
  );
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: NOTIFY_KEYS.settings,
    queryFn: () => getAlertsClient().getNotificationSettings(),
    staleTime: Infinity,
    ...READ,
  });
}

/** What pop-ups follow: the saved settings, or both on until they load (never silently muted, R5). */
export function usePopupSettings(): NotificationSettingsOut {
  return useNotificationSettings().data ?? DEFAULT_SETTINGS;
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (p: NotificationSettingsPatchIn, key) =>
      getAlertsClient().updateNotificationSettings(p, { idempotencyKey: key }),
    { onSuccess: (s) => qc.setQueryData(NOTIFY_KEYS.settings, s) },
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/notification-queries.test.tsx lib/network.test.ts lib/correction-queries.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/notification-queries.ts lib/notification-queries.test.tsx lib/network.ts lib/network.test.ts lib/correction-queries.ts
git commit -m "Add query hooks for patient alerts and notification settings"
```

---

### Task 6: Shared pieces: the switch, link tabs and pop-ups in the toast

**Files:**

- Create: `components/ui/switch.tsx`, `components/ui/link-tabs.tsx`,
  `components/ui/toast.test.tsx`
- Modify: `components/ui/toast.tsx`, `components/ui/primitives.test.tsx`,
  `components/admin/settings-view.tsx`, `components/admin/activity-tabs.tsx`
- Test: `components/ui/toast.test.tsx`, `components/ui/primitives.test.tsx`,
  `components/admin/settings-view.test.tsx` and
  `components/admin/activity-view.test.tsx` (unchanged, must still pass),
  `lib/motion.test.ts`

**Interfaces:**

- Consumes: `cn` (`components/ui/cn.ts`), `Link` (`next/link`).
- Produces (`components/ui/switch.tsx`):
  `Switch({ label, checked, onChange, disabled?, describedBy? }: { label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean; describedBy?: string })`
  (moved from the hospital settings view; a word "On"/"Off" beside it).
- Produces (`components/ui/link-tabs.tsx`):
  `interface LinkTab { id: string; href: string; label: string }`,
  `LinkTabs({ label, tabs, current }: { label: string; tabs: readonly LinkTab[]; current: string })`.
- Produces (`components/ui/toast.tsx`):
  - `type ToastSeverity = "critical" | "urgent" | "info"`;
  - `interface ToastInput { title; body?; tone?; ms?: number | null; action?: { label: string; name: string; onClick(): void }; live?: "polite" | "assertive"; severity?: ToastSeverity; tag?: string }`;
  - `useToast(): { show(t: ToastInput): number; dismiss(id: number): void; clear(tag: string): void }`
    (`show` keeps its old call shape, so existing callers don't change);
  - `TOAST_MAX = 4`.

- [ ] **Step 1: Write the failing tests**

Create `components/ui/toast.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOAST_MAX, ToastProvider, useToast, type ToastInput } from "./toast";

let api: ReturnType<typeof useToast>;
function Grab() {
  api = useToast();
  return <button type="button">elsewhere</button>;
}
const ui = () =>
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  );
const polite = () => document.querySelector('[aria-live="polite"]')!;
const assertive = () => document.querySelector('[aria-live="assertive"]')!;
const popup = (o: Partial<ToastInput> = {}): ToastInput => ({
  title: "Urgent patient alert",
  body: "Emeka Nnamdi · Platelets 62",
  live: "polite",
  severity: "urgent",
  ms: 12_000,
  tag: "notifications",
  action: {
    label: "View",
    name: "View alert for Emeka Nnamdi",
    onClick: vi.fn(),
  },
  ...o,
});
afterEach(() => vi.useRealTimers());

describe("Toast pop-ups", () => {
  it("keeps plain toasts as they were", () => {
    vi.useFakeTimers();
    ui();
    act(() => {
      api.show({ title: "Copied", ms: 1000 });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(screen.queryByRole("button", { name: /Hide pop-up/ })).toBeNull();
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Copied")).toBeNull();
  });

  it("reads a pop-up out politely, without moving focus", () => {
    ui();
    screen.getByRole("button", { name: "elsewhere" }).focus();
    act(() => {
      api.show(popup());
    });
    expect(screen.getByText("Urgent patient alert")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    expect(polite()).toHaveTextContent(
      "Urgent patient alert. Emeka Nnamdi · Platelets 62",
    );
    expect(assertive()).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("reads Critical out assertively and keeps it until hidden", () => {
    vi.useFakeTimers();
    ui();
    act(() => {
      api.show(
        popup({
          title: "Critical patient alert",
          live: "assertive",
          severity: "critical",
          ms: null,
        }),
      );
    });
    expect(assertive()).toHaveTextContent("Critical patient alert");
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(screen.getByText("Critical patient alert")).toBeVisible();
    act(() =>
      screen
        .getByRole("button", { name: "Hide pop-up: Critical patient alert" })
        .click(),
    );
    expect(screen.queryByText("Critical patient alert")).toBeNull();
  });

  it("runs View and hides the pop-up", async () => {
    const onClick = vi.fn();
    ui();
    act(() => {
      api.show(
        popup({
          action: {
            label: "View",
            name: "View alert for Emeka Nnamdi",
            onClick,
          },
        }),
      );
    });
    await userEvent.click(
      screen.getByRole("button", { name: "View alert for Emeka Nnamdi" }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
  });

  it("keeps at most TOAST_MAX on screen, dropping the oldest that can expire (Review Focus 3)", () => {
    ui();
    act(() => {
      api.show(
        popup({
          title: "Critical 1",
          ms: null,
          live: "assertive",
          severity: "critical",
        }),
      );
      for (let i = 1; i <= 5; i++) api.show(popup({ title: `Urgent ${i}` }));
    });
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(TOAST_MAX);
    expect(screen.getByText("Critical 1")).toBeVisible();
    expect(screen.queryByText("Urgent 1")).toBeNull();
    expect(screen.queryByText("Urgent 2")).toBeNull();
    expect(screen.getByText("Urgent 5")).toBeVisible();
  });

  it("clears a tag's pop-ups and the live text (Review Focus 5)", () => {
    ui();
    act(() => {
      api.show({ title: "Saved", ms: 60_000 });
      api.show(
        popup({
          title: "Critical patient alert",
          body: "Halima Garba · Potassium 6.7",
          live: "assertive",
          ms: null,
        }),
      );
    });
    act(() => api.clear("notifications"));
    expect(screen.queryByText("Critical patient alert")).toBeNull();
    expect(document.body.textContent).not.toContain("Halima Garba");
    expect(screen.getByText("Saved")).toBeVisible();
    expect(assertive()).toBeEmptyDOMElement();
    expect(polite()).toBeEmptyDOMElement();
  });
});
```

In `components/ui/primitives.test.tsx`, add to the imports:

```tsx
import { LinkTabs } from "./link-tabs";
import { Switch } from "./switch";
```

In the "Toast placement" test, change the expected class to
`"top-[calc(var(--demo-h,0px)+4.75rem)]"` and the test name to
`"sits below the top bar and the demo ribbon (offset by --demo-h)"`. Then
add:

```tsx
describe("Switch", () => {
  it("says On or Off in words, and can be described and disabled", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <>
        <Switch
          label="Pop-ups for patient alerts"
          checked
          onChange={onChange}
          describedBy="hint"
        />
        <p id="hint">Critical alerts will still pop up.</p>
      </>,
    );
    const sw = screen.getByRole("switch", {
      name: "Pop-ups for patient alerts",
    });
    expect(sw).toBeChecked();
    expect(sw).toHaveAccessibleDescription(
      "Critical alerts will still pop up.",
    );
    expect(screen.getByText("On")).toBeInTheDocument();
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
    rerender(
      <Switch
        label="Pop-ups for patient alerts"
        checked={false}
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});

describe("LinkTabs", () => {
  it("marks the current tab as the page", () => {
    render(
      <LinkTabs
        label="Notifications"
        current="alerts"
        tabs={[
          { id: "alerts", href: "/notifications", label: "Patient alerts" },
          {
            id: "corrections",
            href: "/notifications/corrections",
            label: "Corrections",
          },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Notifications" });
    expect(nav).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Patient alerts" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Corrections" }),
    ).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/ui`
Expected: FAIL. `./switch` and `./link-tabs` don't exist; pop-ups have no
live regions, View button or cap; the stack is still at `+1.25rem`.

- [ ] **Step 3: Move the switch and the tabs**

Create `components/ui/switch.tsx` (the hospital settings view's switch, with
`disabled` and `describedBy`):

```tsx
"use client";
import { cn } from "./cn";

/** An on/off switch with the word "On" or "Off" beside it, never colour alone. */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  describedBy,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-2 text-[13px] text-ink-2",
        disabled && "opacity-50",
      )}
    >
      {/* The real control sits, transparent, over the track: clickable and labelled. */}
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={describedBy}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 rounded-full bg-lilac-2 transition-colors duration-[var(--t-fast)] after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-[var(--t-fast)] peer-checked:bg-mint peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep"
        />
      </span>
      <span aria-hidden>{checked ? "On" : "Off"}</span>
    </label>
  );
}
```

In `components/admin/settings-view.tsx`, delete the local `Switch` function
and add `import { Switch } from "../ui/switch";` to the imports. Its three
uses stay as they are.

Create `components/ui/link-tabs.tsx`:

```tsx
"use client";
import Link from "next/link";
import { cn } from "./cn";

export interface LinkTab {
  id: string;
  href: string;
  label: string;
}

/** Page tabs where each tab is its own route; the current one has aria-current. */
export function LinkTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: readonly LinkTab[];
  current: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-4 flex w-fit flex-wrap gap-1 rounded-full bg-lilac p-1"
    >
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={current === t.id ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep sm:min-h-9",
            current === t.id ? "bg-white text-ink shadow-sm" : "text-bloom",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
```

Replace `components/admin/activity-tabs.tsx` with:

```tsx
"use client";
import { useOversight } from "@/lib/admin-queries";
import { isOverdueItem } from "@/lib/admin/report";
import { useNow } from "@/lib/hooks/use-now";
import { LinkTabs } from "../ui/link-tabs";

/** Log and Review oversight (hospital-admin.html tabs 6 and 7). */
export function ActivityTabs({ current }: { current: "log" | "oversight" }) {
  const o = useOversight();
  const now = useNow(60_000);
  const overdue = o.data
    ? o.data.items.filter((i) =>
        isOverdueItem(i, o.data.overdue_after_hours, now),
      ).length
    : 0;
  const tabs = [
    { id: "log", href: "/admin/activity", label: "Log" },
    {
      id: "oversight",
      href: "/admin/activity/oversight",
      label: overdue
        ? `Review oversight · ${overdue} overdue`
        : "Review oversight",
    },
  ];
  return <LinkTabs label="Activity" tabs={tabs} current={current} />;
}
```

- [ ] **Step 4: Pop-ups in the toast**

Replace `components/ui/toast.tsx` with:

```tsx
"use client";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";

export type ToastSeverity = "critical" | "urgent" | "info";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: "ok" | "info";
  /** How long it stays (3.2 s by default); null keeps it until hidden. */
  ms?: number | null;
  /** A pop-up's "View" button: it hides the pop-up, then runs. */
  action?: { label: string; name: string; onClick(): void };
  /** Pop-ups are read out through the page's live regions (R4). */
  live?: "polite" | "assertive";
  /** Shows the severity's icon; the title carries the word. */
  severity?: ToastSeverity;
  /** Lets a group be cleared together, e.g. at sign-out (R4). */
  tag?: string;
}

type Item = ToastInput & { id: number };
type Said = { text: string; n: number };

/** At most this many on screen; the oldest that can expire goes first (R4). */
export const TOAST_MAX = 4;
const DEFAULT_MS = 3200;
const QUIET: Said = { text: "", n: 0 };

type Ctx = {
  show(t: ToastInput): number;
  dismiss(id: number): void;
  clear(tag: string): void;
};
const ToastCtx = createContext<Ctx>({
  show: () => 0,
  dismiss() {},
  clear() {},
});
export const useToast = () => useContext(ToastCtx);

const ICON = {
  critical: OctagonAlert,
  urgent: AlertTriangle,
  info: Info,
} as const;
const RING = {
  critical: "ring-bad-line text-bad-deep",
  urgent: "ring-warn-line text-warn-deep",
  info: "ring-line text-ink-2",
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [polite, setPolite] = useState<Said>(QUIET);
  const [assertive, setAssertive] = useState<Said>(QUIET);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((x) => x.filter((i) => i.id !== id));
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((x) => {
        const next = [...x, { ...t, id }];
        while (next.length > TOAST_MAX) {
          const i = next.findIndex((n) => n.ms !== null);
          next.splice(i === -1 ? 0 : i, 1);
        }
        return next;
      });
      if (t.live) {
        // A fresh key re-announces even the same words.
        const said = {
          text: [t.title, t.body].filter(Boolean).join(". "),
          n: id,
        };
        if (t.live === "assertive") setAssertive(said);
        else setPolite(said);
      }
      if (t.ms !== null)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), t.ms ?? DEFAULT_MS),
        );
      return id;
    },
    [dismiss],
  );

  const clear = useCallback((tag: string) => {
    setItems((x) => x.filter((i) => i.tag !== tag));
    setPolite(QUIET);
    setAssertive(QUIET);
  }, []);

  const value = useMemo(
    () => ({ show, dismiss, clear }),
    [show, dismiss, clear],
  );
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* Always in the page, so screen readers hear what's added (spec §6). */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {polite.text && <span key={polite.n}>{polite.text}</span>}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive.text && <span key={assertive.n}>{assertive.text}</span>}
      </div>
      {/* Below the top bar, so a pop-up never covers the bell (R4). */}
      <div className="pointer-events-none fixed right-5 top-[calc(var(--demo-h,0px)+4.75rem)] z-50 flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.severity ? ICON[t.severity] : null;
          const action = t.action;
          return (
            <div
              key={t.id}
              data-toast
              role={t.live ? undefined : "status"}
              className={cn(
                "pointer-events-auto animate-[toastIn_var(--t-slow)_var(--e-spring)_both] rounded-2xl bg-white p-4 text-[13.5px] shadow-[0_30px_60px_-24px_#1c0d2299] ring-1",
                t.severity ? RING[t.severity] : "ring-line",
              )}
            >
              <div className="flex items-start gap-2.5">
                {Icon && (
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1 text-ink">
                  <b className="block [overflow-wrap:anywhere]">{t.title}</b>
                  {t.body && (
                    <p className="mt-1 text-xs text-ink-3 [overflow-wrap:anywhere]">
                      {t.body}
                    </p>
                  )}
                  {action && (
                    <button
                      type="button"
                      aria-label={action.name}
                      onClick={() => {
                        dismiss(t.id);
                        action.onClick();
                      }}
                      className="mt-2 inline-flex min-h-11 items-center rounded-full bg-lilac px-3.5 text-[12.5px] font-semibold text-bloom focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-8"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
                {(action || t.ms === null) && (
                  <button
                    type="button"
                    aria-label={`Hide pop-up: ${t.title}`}
                    onClick={() => dismiss(t.id)}
                    className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep sm:size-8"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/ui components/admin lib/motion.test.ts`
Expected: PASS (the settings view still finds its switches; the activity
tabs still mark the current tab; every existing `useToast().show` caller
compiles unchanged).

- [ ] **Step 6: Check and commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.

```bash
git add components/ui components/admin/settings-view.tsx components/admin/activity-tabs.tsx
git commit -m "Share the switch and link tabs; let pop-ups speak and link"
```

---

### Task 7: The alerts provider, pop-ups and the shell

**Files:**

- Create: `components/shell/shell-context.tsx`,
  `components/notifications/alerts-provider.tsx`,
  `components/notifications/notifications-provider.tsx`,
  `components/notifications/alerts-provider.test.tsx`
- Modify: `components/shell/app-shell.tsx`,
  `components/corrections/decisions-provider.tsx`
- Test: `components/notifications/alerts-provider.test.tsx`,
  `components/corrections/decisions.test.tsx` and
  `components/shell/app-shell.test.tsx` (unchanged, must still pass)

**Interfaces:**

- Consumes: `useAlertFeed`, `useUnreadAlerts`, `usePopupSettings`,
  `alertsOff`, `NOTIFY_KEYS` (Task 5); `newAlerts`, `planPopups`,
  `alertPopup`, `moreAlertsPopup`, `SEEN_MAX`, `NOTIFICATION_TAG`,
  `NOTIFICATIONS_HREF`, `CORRECTIONS_HREF` (Task 4); `useToast` (Task 6);
  `DecisionsProvider`, `useDecisions`, `toastFor` (Plan 3).
- Produces (`components/shell/shell-context.tsx`): `type NavigationGuard`,
  `type ShellCtx`, `ShellContext`, `useShell(): ShellCtx` (moved out of
  `app-shell.tsx`, which re-exports `useShell` and `NavigationGuard`, so the
  providers can use the shell's guarded `navigate` without importing the
  shell itself).
- Produces (`components/notifications/alerts-provider.tsx`):
  - `AlertsProvider({ children })`;
  - `useAlerts(): { unread: number; available: boolean; latest: AlertOut[]; focusId: string | null; focusSeq: number; openAlert(id: string | null): void; focusDone(): void } | null`.
- Produces (`components/notifications/notifications-provider.tsx`):
  `NotificationsProvider({ children })` = `DecisionsProvider` +
  `AlertsProvider`; clears every `NOTIFICATION_TAG` pop-up when it unmounts.
- Changes `DecisionsProvider`: decision pop-ups follow `correction_popups`,
  carry a View button to `/notifications/corrections`, use the polite live
  region and the `NOTIFICATION_TAG`; notes and the unseen count update
  either way.

- [ ] **Step 1: Write the failing tests**

Create `components/notifications/alerts-provider.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertOut, AlertSeverity } from "@/lib/api/alerts-contract";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { NOTIFY_KEYS } from "@/lib/notification-queries";
import { makeAlert } from "@/tests/alerts";
import { T0, makeCorrection } from "@/tests/corrections";
import { TOAST_MAX, ToastProvider } from "../ui/toast";

const alerts = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getUnreadCount: vi.fn(),
  getNotificationSettings: vi.fn(),
  acknowledgeAlert: vi.fn(),
  dismissAlert: vi.fn(),
  updateNotificationSettings: vi.fn(),
}));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => alerts }));
const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
import { useDecisions } from "../corrections/decisions-provider";
import { AlertsProvider, useAlerts } from "./alerts-provider";
import { NotificationsProvider } from "./notifications-provider";

const page = (list: AlertOut[]) => ({
  alerts: list,
  next_cursor: null,
  sources: ["Main record"],
});
const OLD = makeAlert({
  id: "old",
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
});
/** Created after the provider started, so it's new to it. */
const arriving = (
  id: string,
  severity: AlertSeverity,
  name: string,
  minutes = 1,
) =>
  makeAlert({
    id,
    severity,
    created_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    patient: { ...makeAlert().patient, full_name: name },
  });

function Probe() {
  const a = useAlerts();
  return (
    <p>{`unread ${a?.unread} · focus ${a?.focusId ?? "none"} · available ${String(a?.available)}`}</p>
  );
}
function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AlertsProvider>
          <Probe />
          <button type="button">elsewhere</button>
        </AlertsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const ready = (qc: QueryClient) =>
  vi.waitFor(() => {
    expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("success");
    expect(qc.getQueryState(NOTIFY_KEYS.settings)?.status).toBe("success");
  });
const poll = (qc: QueryClient) =>
  act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.feed }));
const live = (kind: "polite" | "assertive") =>
  document.querySelector(`[aria-live="${kind}"]`)!;

beforeEach(() => {
  for (const f of Object.values(alerts)) f.mockReset();
  alerts.listAlerts.mockResolvedValue(page([]));
  alerts.getUnreadCount.mockResolvedValue({ count: 0 });
  alerts.getNotificationSettings.mockResolvedValue({
    alert_popups: true,
    correction_popups: true,
  });
  listMine.mockReset();
  listMine.mockResolvedValue([]);
  push.mockClear();
});

describe("alert pop-ups", () => {
  it("never pops up alerts that were there at sign-in", async () => {
    alerts.listAlerts.mockResolvedValueOnce(page([OLD]));
    const qc = ui();
    await ready(qc);
    await act(() => Promise.resolve());
    expect(screen.queryByText(/patient alert$/)).toBeNull();
  });

  it("pops up a new alert politely, and View opens it", async () => {
    alerts.listAlerts.mockResolvedValueOnce(page([OLD]));
    const qc = ui();
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("n1", "urgent", "Emeka Nnamdi"), OLD]),
    );
    await poll(qc);
    expect(await screen.findByText("Urgent patient alert")).toBeVisible();
    expect(
      screen.getByText(
        "Emeka Nnamdi · Potassium 2.9 mmol/L (low; normal 3.5–5.1)",
      ),
    ).toBeVisible();
    expect(live("polite")).toHaveTextContent("Urgent patient alert");
    expect(live("assertive")).toBeEmptyDOMElement();
    await userEvent.click(
      screen.getByRole("button", { name: "View alert for Emeka Nnamdi" }),
    );
    expect(push).toHaveBeenCalledWith("/notifications");
    expect(screen.getByText(/focus n1/)).toBeInTheDocument();
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
  });

  it("with alert pop-ups off, Urgent stays quiet but Critical pops up, assertively (Review Focus 2)", async () => {
    alerts.getNotificationSettings.mockResolvedValue({
      alert_popups: false,
      correction_popups: true,
    });
    const qc = ui();
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([
        arriving("u1", "urgent", "Emeka Nnamdi"),
        arriving("c1", "critical", "Halima Garba"),
      ]),
    );
    alerts.getUnreadCount.mockResolvedValue({ count: 2 });
    await poll(qc);
    expect(await screen.findByText("Critical patient alert")).toBeVisible();
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
    expect(live("assertive")).toHaveTextContent(
      "Critical patient alert. Halima Garba",
    );
    expect(
      screen.getByRole("button", {
        name: "Hide pop-up: Critical patient alert",
      }),
    ).toBeVisible();
    // The count still rises.
    await act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }));
    expect(await screen.findByText(/unread 2/)).toBeInTheDocument();
  });

  it("a burst of eight shows three pop-ups and one summary (Review Focus 3)", async () => {
    const qc = ui();
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([
        ...["u1", "u2", "u3", "u4", "u5", "u6"].map((id, i) =>
          arriving(id, "urgent", `Urgent person ${i + 1}`, i + 1),
        ),
        arriving("c1", "critical", "Critical person 1", 7),
        arriving("c2", "critical", "Critical person 2", 8),
      ]),
    );
    await poll(qc);
    expect(await screen.findByText("5 more new patient alerts")).toBeVisible();
    expect(screen.getAllByText("Critical patient alert")).toHaveLength(2);
    expect(screen.getAllByText("Urgent patient alert")).toHaveLength(1);
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(TOAST_MAX);
    await userEvent.click(
      screen.getByRole("button", { name: "View all new patient alerts" }),
    );
    expect(push).toHaveBeenCalledWith("/notifications");
    expect(screen.getByText(/focus none/)).toBeInTheDocument();
  });

  it("never takes the focus", async () => {
    const qc = ui();
    await ready(qc);
    screen.getByRole("button", { name: "elsewhere" }).focus();
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("c1", "critical", "Halima Garba")]),
    );
    await poll(qc);
    await screen.findByText("Critical patient alert");
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("says when alerts aren't switched on, and counts nothing (R12)", async () => {
    alerts.listAlerts.mockRejectedValue(new ApiError(404, "not_found"));
    alerts.getUnreadCount.mockRejectedValue(new ApiError(404, "not_found"));
    ui();
    expect(await screen.findByText(/available false/)).toBeInTheDocument();
    expect(screen.getByText(/unread 0/)).toBeInTheDocument();
  });
});

describe("the notification centre at sign-out", () => {
  function Shell() {
    const [signedIn, setSignedIn] = useState(true);
    return (
      <>
        {signedIn && (
          <NotificationsProvider>
            <Probe />
          </NotificationsProvider>
        )}
        <button type="button" onClick={() => setSignedIn(false)}>
          sign out
        </button>
      </>
    );
  }

  it("signing out clears every pop-up and keeps nothing (Review Focus 5)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("c1", "critical", "Halima Garba")]),
    );
    await poll(qc);
    expect(await screen.findByText("Critical patient alert")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    expect(screen.queryByText("Critical patient alert")).toBeNull();
    expect(document.body.textContent).not.toContain("Halima Garba");
    expect(live("assertive")).toBeEmptyDOMElement();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("decision pop-ups", () => {
  function Decisions() {
    const d = useDecisions();
    return <p>{`unseen ${d?.unseen}`}</p>;
  }
  const decided: CorrectionOut = {
    ...makeCorrection({ id: "c1" }),
    status: "approved",
    decided_by: {
      display_name: "Dr. Bello",
      full_name: null,
      specialty: null,
      hospital: null,
    },
    decided_at: new Date(T0).toISOString(),
  };
  async function decide(correction_popups: boolean) {
    alerts.getNotificationSettings.mockResolvedValue({
      alert_popups: true,
      correction_popups,
    });
    listMine.mockResolvedValueOnce([makeCorrection({ id: "c1" })]);
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <NotificationsProvider>
            <Decisions />
          </NotificationsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await vi.waitFor(() => {
      expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success");
      expect(qc.getQueryState(NOTIFY_KEYS.settings)?.status).toBe("success");
    });
    listMine.mockResolvedValueOnce([decided]);
    await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
    await screen.findByText("unseen 1");
  }

  it("pops up a decision with View, which opens the Corrections tab", async () => {
    await decide(true);
    expect(screen.getByText("Your correction was approved")).toBeVisible();
    expect(live("polite")).toHaveTextContent("Your correction was approved");
    await userEvent.click(
      screen.getByRole("button", {
        name: "View decision: Dengue fever, likely",
      }),
    );
    expect(push).toHaveBeenCalledWith("/notifications/corrections");
  });

  it("keeps decisions quiet when decision pop-ups are off, but still counts them", async () => {
    await decide(false);
    expect(screen.queryByText("Your correction was approved")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/notifications`
Expected: FAIL. `./alerts-provider` and `./notifications-provider` don't
exist.

- [ ] **Step 3: Move the shell context out of the shell**

Create `components/shell/shell-context.tsx` with the context and hook that
are in `app-shell.tsx` today:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";

/** Returns true to allow navigation, false to block it (the guard handles the block itself). */
export type NavigationGuard = (href: string) => boolean;

export type ShellCtx = {
  openDrawer(): void;
  openSearch(): void;
  openShortcuts(): void;
  closeDrawer(): void;
  searchOpen: boolean;
  closeSearch(): void;
  navigate(href: string): void;
  setNavigationGuard(guard: NavigationGuard | null): void;
};

// Its own module, so providers inside the shell can use it without importing
// the shell (Plan 5a).
export const ShellContext = createContext<ShellCtx | null>(null);

/** Outside an AppShell the shell UI actions are no-ops, but `navigate` still routes. */
export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  const router = useRouter();
  return (
    ctx ?? {
      openDrawer() {},
      openSearch() {},
      openShortcuts() {},
      closeDrawer() {},
      searchOpen: false,
      closeSearch() {},
      navigate: (href) => router.push(href),
      setNavigationGuard() {},
    }
  );
}
```

In `components/shell/app-shell.tsx`:

- delete the `NavigationGuard` type, the `ShellCtx` type, the `Ctx`
  context and the `useShell` function;
- remove `createContext` and `useContext` from the `react` import;
- add:

```tsx
import {
  ShellContext,
  type NavigationGuard,
  type ShellCtx,
} from "./shell-context";
import { NotificationsProvider } from "../notifications/notifications-provider";

export { useShell, type NavigationGuard } from "./shell-context";
```

- delete `import { DecisionsProvider } from "../corrections/decisions-provider";`;
- replace the returned JSX with:

```tsx
return (
  <ShellContext.Provider value={ctx}>
    {/* Patient alerts and decisions, with their pop-ups, for clinicians (spec §2). */}
    {clinical ? <NotificationsProvider>{body}</NotificationsProvider> : body}
  </ShellContext.Provider>
);
```

Every existing `import { useShell } from "./app-shell"` (and
`"../shell/app-shell"`) keeps working through the re-export.

- [ ] **Step 4: Decision pop-ups follow their setting**

In `components/corrections/decisions-provider.tsx`, add the imports:

```tsx
import { usePopupSettings } from "@/lib/notification-queries";
import { CORRECTIONS_HREF, NOTIFICATION_TAG } from "@/lib/notifications/popups";
import { useShell } from "../shell/shell-context";
```

Replace the `DecisionsProvider` function with:

```tsx
/**
 * Watches your corrections while you're signed in (it lives in AppShell) and
 * tells you when a reviewer decides. Memory only: the history goes when the
 * shell unmounts at sign-out. Pop-ups follow "Pop-ups for decisions on my
 * corrections"; the bell counts decisions either way (spec §4).
 */
export function DecisionsProvider({ children }: { children: ReactNode }) {
  useMyCorrections(); // keeps the poll running on every clinical screen
  const qc = useQueryClient();
  const { show } = useToast();
  const { navigate } = useShell();
  const { correction_popups } = usePopupSettings();
  const [since] = useState(() => Date.now());
  const [notes, setNotes] = useState<DecisionNote[]>([]);
  const [unseen, setUnseen] = useState(0);
  const prev = useRef<Map<string, CorrectionStatus> | null>(null);
  // Read inside the cache subscription, which outlives renders.
  const popups = useRef(correction_popups);
  const go = useRef(navigate);
  useEffect(() => {
    popups.current = correction_popups;
    go.current = navigate;
  }, [correction_popups, navigate]);

  useEffect(() => {
    const snapshot = (list: CorrectionOut[]) =>
      new Map(list.map((c) => [c.id, c.status]));
    const cached = qc.getQueryData<CorrectionOut[]>(CORRECTION_KEYS.mine);
    if (cached) prev.current = snapshot(cached);
    // Subscribing to the cache (not an effect on `data`) sees every answer,
    // including ones that arrive while another screen owns the query.
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated" || e.action.type !== "success") return;
      const [a, b] = e.query.queryKey;
      if (a !== CORRECTION_KEYS.mine[0] || b !== CORRECTION_KEYS.mine[1])
        return;
      const list = (e.query.state.data ?? []) as CorrectionOut[];
      const fresh = newDecisions(prev.current, list, since, Date.now());
      prev.current = snapshot(list);
      if (!fresh.length) return;
      setNotes((n) => [...fresh, ...n].slice(0, NOTES_KEPT));
      setUnseen((u) => u + fresh.length);
      if (!popups.current) return;
      for (const d of fresh)
        show({
          ...toastFor(d),
          live: "polite",
          tag: NOTIFICATION_TAG,
          action: {
            label: "View",
            name: `View decision: ${d.title}`,
            onClick: () => go.current(CORRECTIONS_HREF),
          },
        });
    });
  }, [qc, show, since]);

  const markSeen = useCallback(() => setUnseen(0), []);
  const value = useMemo(
    () => ({ notes, unseen, markSeen }),
    [notes, unseen, markSeen],
  );
  return (
    <DecisionsCtx.Provider value={value}>{children}</DecisionsCtx.Provider>
  );
}
```

- [ ] **Step 5: The alerts provider and the notification centre**

Create `components/notifications/alerts-provider.tsx`:

```tsx
"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AlertOut, AlertPageOut } from "@/lib/api/alerts-contract";
import {
  NOTIFY_KEYS,
  alertsOff,
  useAlertFeed,
  usePopupSettings,
  useUnreadAlerts,
} from "@/lib/notification-queries";
import {
  NOTIFICATIONS_HREF,
  NOTIFICATION_TAG,
  SEEN_MAX,
  alertPopup,
  moreAlertsPopup,
  newAlerts,
  planPopups,
  type AlertPopup,
} from "@/lib/notifications/popups";
import { useShell } from "../shell/shell-context";
import { useToast } from "../ui/toast";

type Ctx = {
  /** New alerts no one has handled, from the API; 0 until known (R1). */
  unread: number;
  /** False when the hospital has no patient alerts yet (R12). */
  available: boolean;
  /** The newest new alerts, for the bell. */
  latest: AlertOut[];
  /** The alert a "View" asked for, until the page shows it. Memory only (R3). */
  focusId: string | null;
  /** Goes up on every "View", so the alerts page starts again from New. */
  focusSeq: number;
  /** Opens the Notifications page; with an id, at that alert. */
  openAlert(id: string | null): void;
  focusDone(): void;
};
const AlertsCtx = createContext<Ctx | null>(null);

/** Null outside the clinical shell: admin-only people have no alerts. */
export const useAlerts = () => useContext(AlertsCtx);

/**
 * Polls new alerts and the unread count while a clinician is signed in, and
 * pops up what's new (spec §4): the first answer is a baseline; Critical
 * always pops up; the rest follow "Pop-ups for patient alerts"; a burst is
 * capped (R4). Memory only.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const feed = useAlertFeed();
  const unread = useUnreadAlerts();
  const { alert_popups } = usePopupSettings();
  const qc = useQueryClient();
  const { show } = useToast();
  const { navigate } = useShell();
  const [since] = useState(() => Date.now());
  const [focus, setFocus] = useState<{ id: string | null; seq: number }>({
    id: null,
    seq: 0,
  });
  const seen = useRef<Set<string> | null>(null);
  // Read inside the cache subscription, which outlives renders.
  const popups = useRef(alert_popups);
  const go = useRef(navigate);
  useEffect(() => {
    popups.current = alert_popups;
    go.current = navigate;
  }, [alert_popups, navigate]);

  const openAlert = useCallback((id: string | null) => {
    setFocus((f) => ({ id, seq: f.seq + 1 }));
    go.current(NOTIFICATIONS_HREF);
  }, []);
  const focusDone = useCallback(
    () => setFocus((f) => (f.id ? { ...f, id: null } : f)),
    [],
  );

  useEffect(() => {
    const remember = (list: AlertOut[]) => {
      const s = new Set(seen.current ?? []);
      for (const a of list) s.add(a.id);
      seen.current = new Set([...s].slice(-SEEN_MAX));
    };
    const cached = qc.getQueryData<AlertPageOut>(NOTIFY_KEYS.feed);
    if (cached) remember(cached.alerts);
    const pop = (p: AlertPopup, id: string | null) =>
      show({
        title: p.title,
        body: p.body,
        severity: p.severity,
        live: p.live,
        ms: p.ms,
        tag: NOTIFICATION_TAG,
        action: {
          label: "View",
          name: p.viewName,
          onClick: () => openAlert(id),
        },
      });
    // Subscribing to the cache sees every answer, whichever screen asked.
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated" || e.action.type !== "success") return;
      const [a, b] = e.query.queryKey;
      if (a !== NOTIFY_KEYS.feed[0] || b !== NOTIFY_KEYS.feed[1]) return;
      const list =
        (e.query.state.data as AlertPageOut | undefined)?.alerts ?? [];
      const fresh = newAlerts(seen.current, list, since);
      remember(list);
      if (!fresh.length) return;
      // The Notifications page lists them too.
      void qc.invalidateQueries({ queryKey: NOTIFY_KEYS.lists });
      const plan = planPopups(fresh, { alert_popups: popups.current });
      for (const al of plan.show) pop(alertPopup(al), al.id);
      const more = moreAlertsPopup(plan.rest);
      if (more) pop(more, null);
    });
  }, [qc, show, since, openAlert]);

  const value = useMemo<Ctx>(
    () => ({
      unread: unread.data ?? 0,
      available: !alertsOff(feed.error),
      latest: (feed.data?.alerts ?? []).filter((a) => a.status === "new"),
      focusId: focus.id,
      focusSeq: focus.seq,
      openAlert,
      focusDone,
    }),
    [unread.data, feed.error, feed.data, focus, openAlert, focusDone],
  );
  return <AlertsCtx.Provider value={value}>{children}</AlertsCtx.Provider>;
}
```

Create `components/notifications/notifications-provider.tsx`:

```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { NOTIFICATION_TAG } from "@/lib/notifications/popups";
import { DecisionsProvider } from "../corrections/decisions-provider";
import { useToast } from "../ui/toast";
import { AlertsProvider } from "./alerts-provider";

/**
 * The notification centre for clinicians (spec §2): decisions on your
 * corrections and patient alerts. It lives in AppShell, so it goes at
 * sign-out and takes every pop-up, and the words read out, with it (R4).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { clear } = useToast();
  useEffect(() => () => clear(NOTIFICATION_TAG), [clear]);
  return (
    <DecisionsProvider>
      <AlertsProvider>{children}</AlertsProvider>
    </DecisionsProvider>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/notifications components/corrections components/shell components/consultation lib/motion.test.ts`
Expected: PASS (Plan 3's decision tests still find their toasts by text; the
shell still mounts the decisions context for clinicians only).

- [ ] **Step 7: Check and commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.

```bash
git add components/shell/shell-context.tsx components/shell/app-shell.tsx components/corrections/decisions-provider.tsx components/notifications
git commit -m "Pop up new patient alerts and decisions, Critical always"
```

---

### Task 8: One bell for alerts and decisions

**Files:**

- Create: `components/notifications/notification-bell.tsx`,
  `components/notifications/chips.tsx`,
  `components/notifications/notification-bell.test.tsx`
- Modify: `components/shell/top-bar.tsx`,
  `components/corrections/decisions.test.tsx` (rewritten for the new bell),
  `components/shell/app-shell.test.tsx`, `tests/e2e/review.spec.ts`,
  `tests/e2e/hospital-admin.spec.ts`, `CHANGELOG.md`
- Delete: `components/corrections/decision-bell.tsx`
- Test: `components/notifications/notification-bell.test.tsx`,
  `components/corrections/decisions.test.tsx`,
  `components/shell/app-shell.test.tsx`

**Interfaces:**

- Consumes: `useAlerts` (Task 7), `useDecisions` (Plan 3), `findingLine`,
  `locationLabel`, `SEVERITY`, `severityOf`, `ALERT_STATUS_LABEL`,
  `NOT_STANDARDISED` (Task 3), `NOTIFICATIONS_HREF` (Task 4), `StatusChip`
  (`components/corrections/chips.tsx`), `Chip`, `RESULT_LABEL`.
- Produces (`components/notifications/chips.tsx`):
  `SeverityChip({ severity }: { severity: string })`,
  `AlertStatusChip({ status }: { status: AlertStatus })`,
  `NotStandardisedChip()`, `CauseChip({ level }: { level: CauseConfidence })`
  (each a word and an icon).
- Produces (`components/notifications/notification-bell.tsx`):
  `NotificationBell()`, `BELL_ALERTS = 4`, `BELL_DECISIONS = 3`. The button's
  accessible name is "Notifications" or "Notifications, N unread"; the panel
  is the region "Notifications" with the sections "Patient alerts" and
  "Decisions on your corrections" and a "See all" link.

- [ ] **Step 1: Write the failing tests**

Create `components/notifications/notification-bell.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { NOTIFY_KEYS } from "@/lib/notification-queries";
import { makeAlert } from "@/tests/alerts";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "../ui/toast";

const alerts = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getUnreadCount: vi.fn(),
  getNotificationSettings: vi.fn(),
}));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => alerts }));
const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
import { SeverityChip } from "./chips";
import { BELL_ALERTS, NotificationBell } from "./notification-bell";
import { NotificationsProvider } from "./notifications-provider";

const NAMES = [
  "Maryam Abdullahi",
  "Ibrahim Danladi",
  "Esther Okoye",
  "Samuel Bassey",
  "Blessing Uche",
  "Kemi Afolabi",
];
const SIX = NAMES.map((full_name, i) =>
  makeAlert({ id: `a${i}`, patient: { ...makeAlert().patient, full_name } }),
);
const waiting = makeCorrection({ id: "c1" });
const approved: CorrectionOut = {
  ...waiting,
  status: "approved",
  decided_by: {
    display_name: "Dr. Bello",
    full_name: null,
    specialty: null,
    hospital: null,
  },
  decided_at: new Date(T0).toISOString(),
};

function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <NotificationsProvider>
          <NotificationBell />
          <button type="button">elsewhere</button>
        </NotificationsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const bell = (name: string) => screen.findByRole("button", { name });

/** Six new alerts, then one decision arrives: 7 unread. */
async function withDecision() {
  listMine.mockResolvedValueOnce([waiting]);
  const qc = ui();
  expect(await bell("Notifications, 6 unread")).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
  );
  listMine.mockResolvedValueOnce([approved]);
  await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
  return bell("Notifications, 7 unread");
}

beforeEach(() => {
  alerts.listAlerts.mockReset().mockResolvedValue({
    alerts: SIX,
    next_cursor: null,
    sources: ["Main record"],
  });
  alerts.getUnreadCount.mockReset().mockResolvedValue({ count: 6 });
  alerts.getNotificationSettings
    .mockReset()
    .mockResolvedValue({ alert_popups: true, correction_popups: true });
  listMine.mockReset().mockResolvedValue([]);
  push.mockClear();
});

describe("NotificationBell", () => {
  it("counts new alerts and unseen decisions as one, and says it (R1)", async () => {
    expect(await withDecision()).toBeInTheDocument();
  });

  it("lists the latest of both, and opening it clears only the decisions (R1)", async () => {
    const user = userEvent.setup();
    await user.click(await withDecision());
    const panel = screen.getByRole("region", { name: "Notifications" });
    const list = within(panel).getByRole("region", { name: "Patient alerts" });
    expect(within(list).getAllByRole("button")).toHaveLength(BELL_ALERTS);
    expect(within(list).getByText("Maryam Abdullahi")).toBeVisible();
    expect(within(list).queryByText("Kemi Afolabi")).toBeNull();
    expect(within(list).getAllByText("Ward 3 · Bed 12")[0]).toBeVisible();
    const decisions = within(panel).getByRole("region", {
      name: "Decisions on your corrections",
    });
    expect(within(decisions).getByText("Dengue fever, likely")).toBeVisible();
    expect(within(decisions).getByText("Approved")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "See all" }),
    ).toHaveAttribute("href", "/notifications");
    expect(
      screen.getByRole("button", { name: "Notifications, 6 unread" }),
    ).toBeInTheDocument();
  });

  it("opens the alert you choose, closing the panel", async () => {
    const user = userEvent.setup();
    ui();
    await user.click(await bell("Notifications, 6 unread"));
    await user.click(screen.getByRole("button", { name: /Esther Okoye/ }));
    expect(push).toHaveBeenCalledWith("/notifications");
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });

  it("moves focus in, closes with Esc back to the bell, and on a click elsewhere", async () => {
    const user = userEvent.setup();
    ui();
    const b = await bell("Notifications, 6 unread");
    await user.click(b);
    expect(
      screen.getByRole("button", { name: /Maryam Abdullahi/ }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(b).toHaveFocus();
    await user.click(b);
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });

  it("says when there's nothing yet", async () => {
    const user = userEvent.setup();
    alerts.listAlerts.mockResolvedValue({
      alerts: [],
      next_cursor: null,
      sources: [],
    });
    alerts.getUnreadCount.mockResolvedValue({ count: 0 });
    ui();
    await user.click(await bell("Notifications"));
    expect(screen.getByText("No new patient alerts.")).toBeVisible();
    expect(screen.getByText(/No decisions yet/)).toBeVisible();
    expect(
      screen.getByText("Decisions are kept for this session only."),
    ).toBeVisible();
  });

  it("shows decisions only when alerts aren't switched on (R12)", async () => {
    const user = userEvent.setup();
    alerts.listAlerts.mockRejectedValue(new ApiError(404, "not_found"));
    alerts.getUnreadCount.mockRejectedValue(new ApiError(404, "not_found"));
    const qc = ui();
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("error"),
    );
    await user.click(await bell("Notifications"));
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Decisions on your corrections" }),
    ).toBeVisible();
  });

  it("caps the badge at 99+ but says the number", async () => {
    alerts.getUnreadCount.mockResolvedValue({ count: 140 });
    ui();
    expect(await bell("Notifications, 140 unread")).toHaveTextContent("99+");
  });

  it("renders nothing outside the notification centre", () => {
    const { container } = render(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SeverityChip", () => {
  it("shows the word and an icon, and reads an unknown severity as Urgent", () => {
    const { rerender } = render(<SeverityChip severity="critical" />);
    expect(screen.getByText("Critical").querySelector("svg")).toBeTruthy();
    rerender(<SeverityChip severity="catastrophic" />);
    expect(screen.getByText("Urgent").querySelector("svg")).toBeTruthy();
  });
});
```

Replace `components/corrections/decisions.test.tsx` with (Plan 3's cases,
now through the new bell):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "../ui/toast";

const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { NotificationBell } from "../notifications/notification-bell";
import { DecisionsProvider, newDecisions } from "./decisions-provider";

const reviewer = {
  display_name: "Dr. Bello",
  full_name: null,
  specialty: null,
  hospital: null,
};
const waiting = makeCorrection({ id: "c1" });
const approved: CorrectionOut = {
  ...waiting,
  status: "approved",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
};
const rejected: CorrectionOut = {
  ...makeCorrection({ id: "c2" }),
  status: "rejected",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
  rejection: { reason_code: "unsafe", note: "Dose too high." },
};

function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DecisionsProvider>
          <NotificationBell />
          <button>elsewhere</button>
        </DecisionsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const poll = (qc: QueryClient) =>
  act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));

const baseline = (qc: QueryClient) =>
  vi.waitFor(() =>
    expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
  );

beforeEach(() => listMine.mockReset());

describe("newDecisions", () => {
  const since = T0 - 60_000;
  it("treats the first look as a baseline", () => {
    expect(newDecisions(null, [approved], since, T0)).toEqual([]);
  });
  it("notes a waiting correction that was decided", () => {
    const prev = new Map([["c1", "pending_review" as const]]);
    expect(newDecisions(prev, [approved], since, T0)).toEqual([
      {
        id: "c1",
        status: "approved",
        title: "Dengue fever, likely",
        by: "Dr. Bello",
        reason: null,
        at: T0,
      },
    ]);
  });
  it("notes a new one only if it was decided after we started", () => {
    const prev = new Map<string, CorrectionOut["status"]>();
    expect(newDecisions(prev, [rejected], since, T0)[0]).toMatchObject({
      status: "rejected",
      reason: "Unsafe: Dose too high.",
    });
    const old = { ...rejected, decided_at: new Date(since - 1).toISOString() };
    expect(newDecisions(prev, [old], since, T0)).toEqual([]);
  });
  it("ignores withdrawals and unchanged decisions", () => {
    const prev = new Map([
      ["c1", "approved" as const],
      ["c3", "pending_review" as const],
    ]);
    const withdrawn = {
      ...makeCorrection({ id: "c3" }),
      status: "withdrawn" as const,
    };
    expect(newDecisions(prev, [approved, withdrawn], since, T0)).toEqual([]);
  });
});

describe("decision pop-ups and the bell", () => {
  it("never pops up decisions that were already there at sign-in", async () => {
    listMine.mockResolvedValue([approved]);
    const qc = ui();
    await baseline(qc);
    expect(
      await screen.findByRole("button", { name: "Notifications" }),
    ).toBeVisible();
    await act(() => Promise.resolve());
    expect(screen.queryByText("Your correction was approved")).toBeNull();
  });

  it("pops up a new decision, counts it on the bell, and lists it there", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValueOnce([waiting]);
    const qc = ui();
    await baseline(qc);
    listMine.mockResolvedValueOnce([approved]);
    await poll(qc);
    expect(
      await screen.findByText("Your correction was approved"),
    ).toBeVisible();
    expect(screen.getByText("Dengue fever, likely · Dr. Bello")).toBeVisible();
    const bell = screen.getByRole("button", {
      name: "Notifications, 1 unread",
    });
    await user.click(bell);
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(within(panel).getByText("Approved")).toBeVisible();
    expect(within(panel).getByText("Dengue fever, likely")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "See all" }),
    ).toHaveAttribute("href", "/notifications");
    expect(
      within(panel).getByText("Decisions are kept for this session only."),
    ).toBeVisible();
    expect(bell).toHaveAccessibleName("Notifications");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(bell).toHaveFocus();
  });

  it("shows the reviewer's reason for a rejection", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValueOnce([
      {
        ...rejected,
        status: "pending_review",
        rejection: null,
        decided_at: null,
        decided_by: null,
      },
    ]);
    const qc = ui();
    await baseline(qc);
    listMine.mockResolvedValueOnce([rejected]);
    await poll(qc);
    expect(
      await screen.findByText("Your correction was rejected"),
    ).toBeVisible();
    expect(
      screen.getByText("Dengue fever, likely · Reason: Unsafe: Dose too high."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /1 unread/ }));
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByText(
        "Reason: Unsafe: Dose too high.",
      ),
    ).toBeVisible();
  });

  it("closes when you click elsewhere, and says when there's nothing yet", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([]);
    ui();
    await user.click(
      await screen.findByRole("button", { name: "Notifications" }),
    );
    expect(screen.getByText(/No decisions yet/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });

  it("keeps the history in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    listMine.mockResolvedValueOnce([waiting]);
    const qc = ui();
    await baseline(qc);
    listMine.mockResolvedValueOnce([approved]);
    await poll(qc);
    await screen.findByText("Your correction was approved");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
```

In `components/shell/app-shell.test.tsx`:

- rename the test "gives a clinician the shortcuts and the decision bell"
  to "gives a clinician the shortcuts and the notification bell", and change
  its `name: /Decisions on your corrections/` to `name: /^Notifications/`;
- rename "gives a hospital admin who isn't a clinician no shortcuts, search
  or decision bell (R3)" to "… no shortcuts, search or notification bell
  (R3)", and change its
  `screen.queryByRole("button", { name: /Decisions on your corrections/ })`
  to `screen.queryByRole("button", { name: /^Notifications/ })`.

In `tests/e2e/review.spec.ts`, in "a reviewer's decision arrives as a toast
and stays in the bell", replace the bell lines with:

```ts
await page
  .getByRole("button", { name: /^Notifications, \d+ unread$/ })
  .filter({ visible: true })
  .click();
await expect(page.getByRole("region", { name: "Notifications" })).toContainText(
  "Dengue fever, likely",
);
```

In `tests/e2e/hospital-admin.spec.ts`, change
`page.getByRole("button", { name: /^Decisions on your corrections/ })` to
`page.getByRole("button", { name: /^Notifications/ })`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/notifications/notification-bell.test.tsx components/corrections/decisions.test.tsx components/shell/app-shell.test.tsx`
Expected: FAIL. `./notification-bell` and `./chips` don't exist; the top bar
still shows "Decisions on your corrections".

- [ ] **Step 3: The chips**

Create `components/notifications/chips.tsx`:

```tsx
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  CircleHelp,
  CircleSlash,
  Info,
  OctagonAlert,
  ShieldCheck,
} from "lucide-react";
import type { AlertStatus, CauseConfidence } from "@/lib/api/alerts-contract";
import { RESULT_LABEL } from "@/lib/labels";
import {
  ALERT_STATUS_LABEL,
  NOT_STANDARDISED,
  SEVERITY,
  severityOf,
} from "@/lib/notifications/alert-view";
import { Chip } from "../ui/chip";

const SEVERITY_ICON = {
  critical: OctagonAlert,
  urgent: AlertTriangle,
  info: Info,
} as const;

/** Critical / Urgent / Info: always a word and an icon, never colour alone. */
export function SeverityChip({ severity }: { severity: string }) {
  const s = severityOf(severity);
  const Icon = SEVERITY_ICON[s];
  return (
    <Chip tone={SEVERITY[s].tone}>
      <Icon aria-hidden className="size-3" />
      {SEVERITY[s].label}
    </Chip>
  );
}

const STATUS = {
  new: { tone: "brand", Icon: CircleDot },
  handled: { tone: "ok", Icon: CheckCircle2 },
  dismissed: { tone: "muted", Icon: CircleSlash },
} as const;

/** New / Handled / Dismissed, with an icon. */
export function AlertStatusChip({ status }: { status: AlertStatus }) {
  const { tone, Icon } = STATUS[status];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {ALERT_STATUS_LABEL[status]}
    </Chip>
  );
}

/** An unmapped finding (ADR 0003): shown, never hidden or guessed. */
export function NotStandardisedChip() {
  return (
    <Chip tone="muted">
      <CircleHelp aria-hidden className="size-3" />
      {NOT_STANDARDISED}
    </Chip>
  );
}

const CAUSE = {
  high: { tone: "ok", Icon: ShieldCheck },
  caution: { tone: "warn", Icon: AlertTriangle },
  review: { tone: "bad", Icon: OctagonAlert },
} as const;

/** A suggested cause's confidence, in the result labels' words (spec §6). */
export function CauseChip({ level }: { level: CauseConfidence }) {
  const { tone, Icon } = CAUSE[level];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {RESULT_LABEL[level]}
    </Chip>
  );
}
```

- [ ] **Step 4: The bell**

Create `components/notifications/notification-bell.tsx`:

```tsx
"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ageLabel } from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { findingLine, locationLabel } from "@/lib/notifications/alert-view";
import { NOTIFICATIONS_HREF } from "@/lib/notifications/popups";
import { StatusChip } from "../corrections/chips";
import { useDecisions } from "../corrections/decisions-provider";
import { useAlerts } from "./alerts-provider";
import { SeverityChip } from "./chips";

/** The latest few of each kind in the panel (spec §2). */
export const BELL_ALERTS = 4;
export const BELL_DECISIONS = 3;

const HEADING =
  "px-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint";

/**
 * The top bar's bell: one notification centre for patient alerts and
 * decisions on your corrections (spec §2). One count (R1); pop-ups can be
 * reached from here too (spec §6).
 */
export function NotificationBell() {
  const d = useDecisions();
  const a = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const now = useNow(60_000);

  useEffect(() => {
    if (!open) return;
    ref.current
      ?.querySelector<HTMLElement>("[data-panel] button, [data-panel] a")
      ?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  if (!d && !a) return null;
  const count = (a?.unread ?? 0) + (d?.unseen ?? 0);
  const label = count ? `Notifications, ${count} unread` : "Notifications";
  const alerts = a?.available ? a.latest.slice(0, BELL_ALERTS) : [];
  const notes = (d?.notes ?? []).slice(0, BELL_DECISIONS);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    close(true);
  };

  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          d?.markSeen();
        }}
        className="relative grid size-11 place-items-center rounded-xl border border-line bg-white text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep md:size-[34px] md:rounded-[10px]"
      >
        <Bell aria-hidden className="size-4" />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad-deep px-1 font-mono text-[10px] font-bold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          data-panel
          role="region"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(360px,92vw)] rounded-2xl bg-white p-3 text-left shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <h2 className="px-1 text-[13px] font-semibold">Notifications</h2>
          {a?.available && (
            <section aria-labelledby={`${panelId}-alerts`} className="mt-2">
              <h3 id={`${panelId}-alerts`} className={HEADING}>
                Patient alerts
              </h3>
              {alerts.length ? (
                <ul className="mt-1 flex max-h-[34vh] flex-col overflow-auto">
                  {alerts.map((al) => (
                    <li
                      key={al.id}
                      className="border-t border-line first:border-0"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          close(false);
                          a.openAlert(al.id);
                        }}
                        className="flex min-h-11 w-full flex-col gap-1 rounded-xl px-1 py-2.5 text-left text-[13px] hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <SeverityChip severity={al.severity} />
                          <b className="min-w-0 [overflow-wrap:anywhere]">
                            {al.patient.full_name}
                          </b>
                        </span>
                        <span className="[overflow-wrap:anywhere]">
                          {findingLine(al.finding)}
                        </span>
                        <small className="text-ink-3 [overflow-wrap:anywhere]">
                          {locationLabel(al.patient.location)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 px-1 text-[13px] text-ink-3">
                  No new patient alerts.
                </p>
              )}
            </section>
          )}
          <section aria-labelledby={`${panelId}-decisions`} className="mt-3">
            <h3 id={`${panelId}-decisions`} className={HEADING}>
              Decisions on your corrections
            </h3>
            {notes.length ? (
              <ul className="mt-1 flex max-h-[26vh] flex-col overflow-auto">
                {notes.map((n) => (
                  <li
                    key={`${n.id}-${n.at}`}
                    className="flex flex-col gap-1 border-t border-line px-1 py-2.5 text-[13px] first:border-0"
                  >
                    <span className="flex items-center gap-2">
                      <StatusChip status={n.status} />
                      <b className="min-w-0 [overflow-wrap:anywhere]">
                        {n.title}
                      </b>
                    </span>
                    <small className="text-ink-3">
                      {[n.by, `${ageLabel(n.at, now)} ago`]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {n.reason && (
                      <small className="text-bad-deep [overflow-wrap:anywhere]">
                        Reason: {n.reason}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 px-1 text-[13px] text-ink-3">
                No decisions yet. When a reviewer decides on a correction you
                suggested, it shows here.
              </p>
            )}
            <p className="mt-1 px-1 text-[11px] text-ink-3">
              Decisions are kept for this session only.
            </p>
          </section>
          <Link
            href={NOTIFICATIONS_HREF}
            onClick={() => close(false)}
            className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-lilac text-[13px] font-semibold text-bloom focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
```

In `components/shell/top-bar.tsx`, replace
`import { DecisionBell } from "../corrections/decision-bell";` with
`import { NotificationBell } from "../notifications/notification-bell";` and
`<DecisionBell />` with `<NotificationBell />`. Delete
`components/corrections/decision-bell.tsx`.

- [ ] **Step 5: Changelog**

In `CHANGELOG.md` under _Unreleased_ → _Added_, add at the top:

```markdown
- One notification centre for clinicians: the bell in the top bar counts
  new patient alerts and decisions on your corrections together
  ("Notifications, 3 unread"), and its panel shows the latest of both with
  "See all". New alerts and decisions pop up with a View button. Alerts
  that were already there when you signed in don't pop up; Critical alerts
  are read out at once and stay until you hide them; a burst shows at most
  three pop-ups and a summary. Pop-ups never take the focus and go when you
  sign out.
```

Under _Changed_, add:

```markdown
- The decisions bell is now the notification bell, shared with patient
  alerts.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components lib/motion.test.ts`
Expected: PASS.

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write CHANGELOG.md && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add components/notifications components/shell/top-bar.tsx components/shell/app-shell.test.tsx components/corrections tests/e2e/review.spec.ts tests/e2e/hospital-admin.spec.ts CHANGELOG.md
git commit -m "Replace the decisions bell with one notification bell"
```

---

### Task 9: The patient alert card and the dismiss dialog

**Files:**

- Create: `components/notifications/alert-card.tsx`,
  `components/notifications/dismiss-dialog.tsx`,
  `components/notifications/alert-card.test.tsx`
- Test: `components/notifications/alert-card.test.tsx`, `lib/motion.test.ts`

**Interfaces:**

- Consumes: `useAcknowledgeAlert`, `useDismissAlert`, `useAlertList`
  (Task 5); `findingLine`, `recordedLabel`, `likelyCauses`, `locationLabel`,
  `handledLine`, `recordLink`, `DISMISS_REASONS`, `DISMISS_NOTE_MAX`
  (Task 3); `askFromAlert`, `stashPrefill`, `readPrefill` (Task 4);
  `SeverityChip`, `AlertStatusChip`, `NotStandardisedChip`, `CauseChip`
  (Task 8); `useShell` (Task 7); `eventClock`; `isAlertHandled`; `useOnline`;
  `useIsDesktop`; `Button`, `Banner`, `Chip`, `Dialog`, `Sheet`;
  `renderWithAuth`, `mockAlerts`, `makeAlert`, `ALERT_NOW`.
- Produces (`components/notifications/alert-card.tsx`):
  `AlertCard({ alert, now, showSource }: { alert: AlertOut; now: number; showSource: boolean })`
  (an `article` named by its finding and patient) and
  `alertDomId(id: string): string`.
- Produces (`components/notifications/dismiss-dialog.tsx`):
  `DismissDialog({ open, onClose, patient, gone, busy, failed, onSubmit }: { open: boolean; onClose(): void; patient: string; gone: boolean; busy: boolean; failed: boolean; onSubmit(d: DismissIn): void })`
  (a dialog on desktop, a sheet on phones, titled "Dismiss this alert?").

- [ ] **Step 1: Write the failing tests**

Create `components/notifications/alert-card.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { useAlertList } from "@/lib/notification-queries";
import { readPrefill } from "@/lib/notifications/ask";
import { ALERT_NOW, makeAlert, mockAlerts } from "@/tests/alerts";
import { renderWithAuth } from "@/tests/auth-wrapper";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
import { AlertCard } from "./alert-card";

/** The card as the page shows it: read from the cached list, so updates land. */
function Listed({ id }: { id: string }) {
  const q = useAlertList({ status: "new" });
  const a = q.data?.pages.flatMap((p) => p.alerts).find((x) => x.id === id);
  return a ? <AlertCard alert={a} now={ALERT_NOW} showSource /> : null;
}
const card = () => screen.findByRole("article");

beforeEach(() => {
  holder.client = mockAlerts();
  push.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("AlertCard", () => {
  it("shows the alert in the spec's order, in words and icons", () => {
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource />,
    );
    const c = screen.getByRole("article", {
      name: "Potassium 2.9 mmol/L (low; normal 3.5–5.1) · 08:42 Maryam Abdullahi",
    });
    const text = c.textContent!;
    const order = [
      "Critical",
      "Potassium 2.9 mmol/L (low; normal 3.5–5.1)",
      "Likely causes · Suggested by MHAI",
      "Maryam Abdullahi",
      "204817",
      "Ward 3 · Bed 12",
      "Acknowledge",
      "Ask MHAI about it",
      "Open patient record",
      "Dismiss",
    ];
    const at = order.map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(within(c).getByText("Diuretic treatment")).toBeVisible();
    expect(within(c).getByText("High confidence")).toBeVisible();
    expect(within(c).getByText("Use with caution")).toBeVisible();
    expect(within(c).getByText("Needs review")).toBeVisible();
    expect(
      within(c).getByText("Suggestions to check, not a diagnosis."),
    ).toBeVisible();
    expect(within(c).getByText("New")).toBeVisible();
    expect(within(c).getByText("Main record")).toBeVisible();
    expect(within(c).getByText("Critical").querySelector("svg")).toBeTruthy();
    const record = within(c).getByRole("link", { name: /Open patient record/ });
    expect(record).toHaveAttribute(
      "href",
      "https://record.example/open/al-test",
    );
    expect(record).toHaveAttribute("target", "_blank");
    expect(record).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("leaves the source out when the hospital has one system (R10)", () => {
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource={false} />,
    );
    expect(screen.queryByText("Main record")).toBeNull();
  });

  it("shows a sparse, unstandardised alert without guessing (Review Focus 4)", () => {
    renderWithAuth(
      <AlertCard
        alert={makeAlert({
          severity: "catastrophic" as never,
          finding: {
            name: "HS-TROP (local code)",
            value: "52",
            unit: "ng/L",
            flag: null,
            reference_range: null,
            recorded_at: null,
            code_system: null,
            standardised: false,
          },
          likely_causes: [],
          patient: {
            full_name: "Blessing Uche",
            mrn: "702366",
            location: null,
          },
          emr_link: "http://record.example/open/x",
        })}
        now={ALERT_NOW}
        showSource={false}
      />,
    );
    const c = screen.getByRole("article");
    expect(within(c).getByText("Urgent")).toBeVisible();
    expect(within(c).getByRole("heading", { level: 3 })).toHaveTextContent(
      /^HS-TROP \(local code\) 52 ng\/L$/,
    );
    expect(within(c).getByText("Not standardised")).toBeVisible();
    expect(within(c).getByText("Location not recorded")).toBeVisible();
    expect(within(c).queryByText(/Suggested by MHAI/)).toBeNull();
    expect(
      within(c).queryByRole("link", { name: /Open patient record/ }),
    ).toBeNull();
  });

  it("acknowledges with one key, then says who and moves the focus there (R6)", async () => {
    const user = userEvent.setup();
    const ack = vi.spyOn(holder.client, "acknowledgeAlert");
    renderWithAuth(<Listed id="al-101" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Acknowledge" }));
    const line = await within(c).findByText(
      "Acknowledged by Dr. Reyes · 09:00",
    );
    await waitFor(() => expect(line).toHaveFocus());
    expect(within(c).getByText("Handled")).toBeVisible();
    expect(
      within(c).getByRole("button", { name: "Acknowledge" }),
    ).toBeDisabled();
    expect(within(c).getByRole("button", { name: "Dismiss" })).toBeDisabled();
    expect(
      within(c).getByRole("button", { name: "Ask MHAI about it" }),
    ).toBeEnabled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack.mock.calls[0]![1]?.idempotencyKey).toBeTruthy();
  });

  it("shows who handled it first and disables the actions with that reason (Review Focus 1)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-101" />);
    const c = await card();
    holder.client.handleElsewhere("al-101", "Dr. Okafor");
    await user.click(within(c).getByRole("button", { name: "Acknowledge" }));
    expect(
      await within(c).findByText("Someone else handled this alert"),
    ).toBeVisible();
    const line = within(c).getByText("Acknowledged by Dr. Okafor · 09:00");
    await waitFor(() => expect(line).toHaveFocus());
    for (const name of ["Acknowledge", "Dismiss"]) {
      const b = within(c).getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(
        "Acknowledged by Dr. Okafor · 09:00",
      );
    }
  });

  it("needs a reason to dismiss, then records it with the note", async () => {
    const user = userEvent.setup();
    const dismiss = vi.spyOn(holder.client, "dismissAlert");
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    expect(
      within(dialog).getByText(
        /The alert for Samuel Bassey moves to Dismissed/,
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(within(dialog).getByText("✕ Choose a reason.")).toBeVisible();
    expect(
      within(dialog).getByRole("radio", { name: "Not clinically relevant" }),
    ).toHaveFocus();
    expect(dismiss).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("radio", { name: "Already known" }),
    );
    await user.type(
      within(dialog).getByLabelText("Note (optional)"),
      "Known kidney disease.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(
      await within(c).findByText(
        "Dismissed by Dr. Reyes · 09:00 · Already known",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Dismiss alert" })).toBeNull();
    expect(dismiss).toHaveBeenCalledWith(
      "al-105",
      { reason: "already_known", note: "Known kidney disease." },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("says in the dialog when someone else handled it meanwhile (Review Focus 1)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<Listed id="al-105" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Dismiss" }));
    holder.client.handleElsewhere("al-105", "Nurse Bello", "dismissed");
    const dialog = screen.getByRole("dialog", { name: "Dismiss this alert?" });
    await user.click(
      within(dialog).getByRole("radio", { name: "Wrong patient" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    );
    expect(
      await within(dialog).findByText("Someone else handled this alert"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Nothing you choose here will be sent/),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Dismiss alert" }),
    ).toBeDisabled();
    expect(
      within(c).getByText(/^Dismissed by Nurse Bello · 09:00/),
    ).toBeVisible();
  });

  it("asks MHAI with a prefill that carries no name or MRN (R11)", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource />,
    );
    await user.click(screen.getByRole("button", { name: "Ask MHAI about it" }));
    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0]![0] as string;
    expect(href).toMatch(/^\/\?prefill=[a-z0-9]{12}$/);
    const values = readPrefill(
      new URL(href, "http://x.test").searchParams.get("prefill"),
    );
    expect(values?.age).toBe("67");
    expect(JSON.stringify(values)).not.toMatch(
      /Maryam|Abdullahi|204817|Ward 3/,
    );
  });

  it("disables Acknowledge and Dismiss offline, and says why", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(
      <AlertCard alert={makeAlert()} now={ALERT_NOW} showSource />,
    );
    for (const name of ["Acknowledge", "Dismiss"]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(
        "You're offline. Acknowledge and Dismiss need a connection.",
      );
    }
    expect(
      screen.getByRole("button", { name: "Ask MHAI about it" }),
    ).toBeEnabled();
  });

  it("says why a save failed, and keeps the alert as it was", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "acknowledgeAlert").mockRejectedValue(
      new ApiError(400, "error"),
    );
    renderWithAuth(<Listed id="al-101" />);
    const c = await card();
    await user.click(within(c).getByRole("button", { name: "Acknowledge" }));
    expect(await within(c).findByText("Couldn't save that")).toBeVisible();
    expect(
      within(c).getByRole("button", { name: "Acknowledge" }),
    ).toBeEnabled();
  });

  it("wraps a long name instead of cutting it off", () => {
    const long = "Oluwafunmilayo Adebayo-Ogunleye-Fashola";
    renderWithAuth(
      <AlertCard
        alert={makeAlert({
          patient: { ...makeAlert().patient, full_name: long },
        })}
        now={ALERT_NOW}
        showSource
      />,
    );
    const name = screen.getByText(long);
    expect(name).not.toHaveClass("truncate");
    expect(name.className).toContain("[overflow-wrap:anywhere]");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/notifications/alert-card.test.tsx`
Expected: FAIL. `./alert-card` doesn't exist.

- [ ] **Step 3: The dismiss dialog**

Create `components/notifications/dismiss-dialog.tsx`:

```tsx
"use client";
import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { DismissIn, DismissReason } from "@/lib/api/alerts-contract";
import { useIsDesktop } from "@/lib/hooks/use-media";
import {
  DISMISS_NOTE_MAX,
  DISMISS_REASONS,
} from "@/lib/notifications/alert-view";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Sheet } from "../ui/sheet";

const TITLE = "Dismiss this alert?";

type Props = {
  open: boolean;
  onClose(): void;
  patient: string;
  /** Someone else handled it while this was open (Review Focus 1). */
  gone: boolean;
  busy: boolean;
  failed: boolean;
  onSubmit(d: DismissIn): void;
};

/** Dismiss needs a reason (spec §3). A dialog on desktop, a sheet on phones, like Reject. */
export function DismissDialog(props: Props) {
  const desktop = useIsDesktop();
  // Mounted only while open, so each opening starts empty.
  const form = props.open ? <DismissForm {...props} /> : null;
  return desktop ? (
    <Dialog open={props.open} onClose={props.onClose} title={TITLE}>
      {form}
    </Dialog>
  ) : (
    <Sheet open={props.open} onClose={props.onClose} title={TITLE}>
      <h2 className="mb-3 font-display text-[28px] font-black leading-none">
        {TITLE}
      </h2>
      {form}
    </Sheet>
  );
}

function DismissForm({
  onClose,
  patient,
  gone,
  busy,
  failed,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState<DismissReason | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (gone || busy) return;
        if (!reason) {
          setMissing(true);
          first.current?.focus();
          return;
        }
        const n = note.trim();
        onSubmit(n ? { reason, note: n } : { reason });
      }}
    >
      <p className="text-[13.5px] text-ink-2 [overflow-wrap:anywhere]">
        The alert for {patient} moves to Dismissed. Your reason helps tune
        alerts for your hospital.
      </p>
      {gone && (
        <div className="mt-3">
          <Banner tone="warn" title="Someone else handled this alert">
            Nothing you choose here will be sent. Close this and carry on.
          </Banner>
        </div>
      )}
      <fieldset
        aria-describedby={missing ? `${id}-err` : undefined}
        className="mt-3"
      >
        <legend className="mb-2 text-[13px] font-semibold">
          Reason <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {DISMISS_REASONS.map((r, i) => (
            <label key={r.code} className="cursor-pointer">
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name={`${id}-reason`}
                value={r.code}
                checked={reason === r.code}
                onChange={() => {
                  setReason(r.code);
                  setMissing(false);
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-lilac-2 bg-white px-3 text-[12.5px] text-ink-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9">
                {reason === r.code && (
                  <Check aria-hidden className="size-3.5" />
                )}
                {r.label}
              </span>
            </label>
          ))}
        </div>
        {missing && (
          <p id={`${id}-err`} className="mt-1.5 text-xs text-bad">
            ✕ Choose a reason.
          </p>
        )}
      </fieldset>
      <label
        htmlFor={`${id}-note`}
        className="mb-1.5 mt-3 block text-[12.5px] text-ink-2"
      >
        Note (optional)
      </label>
      <textarea
        id={`${id}-note`}
        rows={3}
        maxLength={DISMISS_NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-describedby={`${id}-note-hint`}
        className="w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none [overflow-wrap:anywhere] focus:border-mint focus:ring-4 focus:ring-mint/15"
      />
      <p className="mt-1 flex justify-between gap-3 text-[11px] text-ink-3">
        <span id={`${id}-note-hint`}>
          Don&apos;t add names or record numbers.
        </span>
        <span className="font-mono">
          {note.length} / {DISMISS_NOTE_MAX}
        </span>
      </p>
      {failed && !gone && (
        <div className="mt-2">
          <Banner tone="bad" title="Couldn't dismiss the alert">
            Check your connection and try again.
          </Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" disabled={busy || gone}>
          Dismiss alert
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: The card**

Create `components/notifications/alert-card.tsx`:

```tsx
"use client";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AlertOut, DismissIn } from "@/lib/api/alerts-contract";
import { isAlertHandled } from "@/lib/api/errors";
import { useOnline } from "@/lib/hooks/use-online";
import {
  useAcknowledgeAlert,
  useDismissAlert,
} from "@/lib/notification-queries";
import {
  findingLine,
  handledLine,
  likelyCauses,
  locationLabel,
  recordLink,
  recordedLabel,
} from "@/lib/notifications/alert-view";
import { askFromAlert, stashPrefill } from "@/lib/notifications/ask";
import { eventClock } from "@/lib/time";
import { useShell } from "../shell/shell-context";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import {
  AlertStatusChip,
  CauseChip,
  NotStandardisedChip,
  SeverityChip,
} from "./chips";
import { DismissDialog } from "./dismiss-dialog";

/** The card's DOM id, so a "View" can bring it into view. Never in the URL (R3). */
export const alertDomId = (id: string) => `alert-${id}`;

type Problem = "conflict" | "failed" | null;

/**
 * One patient alert, in the spec's order (§3): severity, the finding, likely
 * causes suggested by MHAI, the patient and where they are, then the actions.
 */
export function AlertCard({
  alert,
  now,
  showSource,
}: {
  alert: AlertOut;
  now: number;
  showSource: boolean;
}) {
  const ack = useAcknowledgeAlert();
  const dismiss = useDismissAlert();
  const online = useOnline();
  const { navigate } = useShell();
  const ids = useId();
  const [dismissing, setDismissing] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const handledRef = useRef<HTMLParagraphElement>(null);
  // Set before an action; the handled line takes the focus when it appears (R6).
  const focusHandled = useRef(false);

  const closed = alert.status !== "new";
  const handled = handledLine(alert, now);
  const recorded = recordedLabel(alert.finding, now);
  const causes = likelyCauses(alert);
  const link = recordLink(alert.emr_link);
  const busy = ack.isPending || dismiss.isPending;
  // A disabled action always says why (Global Constraints).
  const why = closed
    ? `${ids}-handled`
    : !online
      ? `${ids}-offline`
      : undefined;

  useEffect(() => {
    if (!closed || !focusHandled.current) return;
    focusHandled.current = false;
    handledRef.current?.focus();
  }, [closed]);

  const failed = (e: Error) => {
    if (isAlertHandled(e)) {
      setProblem("conflict");
      return;
    }
    focusHandled.current = false;
    setProblem("failed");
  };
  const acknowledge = () => {
    setProblem(null);
    focusHandled.current = true;
    ack.mutate(alert.id, { onError: failed });
  };
  const submitDismiss = (d: DismissIn) => {
    setProblem(null);
    focusHandled.current = true;
    dismiss.mutate(
      { id: alert.id, d },
      {
        onSuccess: () => setDismissing(false),
        // The dialog stays open and says why, so the focus stays in it.
        onError: (e) => {
          focusHandled.current = false;
          setProblem(isAlertHandled(e) ? "conflict" : "failed");
        },
      },
    );
  };
  // The prefill waits in memory; the URL carries only a random token (R3, R11).
  const ask = () =>
    navigate(`/?prefill=${stashPrefill(askFromAlert(alert, now))}`);

  return (
    <>
      <article
        id={alertDomId(alert.id)}
        tabIndex={-1}
        aria-labelledby={`${ids}-finding ${ids}-patient`}
        className="card-v3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep md:px-[22px]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={alert.severity} />
          <AlertStatusChip status={alert.status} />
          {showSource && alert.source_label && (
            <Chip tone="muted">
              <span className="sr-only">Source: </span>
              <span className="[overflow-wrap:anywhere]">
                {alert.source_label}
              </span>
            </Chip>
          )}
          <span className="ml-auto font-mono text-[11.5px] text-ink-3">
            {eventClock(alert.created_at, now)}
          </span>
        </div>
        <h3
          id={`${ids}-finding`}
          className="mt-2.5 text-[15px] font-semibold [overflow-wrap:anywhere]"
        >
          {findingLine(alert.finding)}
          {recorded && (
            <span className="font-normal text-ink-3"> · {recorded}</span>
          )}
        </h3>
        {!alert.finding.standardised && (
          <div className="mt-1.5">
            <NotStandardisedChip />
          </div>
        )}
        {causes.length > 0 && (
          <section
            aria-labelledby={`${ids}-causes`}
            className="mt-3 rounded-2xl bg-lilac px-3.5 py-3"
          >
            <h4
              id={`${ids}-causes`}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-bloom"
            >
              <Sparkles aria-hidden className="size-3.5" />
              Likely causes · Suggested by MHAI
            </h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {causes.map((c) => (
                <li
                  key={c.label}
                  className="flex flex-wrap items-center gap-2 text-[13.5px]"
                >
                  <span className="[overflow-wrap:anywhere]">{c.label}</span>
                  <CauseChip level={c.level} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-ink-3">
              Suggestions to check, not a diagnosis.
            </p>
          </section>
        )}
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13.5px]">
          <dt className="text-ink-3">Patient</dt>
          <dd
            id={`${ids}-patient`}
            className="font-semibold [overflow-wrap:anywhere]"
          >
            {alert.patient.full_name}
          </dd>
          <dt className="text-ink-3">MRN</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">
            {alert.patient.mrn}
          </dd>
          <dt className="text-ink-3">Where</dt>
          <dd className="flex items-start gap-1 [overflow-wrap:anywhere]">
            <MapPin
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-ink-3"
            />
            {locationLabel(alert.patient.location)}
          </dd>
        </dl>
        {handled && (
          <p
            ref={handledRef}
            id={`${ids}-handled`}
            tabIndex={-1}
            className="mt-3 text-[13px] font-semibold text-ink-2 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            {handled}
          </p>
        )}
        {problem === "conflict" && (
          <div className="mt-3">
            <Banner tone="warn" title="Someone else handled this alert">
              Nothing more to do here. Your action wasn&apos;t recorded.
            </Banner>
          </div>
        )}
        {problem === "failed" && !dismissing && (
          <div className="mt-3">
            <Banner tone="bad" title="Couldn't save that">
              Check your connection and try again.
            </Banner>
          </div>
        )}
        {!online && !closed && (
          <p id={`${ids}-offline`} className="mt-3 text-[13px] text-ink-3">
            You&apos;re offline. Acknowledge and Dismiss need a connection.
          </p>
        )}
        <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            size="sm"
            disabled={closed || busy || !online}
            aria-describedby={why}
            onClick={acknowledge}
          >
            Acknowledge
          </Button>
          <Button size="sm" variant="soft" onClick={ask}>
            Ask MHAI about it
          </Button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-9"
            >
              Open patient record
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={closed || busy || !online}
            aria-describedby={why}
            onClick={() => {
              setProblem(null);
              setDismissing(true);
            }}
          >
            Dismiss
          </Button>
        </div>
      </article>
      <DismissDialog
        open={dismissing}
        patient={alert.patient.full_name}
        gone={closed}
        busy={dismiss.isPending}
        failed={problem === "failed"}
        onClose={() => setDismissing(false)}
        onSubmit={submitDismiss}
      />
    </>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/notifications lib/motion.test.ts`
Expected: PASS.

- [ ] **Step 6: Check and commit**

Run: `npm run typecheck && npm run lint`
Expected: clean.

```bash
git add components/notifications/alert-card.tsx components/notifications/dismiss-dialog.tsx components/notifications/alert-card.test.tsx
git commit -m "Show a patient alert with its actions and the dismiss reason"
```

---

### Task 10: The Notifications page: Patient alerts

**Files:**

- Create: `components/notifications/notifications-frame.tsx`,
  `components/notifications/alerts-view.tsx`,
  `components/notifications/alerts-view.test.tsx`,
  `app/(clinical)/(clinician)/notifications/page.tsx`
- Modify: `CHANGELOG.md`
- Test: `components/notifications/alerts-view.test.tsx`, `lib/motion.test.ts`

**Interfaces:**

- Consumes: `useAlertList`, `alertsOff`, `AlertFilter` (Task 5);
  `ALERT_STATUS_LABEL`, `SEVERITY`, `showSources` (Task 3);
  `NOTIFICATIONS_HREF`, `CORRECTIONS_HREF` (Task 4); `LinkTabs` (Task 6);
  `useAlerts`, `AlertsProvider` (Task 7); `AlertCard`, `alertDomId` (Task 9);
  `useDecisions`; `FilterChip`; `TopBar`, `MenuButton`, `Banner`, `Button`,
  `Skeleton`; `useNow`; the `(clinician)` layout (`AuthGate need="clinical"`).
- Produces (`components/notifications/notifications-frame.tsx`):
  `NotificationsFrame({ current, children }: { current: "alerts" | "corrections"; children: ReactNode })`
  (top bar, heading and the tabs "Patient alerts" and "Corrections", each
  with "· N new" when there is something new).
- Produces (`components/notifications/alerts-view.tsx`): `AlertsTab()` (the
  frame with `AlertsView` keyed by `focusSeq`) and `AlertsView()` (filters
  Status, Severity and, with more than one system, Source; the list; "Show
  more alerts"; the empty, error and "not switched on" states; focus on the
  alert a "View" asked for).
- Produces: the route `/notifications` (page title "Notifications · MHAI",
  with no patient details in it).

- [ ] **Step 1: Write the failing tests**

Create `components/notifications/alerts-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { MOCK_ALERT_EVERY_MS, createMockAlerts } from "@/lib/api/mock-alerts";
import { ALERT_NOW, mockAlerts } from "@/tests/alerts";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/notifications",
}));
import ClinicianLayout from "@/app/(clinical)/(clinician)/layout";
import NotificationsPage from "@/app/(clinical)/(clinician)/notifications/page";
import { AlertsProvider, useAlerts } from "./alerts-provider";

const list = () => screen.findByRole("list", { name: "Patient alerts" });
const cards = async () => within(await list()).getAllByRole("article");
const shows = (n: number) =>
  waitFor(async () => expect(await cards()).toHaveLength(n));

beforeEach(() => {
  holder.client = mockAlerts();
  push.mockClear();
  replace.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("Notifications: Patient alerts", () => {
  it("lists new alerts newest first, with the source when there are two systems", async () => {
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    const all = await cards();
    expect(all[0]).toHaveTextContent("Maryam Abdullahi");
    expect(all[5]).toHaveTextContent("Blessing Uche");
    expect(within(all[1]!).getByText("Results system")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Notifications", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Patient alerts" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Corrections" })).toHaveAttribute(
      "href",
      "/notifications/corrections",
    );
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("6 alerts shown")).toBeInTheDocument();
  });

  it("filters by status, severity and source", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    await user.click(screen.getByRole("button", { name: "Handled" }));
    await shows(1);
    expect(within(await list()).getByText("Kemi Afolabi")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Dismissed" }));
    await waitFor(async () =>
      expect(within(await list()).getByText("Peter Ogbu")).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Critical" }));
    await shows(2);
    const sources = screen.getByRole("group", { name: "Source" });
    await user.click(
      within(sources).getByRole("button", { name: "Main record" }),
    );
    await shows(1);
    expect(within(await list()).getByText("Maryam Abdullahi")).toBeVisible();
  });

  it("shows more with the cursor", async () => {
    const user = userEvent.setup();
    let t = ALERT_NOW;
    holder.client = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 40 * MOCK_ALERT_EVERY_MS;
    renderWithAuth(<NotificationsPage />);
    await shows(20);
    await user.click(screen.getByRole("button", { name: "Show more alerts" }));
    await shows(36);
    expect(
      screen.queryByRole("button", { name: "Show more alerts" }),
    ).toBeNull();
    expect(screen.getByText("36 alerts shown")).toBeInTheDocument();
  });

  it("opens the alert a pop-up asked for, from New, and focuses it", async () => {
    const user = userEvent.setup();
    function Opener() {
      const a = useAlerts();
      return (
        <button type="button" onClick={() => a?.openAlert("al-105")}>
          open Samuel
        </button>
      );
    }
    renderWithAuth(
      <ToastProvider>
        <AlertsProvider>
          <Opener />
          <NotificationsPage />
        </AlertsProvider>
      </ToastProvider>,
    );
    await shows(6);
    await user.click(screen.getByRole("button", { name: "Dismissed" }));
    await shows(1);
    await user.click(screen.getByRole("button", { name: "open Samuel" }));
    expect(push).toHaveBeenCalledWith("/notifications");
    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: /Samuel Bassey/ }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says when alerts aren't switched on (R12)", async () => {
    vi.spyOn(holder.client, "listAlerts").mockRejectedValue(
      new ApiError(404, "not_found"),
    );
    renderWithAuth(<NotificationsPage />);
    expect(
      await screen.findByText(
        "Patient alerts aren't switched on for your hospital yet",
      ),
    ).toBeVisible();
  });

  it("offers a retry when the alerts can't load", async () => {
    vi.spyOn(holder.client, "listAlerts")
      .mockRejectedValueOnce(new ApiError(400, "error"))
      .mockResolvedValue({ alerts: [], next_cursor: null, sources: [] });
    const user = userEvent.setup();
    renderWithAuth(<NotificationsPage />);
    expect(
      await screen.findByText("Couldn't load patient alerts"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No new patient alerts/)).toBeVisible();
  });

  it("offers no print or export, and keeps alerts off a print-out (R14)", async () => {
    renderWithAuth(<NotificationsPage />);
    const l = await list();
    expect(
      screen.queryByRole("button", { name: /print|export|copy|download/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /print|export|download/i }),
    ).toBeNull();
    expect(l.closest(".print\\:hidden")).not.toBeNull();
    expect(screen.getByText("Patient alerts aren't printed.")).toHaveClass(
      "print:block",
    );
  });

  it("keeps alerts out of storage, the URL and the title", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const before = window.location.href;
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    await user.click(screen.getByRole("button", { name: "Handled" }));
    await shows(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
    expect(document.title).not.toMatch(/Maryam|204817|Kemi/);
  });

  it("sends an admin-only person home without loading alerts", async () => {
    const listSpy = vi.spyOn(holder.client, "listAlerts");
    renderWithAuth(
      <ClinicianLayout params={Promise.resolve({})}>
        <NotificationsPage />
      </ClinicianLayout>,
      { ...TEST_USER, roles: ["hospital_admin"] },
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
    expect(screen.queryByRole("list", { name: "Patient alerts" })).toBeNull();
    expect(listSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/notifications/alerts-view.test.tsx`
Expected: FAIL. The notifications page doesn't exist.

- [ ] **Step 3: The frame**

Create `components/notifications/notifications-frame.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import {
  CORRECTIONS_HREF,
  NOTIFICATIONS_HREF,
} from "@/lib/notifications/popups";
import { useDecisions } from "../corrections/decisions-provider";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { LinkTabs } from "../ui/link-tabs";
import { useAlerts } from "./alerts-provider";

/** The Notifications page: top bar, heading and the two tabs (spec §2, R2). */
export function NotificationsFrame({
  current,
  children,
}: {
  current: "alerts" | "corrections";
  children: ReactNode;
}) {
  const a = useAlerts();
  const d = useDecisions();
  const tabs = [
    {
      id: "alerts",
      href: NOTIFICATIONS_HREF,
      label: a?.unread ? `Patient alerts · ${a.unread} new` : "Patient alerts",
    },
    {
      id: "corrections",
      href: CORRECTIONS_HREF,
      label: d?.unseen ? `Corrections · ${d.unseen} new` : "Corrections",
    },
  ];
  return (
    <>
      <TopBar
        title="Notifications"
        sub="Patient alerts and decisions"
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[860px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Your notifications
          </p>
          <h2 className="mb-4 font-display text-[40px] font-black leading-none">
            Notifications
          </h2>
          <LinkTabs label="Notifications" tabs={tabs} current={current} />
          {children}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: The Patient alerts tab and the route**

Create `components/notifications/alerts-view.tsx`:

```tsx
"use client";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AlertSeverity, AlertStatus } from "@/lib/api/alerts-contract";
import { useNow } from "@/lib/hooks/use-now";
import {
  alertsOff,
  useAlertList,
  type AlertFilter,
} from "@/lib/notification-queries";
import {
  ALERT_STATUS_LABEL,
  SEVERITY,
  showSources,
} from "@/lib/notifications/alert-view";
import { FilterChip } from "../corrections/filter-chip";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { AlertCard, alertDomId } from "./alert-card";
import { useAlerts } from "./alerts-provider";
import { NotificationsFrame } from "./notifications-frame";

const STATUSES: AlertStatus[] = ["new", "handled", "dismissed"];
const SEVERITIES: AlertSeverity[] = ["critical", "urgent", "info"];
const SEVERITY_ICON = {
  critical: OctagonAlert,
  urgent: AlertTriangle,
  info: Info,
} as const;
const EMPTY: Record<AlertStatus, string> = {
  new: "No new patient alerts. When MHAI spots an abnormal result for one of your patients, it shows here.",
  handled: "No acknowledged alerts yet.",
  dismissed: "No dismissed alerts yet.",
};

/** The Patient alerts tab. Each "View" starts it again from New (its key, R3). */
export function AlertsTab() {
  const a = useAlerts();
  return (
    <NotificationsFrame current="alerts">
      <AlertsView key={a?.focusSeq ?? 0} />
    </NotificationsFrame>
  );
}

/** Filters and the alert cards (spec §2, §3). Filters live in state, never the URL (R3). */
export function AlertsView() {
  const ctx = useAlerts();
  const now = useNow(60_000);
  const [status, setStatus] = useState<AlertStatus>("new");
  const [severity, setSeverity] = useState<AlertSeverity | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const filter: AlertFilter = {
    status,
    ...(severity ? { severity } : {}),
    ...(source ? { source } : {}),
  };
  const q = useAlertList(filter);
  const alerts = useMemo(
    () => q.data?.pages.flatMap((p) => p.alerts) ?? [],
    [q.data],
  );
  const sources = q.data?.pages[0]?.sources ?? [];
  const multi = showSources(sources);
  const focusId = ctx?.focusId ?? null;
  const focusDone = ctx?.focusDone;

  // Bring the alert a pop-up or the bell asked for into view, once the
  // latest list is in.
  useEffect(() => {
    if (!focusId || !q.isSuccess || q.isFetching) return;
    const el = document.getElementById(alertDomId(focusId));
    if (el) {
      el.scrollIntoView?.({ block: "center" });
      el.focus();
    }
    focusDone?.();
  }, [focusId, q.isSuccess, q.isFetching, alerts, focusDone]);

  return (
    <>
      <div className="print:hidden">
        <p className="mb-3 text-[13.5px] text-ink-2">
          Abnormal results MHAI spotted for your patients, with likely causes to
          check. You decide what happens next.
        </p>
        <div
          role="group"
          aria-label="Status"
          className="mb-2 flex flex-wrap gap-1.5"
        >
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {ALERT_STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>
        <div
          role="group"
          aria-label="Severity"
          className="mb-2 flex flex-wrap gap-1.5"
        >
          <FilterChip
            pressed={severity === null}
            onClick={() => setSeverity(null)}
          >
            All severities
          </FilterChip>
          {SEVERITIES.map((s) => {
            const Icon = SEVERITY_ICON[s];
            return (
              <FilterChip
                key={s}
                pressed={severity === s}
                onClick={() => setSeverity(s)}
              >
                {severity !== s && <Icon aria-hidden className="size-3.5" />}
                {SEVERITY[s].label}
              </FilterChip>
            );
          })}
        </div>
        {multi && (
          <div
            role="group"
            aria-label="Source"
            className="mb-2 flex flex-wrap gap-1.5"
          >
            <FilterChip
              pressed={source === null}
              onClick={() => setSource(null)}
            >
              All systems
            </FilterChip>
            {sources.map((s) => (
              <FilterChip
                key={s}
                pressed={source === s}
                onClick={() => setSource(s)}
              >
                {s}
              </FilterChip>
            ))}
          </div>
        )}
        <div aria-live="polite" className="sr-only">
          {q.isSuccess
            ? `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"} shown`
            : ""}
        </div>
        {q.isPending ? (
          <div aria-busy="true" className="mt-4 flex flex-col gap-3">
            <span className="sr-only">Loading patient alerts</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : !q.data ? (
          alertsOff(q.error) ? (
            <section className="card-v3 mt-4 px-[22px] py-6 text-[14px] text-ink-2">
              <h3 className="text-base font-semibold text-ink">
                Patient alerts aren&apos;t switched on for your hospital yet
              </h3>
              <p className="mt-1">
                When your hospital connects its patient records, alerts for your
                patients will show here.
              </p>
            </section>
          ) : (
            <div className="mt-4">
              <Banner tone="bad" title="Couldn't load patient alerts">
                Check your connection and try again.
              </Banner>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </div>
          )
        ) : alerts.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-ink-3">{EMPTY[status]}</p>
        ) : (
          <ul
            aria-label="Patient alerts"
            aria-busy={q.isFetching || undefined}
            className="mt-4 flex flex-col gap-3"
          >
            {alerts.map((a) => (
              <li key={a.id}>
                <AlertCard alert={a} now={now} showSource={multi} />
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <Button
            variant="ghost"
            className="mt-4"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            Show more alerts
          </Button>
        )}
        <p className="mt-6 text-[12px] text-ink-3">
          Alerts stay on this screen only while you&apos;re signed in, and
          they&apos;re never printed or exported.
        </p>
      </div>
      <p className="hidden print:block">Patient alerts aren&apos;t printed.</p>
    </>
  );
}
```

Create `app/(clinical)/(clinician)/notifications/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AlertsTab } from "@/components/notifications/alerts-view";

// No patient details in the title (spec §5).
export const metadata: Metadata = { title: "Notifications · MHAI" };

export default function NotificationsPage() {
  return <AlertsTab />;
}
```

- [ ] **Step 5: Changelog**

In `CHANGELOG.md` under _Unreleased_ → _Added_, add below the notification
centre entry:

```markdown
- Notifications page, Patient alerts tab (on sample data): each alert shows
  its severity in words and an icon, the abnormal result with its unit,
  normal range and time, up to three likely causes suggested by MHAI with a
  confidence word, the patient's name, MRN and where they are, and the
  hospital's own label for the system it came from when there are several.
  Acknowledge it, dismiss it with a reason, or open the patient's record in
  the hospital's system. An alert someone else handled first says who and
  when. Filters for New, Handled, Dismissed, severity and source; cards on
  phones; nothing is printed or exported.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/notifications lib/motion.test.ts`
Expected: PASS.

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write CHANGELOG.md && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add components/notifications app/'(clinical)'/'(clinician)'/notifications CHANGELOG.md
git commit -m "Add the Notifications page with the patient alerts list"
```

---

### Task 11: The Notifications page: Corrections

**Files:**

- Create: `components/notifications/corrections-tab.tsx`,
  `components/notifications/corrections-tab.test.tsx`,
  `app/(clinical)/(clinician)/notifications/corrections/page.tsx`
- Test: `components/notifications/corrections-tab.test.tsx`

**Interfaces:**

- Consumes: `useMyCorrections` (`lib/correction-queries.ts`),
  `correctionTitle`, `parseTime`, `rejectionText`, `statusLine`
  (`lib/corrections.ts`), `useDecisions`, `StatusChip`, `NotificationsFrame`
  (Task 10), `NotificationBell` (Task 8, in the test), `Chip`, `Banner`,
  `Button`, `Skeleton`, `useNow`.
- Produces: `CorrectionsTab()` (decided corrections, newest decision first,
  with the reviewer's reason; this session's new ones marked "New"; looking
  here counts them as seen, R1; a link to My feedback & corrections) and the
  route `/notifications/corrections`.

- [ ] **Step 1: Write the failing tests**

Create `components/notifications/corrections-tab.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "../ui/toast";

const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import CorrectionsPage from "@/app/(clinical)/(clinician)/notifications/corrections/page";
import { DecisionsProvider } from "../corrections/decisions-provider";
import { NotificationBell } from "./notification-bell";

const reviewer = {
  display_name: "Dr. Bello",
  full_name: null,
  specialty: null,
  hospital: null,
};
const titled = (id: string, diagnosis: string) =>
  makeCorrection({
    id,
    original: { ...makeCorrection().original, diagnosis },
  });
const approved: CorrectionOut = {
  ...titled("c1", "Unstable angina"),
  status: "approved",
  decided_by: reviewer,
  decided_at: new Date(T0 - 3_600_000).toISOString(),
};
const rejected: CorrectionOut = {
  ...makeCorrection({ id: "c2" }),
  status: "rejected",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
  rejection: { reason_code: "unsafe", note: "Dose too high." },
};
const waiting = titled("c3", "Still waiting");
const withdrawn: CorrectionOut = {
  ...titled("c4", "Taken back"),
  status: "withdrawn",
};

function ui(children: ReactNode) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() =>
  listMine
    .mockReset()
    .mockResolvedValue([approved, rejected, waiting, withdrawn]),
);

describe("Notifications: Corrections", () => {
  it("lists decided corrections, newest decision first, with the reviewer's reason", async () => {
    ui(<CorrectionsPage />);
    const list = await screen.findByRole("list", {
      name: "Decisions on your corrections",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Rejected");
    expect(items[0]).toHaveTextContent("Dengue fever, likely");
    expect(items[0]).toHaveTextContent(
      "Reviewer's reason: “Unsafe: Dose too high.”",
    );
    expect(items[1]).toHaveTextContent("Approved");
    expect(items[1]).toHaveTextContent("Unstable angina");
    expect(within(list).queryByText("Still waiting")).toBeNull();
    expect(within(list).queryByText("Taken back")).toBeNull();
    expect(
      screen.getByRole("link", { name: /My feedback & corrections/ }),
    ).toHaveAttribute("href", "/my-feedback");
    expect(screen.getByRole("link", { name: "Corrections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("says when there are no decisions yet", async () => {
    listMine.mockResolvedValue([waiting]);
    ui(<CorrectionsPage />);
    expect(await screen.findByText(/No decisions yet/)).toBeVisible();
  });

  it("marks this session's decisions New and counts them as seen while you look (R1)", async () => {
    listMine.mockResolvedValueOnce([
      {
        ...rejected,
        status: "pending_review",
        rejection: null,
        decided_at: null,
        decided_by: null,
      },
    ]);
    const qc = ui(
      <DecisionsProvider>
        <NotificationBell />
        <CorrectionsPage />
      </DecisionsProvider>,
    );
    await vi.waitFor(() =>
      expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
    );
    listMine.mockResolvedValueOnce([rejected, approved]);
    await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
    const list = await screen.findByRole("list", {
      name: "Decisions on your corrections",
    });
    expect(await within(list).findByText("New")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Notifications/ }),
      ).toHaveAccessibleName("Notifications"),
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/notifications/corrections-tab.test.tsx`
Expected: FAIL. The corrections page doesn't exist.

- [ ] **Step 3: The tab and the route**

Create `components/notifications/corrections-tab.tsx`:

```tsx
"use client";
import { Sparkle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useMyCorrections } from "@/lib/correction-queries";
import {
  correctionTitle,
  parseTime,
  rejectionText,
  statusLine,
} from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { StatusChip } from "../corrections/chips";
import { useDecisions } from "../corrections/decisions-provider";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Skeleton } from "../ui/skeleton";
import { NotificationsFrame } from "./notifications-frame";

/** The Corrections tab: what reviewers decided (spec §2). Looking here counts decisions as seen (R1). */
export function CorrectionsTab() {
  const q = useMyCorrections();
  const d = useDecisions();
  const now = useNow(60_000);
  const unseen = d?.unseen ?? 0;
  const markSeen = d?.markSeen;
  useEffect(() => {
    if (unseen) markSeen?.();
  }, [unseen, markSeen]);
  const fresh = new Set((d?.notes ?? []).map((n) => n.id));
  const decided = (q.data ?? [])
    .filter((c) => c.status === "approved" || c.status === "rejected")
    .sort(
      (x, y) => (parseTime(y.decided_at) ?? 0) - (parseTime(x.decided_at) ?? 0),
    );

  return (
    <NotificationsFrame current="corrections">
      <p className="mb-3 text-[13.5px] text-ink-2">
        What reviewers decided about corrections you suggested.
      </p>
      {q.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading decisions</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !q.data ? (
        <div>
          <Banner tone="bad" title="Couldn't load your decisions">
            Check your connection and try again.
          </Banner>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => void q.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : decided.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">
          No decisions yet. When a reviewer approves or rejects a correction you
          suggested, it shows here.
        </p>
      ) : (
        <ul
          aria-label="Decisions on your corrections"
          className="card-v3 px-5 py-1.5"
        >
          {decided.map((c) => {
            const reason = rejectionText(c.rejection);
            return (
              <li
                key={c.id}
                className="border-t border-line py-3.5 first:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={c.status} />
                  {fresh.has(c.id) && (
                    <Chip tone="mint">
                      <Sparkle aria-hidden className="size-3" />
                      New
                    </Chip>
                  )}
                </div>
                <b className="mt-1.5 block [overflow-wrap:anywhere]">
                  {correctionTitle(c)}
                </b>
                <p className="text-[13px] text-ink-3">{statusLine(c, now)}</p>
                {reason && (
                  <p className="mt-1.5 rounded-xl bg-bad-wash px-3 py-2 text-[13px] text-bad-deep [overflow-wrap:anywhere]">
                    <span className="font-semibold">
                      Reviewer&apos;s reason:{" "}
                    </span>
                    “{reason}”
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/my-feedback"
        className="mt-4 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-mint-deep"
      >
        My feedback &amp; corrections ›
      </Link>
    </NotificationsFrame>
  );
}
```

Create `app/(clinical)/(clinician)/notifications/corrections/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CorrectionsTab } from "@/components/notifications/corrections-tab";

export const metadata: Metadata = { title: "Notifications · MHAI" };

export default function NotificationsCorrectionsPage() {
  return <CorrectionsTab />;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/notifications/corrections-tab.tsx components/notifications/corrections-tab.test.tsx app/'(clinical)'/'(clinician)'/notifications/corrections
git commit -m "Add the Corrections tab to Notifications"
```

---

### Task 12: "Ask MHAI about it" fills a new consultation

**Files:**

- Modify: `app/(clinical)/(clinician)/page.tsx`, `lib/session-store.tsx`,
  `components/consultation/home.test.tsx`, `CHANGELOG.md`
- Test: `components/consultation/home.test.tsx`

**Interfaces:**

- Consumes: `readPrefill`, `clearPrefill`, `stashPrefill`, `askFromAlert`
  (Task 4); `makeAlert`, `ALERT_NOW`; the home page's `Home`, `HomeRoute`,
  `restart`, `ConsultationForm` (Plan 1).
- Produces: `/?prefill=<token>` opens the consultation form filled from the
  waiting prefill (age, sex, priority, symptom, question), with the line
  "Filled in from a patient alert. The patient's name and record number
  weren't copied. Check the details before you analyse."; sending the
  question, discarding or choosing an example forgets it;
  `SessionProvider.clear()` (sign-out) forgets it too.

- [ ] **Step 1: Write the failing tests**

In `components/consultation/home.test.tsx`, add to the imports:

```tsx
import {
  askFromAlert,
  readPrefill,
  stashPrefill,
} from "@/lib/notifications/ask";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
```

and add at the end of the file:

```tsx
describe("Home from a patient alert", () => {
  const QUESTION =
    "Potassium 2.9 mmol/L (low; normal 3.5–5.1), recorded 08:42. What are the likely causes, and what should I check or do next?";

  it("fills the form from the alert, without the name or MRN (R11)", async () => {
    search = new URLSearchParams({
      prefill: stashPrefill(askFromAlert(makeAlert(), ALERT_NOW)),
    });
    await mount(<Page />);
    expect(
      screen.getByText(/Filled in from a patient alert/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue("67");
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
    expect(screen.getByLabelText(/^Clinical question/)).toHaveValue(QUESTION);
    expect(document.body.textContent).not.toMatch(
      /Maryam|Abdullahi|204817|Ward 3/,
    );
  });

  it("forgets the prefill once the question is sent", async () => {
    const token = stashPrefill(askFromAlert(makeAlert(), ALERT_NOW));
    search = new URLSearchParams({ prefill: token });
    await mount(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    expect(createQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        clinical_question: QUESTION,
        urgency: "emergency",
        patient_data: expect.objectContaining({ age: 67, sex: "female" }),
      }),
      { idempotencyKey: expect.any(String) },
    );
    expect(readPrefill(token)).toBeNull();
  });

  it("gives the normal first visit for an unknown or stale token", async () => {
    search = new URLSearchParams({ prefill: "unknown12345" });
    await mount(<Page />);
    expect(
      screen.getByRole("heading", { name: "Ask your first clinical question" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Filled in from a patient alert/)).toBeNull();
  });

  it("signing out forgets the prefill (Review Focus 5)", async () => {
    const token = stashPrefill(askFromAlert(makeAlert(), ALERT_NOW));
    let clear!: () => void;
    function Grab() {
      clear = useSession().clear;
      return null;
    }
    await mount(<Grab />);
    act(() => clear());
    expect(readPrefill(token)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/consultation/home.test.tsx`
Expected: FAIL. The home page ignores `?prefill=` (the first-visit welcome
shows instead) and sign-out keeps the prefill.

- [ ] **Step 3: Read the prefill on the home page**

In `app/(clinical)/(clinician)/page.tsx`:

- add `import { clearPrefill, readPrefill } from "@/lib/notifications/ask";`;
- give `Home` a third prop, `prefillToken: string | null` (in both the
  destructuring and the props type);
- after `const real = …`, add:

```tsx
// "Ask MHAI about it": a form waiting in memory, found by its token (R3).
const prefill = readPrefill(prefillToken);
```

- change the `started` and `initial` state, and add `fromAlert`:

```tsx
const [started, setStarted] = useState(
  session.items.length > 0 || Boolean(editing) || Boolean(prefill),
);
const [initial, setInitial] = useState<FormValues>(() =>
  editing ? fromQuery(editing.query) : (prefill ?? emptyForm),
);
const [fromAlert, setFromAlert] = useState(Boolean(prefill) && !editing);
```

- in `restart`, after `setStarted(true);`, add:

```tsx
// Sent, discarded or replaced: the alert's prefill is done with.
setFromAlert(false);
clearPrefill();
```

- above `{saveError && (`, add:

```tsx
{
  fromAlert && (
    <p className="mb-4 rounded-xl bg-mint-wash px-3.5 py-2.5 text-[13px] text-mint-deep">
      Filled in from a patient alert. The patient&apos;s name and record number
      weren&apos;t copied. Check the details before you analyse.
    </p>
  );
}
```

- in `HomeRoute`, read the token and key the page by it:

```tsx
function HomeRoute() {
  // `?edit=<id>` comes from "Edit question" on a result that couldn't complete.
  // `?waiting=<localId>`: a question just saved offline (see Home).
  // `?prefill=<token>`: "Ask MHAI about it" on a patient alert (Plan 5a).
  const params = useSearchParams();
  const editId = params.get("edit");
  const waitingId = params.get("waiting");
  const prefillToken = params.get("prefill");
  return (
    <Home
      key={`${editId ?? ""}|${waitingId ?? ""}|${prefillToken ?? ""}`}
      editId={editId}
      waitingId={waitingId}
      prefillToken={prefillToken}
    />
  );
}
```

In `lib/session-store.tsx`, add
`import { clearPrefill } from "./notifications/ask";` and change `clear` to:

```tsx
// Sign-out: drop history, cached clinical results held in memory and any
// consultation waiting to be filled from a patient alert.
const clear = useCallback(() => {
  setItems([]);
  queryClient.clear();
  clearPrefill();
}, [queryClient]);
```

- [ ] **Step 4: Changelog**

In `CHANGELOG.md` under _Unreleased_ → _Added_, add below the Patient alerts
entry:

```markdown
- "Ask MHAI about it" on a patient alert starts a consultation filled in
  with the patient's age and sex, a priority from the alert's severity and
  the abnormal result as the question. The patient's name, record number and
  location are never copied.
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/consultation lib/notifications`
Expected: PASS (the existing home tests too).

- [ ] **Step 6: Check and commit**

Run: `npx prettier --write CHANGELOG.md && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add app/'(clinical)'/'(clinician)'/page.tsx lib/session-store.tsx components/consultation/home.test.tsx CHANGELOG.md
git commit -m "Start a consultation from a patient alert without identifiers"
```

---

### Task 13: Notifications settings on Profile & security

**Files:**

- Create: `components/account/notifications-section.tsx`,
  `components/account/notifications-section.test.tsx`
- Modify: `components/account/account-view.tsx`,
  `components/account/account-view.test.tsx`, `CHANGELOG.md`
- Test: `components/account/notifications-section.test.tsx`,
  `components/account/account-view.test.tsx`

**Interfaces:**

- Consumes: `useNotificationSettings`, `useUpdateNotificationSettings`
  (Task 5), `Switch` (Task 6), `useOnline`, `Banner`, `Button`, `Skeleton`,
  `mockAlerts`, `renderWithAuth`.
- Produces: `NotificationsSection()`: the region "Notifications" (`#notifications`)
  with the switches "Pop-ups for patient alerts" and "Pop-ups for decisions
  on my corrections"; with alert pop-ups off it says "Critical alerts will
  still pop up."; shown on Profile & security for clinicians only, listed in
  the account sections after Security.

- [ ] **Step 1: Write the failing tests**

Create `components/account/notifications-section.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { mockAlerts } from "@/tests/alerts";
import { renderWithAuth } from "@/tests/auth-wrapper";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
import { NotificationsSection } from "./notifications-section";

const ALERTS = "Pop-ups for patient alerts";
const DECISIONS = "Pop-ups for decisions on my corrections";
const sw = (name: string) => screen.findByRole("switch", { name });

beforeEach(() => {
  holder.client = mockAlerts();
});
afterEach(() => vi.restoreAllMocks());

describe("Notifications settings", () => {
  it("starts with both pop-ups on", async () => {
    renderWithAuth(<NotificationsSection />);
    expect(await sw(ALERTS)).toBeChecked();
    expect(await sw(DECISIONS)).toBeChecked();
    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("turning alert pop-ups off saves it and says Critical alerts will still pop up (Review Focus 2)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(ALERTS));
    expect(await sw(ALERTS)).not.toBeChecked();
    expect(
      screen.getByText("Critical alerts will still pop up."),
    ).toBeVisible();
    expect(await sw(ALERTS)).toHaveAccessibleDescription(
      "Critical alerts will still pop up.",
    );
    await waitFor(async () =>
      expect(await holder.client.getNotificationSettings()).toEqual({
        alert_popups: false,
        correction_popups: true,
      }),
    );
  });

  it("sends one idempotency key per change", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(holder.client, "updateNotificationSettings");
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(DECISIONS));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await sw(DECISIONS)).not.toBeChecked());
    await user.click(await sw(DECISIONS));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[0]![0]).toEqual({ correction_popups: false });
    expect(update.mock.calls[1]![0]).toEqual({ correction_popups: true });
    expect(update.mock.calls[0]![1]?.idempotencyKey).not.toBe(
      update.mock.calls[1]![1]?.idempotencyKey,
    );
  });

  it("puts the switch back and says so when saving fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "updateNotificationSettings").mockRejectedValue(
      new ApiError(400, "error"),
    );
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(ALERTS));
    expect(
      await screen.findByText("Couldn't save your notification settings"),
    ).toBeVisible();
    expect(await sw(ALERTS)).toBeChecked();
  });

  it("can't be changed offline, and says why", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(<NotificationsSection />);
    const s = await sw(ALERTS);
    expect(s).toBeDisabled();
    expect(s).toHaveAccessibleDescription(
      /You're offline\. Changes need a connection\./,
    );
  });
});
```

In `components/account/account-view.test.tsx`, add:

```tsx
describe("AccountView notifications", () => {
  it("has a Notifications section for clinicians, after Security", async () => {
    await signedIn();
    expect(
      await screen.findByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
    const links = within(
      screen.getByRole("navigation", { name: "Account sections" }),
    ).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Profile",
      "Security",
      "Notifications",
      "Devices",
      "My feedback",
    ]);
    expect(
      await screen.findByRole("switch", { name: "Pop-ups for patient alerts" }),
    ).toBeChecked();
  });

  it("has none for a hospital admin who isn't a clinician", async () => {
    await signedIn({ ...TEST_USER, roles: ["hospital_admin"] });
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/account`
Expected: FAIL. `./notifications-section` doesn't exist and the account page
has no Notifications section.

- [ ] **Step 3: The section**

Create `components/account/notifications-section.tsx`:

```tsx
"use client";
import { useId, useState } from "react";
import type { NotificationSettingsPatchIn } from "@/lib/api/alerts-contract";
import { useOnline } from "@/lib/hooks/use-online";
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/lib/notification-queries";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";

const row =
  "flex min-h-14 flex-wrap items-center gap-3 border-t border-line py-3 text-[14px]";

/**
 * Profile & security → Notifications (spec §4): what pops up. The bell and
 * the Notifications page update either way, and Critical alerts always pop
 * up. Saved with the account (R5).
 */
export function NotificationsSection() {
  const q = useNotificationSettings();
  const save = useUpdateNotificationSettings();
  const online = useOnline();
  const id = useId();
  const [failed, setFailed] = useState(false);
  // Show a change at once while it saves; a failure puts the saved value back.
  const pending = save.isPending ? save.variables?.v : undefined;
  const value = q.data ? { ...q.data, ...pending } : null;
  const offline = online ? undefined : `${id}-offline`;
  const set = (p: NotificationSettingsPatchIn) => {
    setFailed(false);
    save.mutate(p, { onError: () => setFailed(true) });
  };
  const describedBy = (hint: string) =>
    [hint, offline].filter(Boolean).join(" ");

  return (
    <section
      id="notifications"
      aria-labelledby={`${id}-h`}
      className="card-v3 scroll-mt-4 px-[22px] py-5"
    >
      <h2 id={`${id}-h`} className="text-base font-semibold">
        Notifications
      </h2>
      <p className="mb-3.5 mt-1 text-[13px] text-ink-3">
        Choose what pops up. The bell and the Notifications page always update.
      </p>
      {q.isPending ? (
        <Skeleton className="h-[112px]" />
      ) : !value ? (
        <div>
          <p className="text-[13px] text-ink-3">
            Your notification settings aren&apos;t available right now. Pop-ups
            stay on.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void q.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className={row}>
            <span className="min-w-0 flex-1 basis-[220px]">
              Pop-ups for patient alerts
              <small
                id={`${id}-alerts`}
                className="block text-[12px] text-ink-3"
              >
                {value.alert_popups
                  ? "New patient alerts pop up on any screen. If you turn this off, Critical alerts will still pop up."
                  : "Critical alerts will still pop up."}
              </small>
            </span>
            <Switch
              label="Pop-ups for patient alerts"
              checked={value.alert_popups}
              disabled={!online}
              describedBy={describedBy(`${id}-alerts`)}
              onChange={(v) => set({ alert_popups: v })}
            />
          </div>
          <div className={row}>
            <span className="min-w-0 flex-1 basis-[220px]">
              Pop-ups for decisions on my corrections
              <small
                id={`${id}-decisions`}
                className="block text-[12px] text-ink-3"
              >
                When a reviewer approves or rejects a correction you suggested.
              </small>
            </span>
            <Switch
              label="Pop-ups for decisions on my corrections"
              checked={value.correction_popups}
              disabled={!online}
              describedBy={describedBy(`${id}-decisions`)}
              onChange={(v) => set({ correction_popups: v })}
            />
          </div>
          {!online && (
            <p id={`${id}-offline`} className="mt-2 text-[13px] text-ink-3">
              You&apos;re offline. Changes need a connection.
            </p>
          )}
          {failed && (
            <div className="mt-3">
              <Banner
                tone="bad"
                title="Couldn't save your notification settings"
              >
                Check your connection and try again.
              </Banner>
            </div>
          )}
          <p className="mt-3 text-[12px] text-ink-3">
            Saved with your account, so they follow you to any device.
          </p>
        </>
      )}
    </section>
  );
}
```

In `components/account/account-view.tsx`:

- add `import { NotificationsSection } from "./notifications-section";`;
- in `sections`, after `["security", "Security"],` add
  `...(clinical ? [["notifications", "Notifications"]] : []),`;
- after the closing `</section>` of the Security section, add
  `{clinical && <NotificationsSection />}`.

- [ ] **Step 4: Changelog**

In `CHANGELOG.md` under _Unreleased_ → _Added_, add below the "Ask MHAI
about it" entry:

```markdown
- Profile & security → Notifications: switch off pop-ups for patient alerts
  or for decisions on your corrections. The bell and the Notifications page
  still update, and Critical alerts always pop up. The settings are saved
  with your account (in the demo, for this session).
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/account`
Expected: PASS.

- [ ] **Step 6: Check and commit**

Run: `npx prettier --write CHANGELOG.md && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add components/account CHANGELOG.md
git commit -m "Add notification pop-up settings to Profile & security"
```

---

### Task 14: End to end, the README and the privacy sign-off note

**Files:**

- Create: `tests/e2e/notifications.spec.ts`
- Modify: `tests/e2e/helpers.ts`, `README.md`, `tests/readme.test.ts`,
  `CONTRIBUTING.md`
- Test: `tests/e2e/notifications.spec.ts` (desktop and mobile projects),
  `tests/e2e/review.spec.ts` and `tests/e2e/hospital-admin.spec.ts` (updated
  in Task 8), `tests/readme.test.ts`

**Interfaces:**

- Consumes: `signIn`, `openAccountMenu`, `isMobile`, `expectNoStorage`,
  `expectNoForbiddenWords`, `DEMO_EMAILS` (`tests/e2e/helpers.ts`); every
  screen from Tasks 7–13; the sample alerts and their arrival order (Task 1).
- Produces: `openNotifications(page: Page): Promise<void>` in
  `tests/e2e/helpers.ts`.

- [ ] **Step 1: Write the failing end-to-end tests**

In `tests/e2e/helpers.ts`, add:

```ts
/** From a signed-in clinical screen: the bell, then "See all". */
export async function openNotifications(page: Page) {
  await page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("link", { name: "See all" }).click();
  await expect(page).toHaveURL(/\/notifications$/);
}
```

Create `tests/e2e/notifications.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  isMobile,
  openAccountMenu,
  openNotifications,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;
  // Patient names and MRNs live in memory only, and no codes reach the screen.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

const bell = (page: Page) =>
  page
    .getByRole("button", { name: /^Notifications(, \d+ unread)?$/ })
    .filter({ visible: true });
const card = (page: Page, name: string) =>
  page.getByRole("article", { name: new RegExp(name) });
// Pop-up text is matched exactly: the hidden live regions hold the same words
// with more around them.

/** The clinician sample, on a clock the test can move (a new alert every 2 minutes). */
async function asClinician(page: Page) {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(bell(page)).toHaveAccessibleName("Notifications, 6 unread");
}

test("a new alert pops up, opens from View, and is acknowledged", async ({
  page,
}) => {
  await asClinician(page);
  // The alerts already there at sign-in never pop up.
  await expect(
    page.getByText(/^(Critical|Urgent|Info) patient alert$/),
  ).toHaveCount(0);
  await page.clock.fastForward("02:30"); // the Urgent sample arrives
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Emeka Nnamdi · Platelets 62 ×10⁹/L (low; normal 150–400)", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName("Notifications, 7 unread");
  await page
    .getByRole("button", { name: "View alert for Emeka Nnamdi" })
    .click();
  await expect(page).toHaveURL(/\/notifications$/);
  const c = card(page, "Emeka Nnamdi");
  await expect(c).toBeFocused();
  await c.getByRole("button", { name: "Acknowledge" }).click();
  await expect(
    c.getByText(/^Acknowledged by Dr\. Reyes · \d\d:\d\d$/),
  ).toBeVisible();
  await expect(c.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
  await expect(bell(page)).toHaveAccessibleName("Notifications, 6 unread");
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  await expect(card(page, "Emeka Nnamdi")).toBeVisible();
  await expect(card(page, "Kemi Afolabi")).toBeVisible();
  // Nothing about the patient in the address bar.
  expect(page.url()).not.toMatch(/Emeka|Nnamdi|318552/);
});

test("dismissing needs a reason, and the alert moves to Dismissed", async ({
  page,
}) => {
  await asClinician(page);
  await openNotifications(page);
  const c = card(page, "Samuel Bassey");
  await c.getByRole("button", { name: "Dismiss" }).click();
  const dialog = page.getByRole("dialog", { name: "Dismiss this alert?" });
  await dialog.getByRole("button", { name: "Dismiss alert" }).click();
  await expect(dialog.getByText("✕ Choose a reason.")).toBeVisible();
  await dialog.getByText("Already known", { exact: true }).click();
  await dialog.getByLabel("Note (optional)").fill("Known kidney disease.");
  await dialog.getByRole("button", { name: "Dismiss alert" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    c.getByText(/^Dismissed by Dr\. Reyes · \d\d:\d\d · Already known$/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismissed", exact: true }).click();
  await expect(card(page, "Samuel Bassey")).toBeVisible();
  await expect(card(page, "Peter Ogbu")).toBeVisible();
});

test("Ask MHAI about it fills a consultation without the name or MRN", async ({
  page,
}) => {
  await asClinician(page);
  await openNotifications(page);
  await card(page, "Maryam Abdullahi")
    .getByRole("button", { name: "Ask MHAI about it" })
    .click();
  await expect(page).toHaveURL(/\/\?prefill=[a-z0-9]+$/);
  await expect(page.getByText(/Filled in from a patient alert/)).toBeVisible();
  await expect(page.getByLabel("Age")).toHaveValue("67");
  if (isMobile(page)) await page.getByRole("button", { name: "Next" }).click();
  const question = page.getByLabel("Clinical question");
  await expect(question).toHaveValue(
    /^Potassium 2\.9 mmol\/L \(low; normal 3\.5–5\.1\), recorded (\d{1,2} \w{3} )?\d\d:\d\d\. /,
  );
  expect(await question.inputValue()).not.toMatch(
    /Maryam|Abdullahi|204817|Ward 3/,
  );
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/Maryam|Abdullahi|204817/);
  expect(page.url()).not.toMatch(/Maryam|204817/);
});

test("with alert pop-ups off, Urgent stays quiet but Critical still pops up", async ({
  page,
}) => {
  await asClinician(page);
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  const alertsSwitch = page.getByRole("switch", {
    name: "Pop-ups for patient alerts",
  });
  await alertsSwitch.click();
  await expect(alertsSwitch).not.toBeChecked();
  await expect(
    page.getByText("Critical alerts will still pop up.", { exact: true }),
  ).toBeVisible();

  await page.clock.fastForward("02:30"); // the Urgent sample arrives
  await expect(bell(page)).toHaveAccessibleName("Notifications, 7 unread");
  await bell(page).click();
  await expect(
    page.getByRole("region", { name: "Notifications" }),
  ).toContainText("Emeka Nnamdi");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Urgent patient alert", { exact: true }),
  ).toHaveCount(0);

  await page.clock.fastForward("02:00"); // the Critical sample arrives
  await expect(
    page.getByText("Critical patient alert", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Halima Garba · Potassium 6\.7/)).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName("Notifications, 8 unread");
});

test("the Corrections tab still shows decisions on your corrections", async ({
  page,
}) => {
  await asClinician(page);
  await openNotifications(page);
  await page.getByRole("link", { name: /^Corrections/ }).click();
  await expect(page).toHaveURL(/\/notifications\/corrections$/);
  const list = page.getByRole("list", {
    name: "Decisions on your corrections",
  });
  await expect(list).toContainText("Unstable angina");
  await expect(list).toContainText("Approved");
  await expect(list).toContainText("Hypokalaemia, cause unclear");
  await expect(list).toContainText("Rejected");
  await page.getByRole("link", { name: /My feedback & corrections/ }).click();
  await expect(page).toHaveURL(/\/my-feedback$/);
});

test("signing out while a Critical pop-up shows clears it and keeps nothing", async ({
  page,
}) => {
  await asClinician(page);
  await page.clock.fastForward("04:30"); // the Urgent and Critical samples arrive
  await expect(
    page.getByText("Critical patient alert", { exact: true }),
  ).toBeVisible();
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText(/patient alert/)).toHaveCount(0);
  await expect(page.getByText(/Halima Garba|Emeka Nnamdi/)).toHaveCount(0);
});

test("a hospital admin who isn't a clinician gets no bell", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(
    page.getByRole("heading", { name: "Staff", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Notifications/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Notifications/ })).toHaveCount(
    0,
  );
});
```

In `tests/readme.test.ts`, add:

```ts
it("documents the notifications demo, the pop-up rule and the sign-off gate", () => {
  expect(readme).toMatch(/\*\*Notifications and patient alerts\.\*\*/);
  expect(readme).toMatch(/a\s+new\s+one\s+arrives\s+every\s+2\s+minutes/);
  expect(readme).toMatch(/Critical\s+alerts\s+still\s+pop\s+up/);
  expect(readme).toMatch(
    /clinical\s+and\s+privacy\s+sign-off[\s\S]*?before\s+live\s+use/,
  );
  expect(readme).not.toMatch(/\blab\b/i);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/readme.test.ts && npx playwright test tests/e2e/notifications.spec.ts`
Expected: the README test FAILS (no notifications paragraph yet). The e2e
spec should already pass, because Tasks 7–13 built every screen it drives; if
one of its tests fails, fix the screen in its owning task's files (and that
task's unit test) before going on.

- [ ] **Step 3: The README and CONTRIBUTING**

In `README.md`, under "Run on mock data", after the **Hospital admin.**
paragraph, add:

```markdown
**Notifications and patient alerts.** Sign in as the clinician sample (any
clinician sees the same sample alerts). The bell in the top bar counts new
patient alerts and decisions on your corrections together; its panel shows
the latest of both, and **See all** opens Notifications, with a **Patient
alerts** tab (New, Handled, Dismissed, severity and source) and a
**Corrections** tab. Eight sample alerts are there at sign-in (they don't pop
up), and a new one arrives every 2 minutes: Urgent, then Critical, then Info,
again and again. Acknowledge one, dismiss one with a reason, or choose **Ask
MHAI about it** to start a consultation filled in from the alert without the
patient's name or MRN. Turn pop-ups off in Profile & security →
Notifications: Critical alerts still pop up. The sample hospital has two
connected systems, "Main record" and "Results system", so each alert says
which one it came from. Every name and MRN is synthetic, and like the rest of
the demo it is all in memory only.
```

After the "Offline" section, add:

```markdown
### Patient alerts

Patient alerts are the first place MHAI shows patients' names and MRNs. They
are kept in memory only (never in browser storage, the URL or logs), clear on
sign-out, and are never printed or exported; "Ask MHAI about it" copies no
identifiers into the question. They need the same clinical and privacy
sign-off as the offline outbox before live use. Until it is given, alerts run
on sample data only; see [CONTRIBUTING.md](CONTRIBUTING.md).
```

In `CONTRIBUTING.md`, under "Patient data in the browser", after the outbox
bullet, add:

```markdown
- **Patient alerts show names and MRNs** (Plan 5a). They are held in memory
  only: the query cache, React state and the pop-ups, all cleared on
  sign-out. Never write them to storage, the URL, the document title, logs
  or analytics; don't add print, export or copy for them; and "Ask MHAI
  about it" must never copy the patient's name, MRN or location into a
  consultation. **Clinical and privacy sign-off is required before live
  use**, as for the outbox. It hasn't been given yet, so alerts run on
  sample data only. Any change to how alerts handle patient identifiers
  needs `clinical-review` and that sign-off.
- **Alerts are EMR-agnostic** ([ADR 0003](docs/adr/0003-many-emr-systems.md)):
  no vendor or product names anywhere, the record link comes from the API
  (`emr_link`), and only the hospital's own `source_label` is shown.
```

- [ ] **Step 4: Run everything**

Run: `npx prettier --write README.md CONTRIBUTING.md tests && npm test && npm run lint && npm run typecheck && npm run format:check && npm run build && npx playwright test`
Expected: every unit test passes, the build is clean, and every e2e spec
passes on the desktop and mobile projects (including the updated bell tests
in `review.spec.ts` and `hospital-admin.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e tests/readme.test.ts README.md CONTRIBUTING.md
git commit -m "Test notifications end to end; document the demo and sign-off"
```

---

## Self-review notes

- **Spec coverage (notifications design):**
  - §2 notification centre: one bell replacing Plan 3's, one count, its
    accessible name, a panel with the latest of both and "See all"
    (Tasks 7, 8; R1); the page with Patient alerts (New, Handled, Dismissed,
    severity) and Corrections (with the link to My feedback & corrections)
    (Tasks 10, 11; R2); admin-only accounts get neither (Tasks 7, 10, 14),
    platform accounts the 403 page (the `(clinician)` gate, unchanged);
  - §3 the alert: severity word and icon, the finding with value, unit,
    range and time, up to three causes "Suggested by MHAI" with confidence
    words and never a diagnosis, full name, MRN and location (ward and bed,
    outpatient clinic, emergency), Acknowledge, Ask MHAI about it, Open
    patient record, Dismiss with a required reason and optional note, who and
    when, handled-by-someone-else with disabled actions and the reason
    (Tasks 3, 9; R6, R7, R8);
  - §4 pop-ups: severity, patient, finding and View; the baseline; the two
    switches; muted items still counted; Critical always, with "Critical
    alerts will still pop up."; saved on the server, memory in the demo
    (Tasks 4, 6, 7, 13; R4, R5);
  - §5 privacy: sign-off gate (Task 14), memory only and cleared at sign-out
    (Tasks 6, 7, 12), nothing printed or exported (Task 10, R14), no
    identifiers into the consultation (Tasks 4, 9, 12, R11), plain wording
    (Task 3);
  - §6 accessibility: word and icon (Tasks 3, 8), polite and assertive live
    regions, no focus stealing, reachable from the bell (Tasks 6–8), keyboard
    and 44 px targets (every component), phone layout (cards, R13), reduced
    motion (token classes only, `lib/motion.test.ts`);
  - §7 demo: severities, admitted, outpatient and ED patients, a new alert
    every couple of minutes, synthetic names (Task 1);
  - §8 many EMR systems: `emr_link`, normalised labels, "Location not
    recorded", "Not standardised", the Source filter by `source_label`
    (Tasks 1, 3, 9, 10; R9, R10);
  - §9 the backend contract, written into spec §10 item 20 (Task 2).
- **ADR 0003 frontend rules:** the client talks only to MHAI's API through the
  BFF (Task 2); no vendor names in the UI, code, types, sample data or docs
  (sample systems are "Main record" and "Results system", R17); the UI never
  builds a record URL (R8) or maps codes; partial data degrades (R9).
- **Review Focus:** each of the five has named tests in its owning tasks (see
  the Review Focus section).
- **Names used across tasks:** `AlertsClient`, `getAlertsClient`,
  `createMockAlerts`, `MockAlerts`, `handleElsewhere`, `createLiveAlertsClient`,
  `AlertHandledError`, `isAlertHandled`, `AlertOut`, `AlertSeverity`,
  `AlertStatus`, `DismissIn`, `DismissReason`, `NotificationSettingsOut`,
  `MOCK_ALERT_EVERY_MS`, `MOCK_ARRIVALS_MAX`, `MOCK_SOURCES`,
  `ALERT_PAGE_SIZE`, `ALERT_NOW`, `at`, `makeAlert`, `mockAlerts`,
  `eventClock`, `SEVERITY`, `severityOf`, `ALERT_STATUS_LABEL`,
  `findingLine`, `recordedLabel`, `locationLabel`, `likelyCauses`,
  `handledLine`, `recordLink`, `showSources`, `DISMISS_REASONS`,
  `DISMISS_NOTE_MAX`, `CAUSE_MAX`, `NOTIFICATIONS_HREF`, `CORRECTIONS_HREF`,
  `NOTIFICATION_TAG`, `POPUP_MAX`, `ALERT_POPUP_MS`, `SEEN_MAX`, `newAlerts`,
  `planPopups`, `alertPopup`, `moreAlertsPopup`, `askFromAlert`,
  `stashPrefill`, `readPrefill`, `clearPrefill`, `usePollEvery`,
  `ALERT_POLL_MS`, `FEED_SIZE`, `DEFAULT_SETTINGS`, `NOTIFY_KEYS`,
  `alertsOff`, `putAlert`, `useAlertFeed`, `useUnreadAlerts`, `useAlertList`,
  `useAcknowledgeAlert`, `useDismissAlert`, `useNotificationSettings`,
  `usePopupSettings`, `useUpdateNotificationSettings`, `Switch`, `LinkTabs`,
  `TOAST_MAX`, `ShellContext`, `useShell`, `AlertsProvider`, `useAlerts`,
  `NotificationsProvider`, `NotificationBell`, `BELL_ALERTS`,
  `BELL_DECISIONS`, `SeverityChip`, `AlertStatusChip`, `NotStandardisedChip`,
  `CauseChip`, `AlertCard`, `alertDomId`, `DismissDialog`,
  `NotificationsFrame`, `AlertsTab`, `AlertsView`, `CorrectionsTab`,
  `NotificationsSection`, `openNotifications`; the seeded ids `al-101` …
  `al-108` and arrivals `al-n1`, `al-n2`, …; the routes `/notifications` and
  `/notifications/corrections`. Each is defined once and used with the same
  spelling after.
- **Still open (for the spec owners):**
  - the whole alerts contract (spec §10 item 20) is assumed, especially
    `sources` on the list reply, the 409 body, the 404 "not switched on"
    convention, and whether `unread-count` means "new and unhandled" (R1) or
    "not yet opened by me";
  - who receives which alerts (routing) and how a clinician sees alerts for
    patients outside their routing: the later EMR/EHR integration plan;
  - push delivery instead of 30-second polling, if alerts need to arrive
    faster than that;
  - whether "Ask MHAI about it" should offer MHAI's suggested causes to the
    consultation (this plan leaves them out, R11);
  - the clinical and privacy sign-off for showing names and MRNs (spec §5);
  - the sample hospital keeps its existing name from Plans 2–4, which is the
    same word ADR 0003 uses for the first EMR system; spec §11 already asks
    whether demos should use a placeholder name. This plan adds no new use
    of it.
