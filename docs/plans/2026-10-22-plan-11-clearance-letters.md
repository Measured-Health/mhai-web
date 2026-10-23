# Plan 11: Analysis clearance letters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** clearance letters for named drill-down in Analysis, on sample data, in three PRs:

- **11a, hospital side (clinical app):** a **Named access** page where hospital admins upload a letter, name the people it covers, enter its end date, and see its status. From there they also view, renew, narrow and revoke it. The staff panel shows each person's named access.
- **11b, platform side (platform app):** a **Clearances** page with the queue, a safe in-app letter viewer, verify and reject with step-up and the same-side rule, and revoke. It also holds the three-position named-access switch: global and per hospital, raised by two platform admins and lowered by one.
- **11c, the gate in Analysis (clinical app):** **Show names** with a purpose, the named banner and watermark, and access that ends on open screens (at `named_until`, by a 30-second check, and on a 403). The demo writes audit entries.

**Live mode ships with named access Off.** Clinical, privacy and legal sign-off for named drill-down is still pending. Nothing in this plan can show a name in live mode until the backend switch is raised **and** the clinical deployment sets `NAMED_ACCESS_SIGNED_OFF=true`.

**Order.** Plan 11 starts only after **Plan 6 (Analysis) is merged**. It uses Plan 6's `features.analysis`, `ANALYSIS_SIGNED_OFF`, `canUseAnalysis`, the `analyst` role, `PatientLevel`, `readPatients`, `PatientsPanel` and `recordAudit`. The platform side also starts only after **Plans 7c and 7d are merged**, because it builds on the platform app as they leave it (the Analytics nav entry, the notifications SHAPES).

**Architecture:**

- **Shared pieces** (`packages/`): the reason codes, position words and date helpers both apps show; a safe `LetterViewer` that only ever renders flat page images from memory; and `form` and blob support in the shared API request helper. Neither app imports from the other.
- **Clinical app.**
  - **Gate.** A second deployment key, `NAMED_ACCESS_SIGNED_OFF`, works the same way as Plan 6's `ANALYSIS_SIGNED_OFF`. It sets `User.features.named` and is checked by the proxy on every call.
  - **Data.** A clearance contract, mock and live client. The demo letter store lives in memory in `lib/api/mock-clearances.ts`, and the analysis mock reads it to decide who is covered.
  - **Rules** in `lib/clearances/` and `lib/analysis/named.ts`; **UI** in `components/admin/named-access/` and `components/analysis/`.
- **Platform app.** A clearance and switch contract, with the mock in its own module, `lib/api/mock-clearances.ts`, which `mock.ts` spreads in. Rules live in `lib/clearances/`, UI in `components/clearances/`, and the page at `app/(app)/clearances/page.tsx`.
- **The backend decides.** The app never decides the switch position, who is covered, `verifiable_by_you`, or when a letter ends. It reads them and fails closed on anything it didn't expect.

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64.

**Spec:** `docs/specs/2026-10-22-clearance-letters-design.md` (approved 22 Oct 2026; every suggested default in §15 accepted as the decision). Background:

- `mhai-web-6/docs/specs/2026-10-17-analysis-design.md` §5–§6, and Plan 6 (`docs/plans/2026-10-22-plan-6-analysis.md`) for the names this plan extends;
- `docs/specs/2026-10-17-platform-admin-design.md` §7.6, for the two-person pattern;
- `docs/specs/2026-10-13-ui-design-v3.md` §5.6.

## Global Constraints

- **Sample data only.** Named drill-down stays **Off** in live mode until clinical, privacy and legal sign-off are all recorded (spec §4, §14, §15 Q1).
- **The named gate (clinical).**
  - `User.features.named` is true only:
    - in the demo (`NEXT_PUBLIC_USE_MOCK=true`), always;
    - in live mode, only when `analysisSignedOff()` **and** the server's `NAMED_ACCESS_SIGNED_OFF` is exactly `"true"`.
  - `canUseNamedAccess(u)` = `canUseAnalysis(u) && u.features?.named === true`.
  - When the key is off, the proxy:
    - answers `hospital/clearances*`, `analysis/named-access` and `analysis/clearance/me` with **404** `not_found`, before the session is read;
    - answers `analysis/patients` with any `level` other than `deidentified` with **403** `named_access_off`, before upstream.
- **The switch** (spec §4, §15 Q2):
  - it is read from the backend and never decided by the app;
  - it has three positions, `off`, `letters_only` and `on`, shown as "Off", "Letters only" and "On";
  - there is one global switch, plus one per hospital. A hospital's **effective** position is the lower of the two, and the clinical app only ever sees the effective one;
  - raising a switch (global or hospital) needs all three sign-off references and a **second, different** platform admin's approval;
  - lowering needs one platform admin, a reason and a two-step code, and takes effect at once;
  - a hospital can't be raised above the global position (**409** `above_global`).
  - The demo runs **On**, globally and for Havana Hospital.
- **Names show only** (anti-goal 1) when all of these hold:
  - the effective position is On;
  - the person is covered by a verified letter whose end date hasn't passed;
  - they asked with a purpose;
  - the reply's `level` is `"named"` with `named_until` in the future.

  Anything else fails closed to the de-identified list.

- **Ending access** (anti-goal 3):
  - names are dropped at `named_until`, without waiting for the server;
  - while names are on screen, `GET analysis/clearance/me` is checked every **30 seconds**, and any change to `named`, `clearance_id` or `version` drops them;
  - any **403** `clearance_ended`, `not_cleared` or `named_access_off` drops them;
  - changing a filter or the group drops them;
  - sign-out and the idle timeout drop them.

  "Dropping" means removing the query (`gcTime: 0`) and the component state, then showing the de-identified list with "Named access has ended" and the reason.

