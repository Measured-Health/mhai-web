# Plan 7d: Getting told about analytics changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the platform admin app, add:

- a **bell** in the top bar that counts new analytics changes not yet seen by this person, and opens a list of them;
- an **Analytics email** setting on Account for platform admins. The options are Off, Critical only, and Critical and weekly digest.

It runs on sample data. Sending the emails is the backend's job, as written in the contract.

**Architecture:**

- The contract gains notifications and the email preference. The mock and live client follow, and the proxy accepts the new paths.
- Query hooks live in `lib/queries/notifications.ts`.
- The bell and its list live in `components/notifications/`. The bell is mounted in the shell's top bar.
- The email setting is a section on Account.
- The bell polls every 60 seconds while the tab is visible. It pauses offline and when hidden.

**Tech Stack:** as Plan 7c.

**Spec:** `docs/specs/2026-10-22-platform-analytics-design.md` §6, and §7's "Plan 7d" lines.

## Global Constraints

- **What the bell counts:** analytics changes from What changed that this person hasn't seen. Opening the list marks them seen **for this person only**. Seen is not the same as "followed up".
- **Who sees what:** platform admins and auditors see the bell. Only platform admins see the email setting, so auditors get no email (design call, spec §6).
- **Email modes:**
  - `off`: shown as **Off**;
  - `critical`: shown as **Critical only**;
  - `critical_and_digest`: shown as **Critical and weekly digest**.

  The default is `off`. The help text says: "Critical-type changes are sent straight away, at most once a day per hospital and measure. Everything else comes in a weekly summary on Mondays at 08:00 (Lagos time). Emails name the hospital and the change and link here. They never include patient details."

- **The bell's list:**
  - each item shows the change's sign and words (Plan 7c's `changeLine`), the hospital and the time;
  - clicking an item opens `/analytics` with that change selected;
  - **Mark all seen** clears the count.
  - The list shows the 20 newest, with "Nothing new" when empty.
- **Privacy:** counts only. Item wording comes from the same summaries as What changed and is checked by the same rules: a list that fails them shows "Couldn't load notifications".
- **Accessibility:**
  - the bell is a button labelled "Notifications, {n} new" (or "Notifications" when there are none);
  - the list is a dialog on desktop and a sheet on phones;
  - focus moves into it on open and back to the bell on close;
  - targets are 44 px on phones.
- **Contract** (spec §7 plus the backend's §14.7):
  - `GET /platform/notifications` returns `{items: Notification[], unseen: number}` (`unseen` counts ALL of this person's unseen notifications, which can be more than the 20 items returned), where `Notification = {id, change_id, hospital: Person | null, summary, serious, direction, at, seen}`, newest first, at most 20;
  - `POST /platform/notifications/seen {ids?: string[]}` marks the given ones seen, or all of them, and returns `{unseen}`;
  - `GET /platform/me/analytics-email` returns `{mode}`, and `PUT` with `{mode, version}` returns `{mode, version}`. Auditors get 403 on both;
  - every write sends an `Idempotency-Key`.
- **No change** to the clinical app. Repo rules as in Plan 7c.

## Review Focus

1. **A change seen by Ada still shows as new for Tunde.** Seen is per person. Tasks 1 and 2 test it.
2. **The bell offline or with a failed check.** It keeps its last count, with no error badge. The list shows "Couldn't load notifications" with Try again. Task 2 tests it.
3. **A notification for a change that has since cleared.** Opening it lands on Analytics with "That change has cleared." and the list. Task 2 tests it.
4. **An auditor opening Account.** There is no email setting, and the API refuses the preference. Tasks 1 and 3 test it.
5. **Polling when the tab is hidden.** No requests are sent until the tab is visible again. Task 2 tests it.

---

### Task 1: Notifications contract, sample data, live client and proxy paths

**Files:**

- Modify: `apps/platform/lib/api/analytics-contract.ts` (or a new `notifications-contract.ts`), `contract.ts` (`PlatformClient`), `mock.ts`, `live.ts`, `app/api/v1/[...path]/route.ts`, plus their tests.

**Interfaces:**

- `PlatformClient` gains:
  - `listNotifications(): Promise<{ items: Notification[]; unseen: number }>`;
  - `markSeen(body: { ids?: string[] }, opts): Promise<{ unseen: number }>`;
  - `getEmailPref(): Promise<{ mode: EmailMode; version: number }>`;
  - `setEmailPref(body: { mode: EmailMode; version: number }, opts): Promise<{ mode: EmailMode; version: number }>`;
  - `EmailMode = "off" | "critical" | "critical_and_digest"`.
- **The mock:**
  - notifications are made from the analytics changes, one per change, with Northgate's serious change newest;
  - seen state is kept per signed-in person;
  - the email preference is kept per person, default `off`, with a version check giving 409 `conflict`;
  - auditor calls to the preference get 403;
  - a mock option `notifications: "normal" | "unavailable"`.
- **The proxy:** `GET platform/notifications`, `POST platform/notifications/seen`, `GET platform/me/analytics-email` and `PUT platform/me/analytics-email`. An auditor's PUT is refused before upstream; `POST …/seen` is allowed for auditors, since it is their own read state. The proxy's auditor rule therefore needs one exception for exactly this path, and it must be tested.

- [ ] **Step 1: Tests first**
  - "seen is per person (Ada marks seen, Tunde still sees new)";
  - "mark all seen sets unseen to 0";
  - "the preference defaults to off, saves, and a stale version is 409";
  - "an auditor's preference read and write are 403";
  - "the live client uses the paths and an Idempotency-Key";
  - "proxy: an auditor may POST seen but not PUT the preference".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Add notifications and the email preference to the platform API".

### Task 2: The bell and its list

**Files:**

- Create: `components/notifications/{bell,notifications-list}.tsx`, `lib/queries/notifications.ts`, and tests.
- Modify: `components/shell/top-bar.tsx`, to mount the bell.

**Interfaces:**

- `useNotifications()` uses `refetchInterval` of 60,000 ms only while `document.visibilityState === "visible"` and online, and keeps its previous data on error.
- `useMarkSeen()` is a keyed mutation that sets `unseen` in the cache.
- The bell's list items use `changeLine`, and the summary is checked through Plan 7c's summary rule (export a `notificationOk` from `lib/analytics/read.ts` that reuses `summarySafe`).
- Clicking an item navigates to `/analytics?change={change_id}`.
- The Analytics page reads `?change=` to select that change. If it has cleared, the page shows "That change has cleared." above the list. This is a small change to `analytics-view.tsx`.

- [ ] **Step 1: Tests first**
  - "the bell shows the count and its label";
  - "opening the list shows newest first and marks them seen";
  - "Mark all seen clears the count";
  - "an item opens Analytics with that change selected";
  - "a cleared change shows 'That change has cleared.'";
  - "a failed check keeps the last count; the list shows Couldn't load notifications with Try again";
  - "no polling while the tab is hidden or offline";
  - "a phone opens the list as a sheet and focus returns to the bell".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Add the analytics bell".

### Task 3: The email setting, e2e and docs

**Files:**

- Create: `components/account/analytics-email-section.tsx` and its test, and `tests/e2e/notifications.spec.ts`.
- Modify: `components/account/account-view.tsx`, `README.md` (the platform section), `CHANGELOG.md`, and a readme pin.

**Interfaces:**

- **The section:**
  - a radio group with the three modes and the help text from the Global Constraints;
  - **Save** sends `version`;
  - a 409 gives "Changed by someone else" and a reload;
  - it is shown only to platform admins;
  - offline disables it, with the reason.
- **The e2e** runs on desktop and mobile, with `expectNoStorage` after each test:
  - "the bell counts new changes, the list opens, and they're marked seen";
  - "Ada's seen doesn't clear Tunde's bell" (same tab, sign out and in);
  - "an item opens Analytics on that change";
  - "a platform admin chooses Critical and weekly digest, and it stays after reload of the page data";
  - "an auditor has the bell but no email setting".
- **Docs:** the README platform section gains "**Notifications.**" with the bell and email setting, plus a pin. Add a CHANGELOG line.

- [ ] **Step 1: Tests first.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Full verification:** lint, `format:check`, typecheck, `npm test`, build, `check:bundle`, `check:platform-marker` and `npm run e2e`, for both apps.
- [ ] **Step 4: Commit:** "Add the analytics email setting; test notifications end to end".

## Self-review notes

- **Spec coverage:** §6 is covered by Tasks 1–3, and the Plan 7d contract lines in §7 by Task 1.
- **Names:**
  - `Notification`, `EmailMode`;
  - `listNotifications`, `markSeen`, `getEmailPref`, `setEmailPref`;
  - `useNotifications`, `useMarkSeen`, `notificationOk`.