- **The letter** (anti-goal 4):
  - accepted: PDF, PNG and JPEG, up to **10 MB** (`10 * 1024 * 1024` bytes) and **20 pages**;
  - the app checks the type (by the file's first bytes) and the size before sending, and shows only the file name and size, never a preview;
  - it is viewed only as server-made page images, fetched one at a time with `Cache-Control: no-store`, held as a Blob in component state, shown through `URL.createObjectURL`, and revoked when the page changes or the viewer closes;
  - never in a query cache, browser storage, a service worker, the URL or logs;
  - no download and no print (`print:hidden`);
  - file names are never logged or sent to analytics.
- **Step-up.**
  - Upload, narrow, revoke (either side), verify, reject, and every switch request, approval and lowering take the person's two-step code: `mfa_code`, or `backup_code`.
  - A wrong code is **403** `mfa_invalid`; a locked one is **429** `mfa_locked`.
  - Writes carry an `Idempotency-Key`; ids are opaque `[A-Za-z0-9_-]+`.
- **Who.**
  - Hospital admins upload, view, narrow, revoke and renew their own hospital's letters; any of them can revoke, not only the uploader.
  - Platform admins verify, reject and revoke, and run the switch.
  - Auditors read everything and view letters, but change nothing. The screens hide the controls, and the proxy refuses the writes.
  - A platform admin with `verifiable_by_you: false` sees "You can't verify letters from a hospital you're linked to" instead of Verify and Reject; the server answers **409** `same_side`.
  - The person who requested a switch change can't approve it (**409** `same_person`).
  - **No one verifies their own access.** A platform admin the letter covers (`covered_platform`) gets `verifiable_by_you: false`, sees "You can't verify a letter that covers you", and the server answers **409** `same_person` to verify or reject. This is checked before `same_side`.
- **The letter's limits.**
  - It covers **1 to 20** people in total:
    - hospital staff, each picked from the hospital's active staff who hold hospital admin or Analyst and have two-step on;
    - optionally, Measured Health platform admins named in the letter (`covered_platform`, for Plan 12b's cross-hospital drill-down), entered by email. The server resolves each one to an active platform admin with two-step, or refuses with **422** `not_eligible_platform`.
  - Its end date is after today and no later than the server's `max_end_date` (12 months on). The picker stops there, and the server refuses a later date (**422** `end_date_too_late`).
  - Narrowing only removes people, and never all of them (**422** `would_empty`: "To remove everyone, revoke the letter").
- **Copy** (exact):
  - the statuses: "Checking the file", "Couldn't accept the file", "Waiting for Measured Health", "Active until {date}", "Ends in {n} days" ("Ends in 1 day", "Ends today"), "Rejected", "Ended {date}", "Revoked {date}";
  - "Named access isn't available yet";
  - "Named access until {date} · letter on file", "No named access";
  - "Named view · letter until {date} · this view is recorded";
  - "Named access needs a clearance letter. Ask your hospital admin.";
  - "Named access has ended";
  - "You can't verify letters from a hospital you're linked to";
  - "No letters waiting";
  - "Couldn't load {thing}" with **Try again**;
  - dates are written `d MMM yyyy` ("12 Mar 2027");
  - status always has a word and an icon, never colour alone.
- **States.** Loading, empty, "Couldn't load" with **Try again**, and offline: writes are disabled with the reason, and **View letter** and **Show names** are disabled offline.
- **Phone.** At 390 px, panels and dialogs become sheets, there is no horizontal page scroll, and targets are 44 px.
- **No change to existing behaviour.** Both apps' unit and e2e suites pass with their assertions unchanged, except the tests this plan names. Record the counts before Task 1, and again before Task 8.
- **Repo rules:**
  - no AI attribution;
  - never `git add -f` under `.superpowers/`;
  - heavy commands run on the build server;
  - no vendor names;
  - patient names in the sample data are invented.

## Rulings made while planning

- **Three PRs, as spec §11 says.**
  - **11a** is Tasks 1–7, branched from `main` after Plan 6 merges. It carries the shared pieces (Task 1).
  - **11b** is Tasks 8–12, branched from the 11a branch at Task 1's commit, after 7c and 7d merge; it is rebased onto `main` once 11a merges.
  - **11c** is Tasks 13–15, branched from `main` after 11a merges.
  - The backend contract goes to the controller with 11a.
- **A second deployment key, `NAMED_ACCESS_SIGNED_OFF`, mirrors Plan 6's `ANALYSIS_SIGNED_OFF`.** The backend switch stays the authority. The key only lets the clinical server refuse everything about names until sign-off, even if the backend switch is raised by mistake. The platform app has no key, because its Clearances page is where the switch is raised.
- **The per-hospital switch** (PO decision on Q2) uses the same request, approve, cancel and lower calls as the global one, with `hospital: id | null` in the body. Any platform admin can cancel a pending request.
- **Every raise needs all three sign-off references**, not only a raise to On (PO decision on Q1: live goes to Letters only for one pilot hospital, and only after all three sign-offs). The server answers **409** `signoff_missing`.
- **The clinical server sends `today` and `max_end_date`** with the letter list, as the hospital's days. The browser does no time-zone arithmetic, and the end of day in the hospital's zone is the server's job.
- **The contract additions to spec §10:**
  - `renews` (optional letter id) on upload;
  - `GET /platform/clearances/{id}`;
  - `status=ending_soon` on the platform list;
  - the per-hospital switch fields;
  - `reason` on `GET /analysis/clearance/me`;
  - **422** `would_empty` on narrow;
  - for Plan 12b: `covered_platform` on the letter (both apps) and on upload; `covers_you` on the platform letter; `covers=me` on the platform list ("my clearances"); **409** `same_person` on verify and reject when the caller is covered;
  - the whole contract is **§14.10** in mhai-multiagent's frontend requirements.
- **Narrowing to nobody is refused.** Removing everyone is a revocation. The server still ends a letter's access when its last covered person loses their role.
- **Staff eligibility in the picker** is read from `StaffOut`: `status === "active"`, roles include `hospital_admin` or `analyst`, and `issues` doesn't include `mfa_not_set_up`. The server has the last word (**422** `not_eligible`, with the ids).
- **A person's named-access line** (staff panel, Analysis page) shows only while the effective position is On:
  - the staff panel derives it from the hospital's letter list (active letters covering that person, latest end date);
  - the Analysis page reads it from `GET analysis/clearance/me`.
- **Page images.**
  - Each app's proxy passes a page through only if it is `image/png` or `image/jpeg`, adding `Cache-Control: no-store`, `Content-Disposition: inline` and `X-Content-Type-Options: nosniff`. Anything else is **502** `bad_page`.
  - The mocks draw sample pages as SVG with the watermark baked in. `LetterViewer` accepts PNG, JPEG and SVG Blobs, only ever in an `<img>`, where no script runs. Any other type gives "Couldn't show this page".
  - The platform CSP gains `blob:` in `img-src`. The clinical app has no CSP today.
- **Uploads through the clinical proxy.**
  - Only `POST hospital/clearances` may be `multipart/form-data`. Its limit is `10 MB + 64 KB`, and a larger body is **413** `file_too_large`. Any other content type there is **415** `file_type`.
  - Every other write keeps the JSON path and its 64 KB limit.
- **The two demos keep separate stores.** Each app seeds the same sample letters, with the same ids, but in memory per app. A letter verified in the platform demo doesn't change the clinical demo; the README says so.
- **The platform demo gains a fifth team member**, Bola Hassan (`bola.hassan@measured-health.example`). He is a platform admin with two-step on, linked to Havana Hospital by a past account, and shows the same-side refusal. The team tests that list the sample team gain him.
- **The Named access nav entry** goes after Plan 6's Analysis entry in the Hospital admin group. It has the line "Clearance letters" and the `FileKey` icon, and shows only when `isHospitalAdmin(u) && canUseNamedAccess(u)`. The route is `/admin/named-access`.
- **The platform nav entry** is **Clearances**, at `/clearances`, with the `FileCheck2` icon. The merged sidebar order is fixed by the controller: **Hospitals · Usage · Analysis · Clearances · Legal holds · System · Settings · Team · Activity · Audit log · Account**. Clearances goes straight after the Analysis entry (today's Analytics link, whatever it is called when 11b merges); whichever plan merges second fixes `nav.ts` and its test to the whole order. The selected letter lives in React state, never in the URL.
- **Platform people on a letter (for Plan 12b).** A hospital admin types the emails of any Measured Health staff the letter names; the app never lists platform accounts to a hospital. Narrowing may remove them too. Covering a platform admin grants nothing in this plan's screens (platform staff still never see names); Plan 12b reads it through `covers=me`.
- **Audit in the demo** goes through Plan 6's `recordAudit`:
  - a named view has type `security`, flag `alert`, a `count` and a `purpose`;
  - a refused file with `failed_safety_check` has type `security`, flag `alert`;
  - every other clearance event has type `admin` and flag null.

  The platform mock logs its actions to its own Activity.

- **The step-up fields in the clinical app** move out of `account-actions.tsx`'s `RemoveDialog` into `components/admin/step-up-fields.tsx`, with no change in behaviour. The clearance dialogs then reuse them inside `ConfirmDialog`.

## Shared with in-flight plans (merge sequencing)

The controller sequences merges on these files.

- **Platform app:**
  - `components/shell/nav.ts` (the merged order in the rulings; the second plan to merge fixes it);
  - `app/api/v1/[...path]/route.ts` (`SHAPES`) and `proxy.test.ts`;
  - `lib/api/contract.ts` (`PlatformClient`, `ActivityAction`);
  - `lib/api/mock.ts`, `lib/api/live.ts`, `live.test.ts`;
  - `lib/api/fixtures.ts` (the team);
  - `lib/auth/mock.ts` (`SAMPLE_ACCOUNTS`);
  - `lib/activity-labels.ts`;
  - `lib/queries/keys.ts`;
  - `proxy.ts` (the CSP) and `proxy.test.ts`;
  - `tests/e2e/helpers.ts`.
- **Clinical app, the hospital admin side:**
  - `components/shell/admin-nav.tsx`;
  - `components/admin/staff-panel.tsx`, `access-editor.tsx`, `account-actions.tsx`;
  - `lib/api/admin-contract.ts` (`ActivityKind`, `ActivityEventOut`);
  - `lib/admin/activity.ts`.
- **Clinical app, the Analysis files from Plan 6:**
  - `lib/auth/types.ts`, `lib/server/features.ts`, `lib/server/map-user.ts`, `lib/auth/mock.ts`;
  - `app/api/v1/[...path]/route.ts` and `proxy.test.ts`;
  - `lib/api/analysis-contract.ts`, `analysis.ts`, `mock-analysis.ts`, `live-analysis.ts`, `mock-audit.ts`;
  - `lib/analysis/read.ts`;
  - `lib/analysis-queries.ts`;
  - `components/analysis/patients-panel.tsx`, `analysis-view.tsx`.
- **Shared packages:**
  - `packages/api-client/src/request.ts`;
  - `packages/ui/package.json` (exports).
- **Docs:** `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `apps/clinical/tests/readme.test.ts`.

## Review Focus

1. **A letter revoked elsewhere while names are open.** Within 30 seconds the names go, and "Named access has ended" shows with the reason. Nothing is left in the query cache. Task 14 tests it with fake timers against the shared mock store.
2. **A reply with names the app didn't ask for, or a named reply that is already past.** Examples: a `name` key in a de-identified reply; a named reply without `named_until` or with it in the past; a named reply while the effective position isn't On. Each fails closed, with no row. Task 13 tests the reader and Task 14 the panel.
3. **End-date edges.** The picker's `max` is exactly the server's `max_end_date`. A date one day later (for example, typed into the field) is refused on the device with "The end date can't be more than 12 months away", and the server's **422** `end_date_too_late` shows the same words. Today, and a letter date after the end date, are refused too. Tasks 4 and 5 test it.
4. **A platform admin linked to the hospital.** They see no Verify and no Reject, only "You can't verify letters from a hospital you're linked to". A forced call gets **409** `same_side` with the same words, and the refusal is logged. Tasks 8 and 10 test it.
5. **Two hospital admins acting on one letter at once.** One narrows while the other revokes. The second write gets **409** `conflict`: "Changed by someone else", and the letter reloads; it is never overwritten silently. Narrowing to nobody is refused. Tasks 3 and 6 test it.

---

## File structure

```text
packages/ui/src/clearances.ts                      reason codes, position words, date helpers (+ test)
packages/ui/src/letter-viewer.tsx                  LetterViewer (+ test)
packages/api-client/src/request.ts                 `form` option, apiBlob
apps/clinical/lib/server/features.ts · map-user.ts namedSignedOff, features.named
apps/clinical/lib/auth/types.ts                    canUseNamedAccess
apps/clinical/app/api/v1/[...path]/route.ts        clearance shapes, multipart, named gate, page images
apps/clinical/app/(clinical)/admin/named-access/page.tsx
apps/clinical/components/shell/admin-nav.tsx       Named access link
apps/clinical/lib/api/clearances-contract.ts · clearances.ts · mock-clearances.ts · live-clearances.ts · clearances-fixtures.ts
apps/clinical/lib/clearances/status.ts · eligibility.ts · file-check.ts · summary.ts
apps/clinical/lib/clearance-queries.ts
apps/clinical/components/admin/step-up-fields.tsx  (moved out of account-actions)
apps/clinical/components/admin/named-access/*.tsx  page parts
apps/clinical/lib/analysis/named.ts                end reasons, timing
apps/clinical/components/analysis/named-view.tsx · purpose-dialog.tsx · clearance-line.tsx
apps/clinical/tests/e2e/named-access.spec.ts · named-analysis.spec.ts
apps/platform/lib/api/clearances-contract.ts · clearances-fixtures.ts · mock-clearances.ts
apps/platform/lib/clearances/queue.ts · switch.ts · labels.ts
apps/platform/lib/queries/clearances.ts
apps/platform/components/clearances/*.tsx
apps/platform/app/(app)/clearances/page.tsx
apps/platform/tests/e2e/clearances.spec.ts
```

---

## Part 11a: hospital side (clinical app)

### Task 1: The shared pieces: reason codes, the letter viewer and the request helper

**Before you start:** merge `origin/main` once Plan 6 is in. Check that `apps/clinical/lib/analysis/read.ts` and `components/analysis/patients-panel.tsx` exist, then record both apps' unit and e2e counts.

**Files:**

- Create:
  - `packages/ui/src/clearances.ts` and `clearances.test.ts`;
  - `packages/ui/src/letter-viewer.tsx` and `letter-viewer.test.tsx`.
- Modify:
  - `packages/api-client/src/request.ts` and `request.test.ts`;
  - `packages/ui/package.json`: add a `./clearances` export if the `./*` → `.tsx` pattern doesn't cover a `.ts` file.

**Interfaces:**

- Produces (`@mhai/ui/clearances`):

```ts
export type NamedPosition = "off" | "letters_only" | "on";
export type ClearanceStatus =
  | "checking"
  | "refused"
  | "waiting"
  | "active"
  | "rejected"
  | "ended"
  | "revoked";
export type RefusedReason =
  | "file_type"
  | "file_too_large"
  | "too_many_pages"
  | "password_protected"
  | "unreadable"
  | "failed_safety_check";
export type RejectReason =
  | "wrong_people"
  | "end_date_mismatch"
  | "not_leadership"
  | "unreadable"
  | "other";
export type RevokeReason =
  | "no_longer_needed"
  | "person_left"
  | "uploaded_in_error"
  | "security_concern"
  | "other";
export type NarrowReason =
  "person_left" | "no_longer_needed" | "uploaded_in_error" | "other";
export const POSITION_LABEL: Record<NamedPosition, string>; // "Off" | "Letters only" | "On"
export const POSITION_ORDER: readonly NamedPosition[]; // off < letters_only < on
export const REFUSED_TEXT: Record<RefusedReason, string>; // spec §7 wording, exactly
export const REJECT_LABEL: Record<RejectReason, string>; // spec §6.3 wording
export const REVOKE_LABEL: Record<RevokeReason, string>; // spec §5.3 wording
export const NARROW_LABEL: Record<NarrowReason, string>;
export const LETTER_MAX_BYTES = 10 * 1024 * 1024;
export const LETTER_MAX_PAGES = 20;
export const COVER_MAX = 20;
export const NOTE_MAX = 500;
export const ENDING_SOON_DAYS = 30;
export function dayLabel(ymd: string): string; // "2027-03-12" → "12 Mar 2027"
export function daysBetween(fromYmd: string, toYmd: string): number;
```

- The `REFUSED_TEXT` values, exactly:
  - "This file type isn't accepted";
  - "The file is larger than 10 MB";
  - "The letter has more than 20 pages";
  - "Password-protected files can't be accepted";
  - "The file couldn't be read";
  - "The file didn't pass the safety check".
- The `REJECT_LABEL` values: "Doesn't name these people", "End date doesn't match", "Not signed by leadership", "Can't read it", "Other".
- The `REVOKE_LABEL` values: "No longer needed", "Person left or changed role", "Uploaded in error", "Security concern", "Other".
- The `NARROW_LABEL` values: "Person left or changed role", "No longer needed", "Uploaded in error", "Other".
- `LetterViewer({ title, pages, loadPage, onClose }: { title: string; pages: number; loadPage(n: number): Promise<Blob>; onClose(): void })`:
  - a `Dialog` on `md` and up, a `Sheet` below;
  - "Page {n} of {N}", with **Previous** and **Next**; only the shown page is fetched;
  - an `<img alt="Page {n} of {N}" draggable={false}>` on an object URL;
  - it revokes the URL when the page changes, on close and on unmount;
  - a Blob whose type isn't `image/png`, `image/jpeg` or `image/svg+xml`, or a failed load, shows "Couldn't show this page" with **Try again**;
  - no download, print or open-in-new-tab control; the root is `print:hidden`.
- `@mhai/api-client/request`:
  - `RequestOpts` gains `form?: FormData`. When set, the body is the form and no Content-Type is set, so the browser adds the boundary. `body` and `form` together throw.
  - `createApiRequest` also returns `apiBlob(fetchImpl, path): Promise<Blob>`. It errors the same way as `apiRequest`, with `Accept: image/png, image/jpeg, image/svg+xml` and `cache: "no-store"`.

- [ ] **Step 1: Write the failing tests**
  - clearances:
    - "the refused, reject and revoke words are the spec's";
    - "dayLabel writes 12 Mar 2027";
    - "daysBetween counts whole days, including across a month end".
  - viewer:
    - "shows page 1 of 3 and fetches only page 1";
    - "Next fetches page 2 and revokes page 1's URL";
    - "closing revokes the URL";
    - "a text/html blob shows Couldn't show this page";
    - "a failed load shows Try again, which reloads";
    - "there is no download or print control";
    - "it is hidden in print".
  - request:
    - "a form is sent without a JSON content type";
    - "body and form together throw";
    - "apiBlob returns the blob, and a 403 throws an ApiError with its code".
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the `@mhai/ui` and `@mhai/api-client` tests, lint and typecheck (remote).
- [ ] **Step 5: Commit:** "Add the shared clearance words, the safe letter viewer and form uploads".

---

### Task 2: The named gate, the proxy shapes and the Named access route

**Files:**

- Create: `app/(clinical)/admin/named-access/page.tsx` (the heading only, in `AdminFrame`; Task 5 fills it) and `layout.tsx`.
- Modify:
  - `lib/server/features.ts` and its test;
  - `lib/server/map-user.ts` and its test;
  - `lib/auth/types.ts`, `roles.test.ts`;
  - `lib/api/auth-contract.ts`;
  - `lib/auth/mock.ts`, `mock.test.ts`;
  - `components/auth/auth-gate.tsx` and its test;
  - `app/api/v1/[...path]/route.ts`, `proxy.test.ts`;
  - `components/shell/admin-nav.tsx`, `sidebar.test.tsx`.

All under `apps/clinical/`.

**Interfaces:**

- Consumes: Plan 6's `analysisSignedOff`, `canUseAnalysis`, `analysisOn` and `User.features`.
- Produces:
  - `namedSignedOff(env = process.env): boolean`, true only for `NAMED_ACCESS_SIGNED_OFF === "true"` (server only);
  - `User.features?: { analysis: boolean; named: boolean }`, where absent means off;
  - `ApiUser.features?.named_access?: boolean`;
  - `features.named` is true in the demo; in live mode it is `features.analysis && namedSignedOff()`. The API's `named_access` flag is not trusted on its own, because the position comes from `GET analysis/named-access`;
  - `canUseNamedAccess(u: User | null): boolean`;
  - `AuthGate need="named-admin"`, meaning `isHospitalAdmin(u) && canUseNamedAccess(u)`; anyone else is sent home;
  - `NAMED_ACCESS_HREF = "/admin/named-access"`, added to `ADMIN_LINKS` after Analysis with the line "Clearance letters" and the `FileKey` icon, only when the gate holds.
- **Proxy:**
  - shapes under `hospital`:
    - GET and POST `hospital/clearances`;
    - GET `hospital/clearances/{id}`;
    - GET `hospital/clearances/{id}/pages/{n}`;
    - POST `hospital/clearances/{id}/revoke` and `…/narrow`;
  - shapes under `analysis`: GET `analysis/named-access` and GET `analysis/clearance/me`. Any other `clearances` or `clearance` path is 404;
  - `namedSignedOff()` false gives 404 `not_found` for all of the above, before the session;
  - `analysis/patients` with a `level` other than `deidentified` gives 403 `named_access_off` while the key is off;
  - `POST hospital/clearances` must be `multipart/form-data`, otherwise 415 `file_type`. It may be up to `LETTER_MAX_BYTES + 64 * 1024` bytes, checked by `Content-Length` and while reading; over that is 413 `file_too_large`. It is forwarded as bytes with its own Content-Type;
  - a page reply passes only as `image/png` or `image/jpeg`, with `no-store`, `inline` and `nosniff`; otherwise 502 `bad_page`;
  - the admin area rules (hospital admin, two-step) apply to `hospital/clearances*` as today.

- [ ] **Step 1: Write the failing tests**
  - `features.test.ts`: "named is off unless NAMED_ACCESS_SIGNED_OFF is exactly 'true'".
  - `map-user.test.ts`:
    - "named is on only with analysis on and the key set";
    - "the API's named_access alone doesn't turn it on".
  - `roles.test.ts`:
    - "a hospital admin with both features can use named access";
    - "without features.named nobody can";
    - "an analyst who isn't an admin can't open the Named access page".
  - `auth-gate.test.tsx`: "/admin/named-access sends a clinician home; the key off sends everyone home".
  - `sidebar.test.tsx`:
    - "a hospital admin sees Named access after Analysis";
    - "with the key off nobody sees it".
  - `proxy.test.ts`:
    - "the eight clearance shapes are accepted";
    - "hospital/clearances/x/download and analysis/clearance/other are 404";
    - "the key off gives 404 before upstream for every clearance shape";
    - "level=named with the key off is 403 named_access_off before upstream";
    - "an upload that isn't multipart is 415";
    - "an 11 MB upload is 413 before upstream";
    - "a 2 MB upload is forwarded with its boundary";
    - "a page reply of text/html is 502 bad_page";
    - "a PNG page passes with no-store and nosniff".
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the clinical tests, lint and typecheck (remote). Only the tests named above changed.
- [ ] **Step 5: Commit:** "Gate named access behind sign-off; add the clearance proxy shapes".

---

### Task 3: The clearance contract, sample letters, mock and live client

**Files:**

- Create: `apps/clinical/lib/api/clearances-contract.ts`, `clearances-fixtures.ts`, `clearances.ts`, `mock-clearances.ts`, `live-clearances.ts`, and tests `mock-clearances.test.ts` and `live-clearances.test.ts`.
- Modify:
  - `lib/api/admin-contract.ts`: the `ActivityKind` additions, and `ActivityEventOut.purpose?`;
  - `lib/admin/activity.ts` and its test.

**Interfaces (`clearances-contract.ts`; the codes come from `@mhai/ui/clearances`, and `StepUp` is the same shape as the admin client's `StaffRemoveAuth`):**

```ts
type Who = { display_name: string };
type CoveredOut = { id: string; display_name: string };
type ClearanceEventKind =
  | "uploaded"
  | "refused"
  | "ready"
  | "verified"
  | "rejected"
  | "narrowed"
  | "revoked"
  | "ended"
  | "reminded";
type ClearanceEventOut = {
  at: string;
  kind: ClearanceEventKind;
  by: Who | null;
  side: "hospital" | "platform" | null;
  reason: string | null;
  note: string | null;
  removed?: CoveredOut[];
};
type ClearanceOut = {
  id: string;
  status: ClearanceStatus;
  refused_reason: RefusedReason | null;
  signed_by: string;
  signer_title: string;
  letter_date: string; // YYYY-MM-DD
  covered: CoveredOut[];
  covered_platform: CoveredOut[]; // Measured Health staff the letter names (Plan 12b)
  end_date: string; // the hospital's day
  uploaded_by: Who;
  uploaded_at: string;
  verified_by: Who | null;
  verified_at: string | null;
  rejection: { reason: RejectReason; note: string | null; at: string } | null;
  revocation: {
    by: Who;
    side: "hospital" | "platform";
    at: string;
    reason: RevokeReason;
    note: string | null;
  } | null;
  renews: string | null;
  pages: number; // 0 until ready
  history: ClearanceEventOut[];
  version: number;
};
type ClearancesOut = {
  clearances: ClearanceOut[];
  today: string;
  max_end_date: string;
};
type ClearanceUpload = {
  file: File;
  signed_by: string;
  signer_title: string;
  letter_date: string;
  covered: string[];
  covered_platform?: string[]; // emails, as written in the letter
  end_date: string;
  renews?: string;
} & StepUp;
type NamedAccessOut = { position: NamedPosition; since: string | null }; // the effective one
```

**`ClearanceClient`** (`clearances.ts`, with `getClearanceClient()` choosing the mock or live client as `getAdminClient` does):

- `getNamedAccess(): Promise<NamedAccessOut>`. A 404 from the proxy (the key is off) reads as `{ position: "off", since: null }`.
- `listClearances(): Promise<ClearancesOut>`, newest first.
- `getClearance(id: string): Promise<ClearanceOut>`.
- `uploadClearance(u: ClearanceUpload, opts: WriteOpts): Promise<ClearanceOut>`, sending multipart fields named exactly as in spec §10, plus `renews`.
- `revokeClearance(id, body: { reason: RevokeReason; note?: string } & StepUp, opts): Promise<ClearanceOut>`.
- `narrowClearance(id, body: { remove: string[]; reason: NarrowReason; note?: string; version: number } & StepUp, opts): Promise<ClearanceOut>`.
- `getClearancePage(id: string, n: number): Promise<Blob>`.

**Live paths:** the spec §10 hospital paths. Pages use `apiBlob`; the upload uses `form`.

**Activity kinds and wording:**

| Kind                      | Type     | Flag              | Wording                                                  |
| ------------------------- | -------- | ----------------- | -------------------------------------------------------- |
| `clearance_uploaded`      | admin    | null              | "{actor} uploaded a clearance letter"                    |
| `clearance_refused`       | security | `alert` on safety | "A clearance letter's file was refused"                  |
| `clearance_verified`      | admin    | null              | "{actor} at Measured Health verified a clearance letter" |
| `clearance_rejected`      | admin    | null              | "{actor} at Measured Health rejected a clearance letter" |
| `clearance_narrowed`      | admin    | null              | "{actor} removed {target} from a clearance letter"       |
| `clearance_revoked`       | admin    | null              | "{actor} revoked a clearance letter"                     |
| `clearance_ended`         | admin    | null              | "A clearance letter ended"                               |
| `clearance_viewed`        | admin    | null              | "{actor} viewed a clearance letter"                      |
| `clearance_reminder_sent` | admin    | null              | "A reminder was sent to {target} about a letter ending"  |
| `analysis_named_viewed`   | security | `alert`           | "{actor} viewed {count} patients by name in Analysis"    |

`ActivityEventOut` gains `purpose?: NamedPurpose`, which Task 13 defines; declare the type here.

**Sample letters (`clearances-fixtures.ts`)** for Havana Hospital, relative to the mock's clock. The hospital's day is computed in `Africa/Lagos` inside the mock only.

| Id         | Status   | Covered                               | Other                                             |
| ---------- | -------- | ------------------------------------- | ------------------------------------------------- |
| `cl_check` | checking | Kemi Adeyemi                          | becomes `waiting` after `CHECK_MS = 3000`         |
| `cl_bad`   | refused  | Grace Nwosu                           | `failed_safety_check`                             |
| `cl_wait`  | waiting  | Dr. Ngozi Obi; platform: Tunde Okafor | 3 pages                                           |
| `cl_act`   | active   | Grace Nwosu                           | ends in about 4½ months; verified by Tunde Okafor |
| `cl_soon`  | active   | Kemi Adeyemi                          | ends in 12 days; a 30-day `reminded` event        |
| `cl_rej`   | rejected | Kemi Adeyemi                          | `end_date_mismatch`                               |
| `cl_end`   | ended    | Grace Nwosu                           | ended 2 months ago                                |
| `cl_rev`   | revoked  | a since-deactivated analyst           | `person_left`, by Grace Nwosu                     |

The signer is "Dr. Funmi Ade, Chief Medical Director", an invented name. Every other letter has `covered_platform: []`.

**Mock rules (`createMockClearances({ now, me, delayMs, stepUp, namedAccess = "on", staff })`):**

- The store is memory only, module-level, like Plan 6's `mock-audit.ts`. It has `resetClearances()` for tests and exports `coverFor(staffId: string, now: number): { clearance_id: string; until: string; version: number } | null` for Task 13.
- `namedAccess: "off"` makes every hospital call **403** `named_access_off`, and `getNamedAccess` returns Off.
- **Upload:**
  - it checks two-step (`123456`) as `requireStepUp` does;
  - it checks the file type by its first bytes (`%PDF`, the PNG signature, `FF D8 FF`) and its size;
  - it checks the end date (after `today`, no later than `max_end_date`, otherwise **422** `end_date_too_late`);
  - it checks the letter date (not after today or the end date);
  - it checks 1–20 people in total across `covered` and `covered_platform`, every staff id eligible by `staff()` (otherwise **422** `not_eligible` with the ids), and every email a sample platform admin with two-step (Ada, Tunde, Bola; otherwise **422** `not_eligible_platform` with the emails);
  - it stores the letter as `checking` and logs `clearance_uploaded`.
- **Revoke:** `waiting` or `active` only, otherwise **409** `conflict`.
- **Narrow:**
  - it needs `version`, otherwise **409** `conflict`;
  - `remove` must be a subset of `covered` and `covered_platform` ids, otherwise **422** `invalid`;
  - removing everyone is **422** `would_empty`.
- `listClearances` moves letters past their end to `ended` and logs `clearance_ended` once.
- Each `getClearancePage` logs `clearance_viewed`, and returns an SVG Blob. The page shows "Sample clearance letter · page {n}", with the watermark "{viewer display name} · {d MMM yyyy HH:mm}" across it.
- Writes are idempotent by key, as in the other mocks.

- [ ] **Step 1: Write the failing tests**
  - mock:
    - "the sample letters cover every status";
    - "an upload is checking, then waiting after 3 seconds";
    - "a .pdf name with PNG bytes is accepted as PNG; a text file named .pdf is 415";
    - "11 MB is 413";
    - "an end date one day past max_end_date is 422 end_date_too_late" (Review Focus 3);
    - "an end date of today is 422 invalid";
    - "an ineligible person (a clinician without Analyst) is 422 not_eligible with their id";
    - "21 people is 422, counting covered and covered_platform together";
    - "a letter may cover Tunde Okafor by email; it comes back in covered_platform with his name";
    - "an email that isn't an active platform admin is 422 not_eligible_platform";
    - "narrowing can remove a platform person";
    - "a wrong code is 403 mfa_invalid";
    - "any hospital admin can revoke";
    - "narrowing with a stale version is 409 conflict" (Review Focus 5);
    - "narrowing to nobody is 422 would_empty" (Review Focus 5);
    - "revoking a revoked letter is 409";
    - "each page view logs clearance_viewed";
    - "the page is watermarked with the viewer and the time";
    - "namedAccess off makes every call 403 named_access_off";
    - "coverFor returns cl_act for Grace Nwosu, and null after it is revoked".
  - live:
    - "the paths and methods of spec §10";
    - "the upload is multipart with the exact field names and an Idempotency-Key";
    - "a 404 named-access reads as Off".
  - activity: the ten sentences, exactly.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the clearance contract, sample letters, mock and live client".

---

### Task 4: The clearance rules: status, eligibility, file checks and the summary

**Files:**

- Create, each with a test: `apps/clinical/lib/clearances/status.ts`, `eligibility.ts`, `file-check.ts` and `summary.ts`.

**Interfaces:**

- `statusLine(c: ClearanceOut, today: string): { icon: "clock" | "x" | "hourglass" | "check" | "alert" | "ban" | "calendar-x"; words: string; detail: string | null }`.
  - The words follow the copy in Global Constraints. "Ends in {n} days" is used when `0 ≤ daysBetween(today, end_date) ≤ ENDING_SOON_DAYS`.
  - `detail` holds the refused text, the rejection reason (and its note), or "By {name} · {reason}" for a revocation.
- `eligibility(s: StaffOut): { ok: true } | { ok: false; reason: "Not an analyst or hospital admin" | "Two-step isn't on" | "Not active" }`.
- `fileProblem(f: File): Promise<string | null>`. It reads only the first 8 bytes. The problems are "This file type isn't accepted" and "The file is larger than 10 MB".
- `endDateProblem(end: string, today: string, max: string): string | null`. The problems are:
  - "Choose an end date after today";
  - "The end date can't be more than 12 months away" (Review Focus 3).
- `letterDateProblem(letter: string, today: string, end: string): string | null`, which allows neither a date in the future nor one after the end date.
- `namedAccessFor(staffId: string, list: ClearanceOut[]): { until: string } | null`. It takes the active letters covering that person and returns the latest end date.
- `accessSummary(list: ClearanceOut[]): string`. Over active letters, it counts distinct covered people, each at their latest end:
  - "Nobody has named access";
  - "1 person has named access until {date}";
  - "{n} people have named access until {date}", when they all share one date;
  - "{n} people have named access; the earliest ends {date}".
- `errorText(e: unknown): string` maps the codes to words:
  - `end_date_too_late` reads the same as `endDateProblem`'s cap message;
  - `not_eligible` reads "Someone you picked can't be covered. Check the list and try again.";
  - `conflict` reads "Changed by someone else";
  - `would_empty` reads "To remove everyone, revoke the letter";
  - `file_too_large` and `file_type` read as `REFUSED_TEXT`;
  - `mfa_invalid` and `mfa_locked` use the existing two-step words.

- [ ] **Step 1: Write the failing tests**
  - "every status's words and icon, including Ends in 12 days, Ends in 1 day, Ends today";
  - "Active until 12 Mar 2027 when 31 days or more away";
  - "eligibility gives each reason";
  - "fileProblem reads the bytes, not the name";
  - "endDateProblem at max is fine and one day past is refused" (Review Focus 3);
  - "a letter date after the end date is refused";
  - "namedAccessFor takes the latest active letter and ignores waiting ones";
  - "the four summary sentences";
  - "errorText for each code".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the tests.**
- [ ] **Step 4: Commit:** "Add the clearance rules: status, eligibility, file and date checks".

---

### Task 5: The Named access page: the list, the banner and Upload

**Files:**

- Create:
  - `apps/clinical/lib/clearance-queries.ts`;
  - `components/admin/named-access/named-access-view.tsx`, `letter-list.tsx`, `upload-dialog.tsx`, `people-picker.tsx`;
  - `components/admin/step-up-fields.tsx`, moved out of `account-actions.tsx` with that file rewired and no change in behaviour;
  - tests.
- Modify:
  - `app/(clinical)/admin/named-access/page.tsx`, with `metadata.title = "Named access · MHAI"`;
  - the sign-out key removal, which gains `CLEARANCE_KEYS.all` beside `ADMIN_KEYS.all`.

**Interfaces:**

- **Hooks:**
  - `CLEARANCE_KEYS = { all: ["clearances"], list: [...], one: (id) => [...], named: ["clearances", "named-access"] }`;
  - `useNamedAccess()`;
  - `useClearances()`, which refetches every **5 s** while any letter is `checking`;
  - `useClearance(id)`;
  - `useUploadClearance()`, `useRevokeClearance()` and `useNarrowClearance()`: keyed mutations with `gcTime: 0`, which invalidate the clearances and activity keys.
- **`NamedAccessView`:**
  - with position `off`, it shows only "Named access isn't available yet";
  - otherwise it shows the `accessSummary` banner, **Upload a letter**, and the list.
- **`LetterList`:**
  - one row per letter, newest first;
  - each row shows the status word and icon, the people covered, the end date, "Uploaded by {name} · {date}" and "Verified by {name} · {date}";
  - rows are buttons that open the detail (Task 6);
  - it is a table on `md` and up, and cards below.
- **`UploadDialog({ open, onClose, prefill?: { covered: string[]; signed_by: string; signer_title: string; renews: string } })`**, in this order:
  - **The letter:** a file input with `accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"`. It runs `fileProblem` and then shows only "{name} · {size}". The `File` lives in component state and is dropped on close;
  - **Signed by** and **Job title**;
  - **Letter date**;
  - **People covered**: the `PeoplePicker` over `useStaff()`, where ineligible people are disabled with the reason, and the count is shown;
  - **Measured Health staff named in the letter** (optional): up to 20 email entries with **Add**. Together with the people covered there are 1–20; `not_eligible_platform` names the refused emails;
  - **End date**: a date input with `min` the day after `today` and `max` the server's `max_end_date`, checked by `endDateProblem`;
  - the **Confirm** checkbox: "This letter is signed by hospital leadership and names these people.";
  - the `StepUpFields`;
  - **Upload**. Server refusals show through `errorText`. On success it toasts "Letter uploaded. It shows Checking the file until it's ready."
- **Offline** disables Upload, with the reason.

- [ ] **Step 1: Write the failing tests**
  - "with the switch Off the page says Named access isn't available yet and nothing else";
  - "the banner reads 2 people have named access; the earliest ends …";
  - "every sample status shows its words and icon";
  - "a checking letter turns to Waiting for Measured Health without a reload";
  - "upload: a text file is refused before sending with This file type isn't accepted";
  - "upload: no preview is rendered (no img, iframe or object)";
  - "the picker greys out a clinician with Not an analyst or hospital admin, and someone without two-step with Two-step isn't on";
  - "the end date input's max is max_end_date; typing one day later shows the 12-month message" (Review Focus 3);
  - "Upload stays disabled until confirm, a person, the dates and a full code";
  - "adding tunde.okafor@measured-health.example sends covered_platform; an unknown email shows the refusal with that email";
  - "19 staff plus 2 emails is refused before sending (20 at most)";
  - "a wrong code shows the two-step message and keeps the form";
  - "a successful upload adds a Checking the file row";
  - "the account-actions remove dialog still works" (the existing test, unchanged);
  - "offline disables Upload";
  - "at phone width the list is cards and Upload is a sheet".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Named access page: the list, the summary and uploading a letter".

---

### Task 6: A letter's detail: view, revoke, narrow and renew; named access in the staff panel

**Files:**

- Create: `components/admin/named-access/letter-detail.tsx`, `revoke-dialog.tsx`, `narrow-dialog.tsx`, and their tests.
- Modify:
  - `named-access-view.tsx`, to open the detail;
  - `components/admin/staff-panel.tsx`, `access-editor.tsx`, `account-actions.tsx` and `staff-panel.test.tsx`.

**Interfaces:**

- Consumes:
  - `LetterViewer` (Task 1);
  - `statusLine`, `namedAccessFor` and `errorText` (Task 4);
  - the hooks and `StepUpFields` (Task 5).
- **`LetterDetail({ id, onClose })`**, a `@mhai/ui/side-panel` on `md` and up and a sheet below, showing:
  - everything entered, with platform people listed under "Measured Health staff";
  - the status line;
  - the history, oldest first, as "{date} · {what} · {who}";
  - **View letter**, only when `pages > 0`, which opens `LetterViewer` with `loadPage = (n) => client.getClearancePage(id, n)`;
  - **Revoke**, only for `waiting` or `active`;
  - **Remove a person**, only for `waiting` or `active` with 2 or more people;
  - **Renew**, only for `active`, `ended` or `revoked`, which opens `UploadDialog` with `prefill`.
- **`RevokeDialog`:** `ConfirmDialog` with the `REVOKE_LABEL` radios, a note (required for Other, 500 characters at most) and the `StepUpFields`. The intro reads "Named access under this letter ends at once."
- **`NarrowDialog`:**
  - checkboxes over the covered people, where checking everyone is blocked with "To remove everyone, revoke the letter";
  - `NARROW_LABEL`, a note and the `StepUpFields`;
  - it sends `version`, and a 409 shows "Changed by someone else" and reloads the letter (Review Focus 5).
- **Staff panel**, while `useNamedAccess().position === "on"`:
  - the line "Named access until {date} · letter on file" or "No named access", from `namedAccessFor`;
  - when the person has named access, three confirms gain the sentence `ENDS_NAMED = "This also ends their named access at once."`:
    - removing their Analyst or hospital admin role;
    - deactivating them;
    - resetting their two-step.

- [ ] **Step 1: Write the failing tests**
  - "the detail shows what was entered and the history";
  - "View letter opens the viewer on page 1 of 3; closing it revokes the image";
  - "a checking letter has no View letter";
  - "any hospital admin can revoke with a reason and code, and the row turns Revoked {date}";
  - "Other needs a note";
  - "narrow removes one of two people";
  - "cl_wait lists Tunde Okafor under Measured Health staff, and narrow can remove him";
  - "checking everyone shows revoke instead" (Review Focus 5);
  - "a stale narrow shows Changed by someone else and reloads" (Review Focus 5);
  - "Renew opens Upload with the same people and signer";
  - "the old letter stays Active after renewing";
  - "the staff panel shows Named access until … for Grace Nwosu and No named access for a clinician";
  - "removing Kemi Adeyemi's Analyst role says it also ends their named access";
  - "with the switch Letters only the staff panel shows no named-access line".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint.
- [ ] **Step 4: Commit:** "Add a letter's detail: view, revoke, narrow, renew; show named access on staff".

---

### Task 7: 11a end to end and docs

**Files:**

- Create: `apps/clinical/tests/e2e/named-access.spec.ts`.
- Modify:
  - `README.md`, adding "**Named access.**" under Run on mock data, and extending the `### Analysis` sign-off section;
  - `apps/clinical/tests/readme.test.ts`;
  - `CONTRIBUTING.md`, `ARCHITECTURE.md` (the admin sidebar and the named gate) and `CHANGELOG.md`.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test. Each test also checks `caches.keys()` is empty and that no page URL contains a letter id or page number.
  - "the hospital admin opens Named access and sees every sample status";
  - "upload a PNG letter for Kemi Adeyemi; it shows Checking the file, then Waiting for Measured Health";
  - "view a letter page by page; no download or print control exists";
  - "revoke a waiting letter with a code";
  - "renew the letter ending in 12 days";
  - "an analyst who isn't an admin has no Named access entry";
  - "phone: the list as cards and Upload as a sheet".
- [ ] **Step 2: Docs.**
  - "**Named access.**" covers the sample letters, the demo code `123456`, and the fact that verifying happens in the platform demo, whose store is separate.
  - The sign-off section adds that named drill-down needs **clinical, privacy and legal sign-off**, and stays off in live mode until `NAMED_ACCESS_SIGNED_OFF=true` is set **and** the backend switch is raised by two platform admins.
  - Pin these with:
    - `"documents the named access demo"`, matching `/\*\*Named access\.\*\*/`;
    - `"says named access stays off until sign-off"`, matching `/NAMED_ACCESS_SIGNED_OFF=true/`.
  - CONTRIBUTING repeats the letter rules: no preview, no caching, no file names in logs.
  - CHANGELOG, under Unreleased › Added.
- [ ] **Step 3: Verify.** Run the full suite (`npm test`, `npm run e2e` for both apps, lint, `format:check`, typecheck, build, `check:bundle`, `check:platform-marker`) and compare the counts with Task 1's record.
- [ ] **Step 4: Commit:** "Test named access end to end; document the demo and the sign-off key".

The controller then adds spec §10, with this plan's rulings on the contract, to mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as **§14.10**, through its own PR.

---

## Part 11b: platform side (platform app)

### Task 8: The clearance and switch contract, sample data, mock, live client and proxy

**Before you start:** branch from the 11a branch at Task 1's commit, then merge `origin/main` once 7c and 7d are in. Record the platform unit and e2e counts.

**Files:**

- Create: `apps/platform/lib/api/clearances-contract.ts`, `clearances-fixtures.ts`, `mock-clearances.ts`, and `mock-clearances.test.ts`.
- Modify:
  - `lib/api/contract.ts` (the methods, `ActivityAction`);
  - `lib/api/mock.ts` (spread in `createClearanceMock(ctx)`; options);
  - `lib/api/fixtures.ts` (Bola Hassan);
  - `lib/auth/mock.ts` (`SAMPLE_ACCOUNTS`);
  - `lib/api/live.ts`, `live.test.ts`;
  - `app/api/v1/[...path]/route.ts`, `app/api/v1/proxy.test.ts`;
  - `proxy.ts`, `proxy.test.ts` (`img-src 'self' data: blob:`);
  - `lib/activity-labels.ts` and its test;
  - `mock.test.ts` (the sample team now has Bola Hassan).

**Interfaces (`clearances-contract.ts`; the codes come from `@mhai/ui/clearances`):**

```ts
type ClearanceEvent = {
  at: string;
  kind:
    | "uploaded"
    | "refused"
    | "ready"
    | "verified"
    | "rejected"
    | "narrowed"
    | "revoked"
    | "ended"
    | "reminded";
  by: Person | null;
  side: "hospital" | "platform" | null;
  reason: string | null;
  note: string | null;
};
type Clearance = {
  id: string;
  hospital: Person;
  status: ClearanceStatus;
  refused_reason: RefusedReason | null;
  signed_by: string;
  signer_title: string;
  letter_date: string;
  covered: Person[];
  /** Measured Health platform admins the letter names (Plan 12b). */
  covered_platform: Person[];
  /** The caller is in `covered_platform`: they can't verify or reject it. */
  covers_you: boolean;
  end_date: string;
  uploaded_by: Person;
  uploaded_at: string;
  ready_at: string | null;
  verified_by: Person | null;
  verified_at: string | null;
  rejection: {
    by: Person;
    at: string;
    reason: RejectReason;
    note: string | null;
  } | null;
  revocation: {
    by: Person;
    side: "hospital" | "platform";
    at: string;
    reason: RevokeReason;
    note: string | null;
  } | null;
  pages: number;
  history: ClearanceEvent[];
  /** Decided by the server for the caller: false for auditors and linked admins. */
  verifiable_by_you: boolean;
  version: number;
};
type ClearanceTab = "waiting" | "active" | "ending_soon" | "all";
type ClearanceQuery = {
  status?: ClearanceTab;
  hospital?: string;
  covers?: "me";
  cursor?: string;
}; // covers=me: "my clearances" (Plan 12b)
type Signoff = { by: string; at: string; ref: string }; // name and role, YYYY-MM-DD, document reference
type Signoffs = { clinical: Signoff; privacy: Signoff; legal: Signoff };
type SwitchRequest = {
  id: string;
  position: NamedPosition;
  requested_by: Person;
  requested_by_you: boolean;
  requested_at: string;
  signoffs: Signoffs;
};
type SwitchChange = {
  at: string;
  from: NamedPosition;
  to: NamedPosition;
  requested_by: Person | null;
  approved_by: Person | null;
  lowered_by: Person | null;
  reason: string | null;
  signoffs: Signoffs | null;
};
type SwitchState = {
  position: NamedPosition;
  since: string | null;
  history: SwitchChange[];
  request: SwitchRequest | null;
};
type HospitalSwitch = SwitchState & {
  hospital: Person;
  effective: NamedPosition;
};
type NamedAccessOut = { global: SwitchState; hospitals: HospitalSwitch[] };
```

**`PlatformClient` gains:**

- `listClearances(q: ClearanceQuery): Promise<{ clearances: Clearance[]; next_cursor: string | null }>`;
- `getClearance(id: string): Promise<Clearance>`;
- `getClearancePage(id: string, n: number): Promise<Blob>`;
- `verifyClearance(id, body: { version: number } & StepUp, opts: WriteOpts): Promise<Clearance>`;
- `rejectClearance(id, body: { reason: RejectReason; note?: string; version: number } & StepUp, opts): Promise<Clearance>`;
- `revokeClearance(id, body: { reason: RevokeReason; note?: string } & StepUp, opts): Promise<Clearance>`;
- `getNamedAccess(): Promise<NamedAccessOut>`;
- `requestNamedAccess(body: { hospital: string | null; position: NamedPosition; signoffs: Signoffs } & StepUp, opts): Promise<NamedAccessOut>`;
- `approveNamedAccess(requestId: string, body: StepUp, opts): Promise<NamedAccessOut>`;
- `cancelNamedAccess(requestId: string, opts): Promise<NamedAccessOut>`;
- `lowerNamedAccess(body: { hospital: string | null; position: NamedPosition; reason: string } & StepUp, opts): Promise<NamedAccessOut>`.

`ActivityAction` gains the following, with the labels exactly (`{t}` is the target):

- `clearance_viewed`: "viewed {t}";
- `clearance_verified`: "verified {t}";
- `clearance_rejected`: "rejected {t}";
- `clearance_revoked`: "revoked {t}";
- `clearance_verify_refused`: "was refused verifying {t} (linked to the hospital)";
- `named_access_requested`: "asked to turn named access to {t}";
- `named_access_approved`: "approved turning named access to {t}";
- `named_access_cancelled`: "cancelled turning named access to {t}";
- `named_access_lowered`: "turned named access down to {t}".

A letter's target is "the clearance letter signed by {signed_by}"; a switch target is "{position} for {hospital}" or "{position} for every hospital".

**Proxy `SHAPES` gains:**

| Method | Path                                          |
| ------ | --------------------------------------------- |
| GET    | `platform/clearances`                         |
| GET    | `platform/clearances/{id}`                    |
| GET    | `platform/clearances/{id}/pages/{id}`         |
| POST   | `platform/clearances/{id}/verify`             |
| POST   | `platform/clearances/{id}/reject`             |
| POST   | `platform/clearances/{id}/revoke`             |
| GET    | `platform/named-access`                       |
| POST   | `platform/named-access/requests`              |
| POST   | `platform/named-access/requests/{id}/approve` |
| POST   | `platform/named-access/requests/{id}/cancel`  |
| POST   | `platform/named-access/lower`                 |

None of them is in `AUDITOR_WRITES`. A page reply passes only as PNG or JPEG, with `no-store`, `inline` and `nosniff`; anything else is 502 `bad_page`.

**Sample data and mock rules:**

- **Letters:**
  - Havana Hospital has the 11a set, with the same ids;
  - Northgate has `cl_north`, waiting, so that Bola can verify something;
  - Havana's `cl_wait` covers Tunde (`covered_platform`), so Tunde gets `same_person` on it;
  - Riverside has `cl_river`, active, ending in 20 days.
- **The switch:**
  - global On since 3 Feb, requested by Ada and approved by Tunde, with sign-off references "Clinical: Dr. A. Musa, 1 Feb, CS-014", "Privacy: …" and "Legal: …";
  - Havana On;
  - other hospitals Off.
- **Options:** `clearances?: "normal" | "unavailable" | "off"`. "unavailable" makes the list and named-access calls 503; "off" seeds the global switch as Off with no history.
- **`verifiable_by_you`:**
  - false for an auditor;
  - false when `covers_you`;
  - false for a member in `LINKED` (Bola is linked to `h_havana`);
  - false for a member whose email domain is in the hospital's `email_domains`;
  - true otherwise.
- **Verify:**
  - it needs status `waiting`: `checking` is **409** `not_ready`, and any other status is **409** `conflict`;
  - a stale `version` is **409** `conflict`;
  - a caller in `covered_platform` gets **409** `same_person`, checked first;
  - any other caller who can't verify gets **409** `same_side`;
  - both refusals log `clearance_verify_refused`;
  - an auditor gets **403**.
- **Reject:** the same rules, plus Other needs a note.
- **Revoke:** `waiting` or `active` only.
- **Switch:**
  - a request must be a raise, with all three sign-offs filled in, otherwise **409** `signoff_missing`;
  - a hospital can't be raised above global: **409** `above_global`;
  - there is one open request per scope: **409** `conflict`;
  - approving needs a different admin, otherwise **409** `same_person`;
  - lowering must actually lower, otherwise **422** `invalid`;
  - every step logs.
- **Pages:** an SVG Blob, watermarked "{viewer} · {d MMM yyyy HH:mm}", logging `clearance_viewed`.

- [ ] **Step 1: Write the failing tests**
  - `mock-clearances.test.ts`:
    - "the queue's To verify is waiting letters, oldest first";
    - "Ending soon is active letters within 30 days";
    - "Bola gets verifiable_by_you false on Havana and true on Northgate";
    - "Bola verifying Havana is 409 same_side and logs it" (Review Focus 4);
    - "Tunde verifying or rejecting cl_wait, which covers him, is 409 same_person; Ada can verify it";
    - "covers_you is true for Tunde on cl_wait and false for Ada";
    - "covers=me lists only the letters that cover the caller: cl_wait for Tunde, none for Ada";
    - "an auditor is 403";
    - "verifying a checking letter is 409 not_ready";
    - "a stale version is 409 conflict";
    - "reject Other needs a note";
    - "revoke an active letter";
    - "a raise without the legal sign-off is 409 signoff_missing";
    - "the requester can't approve: 409 same_person; Tunde can";
    - "a hospital raised above global is 409 above_global";
    - "lowering takes effect at once with one admin";
    - "effective is the lower of global and hospital";
    - "every action logs Activity";
    - "the off option seeds global Off".
  - `live.test.ts`: the eleven methods use the paths above, with an Idempotency-Key on writes and `apiBlob` for pages; `listClearances({ covers: "me" })` sends `covers=me`.
  - `proxy.test.ts` (route):
    - "the eleven shapes are accepted";
    - "auditor POSTs to verify, reject, revoke and the switch are refused before upstream";
    - "`platform/clearances/x/download` is 404";
    - "a text/html page is 502".
  - `proxy.test.ts` (CSP): "img-src allows blob:".
  - `activity-labels.test.ts`: the nine labels.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the clearance and named-access contract, sample data and live client".

---

### Task 9: The platform rules: the queue, the switch and the wording

**Files:**

- Create, each with a test: `apps/platform/lib/clearances/queue.ts`, `switch.ts` and `labels.ts`.

**Interfaces:**

- `TABS: { id: ClearanceTab; label: string }[]`, which is To verify (default), Active, Ending soon and All.
- `waitingText(c: Clearance, now: number): string`, e.g. "Waiting 5 hours" or "Waiting 3 days". It counts from `ready_at`.
- `statusText(c: Clearance, today: string): { icon; words }`, with the same words as the clinical side ("Waiting for Measured Health"…). Write it here; the apps don't share code beyond `@mhai/ui/clearances`.
- `CHECKLIST: readonly string[]`, spec §6.3's four lines, exactly.
- `verifyBlock(c: Clearance, isAdmin: boolean): null | "auditor" | "covers_you" | "same_side" | "not_ready" | "done"`, checked in that order. `"covers_you"` gives "You can't verify a letter that covers you"; `"same_side"` gives "You can't verify letters from a hospital you're linked to".
- `positionLine(s: SwitchState): string`:
  - "On since 3 Feb 2027 · requested by Ada Bakare, approved by Tunde Okafor";
  - "Letters only since … · requested by …, approved by …";
  - for a lowering: "Off since … · turned down by {name}: {reason}";
  - with no history: "Off".
- `raiseOptions(current: NamedPosition, ceiling: NamedPosition): NamedPosition[]` and `lowerOptions(current: NamedPosition): NamedPosition[]`. The ceiling is the global position for a hospital, and On for the global switch.
- `requestLine(r: SwitchRequest): string` gives "Ada Bakare asked to turn it On · 2 Feb 2027". When `requested_by_you` it adds "Waiting for a different platform admin to approve".
- `signoffProblem(s: Partial<Signoffs>): string | null` gives "Fill in who signed, when, and the document for clinical, privacy and legal". Each field may be 200 characters at most, and dates may not be in the future.
- `verifiedToast(c: Clearance, effective: NamedPosition): string`:
  - "Verified. {n} people can now see names", when the effective position is On;
  - otherwise "Verified. Names stay hidden until named access is switched on".

- [ ] **Step 1: Write the failing tests**
  - "tabs and their order";
  - "waiting text in hours and days";
  - "verifyBlock for an auditor, a covered admin, a linked admin, a checking letter and a verified one";
  - "a covered admin who is also linked gets covers_you";
  - "the checklist is the spec's four lines";
  - "positionLine for a two-person raise and a lowering";
  - "a hospital's raise options stop at the global position";
  - "the requester's line says waiting for a different admin";
  - "signoffProblem with legal missing";
  - "the verified toast for On and for Letters only".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the tests.**
- [ ] **Step 4: Commit:** "Add the clearance queue and switch rules".

---

### Task 10: The Clearances page: the queue, the safe viewer, verify, reject and revoke

**Files:**

- Create:
  - `apps/platform/app/(app)/clearances/page.tsx`, with `metadata.title = "Clearances · MHAI Platform"`;
  - `components/clearances/clearances-view.tsx`, `clearance-queue.tsx`, `clearance-detail.tsx`, `verify-actions.tsx`;
  - `lib/queries/clearances.ts`;
  - tests.
- Modify:
  - `components/shell/nav.ts`: **Clearances**, `/clearances`, the `FileCheck2` icon, straight after the Analysis entry (today's Analytics), in the merged order from the rulings;
  - `lib/queries/keys.ts`: the `clearances` and `namedAccess` roots;
  - `components/shell/app-shell.test.tsx`: the nav order.

**Interfaces:**

- **Hooks:**
  - `useClearances(tab)`, which is infinite with `next_cursor`;
  - `useClearance(id)`;
  - `useNamedAccessState()`;
  - `useVerify()`, `useReject()` and `useRevoke()`: keyed mutations with `gcTime: 0`, which update the letter in the cache and invalidate the clearances, named-access and activity queries.
- **`ClearancesView`:**
  - the header "Clearances";
  - the switch panel slot (Task 11);
  - with the global position Off, "Named access isn't available yet" in place of the queue;
  - otherwise the tabs and the queue, and the detail beside them.
- **`ClearanceQueue`:**
  - the tabs (`role="tablist"`);
  - rows as buttons, each showing the hospital, "{n} people", the end date, "Uploaded by {name} · {date}" and `waitingText`;
  - the states: loading, "No letters waiting" (To verify) or "No letters" (the other tabs), "Couldn't load letters" with Try again, and offline.
- **`ClearanceDetail`:**
  - what the hospital entered: the signer and title, the letter date, the people, the end date and the status;
  - the history;
  - **View letter**, which opens `LetterViewer` with `getClearancePage`;
  - the `CHECKLIST`;
  - then `VerifyActions`.
- **`VerifyActions`:**
  - by `verifyBlock`:
    - null shows **Verify** and **Reject**;
    - `"covers_you"` and `"same_side"` show their copy line only;
    - `"auditor"` shows nothing;
    - `"not_ready"` shows "Can't verify while the file is being checked".
  - **Verify** is a `StepUpDialog` (from `components/hospitals/step-up-dialog.tsx`) with the intro "Names unlock for these people at once if named access is On". It sends `version`.
  - **Reject** is a `StepUpDialog` with the `REJECT_LABEL` reasons, `noteFor="other"`, and the intro "The reason is shown to the hospital".
  - **Revoke** is for platform admins only, on `waiting` or `active`, using `REVOKE_LABEL` and a code.
  - A 409 `same_side` reads the same-side copy; a 409 `same_person` reads "You can't verify a letter that covers you"; a 409 `conflict` reads "Changed by someone else" and reloads.
  - The detail lists platform people under "Measured Health staff".
  - Offline disables all of them, with the reason.
- **Phone:** the queue shows alone; tapping a row opens the detail, with **Back**.

- [ ] **Step 1: Write the failing tests**
  - "opens on To verify, oldest first";
  - "the sidebar shows Clearances straight after the Analysis entry" (if the other plans have merged, the test pins the whole merged order);
  - "Ending soon lists Riverside's letter";
  - "the detail shows what was entered beside the checklist";
  - "View letter shows page 1 of 3 in an image and no download or print";
  - "closing the viewer revokes the page image";
  - "Ada verifies Northgate with a code; Northgate is Off, so the toast reads Verified. Names stay hidden until named access is switched on";
  - "Bola sees You can't verify letters from a hospital you're linked to on Havana, and no buttons" (Review Focus 4);
  - "a forced same_side reply shows the same words" (Review Focus 4);
  - "Tunde sees You can't verify a letter that covers you on cl_wait, and no buttons; a forced same_person reply shows the same words";
  - "reject with Other needs a note";
  - "the auditor sees the letter and the viewer but no Verify, Reject or Revoke";
  - "revoke an active letter";
  - "a stale verify shows Changed by someone else";
  - "global Off shows Named access isn't available yet instead of the queue";
  - "Couldn't load letters with Try again";
  - "offline disables Verify, Reject, Revoke and View letter";
  - "phone: queue, then detail with Back".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Add the Clearances page: queue, safe viewer, verify, reject and revoke".

---

### Task 11: The named-access switch panel

**Files:**

- Create: `apps/platform/components/clearances/switch-panel.tsx`, `switch-request-dialog.tsx`, and their tests.
- Modify:
  - `clearances-view.tsx`, to mount the panel at the top;
  - `lib/queries/clearances.ts`, adding `useRequestNamedAccess()`, `useApproveNamedAccess()`, `useCancelNamedAccess()` and `useLowerNamedAccess()`.

**Interfaces:**

- Consumes: `positionLine`, `raiseOptions`, `lowerOptions`, `requestLine` and `signoffProblem` (Task 9), and `StepUpDialog`.
- **`SwitchPanel`:**
  - a "Named access" section with the global position (word and icon) and its `positionLine`;
  - a "By hospital" list: each hospital's own position, its `effective` position, and "Limited by the global switch" when effective is lower than its own;
  - platform admins get **Turn up**, **Turn down** and, when there is a request, **Approve** or **Cancel** per scope. Auditors see the lines only.
  - **History** expands the global and per-hospital changes, newest first, with the sign-off references.
- **`SwitchRequestDialog({ scope: { hospital: Person | null }, current, ceiling })`:**
  - the target position (`raiseOptions`);
  - three groups, Clinical, Privacy and Legal, each with "Signed by (name and role)", "Date" and "Document reference";
  - `signoffProblem`;
  - the two-step code.

  It is built from the same code fields as `StepUpDialog`. Its intro reads "A different platform admin must approve before this takes effect."

- **Approve:** a `StepUpDialog` showing the request's sign-offs. The requester sees `requestLine`'s waiting text and no Approve. 409 `same_person` reads "You asked for this change, so a different platform admin must approve it".
- **Turn down:** a `StepUpDialog` with `freeReason` over `lowerOptions`, and the intro "This takes effect at once and ends every named view on screen."
- `signoff_missing` reads `signoffProblem`'s words; `above_global` reads "A hospital can't be turned higher than every hospital's switch".

- [ ] **Step 1: Write the failing tests**
  - "shows On since … · requested by Ada Bakare, approved by Tunde Okafor";
  - "Havana On and Northgate Off, with effective positions";
  - "Ada requests Letters only for Riverside with three sign-offs and a code; it shows as waiting";
  - "Ada sees no Approve on her own request; Tunde approves and it takes effect";
  - "a missing legal reference blocks the request";
  - "a hospital can't be offered a position above global";
  - "turning global down to Letters only takes effect at once with one admin";
  - "cancel a pending request";
  - "the auditor sees positions and history but no controls";
  - "History lists the sign-off references".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint.
- [ ] **Step 4: Commit:** "Add the named-access switch: two-person raise, one-person lower".

---

### Task 12: 11b end to end and docs

**Files:**

- Create: `apps/platform/tests/e2e/clearances.spec.ts`.
- Modify:
  - `tests/e2e/helpers.ts` (`BOLA`);
  - `README.md` (the platform demo section), `apps/clinical/tests/readme.test.ts` (one pin);
  - `ARCHITECTURE.md` §5 (the sidebar) and `CHANGELOG.md`.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test, the CSP check on `/clearances`, and no letter id or page number in any page URL:
  - "Ada opens Clearances, views Northgate's letter and verifies it";
  - "Ada rejects a letter with Can't read it";
  - "Bola sees the same-side line on Havana's waiting letter";
  - "Tunde sees You can't verify a letter that covers you on cl_wait";
  - "the auditor views a letter and has no controls";
  - "Ada asks to turn Riverside to Letters only; Tunde, signed in in the same tab, approves";
  - "Ada turns global down to Letters only at once";
  - "phone: tap a letter, see the detail, Back".
- [ ] **Step 2: Docs.**
  - The README platform section gains "**Clearances.**". It covers the queue, the viewer, the switch, the sample accounts (Bola is the linked admin), the demo code, and the fact that the store is separate from the clinical demo's.
  - Pin it with `"documents the platform clearances demo"` matching `/\*\*Clearances\.\*\*/`.
  - The ARCHITECTURE sidebar line.
  - CHANGELOG.
- [ ] **Step 3: Verify.** Run the full suite and compare with Task 8's record.
- [ ] **Step 4: Commit:** "Test clearances end to end; document the platform demo".

---

## Part 11c: the gate in Analysis (clinical app)

### Task 13: Named rows, the clearance check, and their reader and mock

**Before you start:** merge `origin/main` once 11a is in.

**Files:**

- Create: `apps/clinical/lib/analysis/named.ts` and `named.test.ts`.
- Modify:
  - `lib/api/analysis-contract.ts`, `analysis.ts`, `mock-analysis.ts`, `live-analysis.ts`, `analysis-fixtures.ts`;
  - `lib/analysis/read.ts`;
  - the tests `mock-analysis.test.ts`, `live-analysis.test.ts` and `read.test.ts`.

**Interfaces (additions to `analysis-contract.ts`):**

```ts
type PatientLevel = "deidentified" | "named";
type NamedPurpose =
  "clinical_follow_up" | "quality_improvement" | "audit" | "other";
type NamedPatientRowOut = PatientRowOut & { name: string; mrn: string };
type DeidentifiedPatientsOut = {
  level: "deidentified";
  count: number;
  patients: PatientRowOut[];
};
type NamedPatientsOut = {
  level: "named";
  count: number;
  patients: NamedPatientRowOut[];
  named_until: string;
  clearance: { id: string; end_date: string };
};
type PatientsOut = DeidentifiedPatientsOut | NamedPatientsOut;
type ClearanceMeOut = {
  named: boolean;
  until: string | null;
  clearance_id: string | null;
  version: number;
  reason:
    | "none"
    | "ended"
    | "revoked"
    | "removed_from_letter"
    | "role_or_account"
    | "switched_off"
    | null;
};
```

- **`AnalysisClient`:**
  - `listPatients(q: { drill: string; level: PatientLevel; filters: AnalysisFilters; purpose?: NamedPurpose; note?: string })`;
  - `getClearanceMe(): Promise<ClearanceMeOut>`;
  - `getNamedAccess()`, re-exported from the clearance client.
- **Live paths:** `GET analysis/patients?…&level=named&purpose=…&note=…` and `GET analysis/clearance/me`.
- **`readPatients(raw: unknown, expected: PatientLevel, now: number)`:**
  - fails closed when the reply's `level` isn't `expected`;
  - a de-identified reply keeps Plan 6's rules, so `name` and `mrn` fail;
  - a named reply allows exactly `PatientRowOut`'s keys plus `name` and `mrn`, and needs a `named_until` that is valid and after `now`, and a `clearance` with an opaque id;
  - more than 200 rows fail.
- **`readClearanceMe(raw: unknown): ClearanceMeOut | null`**: null on a wrong shape, which counts as a change.
- **`named.ts`:**
  - `PURPOSE_LABEL`, which is "Clinical follow-up", "Quality improvement", "Audit" and "Other";
  - `PURPOSE_NOTE_MAX = 200`;
  - `EndReason = "until" | "changed" | "ended" | "revoked" | "removed_from_letter" | "role_or_account" | "switched_off" | "filters"`;
  - `endReasonFrom(e: unknown | ClearanceMeOut): EndReason | null`. It maps 403 `clearance_ended` to "ended", `not_cleared` to "changed", `named_access_off` to "switched_off", and a `ClearanceMeOut.reason` to its own value;
  - `END_TEXT: Record<EndReason, string>`, each placed after "Named access has ended":
    - "until": "The clearance letter's end date has passed.";
    - "changed": "Your clearance changed.";
    - "ended": "The clearance letter has ended.";
    - "revoked": "The clearance letter was revoked.";
    - "removed_from_letter": "You were removed from the clearance letter.";
    - "role_or_account": "Your role or account changed.";
    - "switched_off": "Named access was switched off.";
    - "filters": "Showing names again starts a new recorded view.";
  - `meChanged(a: ClearanceMeOut, b: ClearanceMeOut | null): boolean`, true when `named`, `clearance_id` or `version` differ, or when `b` is null;
  - `msUntil(namedUntil: string, now: number): number`.
- **The mock:**
  - the fixtures give every cohort patient an invented `name` (from a fixed list) and an `mrn` like `HH-104233`;
  - `level: "named"` needs Task 3's `namedAccess` On, else 403 `named_access_off`;
  - it needs `coverFor(me)` and the person's staff state (active, with the role, with two-step), else 403 `not_cleared`. A `coverFor` whose `until` has passed is 403 `clearance_ended`;
  - it needs a purpose, with a note for Other, else 422 `invalid`;
  - `named_until` is the letter's end of day, or `now + 1 hour` if that is sooner (a demo stand-in for the server's earliest-end rule);
  - it records `analysis_named_viewed` with `count` and `purpose`, type security, flag alert. The entry has no names;
  - `getClearanceMe` reads `coverFor` live, with no caching.

- [ ] **Step 1: Write the failing tests**
  - read:
    - "a de-identified request answered with names fails closed" (Review Focus 2);
    - "a named reply without named_until fails" (Review Focus 2);
    - "a named reply with named_until in the past fails" (Review Focus 2);
    - "a named row with dob or address fails";
    - "a named reply reads with name and mrn".
  - named:
    - "endReasonFrom for each 403 code and each me reason";
    - "meChanged on version, clearance and named";
    - "END_TEXT exact".
  - mock:
    - "Grace Nwosu gets named rows with a purpose";
    - "a clinician without a letter is 403 not_cleared";
    - "after cl_act is revoked, Grace gets 403 not_cleared and me says named false, revoked";
    - "after Analyst is removed, Kemi gets 403";
    - "with the switch off it is 403 named_access_off";
    - "Other without a note is 422";
    - "each named view records one flagged event with the count and purpose and no name";
    - "no invented name matches a real-person list" (the vendor-word style scan, extended with the README's sample names).
  - live: the named query string and `clearance/me`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint (remote).
- [ ] **Step 4: Commit:** "Add named patient rows and the clearance check, failing closed".

---

### Task 14: Show names, the named banner, and ending access on open screens

**Files:**

- Create:
  - `apps/clinical/components/analysis/named-view.tsx`, `purpose-dialog.tsx` and `clearance-line.tsx`;
  - tests: `named-view.test.tsx`, `clearance-line.test.tsx`.
- Modify:
  - `components/analysis/patients-panel.tsx` and its test;
  - `analysis-view.tsx`, to mount `ClearanceLine` above the drill-down area;
  - `lib/analysis-queries.ts`, adding `useNamedPatients`, `useClearanceMe` and `useNamedAccessPosition`.

**Interfaces:**

- **Hooks:**
  - `useNamedAccessPosition()`, enabled only when `canUseNamedAccess(user)`;
  - `useClearanceMe({ poll }: { poll: boolean })`, with `refetchInterval: poll ? 30_000 : false`, `gcTime: 0`, and enabled only when the position is On;
  - `useNamedPatients(q | null)`, with `gcTime: 0` and `retry: false`, keyed under `ANALYSIS_KEYS.all` so sign-out removes it, reading through `readPatients(raw, "named", Date.now())`.
- **`ClearanceLine`**, only when the position is On:
  - "Named access until {date} · letter on file", or "No named access", from `useClearanceMe`;
  - when the access ends within 30 days, it adds "· ends in {n} days".
- **`PatientsPanel`:**
  - keeps the de-identified list as Plan 6 built it;
  - with the position On and `me.named`, it adds **Show names**, which opens `PurposeDialog`. The dialog offers the `PURPOSE_LABEL` radios, and a note (required for Other, 200 characters at most);
  - with the position On and not `me.named`, it shows the line "Named access needs a clearance letter. Ask your hospital admin.";
  - with the position below On, it shows nothing about names.
- **`NamedView({ drill, filters, purpose, note, onEnd })`:**
  - it renders the rows with **Name** and **MRN** columns first;
  - the banner reads "Named view · letter until {dayLabel(clearance.end_date)} · this view is recorded";
  - an `aria-hidden` watermark repeats "{user.name} · {HH:mm}" faintly across the list (`pointer-events-none select-none`);
  - the root is `print:hidden`, and there is no copy, export or print control;
  - ending, all calling `onEnd(reason)`, which removes the named query and returns to the de-identified rows with "Named access has ended" plus `END_TEXT[reason]`:
    - a `setTimeout` for `msUntil(named_until)`;
    - `useClearanceMe({ poll: true })`, when `meChanged` is true;
    - any 403 from the named query, through `endReasonFrom`;
    - a change of `drill` or `filters` (reason "filters").
  - Showing names again asks for a purpose again; that is a new view.
- **Offline** disables **Show names**, with the reason. Going offline while names are shown keeps the `named_until` timer running.

- [ ] **Step 1: Write the failing tests**
  - "Grace sees Show names; choosing Clinical follow-up shows Name and MRN under the named banner";
  - "a clinician-analyst without a letter sees Named access needs a clearance letter, and no button";
  - "with the switch Letters only nothing about names shows";
  - "the watermark shows the viewer and the time";
  - "names go at named_until" (fake timers);
  - "names go within 30 seconds of cl_act being revoked in the shared store, with The clearance letter was revoked." (fake timers; Review Focus 1);
  - "nothing named is left in the query cache after ending" (Review Focus 1);
  - "a 403 clearance_ended on refetch drops the names at once";
  - "the switch turned off drops the names with Named access was switched off.";
  - "changing a filter returns to de-identified, and Show names asks for the purpose again";
  - "removing Kemi's Analyst role in the staff panel ends her names within 30 seconds";
  - "sign-out removes the named query";
  - "the panel is hidden in print and has no copy or export";
  - "the Analysis page shows Named access until … · letter on file for Grace";
  - "Show names is disabled offline".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests, lint and typecheck.
- [ ] **Step 4: Commit:** "Show names under a verified letter, with a purpose; end them everywhere at once".

---

### Task 15: 11c end to end and docs

**Files:**

- Create: `apps/clinical/tests/e2e/named-analysis.spec.ts`.
- Modify: `README.md` (the "**Analysis.**" and "**Named access.**" paragraphs), `CONTRIBUTING.md`, `CHANGELOG.md`, and spec §10, only if the contract changed while building.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test, `caches.keys()` empty, no name or MRN in the URL or the page title, and none in `console` output (collect the messages and scan them for the sample names):
  - "Grace opens a group, shows names for Quality improvement, and sees the banner and watermark";
  - "Activity shows 'viewed 37 patients by name in Analysis', flagged";
  - "Grace revokes cl_act on Named access in another tab; within 30 seconds the Analysis tab shows Named access has ended" (the clock is set with `page.clock`);
  - "a clinician-analyst without a letter sees the needs-a-letter line";
  - "print emulation hides the named list";
  - "phone: the named list as a sheet with the banner".
- [ ] **Step 2: Docs.**
  - The README's Analysis paragraph adds Show names: who sees it, the purpose, the banner, and how it ends.
  - CONTRIBUTING adds that named rows are only in memory, with `gcTime: 0`, never in the URL or logs, and are dropped at `named_until`.
  - CHANGELOG.
- [ ] **Step 3: Verify.** Run the full suite and compare with the 11a record.
- [ ] **Step 4: Commit:** "Test named Analysis end to end; document Show names".

The controller then updates §14.10 from Task 7 with any change made in 11b or 11c, through its own PR.

---

## Parallel work

- **Order between plans.** Plan 6 merged, then 11a. Plans 7c and 7d merged before 11b. 11a merged before 11c.
- **Group A:** Task 1 first, alone (small; everything uses it).
- **Group B, in parallel, in separate worktrees:** Task 2 (clinical gate and proxy), Task 3 (clinical contract and mock) and Task 8 (platform data). They touch different files. Task 8's branch is the 11b branch.
- **Group C, in parallel:** Task 4 (needs 3) and Task 9 (needs 8).
- **Group D, in parallel:** Task 5 (needs 2 and 4) and Task 10 (needs 9).
- **Group E, in parallel:** Task 6 (needs 5) and Task 11 (needs 10).
- **Group F, in parallel:** Task 7 (11a, last of 11a) and Task 12 (11b, last of 11b).
- **11c:**
  - Task 13 needs only Task 3, so it can be written on a branch from 11a alongside Groups C–E, but it merges after 11a;
  - Task 14 needs Tasks 2, 6 (the staff-panel role change) and 13;
  - Task 15 comes last.

## Self-review notes

- **Spec coverage:**

  | Spec section                                                             | Task(s)                                                                                                           |
  | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
  | §2 goals, anti-goals                                                     | Global Constraints; 2–15                                                                                          |
  | §3 who                                                                   | 2, 8, 10                                                                                                          |
  | §4 the switch (three positions, two-person, per hospital)                | 3 (read), 8, 9, 11; Q1, Q2 rulings                                                                                |
  | §5.1 list and statuses                                                   | 4, 5                                                                                                              |
  | §5.2 upload                                                              | 1, 2 (multipart), 3, 4, 5                                                                                         |
  | §5.3 detail, revoke, narrow, renew                                       | 6                                                                                                                 |
  | §5.4 staff panel, Analysis line, role-change confirms                    | 6, 14                                                                                                             |
  | §6.1 queue                                                               | 9, 10                                                                                                             |
  | §6.2 safe viewing                                                        | 1 (viewer), 2 and 8 (proxy), 10                                                                                   |
  | §6.3 verify, reject, same-side                                           | 8, 9, 10                                                                                                          |
  | §6.4 revoke                                                              | 8, 10                                                                                                             |
  | §7 the document                                                          | 1, 2, 3, 4, 5                                                                                                     |
  | §8 expiry and ending access                                              | 3 (ended), 13, 14; reminders: server (3, a seeded event)                                                          |
  | §9 named drill-down and audit                                            | 3 (kinds), 13, 14                                                                                                 |
  | §10 contract                                                             | 3, 8, 13, then the controller's PR as §14.10 (Task 7)                                                             |
  | Plan 12b needs (controller): platform people on a letter; no self-verify | 3, 5, 6 (clinical); 8, 9, 10 (platform)                                                                           |
  | §11 delivery                                                             | the three parts                                                                                                   |
  | §12 demo                                                                 | 3, 8                                                                                                              |
  | §13 testing                                                              | 2–15; Review Focus                                                                                                |
  | §15 decisions                                                            | rulings (Q1, Q2); Q3 one verifier; Q4 purpose required (13, 14); Q5 no download (1, 10); Q6 reminders server-side |

- **Names used across tasks:**
  - `@mhai/ui/clearances`: `NamedPosition`, `ClearanceStatus`, `RefusedReason`, `RejectReason`, `RevokeReason`, `NarrowReason`, `POSITION_LABEL`, `REFUSED_TEXT`, `REJECT_LABEL`, `REVOKE_LABEL`, `NARROW_LABEL`, `LETTER_MAX_BYTES`, `COVER_MAX`, `ENDING_SOON_DAYS`, `dayLabel`, `daysBetween`;
  - shared helpers: `LetterViewer`, `apiBlob`, `RequestOpts.form`;
  - the clinical gate: `namedSignedOff`, `canUseNamedAccess`, `User.features.named`, `NAMED_ACCESS_HREF`;
  - the clinical contract: `ClearanceOut` (with `covered_platform`), `ClearancesOut`, `ClearanceUpload` (with `covered_platform` emails), `NamedAccessOut`, `getClearanceClient`, `coverFor`, `resetClearances`;
  - the clinical rules: `statusLine`, `eligibility`, `fileProblem`, `endDateProblem`, `letterDateProblem`, `namedAccessFor`, `accessSummary`, `errorText`;
  - the clinical hooks and components: `CLEARANCE_KEYS`, `useClearances`, `useClearance`, `useNamedAccess`, `useUploadClearance`, `useRevokeClearance`, `useNarrowClearance`, `StepUpFields`, `UploadDialog`, `LetterDetail`, `ENDS_NAMED`;
  - the platform contract: `Clearance` (with `covered_platform`, `covers_you`), `ClearanceQuery.covers`, `ClearanceTab`, `Signoffs`, `SwitchState`, `HospitalSwitch`, `NamedAccessOut`, `createClearanceMock`, `LINKED`;
  - the platform rules: `TABS`, `waitingText`, `verifyBlock`, `CHECKLIST`, `positionLine`, `raiseOptions`, `lowerOptions`, `requestLine`, `signoffProblem`, `verifiedToast`;
  - the platform components: `SwitchPanel`, `SwitchRequestDialog`, `ClearanceDetail`, `VerifyActions`;
  - the Analysis additions: `PatientLevel`, `NamedPurpose`, `NamedPatientRowOut`, `NamedPatientsOut`, `ClearanceMeOut`, `readPatients(raw, expected, now)`, `readClearanceMe`, `PURPOSE_LABEL`, `EndReason`, `END_TEXT`, `endReasonFrom`, `meChanged`, `msUntil`, `useClearanceMe`, `useNamedPatients`, `useNamedAccessPosition`, `NamedView`, `ClearanceLine`.

## Across plans (controller, 22 Oct 2026)

- **Platform sidebar order** once every plan has merged: Hospitals · Usage · Analysis · Clearances · Legal holds · System · Settings · Team · Activity · Audit log · Account. Whichever plan merges second fixes `nav.ts` to match.
- **Backend requirements numbering:** Plan 6 updates §10 (Analysis), Plan 8 is §14.8, Plan 9 is §14.9, Plan 11 is §14.10 (plus its hospital side in §10), and Plan 12 is §14.10.
- **Audit kinds:** Plans 8 and 11 add their event kinds to Plan 9's `lib/audit/kinds.ts` if Plan 9 has merged first; otherwise Plan 9 adds theirs.
- **Binary pass-through:** Plans 9 and 11 share one helper in `route.ts`. Whichever lands second reuses it.
