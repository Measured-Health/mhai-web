# Plan 4: The hospital admin side (design v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a hospital its own admin side inside the clinical app, so the
people who run a hospital can manage it without Measured Health:

- **roles combine:** `hospital_admin` joins `clinician`. A medical director
  (clinician and hospital admin) sees both sides in one sidebar; a hospital
  admin who isn't a clinician signs straight in to the admin side and never
  sees a clinical screen, a consultation or a result. Only platform admins
  and auditors still get the 403 "wrong app" page;
- **Staff:** everyone at the hospital with roles, specialty, status (active,
  invited, needs attention, deactivated), sign-in method and last active;
  search and filter chips with counts. The product owner's ask, "hospital
  admin can add, modify, remove and deactivate staff", is met by Invite,
  the staff member panel, Deactivate / Reactivate and Remove;
- **Invite staff:** one person or a pasted list, with a role and a
  specialty; with hospital single sign-on they just sign in, otherwise an
  emailed invite that expires in 7 days;
- **Staff member panel:** change roles, specialty and review rights; send a
  password reset; reset 2-step; remind; deactivate, reactivate or remove
  (each destructive action confirms, and you can never lock yourself or the
  hospital out); the policy warning and recent activity;
- **Hospital settings:** review turnaround, reviewers must share the
  specialty, 2-step for clinicians, idle timeout, "trust this device"; SSO
  status and allowed email domains read-only;
- **Usage:** counts only, CSV export;
- **Activity:** the log (flagged security events, consultation rows show only
  specialty and confidence, filters, CSV export, kept 12 months) and
  **Review oversight** (waiting corrections with specialty, age and eligible
  reviewers; specialties short of reviewers; Remind and Assign reviewer; no
  clinical content);
- **sample accounts** for a hospital admin and a medical director, and the
  403 sample relabelled as a platform admin.

Everything runs on sample data now and switches to the real API without UI
changes.

**Architecture:**

- **Roles.** `User.role` becomes `User.roles: Role[]` (`lib/auth/types.ts`),
  with `isClinical`, `isHospitalAdmin`, `isAdminOnly`, `isPlatformAccount`
  and `canUse(user, area)`. `homeFor` sends a clinician to `/`, a hospital
  admin who isn't a clinician to `/admin/staff` (`ADMIN_HOME`), anyone owing
  first sign-in steps to `/welcome` and platform accounts to `/no-access`.
- **Routes.** `app/(clinical)/layout.tsx` stays the one shell for both sides
  (`AuthGate need="any"`), so a medical director keeps the bell, drawer and
  history when moving between sides. The clinical pages move into the nested
  group `app/(clinical)/(clinician)/` behind `AuthGate need="clinical"`; the
  admin pages live in `app/(clinical)/admin/` behind `AuthGate need="admin"`.
  URLs don't change for clinical pages. `/account` stays shared.
- **Data.** A separate, focused client: `AdminClient` (`lib/api/admin.ts`),
  types in `lib/api/admin-contract.ts`, the in-memory sample hospital in
  `lib/api/mock-admin.ts` and the live client in `lib/api/live-admin.ts`,
  which calls the BFF at `/api/v1/hospital/*`. The BFF forwards those exact
  shapes for a session with `hospital_admin` only, and clinical shapes for
  clinicians only. TanStack Query hooks live in `lib/admin-queries.ts`.
- **Pure rules** (status, filters, guards, the invite parser, error wording,
  activity wording, report maths, CSV) are in `lib/admin/*.ts`, unit-tested
  without React.
- **Screens** in `components/admin/*`, using the existing `TopBar`,
  `MenuButton`, `Button`, `Chip`, `Banner`, `Dialog`, `useToast` and
  `FilterChip`, plus two new primitives: `SidePanel` (right panel on
  desktop, bottom sheet on phones) and `ConfirmDialog` (safe default first).

**The assumed backend contract.** Base `/api/v1`. Errors are
`problem+json` with `code`. Nothing here exists in the backend yet: every
row is **assumed**, and Task 4 writes it into spec §10 items 2 and 3 so the
backend team can match it or tell us what changed. Every route is scoped to
the hospital in the session, needs `hospital_admin`, and is audited with the
actor and the hospital.

| Feature                       | Endpoint                                                                                                                                                                                                                                                                                                                                                                                                                 | Source                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Combined roles on the user    | login and session `user.roles: string[]` (`clinician`, `hospital_admin`, …); `user.role` stays the primary one                                                                                                                                                                                                                                                                                                           | **assumed** (§10 item 2) |
| Staff list                    | `GET /hospital/staff` → `StaffOut[]`: `id`, `full_name`, `display_name`, `email`, `roles` (`clinician`, `hospital_admin`), `specialty`, `can_review`, `review_specialties[]`, `status` (`active`, `invited`, `deactivated`), `issues[]` (`mfa_not_set_up`, `invite_expired`), `sign_in` (`sso`, `password_mfa`, `password`, null), `last_active_at`, `joined_at`, `invited_at`, `invite_expires_at`, `is_you`, `version` | **assumed**              |
| Invite                        | `POST /hospital/staff/invites {emails[], roles[], specialty}` → `{invited: StaffOut[], skipped: [{email, reason}]}`, `reason` one of `already_staff`, `domain_not_allowed`, `invalid_email`, `duplicate`; `Idempotency-Key`; at most 200 emails                                                                                                                                                                          | **assumed**              |
| Edit roles, specialty, review | `PATCH /hospital/staff/{id} {version, roles?, specialty?, can_review?, review_specialties?}` → `StaffOut`                                                                                                                                                                                                                                                                                                                | **assumed**              |
| Account actions               | `POST /hospital/staff/{id}/deactivate`, `/reactivate`, `/password-reset`, `/reset-mfa`, `/remind` (set up 2-step), `/resend-invite` → `StaffOut`; `Idempotency-Key`                                                                                                                                                                                                                                                      | **assumed**              |
| Remove                        | `DELETE /hospital/staff/{id}` → 204; the account goes, past consultations, feedback and audit entries stay attributed under the retention rules; for an invite it cancels the invite                                                                                                                                                                                                                                     | **assumed**              |
| Guards                        | **403** `self_change` (deactivate, remove or drop your own `hospital_admin`); **409** `last_admin` (would leave no active hospital admin); **409** `conflict` (stale `version`, or the action doesn't fit the status); **404** `not_found`                                                                                                                                                                               | **assumed**              |
| Hospital settings             | `GET /hospital/settings` → `{hospital_name, review_overdue_hours, reviewers_share_specialty, require_mfa_for_clinicians, idle_timeout_minutes, allow_trust_device, sso: {status, domain}, allowed_email_domains[], specialties[], limits: {review_overdue_hours[], idle_timeout_minutes[]}, version}`; `PATCH /hospital/settings {version, …editable}` → the same; **409** `conflict`                                    | **assumed**              |
| Usage                         | `GET /hospital/usage?period=this_month\|last_month\|last_90_days` → `{period, from, to, consultations, active_clinicians, agreement_rate, median_review_hours, confidence: {high, caution, review, failed}, by_specialty: [{specialty, consultations}]}`; counts only                                                                                                                                                    | **assumed**              |
| Activity log                  | `GET /hospital/activity?type&person&staff_id&from&to&flagged&cursor&limit` → `{events: ActivityEventOut[], next_cursor}`; each event `{id, at, type, kind, actor, target, specialty, confidence, device, count, flag}`; **never** question text, results or patient details; kept 12 months                                                                                                                              | **assumed**              |
| Review oversight              | `GET /hospital/review-oversight` → `{overdue_after_hours, waiting, median_decision_hours, decided_this_week, items: [{id, ref, suggested_by, specialty, submitted_at, eligible_reviewers, assigned_to, reminded_at}], reviewers_by_specialty: [{specialty, reviewers}]}`; no clinical content                                                                                                                            | **assumed**              |
| Remind, assign                | `GET /hospital/corrections/{id}/eligible-reviewers` → `[{id, display_name, specialty}]`; `POST /hospital/corrections/{id}/remind` → 204; `POST /hospital/corrections/{id}/assign {staff_id}` → 204; **409** `already_decided`; **422** `not_eligible`; `Idempotency-Key`                                                                                                                                                 | **assumed**              |
| Retry-safe writes             | `Idempotency-Key` on every write above, kept as long as for `POST /feedback` (§10 items 15 and 19)                                                                                                                                                                                                                                                                                                                       | **assumed**              |

**Rulings** (open points decided here so the build can go ahead; each is
recorded in the docs by the task named):

- **R1 · Roles.** `User.roles` lists every role. `clinician` and
  `hospital_admin` combine. A platform role (`admin`, `auditor`) wins over
  everything: that account gets the 403 page even if it also carries a
  clinical role, because platform accounts have no clinical permissions
  (ARCHITECTURE §2). Unknown roles are dropped; no known role at all reads
  as `researcher` (the 403 page). A session cookie sealed before this plan
  (one `role`) is read as `roles: [role]` (Task 1).
- **R2 · Where people land.** `homeFor`: first sign-in steps → `/welcome`;
  clinician → `/`; hospital admin who isn't a clinician → `/admin/staff`;
  anyone else → `/no-access`. A page for the other side redirects to the
  person's home and mounts nothing meanwhile, so no query for that side runs.
  `/` therefore means "your home" for everybody (the account page's Close and
  the 404 page's "Back to home" keep working for admin-only users).
- **R3 · The sidebar.** The mockup's group, in its order: **Staff**,
  **Hospital settings**, **Activity** (two tabs: Log and Review oversight),
  **Usage**. An admin-only person sees just this group, the account menu
  (Profile & security, Sign out) and nothing clinical: no New consultation,
  search, Review corrections, history, Help, keyboard shortcuts, bell,
  decision toasts or service-health strip (that check is a clinical call).
- **R4 · Routes.** `/admin/staff`, `/admin/settings`, `/admin/usage`,
  `/admin/activity` (Log) and `/admin/activity/oversight`; `/admin` redirects
  to `/admin/staff`. The open staff member lives in React state, never the
  URL, so no names or ids land in history or logs.
- **R5 · Deactivate and remove.** Deactivate is reversible (sign-in blocked
  at once, everything kept); Reactivate undoes it. Remove deletes the
  account after a confirmation that names the person; for an invited person
  it reads "Cancel invite". Both, and dropping the hospital admin role, are
  refused in the UI for yourself and for the last active hospital admin, and
  the API refuses them too (`self_change`, `last_admin`).
- **R6 · No bulk actions.** The mockup shows none, so every change is one
  person at a time through the panel; the self and last-admin guards cover
  every path.
- **R7 · Someone else changed it.** Staff rows and settings carry `version`;
  edits send it. A 409 `conflict` reloads: the panel shows the latest with
  "Someone else changed this just now"; the settings page keeps the admin's
  unsaved changes on top of the latest values and asks them to save again. A
  404 drops the row and the panel says the person is no longer on the list.
- **R8 · Pasted invite lists.** Commas, semicolons, new lines and tabs
  separate; `Name <email>` and `mailto:` work; case doesn't matter. Each
  problem shows in words (not an email address, listed twice, already on the
  staff list, not a hospital email address) and only the valid new addresses
  are sent, at most 200 at a time (`INVITE_MAX`). The API's `skipped` list is
  shown too. One role set and one specialty per send.
- **R9 · Activity wording comes from structured fields only:** the event
  kind, names, specialty, confidence level (as `RESULT_LABEL`), device,
  count and flag. Free text from the API is never shown, and an unknown
  kind reads "Security activity", "Account activity" and so on.
- **R10 · CSV exports** are built in the browser from usage counts and
  activity events (no clinical content exists in either), downloaded as a
  `Blob` and never stored. Cells starting with `=`, `+`, `-`, `@`, tab or CR
  get a leading `'`, so a spreadsheet never runs them. The activity export
  fetches every page for the current filters, up to 10,000 rows
  (`CSV_MAX_ROWS`), and says so when it stops there.
- **R11 · Review oversight for admins who aren't clinicians:** shown
  (counts, specialty, age, who suggested it, eligible reviewers). This
  answers spec §11's question: counts and names, never clinical content.
  Approve and Reject never appear on oversight; a clinician admin gets a link
  to Review corrections instead.
- **R12 · Overdue and short.** Oversight flags an item as overdue after the
  hospital's `overdue_after_hours` from the API, and "Short" when fewer than
  2 people can review it (`SHORT_OF_REVIEWERS`). The clinicians' queue keeps
  Plan 3's `REVIEW_OVERDUE_MS` until the login user carries the hospital's
  setting (asked in §10 item 7).
- **R13 · Phones.** There is no mobile admin board, so the admin side
  follows the app's mobile rules: the staff table becomes a list of cards
  below `md`, the side panel becomes a bottom sheet, filter chips wrap,
  settings rows stack, and every target is at least 44 px.
- **R14 · Idle timeout and 2-step policy** are saved for the backend to
  enforce at each person's next sign-in. The app's own idle timer stays at
  13 and 15 minutes until the login user carries the hospital's timeout
  (§10 item 7).
- **R15 · Ids.** Staff are named by their opaque `id` in the path, because
  an admin acts on someone else. "Never send a user id" still holds for the
  caller: the API knows who is asking, and `is_you` comes from the server.
- **R16 · Named constants:** `ADMIN_HOME`, `INVITE_MAX` (200),
  `INVITE_DAYS` (7), `SHORT_OF_REVIEWERS` (2), `CSV_MAX_ROWS` (10,000),
  `OVERSIGHT_POLL_MS` (60 s), `ACTIVITY_KEEP_MONTHS` (12).

**Tech Stack:** as Plans 2 and 3 (Next.js 16.4 App Router with
`cacheComponents`, React 19.3, TanStack Query 5, Tailwind 4, `lucide-react`,
Vitest + React Testing Library, Playwright 1.64.1). No new dependencies.

**Spec:** docs/specs/2026-10-13-ui-design-v3.md §5.6 (hospital admin side), §5.3 403 page, §5.5 (account menu), §7 (accessibility), §8 (privacy), §10 items 2, 3 and 7 (+ §11), ARCHITECTURE.md §2 (who can do what) and §4.7 (hospital admin side), mockup design/v3/hospital-admin.html (tabs 1–7). design/v3/mobile-account-review.html has no admin parts (R13).

**Not in this plan:**

- **Generated OpenAPI types.** `lib/api/admin-contract.ts` is written by hand
  until the backend commits `openapi.json`, as in Plans 2 and 3.
- **Applying the hospital's idle timeout and review turnaround in the
  clinical app** (R12, R14): waits for the login user to carry them.
- **Bulk actions** (R6) and **editing SSO or allowed domains** (Measured
  Health configures them, in the planned platform admin app).
- **The platform admin app** (ADR 0002).

**Sample data (mock):** Havana Hospital, 13 synthetic staff, memory only (a
reload signs you out and resets them):

- the two admin sample accounts are on the list: **Grace Nwosu**
  (`admin.nwosu@havanahospital.org`, hospital admin, not a clinician) and
  **Dr. Ngozi Obi** (`director.obi@havanahospital.org`, medical director:
  clinician and hospital admin). Whoever of them signs in is "you" on the
  list;
- Dr. Kofi Mensah needs attention (2-step not set up), Dr. Funmi Adeyemi is
  invited (expires in 5 days), Dr. Halima Sani's invite has expired, Dr.
  James Eze is deactivated, and one name is very long;
- the hospital uses single sign-on (`havanahospital.org`), and reviewers
  must share the specialty, so Paediatrics is short of reviewers;
- usage for three periods, about 130 activity events over 60 days (one
  locked account flagged as an alert, one sign-in without 2-step flagged as
  policy), and three waiting corrections (C-118 Paediatrics 5 h, C-117
  Internal Medicine 3 h, C-116 Infectious disease 42 min).

## Global Constraints

- **Read the Next.js docs before coding.** This Next.js version has
  breaking changes (AGENTS.md). Before writing a page or layout, read
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`,
  `layout.md` and `route-groups.md`. Notes from Plans 1–3 still hold:
  - route handlers use `RouteContext<'/path/[...param]'>`, and params are
    a Promise;
  - with `cacheComponents`, `useSearchParams` and `use(params)` must sit
    inside `<Suspense>`. This plan's pages use neither (filters and the open
    staff member are React state); `Sidebar` and its `AdminNav` read
    `usePathname()` and already sit in `<Suspense>` in `AppShell`.
- **Plain language; never backend terms (spec §6).** No `hospital_admin`,
  `self_change`, `last_admin`, `not_eligible`, `domain_not_allowed`,
  `already_staff`, `invalid_email`, `mfa_not_set_up`, `invite_expired`,
  `password_mfa`, `conflict` codes, event kinds or ids in UI text or
  accessible names. Roles read "Clinician" and "Hospital admin"
  (`ROLE_LABEL`), statuses "Active", "Invited", "Needs attention",
  "Deactivated" (`STAFF_STATE`), sign-in methods "Hospital account",
  "Password + 2-step", "Password" (`SIGN_IN_LABEL`), confidence levels
  `RESULT_LABEL`, events `describeEvent()`, errors `adminError()`. Task 5
  adds the new codes to `FORBIDDEN_TERMS`, so the e2e word check covers them.
  Say "2-step verification" and "hospital account", never "MFA", "TOTP",
  "SSO" or "OIDC" in the UI.
- **Privacy (spec §5.6, §8, CONTRIBUTING).** The admin side never shows
  question text, results or patient details: the admin contract has no field
  that could carry them, the activity wording is built from whitelisted
  fields (R9), and a test in Task 6 proves an unexpected field never reaches
  the screen or a CSV. Admin data (names, emails, activity) lives in memory
  only: the TanStack cache (cleared on sign-out by `SessionProvider.clear()`)
  and React state. Never `localStorage`, `sessionStorage`, IndexedDB,
  cookies, the URL or `console.*`. CSV files are built in memory and handed
  to the browser's download (R10); nothing is kept. Every e2e test ends with
  `expectNoStorage`.
- **Never send the caller's id from the client** (R15). The API knows who
  you are; `is_you` comes from the API.
- **Accessibility (spec §7):**
  - every status has a word and an icon (`StaffStatusChip`, `FlagChip`,
    the Short and Overdue chips), never colour alone; counts are numbers;
  - everything works from the keyboard with a visible focus ring; table rows
    open the panel from a real button ("Manage Dr. Kofi Mensah");
  - dialogs and the side panel trap focus, close with Esc and return focus;
    in a destructive dialog the safe button comes first and has the focus
    (`ConfirmDialog`: "Keep account", "Keep invite", "Cancel");
  - a disabled action always says why next to it (self, last admin,
    offline), never only a greyed button;
  - touch targets are at least 44 px below `sm` (`min-h-11`);
  - tables are usable on small screens (cards below `md`, R13); the desktop
    table has a caption and column headers;
  - motion uses the tokens only and is off under reduced motion
    (`lib/motion.test.ts` scans `components/` and `app/`).
- **Tokens only.** Colours come from `app/globals.css` tokens through
  Tailwind classes (`text-ink-2`, `bg-warn-wash`…). No hex values in new
  code (existing gradients excepted).
- **Long and unusual text.** Names, emails and specialties wrap
  (`[overflow-wrap:anywhere]`) and are never cut off in a way that hides
  them: no `truncate` on a person's name or email in the admin side.
- **Auth gating.** Admin pages sit behind `AuthGate need="admin"`, clinical
  pages behind `AuthGate need="clinical"` (R2). The BFF forwards
  `/hospital/*` only for a session with `hospital_admin` that finished first
  sign-in, and clinical shapes only for clinicians. A 401 from any admin call
  goes through `reportUnauthorized()`, which signs out once with "Your
  session ended".
- **Writes.** Every write carries a fresh `Idempotency-Key` per user action,
  reused on retries; retries are for network errors and 5xx only and never
  while offline. Writes are disabled offline with "You're offline" next to
  them. Admin writes are never queued in the offline outbox.
- **Guards.** You can't deactivate or remove yourself or drop your own
  hospital admin role; nobody can leave the hospital without an active
  hospital admin; destructive actions confirm with a safe default; every
  action is audited by the backend (the UI says "Every change is recorded in
  the activity log").
- **Tests.** Vitest unit and component tests in every task; Playwright e2e
  on the desktop and mobile projects (Task 17). No fixed sleeps in any test:
  wait for what the screen shows. Existing tests that render `AppShell` or
  `Sidebar` with no user, or with a clinician, keep passing (admin-only
  behaviour switches on `isAdminOnly`, which is false for both).
- **Docs.** `CHANGELOG.md` under _Unreleased_ in the task that makes the
  user-visible change; README's "Run on mock data" sample-accounts paragraph
  and a hospital admin demo paragraph (Task 17); spec §10 items 2, 3, 7 and
  §11, ARCHITECTURE §2 and §4.7 (Task 4).
- **Commits.** Imperative subject of at most 72 characters, **no AI
  attribution** (no co-author trailers or "generated with" lines). Work on
  branch `agent/plan-4-hospital-admin`; humans merge. Never name or copy
  outside reference projects in code, comments, docs or commits; no "lab"
  wording anywhere.

## Review Focus

The five real-world failures this feature is most likely to meet that the
happy-path tests would miss. Each has a named test in its owning task.

1. **An admin locks themselves out.** They try to deactivate or remove their
   own account, or untick their own "Hospital admin" role, in the panel (the
   only edit path: there are no bulk actions, R6), or the API refuses it
   because the list was stale. Expected: the action is disabled with "You
   can't deactivate your own account. Ask another hospital admin." beside
   it; if the API still answers 403 `self_change`, the message is "You
   can't change your own access", never a generic error, and nothing
   changes. Tests: Task 3 ("refuses changes to your own access (403
   self_change)"), Task 5 ("refuses yourself, whatever the action (Review
   Focus 1)"), Task 9 ("your own admin role can't be unticked (Review Focus
   1)"), Task 10 ("you can't deactivate or remove yourself (Review Focus
   1)", "shows an API refusal in plain words, in the dialog"), Task 17
   ("can't deactivate or remove yourself").
2. **Someone else changed or removed the person meanwhile** (two admins at
   once). Expected: an edit meets 409 `conflict`, the panel reloads the
   latest row and says "Someone else changed this just now"; an action on a
   removed person meets 404, the row leaves the list and the panel says
   "This person is no longer on the staff list". Settings keep the admin's
   unsaved changes on top of the other admin's. Nothing is applied twice
   (one idempotency key per action). Tests: Task 3 ("a stale version is
   refused (409 conflict), and an unknown id is 404"), Task 7 ("a 404 drops
   the row; a 409 reloads the list (Review Focus 2)"), Task 9 ("shows the
   latest after a conflict (Review Focus 2)", "says when the person was
   removed elsewhere (Review Focus 2)"), Task 13 ("keeps your changes when
   someone else saved first (Review Focus 2)").
3. **A messy pasted invite list:** duplicates in different case, `Name
<email>`, "Obi, Ngozi" <n.obi@…>, blank lines, an address that is already
   staff (even deactivated), another domain, a typo without "@", more than 200. Expected: each problem in words next to the address, only valid new
   people sent, the button counts them ("Send 2 invites"), and the API's own
   `skipped` list shown after. Tests: Task 5 (`parseInviteList`: "names
   every problem", "reads names, angle brackets and mailto:, in any case"),
   Task 3 ("invites new people and skips what it can't invite"), Task 11
   ("shows each problem and sends only the valid new people (Review Focus
   3)", "lists what the API skipped, in words (Review Focus 3)", "needs a
   role, and caps a send at 200").
4. **Removing the last hospital admin** by unticking the role,
   deactivating or removing the only other admin (or the API knowing
   better). Expected: disabled with "The hospital needs at least one active
   hospital admin. Make someone else a hospital admin first."; 409
   `last_admin` reads "The hospital needs a hospital admin". Tests: Task 3
   ("keeps at least one active hospital admin (409 last_admin)"), Task 5
   ("keeps the last active admin (Review Focus 4)"), Task 9 ("the last admin
   keeps the role (Review Focus 4)"), Task 10 ("the last admin can't be
   deactivated or removed (Review Focus 4)").
5. **A hospital admin who isn't a clinician reaches a clinical route** (a
   deep link, a bookmark, the account page's Close, Back after a role
   change) or makes a clinical call. Expected: redirected to Staff with
   nothing clinical mounted (no consultation, review or feedback query
   runs), and the server answers any clinical call with 403 without calling
   the API. Tests: Task 1 (`homeFor` "sends people where they belong"),
   Task 4 ("refuses clinical calls for an admin-only session, without
   calling the API"), Task 8 ("sends an admin-only person from a clinical
   page to Staff, mounting nothing (Review Focus 5)", "has no feedback
   section for a hospital admin who isn't a clinician"), Task 17 ("an admin
   who isn't a clinician can't reach clinical screens").

---

## File structure

```text
lib/auth/types.ts             Role + hospital_admin; User.roles; isClinical, isHospitalAdmin,
                              isAdminOnly, isPlatformAccount, canUse, Area, ADMIN_HOME
lib/auth/auth-context.tsx     homeFor by role
lib/auth/mock.ts              roles per sample; DEMO_EMAILS; new sample accounts
lib/server/map-user.ts        roles from the API (roles[] or role)
lib/server/session.ts         reads a pre-Plan-4 cookie (one role)
lib/api/auth-contract.ts      ApiUser.roles
lib/api/admin-contract.ts     StaffOut, InviteIn/Out, StaffPatchIn, HospitalSettingsOut,
                              SettingsPatchIn, UsageOut, ActivityEventOut, ActivityQuery,
                              OversightOut, ReviewerOut … (new)
lib/api/admin.ts              AdminClient, StaffAction, getAdminClient() (new)
lib/api/mock-admin.ts         createMockAdmin(): the sample hospital, memory only (new)
lib/api/live-admin.ts         createLiveAdminClient() (new)
lib/admin/staff.ts            StaffState, STAFF_STATE, ROLE_LABEL, SIGN_IN_LABEL, staffState,
                              staffCounts, filterStaff, guardFor, lastActiveLabel … (new)
lib/admin/invite.ts           parseInviteList, INVITE_MAX, INVITE_DAYS, INVITE_PROBLEM (new)
lib/admin/errors.ts           adminError() (new)
lib/admin/activity.ts         describeEvent, ACTIVITY_TYPE_LABEL, ACTIVITY_RANGES … (new)
lib/admin/report.ts           PERIODS, shares, labels, SHORT_OF_REVIEWERS, isOverdueItem (new)
lib/admin/csv.ts              csvCell, toCsv, usageCsv, activityCsv, downloadCsv (new)
lib/admin-queries.ts          ADMIN_KEYS, read hooks, write hooks with idempotency keys (new)
lib/labels.ts                 FORBIDDEN_TERMS + the admin codes
app/api/v1/[...path]/route.ts hospital shapes, PATCH and DELETE, role per area
app/(clinical)/layout.tsx     AuthGate need="any" + AppShell (shared shell)
app/(clinical)/(clinician)/   layout.tsx (need="clinical"); page.tsx, c/, help/, my-feedback/,
                              review/ moved here unchanged
app/(clinical)/admin/         layout.tsx (need="admin"), page.tsx (redirect), staff/, settings/,
                              usage/, activity/, activity/oversight/ (new)
components/auth/auth-gate.tsx need prop
components/auth/no-access.tsx platform admin wording
components/shell/app-shell.tsx    clinical tools only for clinicians
components/shell/sidebar.tsx      clinical block hidden for admin-only; AdminNav
components/shell/admin-nav.tsx    the Hospital admin group (new)
components/shell/account-menu.tsx clinical items hidden for admin-only; "Hospital admin" line
components/account/account-view.tsx  My feedback hidden for admin-only
components/states/unsaved-guard.tsx  optional title and body
components/ui/chip.tsx        + muted tone
components/ui/side-panel.tsx  SidePanel (new)
components/admin/             admin-frame, chips, confirm-dialog, staff-view, staff-list,
                              invite-dialog, staff-panel, access-editor, account-actions,
                              settings-view, usage-view, activity-tabs, activity-view,
                              oversight-view, assign-dialog (new)
tests/admin.ts                makeStaff(), makeEvent(), mockAdminAs(), screenAdminAs() (new;
                              each test file keeps its own vi.hoisted adminHolder)
tests/e2e/hospital-admin.spec.ts  (new)
tests/e2e/helpers.ts          + DEMO sample emails, openAdmin()
```

---

### Task 1: Combined roles and where each person lands

**Files:**

- Modify: `lib/auth/types.ts`, `lib/auth/auth-context.tsx`,
  `lib/server/map-user.ts`, `lib/server/session.ts`,
  `lib/api/auth-contract.ts`, `lib/auth/mock.ts` (role plumbing only; the
  new sample people come in Task 2), `app/api/v1/[...path]/route.ts` (one
  line), `tests/auth-wrapper.tsx`
- Modify (mechanical, `role: X` → `roles: [X]`):
  `lib/auth/auth-context.test.tsx`, `lib/offline/outbox-context.test.tsx`,
  `app/api/v1/proxy.test.ts`, `components/auth/auth-gate.test.tsx`,
  `components/auth/no-access.test.tsx`, `lib/auth/mock.test.ts`,
  `lib/server/map-user.test.ts`, `lib/server/session.test.ts`
- Create: `lib/auth/roles.test.ts`
- Test: `lib/auth/roles.test.ts`, `lib/auth/auth-context.test.tsx`,
  `lib/server/map-user.test.ts`, `lib/server/session.test.ts`

**Interfaces:**

- Consumes: `User`, `FirstStep` (`lib/auth/types.ts`); `ApiUser`
  (`lib/api/auth-contract.ts`); `unseal` (`lib/server/session.ts`).
- Produces:
  - `type Role = "clinician" | "hospital_admin" | "admin" | "auditor" | "researcher"`;
  - `User.roles: Role[]` (replaces `User.role`);
  - `isPlatformAccount(u: User | null): boolean`,
    `isClinical(u: User | null): boolean`,
    `isHospitalAdmin(u: User | null): boolean`,
    `isAdminOnly(u: User | null): boolean`,
    `type Area = "clinical" | "admin"`,
    `canUse(u: User | null, area: Area): boolean`,
    `ADMIN_HOME = "/admin/staff"`;
  - `homeFor(s: { user: User | null; steps: FirstStep[] }): "/welcome" | "/" | "/admin/staff" | "/no-access"`;
  - `ApiUser.roles?: string[]`; `rolesOf(u: ApiUser): Role[]` (exported from
    `lib/server/map-user.ts`).

- [ ] **Step 1: Write the failing tests**

Create `lib/auth/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TEST_USER } from "@/tests/auth-wrapper";
import {
  ADMIN_HOME,
  canUse,
  isAdminOnly,
  isClinical,
  isHospitalAdmin,
  isPlatformAccount,
  type Role,
} from "./types";

const as = (...roles: Role[]) => ({ ...TEST_USER, roles });

describe("roles", () => {
  it("a clinician uses the clinical side only", () => {
    const u = as("clinician");
    expect([isClinical(u), isHospitalAdmin(u), isAdminOnly(u)]).toEqual([
      true,
      false,
      false,
    ]);
    expect(canUse(u, "clinical")).toBe(true);
    expect(canUse(u, "admin")).toBe(false);
  });

  it("a medical director uses both sides", () => {
    const u = as("clinician", "hospital_admin");
    expect(canUse(u, "clinical")).toBe(true);
    expect(canUse(u, "admin")).toBe(true);
    expect(isAdminOnly(u)).toBe(false);
  });

  it("a hospital admin who isn't a clinician uses the admin side only", () => {
    const u = as("hospital_admin");
    expect(isAdminOnly(u)).toBe(true);
    expect(canUse(u, "clinical")).toBe(false);
    expect(canUse(u, "admin")).toBe(true);
  });

  it("a platform role wins over everything (R1)", () => {
    for (const u of [
      as("admin"),
      as("auditor"),
      as("admin", "clinician"),
      as("auditor", "hospital_admin"),
    ]) {
      expect(isPlatformAccount(u)).toBe(true);
      expect(canUse(u, "clinical")).toBe(false);
      expect(canUse(u, "admin")).toBe(false);
    }
  });

  it("nobody signed in, or no known role, uses neither side", () => {
    expect(canUse(null, "clinical")).toBe(false);
    expect(canUse(as("researcher"), "admin")).toBe(false);
    expect(canUse(as(), "clinical")).toBe(false);
  });

  it("names the admin home", () => {
    expect(ADMIN_HOME).toBe("/admin/staff");
  });
});
```

In `lib/auth/auth-context.test.tsx`, replace the whole `describe("homeFor", …)`
block at the end with:

```tsx
describe("homeFor", () => {
  const as = (...roles: User["roles"]) => ({ ...TEST_USER, roles });
  it("sends people where they belong", () => {
    expect(homeFor({ user: TEST_USER, steps: ["terms"] })).toBe("/welcome");
    expect(homeFor({ user: TEST_USER, steps: [] })).toBe("/");
    expect(
      homeFor({ user: as("clinician", "hospital_admin"), steps: [] }),
    ).toBe("/");
    expect(homeFor({ user: as("hospital_admin"), steps: [] })).toBe(
      "/admin/staff",
    );
    expect(homeFor({ user: as("admin"), steps: [] })).toBe("/no-access");
    expect(homeFor({ user: as("auditor", "clinician"), steps: [] })).toBe(
      "/no-access",
    );
    expect(homeFor({ user: as("researcher"), steps: [] })).toBe("/no-access");
  });
  it("first sign-in comes first for a hospital admin too", () => {
    expect(homeFor({ user: as("hospital_admin"), steps: ["mfa"] })).toBe(
      "/welcome",
    );
  });
});
```

and change its type import to
`import type { AuthClient, User } from "./types";`.

In `lib/server/map-user.test.ts`, in the first test change
`role: "clinician",` (inside the expected object) to
`roles: ["clinician"],`, and replace the test
`"treats an unknown role as non-clinical"` with:

```ts
it("treats an unknown role as non-clinical", () => {
  expect(toUser({ username: "u", role: "system" }).roles).toEqual([
    "researcher",
  ]);
});
it("reads combined roles and keeps only known ones (R1)", () => {
  expect(
    toUser({
      username: "u",
      role: "clinician",
      roles: ["clinician", "hospital_admin", "root"],
    }).roles,
  ).toEqual(["clinician", "hospital_admin"]);
});
it("falls back to the single role when roles is missing", () => {
  expect(toUser({ username: "u", role: "hospital_admin" }).roles).toEqual([
    "hospital_admin",
  ]);
});
it("never repeats a role", () => {
  expect(
    toUser({
      username: "u",
      role: "clinician",
      roles: ["clinician", "clinician"],
    }).roles,
  ).toEqual(["clinician"]);
});
```

In `lib/server/session.test.ts`, change `user: { role: "clinician" },`
(inside "starts a session…") to `user: { roles: ["clinician"] },` and add
inside `describe("session cookies", …)`:

```ts
it("reads a session sealed before roles combined (one role)", async () => {
  jar.values.set(
    SESSION_COOKIE,
    seal({
      token: "tok",
      expiresAt: Date.now() + 60_000,
      user: { username: "a.reyes", role: "clinician" },
      steps: [],
    }),
  );
  expect((await readSession())?.user.roles).toEqual(["clinician"]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/auth/roles.test.ts lib/auth/auth-context.test.tsx lib/server/map-user.test.ts lib/server/session.test.ts`
Expected: FAIL. `roles.test.ts` can't import `isHospitalAdmin`, `ADMIN_HOME`
and friends; `homeFor` sends a hospital admin to `/no-access`; `toUser` has
no `roles`.

- [ ] **Step 3: Roles on the user**

In `lib/auth/types.ts`, replace `export type Role = …` with:

```ts
export type Role =
  "clinician" | "hospital_admin" | "admin" | "auditor" | "researcher";
```

In `interface User`, replace `role: Role;` with:

```ts
  /** Every role the person holds. Clinician and hospital admin combine (R1). */
  roles: Role[];
```

Replace the `isClinical` line and its comment with:

```ts
/** Measured Health's own staff: they use the platform admin app, never this one. */
const PLATFORM_ROLES: readonly Role[] = ["admin", "auditor"];

/** Roles from a value that may predate `roles` (be defensive: never crash). */
const rolesOf = (u: User | null): Role[] =>
  Array.isArray(u?.roles) ? u.roles : [];

export const isPlatformAccount = (u: User | null) =>
  rolesOf(u).some((r) => PLATFORM_ROLES.includes(r));

/** The clinical side: a clinician who isn't a platform account (R1). */
export const isClinical = (u: User | null) =>
  !isPlatformAccount(u) && rolesOf(u).includes("clinician");

/** The hospital admin side (spec §5.6). */
export const isHospitalAdmin = (u: User | null) =>
  !isPlatformAccount(u) && rolesOf(u).includes("hospital_admin");

/** A hospital admin who isn't a clinician: no clinical screens at all (R3). */
export const isAdminOnly = (u: User | null) =>
  isHospitalAdmin(u) && !isClinical(u);

export type Area = "clinical" | "admin";

export const canUse = (u: User | null, area: Area) =>
  area === "clinical" ? isClinical(u) : isHospitalAdmin(u);

/** The hospital admin side's first screen (R2). */
export const ADMIN_HOME = "/admin/staff";
```

In `lib/auth/auth-context.tsx`, add `ADMIN_HOME` and `isHospitalAdmin` to the
`./types` import and replace `homeFor` with:

```ts
/** Where a signed-in person belongs right now (R2). */
export function homeFor(s: { user: User | null; steps: FirstStep[] }) {
  if (s.steps.length) return "/welcome";
  if (isClinical(s.user)) return "/";
  if (isHospitalAdmin(s.user)) return ADMIN_HOME;
  return "/no-access";
}
```

In `lib/api/auth-contract.ts`, add to `ApiUser` under `role: string;`:

```ts
  /** Every role (assumed, spec §10 item 2); `role` stays the primary one. */
  roles?: string[];
```

In `lib/server/map-user.ts`, replace the `ROLES` line with:

```ts
const ROLES: readonly Role[] = [
  "clinician",
  "hospital_admin",
  "admin",
  "auditor",
  "researcher",
];

/** Known roles only, each once. None known reads as non-clinical, never as a clinician. */
export function rolesOf(u: Pick<ApiUser, "role" | "roles">): Role[] {
  const raw = Array.isArray(u.roles) ? u.roles : [u.role];
  const known = [
    ...new Set(raw.filter((r): r is Role => ROLES.includes(r as Role))),
  ];
  return known.length ? known : ["researcher"];
}
```

and in `toUser` replace the `role: …` line and its comment with
`roles: rolesOf(u),`.

In `lib/server/session.ts`, add `Role` to the `../auth/types` import and
replace `readSession` with:

```ts
export async function readSession(
  now = Date.now(),
): Promise<ServerSession | null> {
  const s = unseal<ServerSession & { user: { role?: Role } }>(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!s || s.expiresAt <= now) return null;
  // Sealed before roles combined (Plan 4): one `role`.
  if (!Array.isArray(s.user.roles))
    s.user = { ...s.user, roles: s.user.role ? [s.user.role] : [] };
  return s;
}
```

In `lib/auth/mock.ts`, change `userFor`'s signature and body line:

```ts
function userFor(login: string, roles: Role[], mfaEnabled: boolean): User {
  return {
    username: login.split("@")[0]!,
    email: login.includes("@") ? login : null,
    ...(PEOPLE[trigger(login)] ?? REYES),
    roles: [...roles],
    hospital: "Havana Hospital",
    mfaEnabled,
    backupCodesLeft: mfaEnabled ? 8 : null,
  };
}
```

then every `userFor(x, "clinician", …)` becomes `userFor(x, ["clinician"], …)`,
and the role pick in `signIn` becomes:

```ts
const roles: Role[] =
  word === "admin"
    ? ["admin"]
    : word === "auditor"
      ? ["auditor"]
      : ["clinician"];
const u = userFor(key, roles, true);
```

(Task 2 changes which word means what.)

In `app/api/v1/[...path]/route.ts`, import `isClinical` from
`@/lib/auth/types` and change the clinician check to
`if (!isClinical(s.user) || s.steps.length > 0) return forbidden();`
(Task 4 replaces it with the per-area rule).

In `tests/auth-wrapper.tsx`, change `role: "clinician",` to
`roles: ["clinician"],`.

Mechanical renames (each is the only occurrence in its file):

- `lib/offline/outbox-context.test.tsx`: `{ ...TEST_USER, role: "admin" }` →
  `{ ...TEST_USER, roles: ["admin"] }`;
- `app/api/v1/proxy.test.ts`: `user: { ...TEST_USER, role: "admin" },` →
  `user: { ...TEST_USER, roles: ["admin"] },`;
- `components/auth/auth-gate.test.tsx`: `{ ...TEST_USER, role: "admin" }` →
  `{ ...TEST_USER, roles: ["admin"] }`;
- `components/auth/no-access.test.tsx`:
  `const ADMIN = { ...TEST_USER, role: "admin" as const };` →
  `const ADMIN = { ...TEST_USER, roles: ["admin" as const] };`;
- `lib/auth/mock.test.ts`: `role: "clinician",` → `roles: ["clinician"],`,
  and `expect(r.user.role).toBe("admin");` →
  `expect(r.user.roles).toEqual(["admin"]);`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/auth lib/server lib/offline app/api components/auth`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean. If `tsc` reports another `role` use, it is one of the
renames above that was missed: apply the same `roles: [X]` change.

- [ ] **Step 5: Commit**

```bash
git add lib/auth lib/server lib/api/auth-contract.ts lib/offline app/api components/auth tests/auth-wrapper.tsx
git commit -m "Let a person hold several roles and send each to their home"
```

---

### Task 2: Sample accounts and the 403 page for platform accounts

**Files:**

- Modify: `lib/auth/mock.ts`, `lib/auth/mock.test.ts`,
  `components/auth/no-access.tsx`, `components/auth/no-access.test.tsx`,
  `tests/e2e/account.spec.ts`, `tests/e2e/helpers.ts`, `CHANGELOG.md`
- Create: `components/auth/demo-hint.test.tsx`
- Test: `lib/auth/mock.test.ts`, `components/auth/no-access.test.tsx`,
  `components/auth/demo-hint.test.tsx`

**Interfaces:**

- Consumes: `createMockAuthClient`, `SAMPLE_ACCOUNTS`, `userFor`, `trigger`
  (`lib/auth/mock.ts`); `DemoHint` (unchanged: it renders
  `SAMPLE_ACCOUNTS`).
- Produces:
  - `DEMO_EMAILS = { clinician, twoStep, newAccount, hospitalAdmin, director, platformAdmin, locked }`
    (exported from `lib/auth/mock.ts`; Task 3's sample hospital and the e2e
    specs use it);
  - `SAMPLE_ACCOUNTS` in this order: Clinician, Clinician with two-step, New
    account, Hospital admin, Medical director, Platform admin, Locked
    account;
  - mock sign-in words: `admin.*` → `["hospital_admin"]` (Grace Nwosu),
    `director.*` → `["clinician", "hospital_admin"]` (Dr. Ngozi Obi),
    `platform.*` → `["admin"]` (Tunde Bakare), `auditor.*` →
    `["auditor"]`; anything else → `["clinician"]`.

- [ ] **Step 1: Write the failing tests**

In `lib/auth/mock.test.ts`, add `DEMO_EMAILS` to the `./mock` import,
replace the test `"signs admin and auditor accounts in with their role"`
with the block below, and in `"gives each sample account its own person"`
replace the two lines using `SAMPLE_ACCOUNTS[3]` and `SAMPLE_ACCOUNTS[4]`
with lookups by email:

```ts
it("signs each kind of account in with its roles", async () => {
  const c = createMockAuthClient();
  const rolesFor = async (email: string) => {
    const r = await c.signIn(email, "pw");
    if (r.status !== "signed_in") throw new Error();
    return r.user;
  };
  expect((await rolesFor(DEMO_EMAILS.hospitalAdmin)).roles).toEqual([
    "hospital_admin",
  ]);
  const director = await rolesFor(DEMO_EMAILS.director);
  expect(director).toMatchObject({
    roles: ["clinician", "hospital_admin"],
    displayName: "Dr. Obi",
    roleTitle: "Medical director",
  });
  const platform = await rolesFor(DEMO_EMAILS.platformAdmin);
  expect(platform.roles).toEqual(["admin"]);
  expect(isClinical(platform)).toBe(false);
  expect((await rolesFor("auditor.x@h.org")).roles).toEqual(["auditor"]);
  expect((await rolesFor(DEMO_EMAILS.clinician)).roles).toEqual(["clinician"]);
});

it("lists the sample accounts with plain labels", () => {
  expect(SAMPLE_ACCOUNTS.map((a) => a.label)).toEqual([
    "Clinician",
    "Clinician with two-step",
    "New account",
    "Hospital admin",
    "Medical director",
    "Platform admin",
    "Locked account",
  ]);
  expect(SAMPLE_ACCOUNTS.find((a) => a.label === "Platform admin")?.note).toBe(
    "Shows the 403 page",
  );
  for (const a of SAMPLE_ACCOUNTS)
    expect(Object.values(DEMO_EMAILS)).toContain(a.email);
});
```

and in `"gives each sample account its own person"`:

```ts
expect((await c.signIn(DEMO_EMAILS.platformAdmin, "pw")).status).toBe(
  "signed_in",
);
expect(await fail(c.signIn(DEMO_EMAILS.locked, "pw"))).toMatchObject({
  code: "locked",
});
```

In `components/auth/no-access.test.tsx`, replace the first and third tests:

```tsx
it("explains the 403 for a platform account and offers sign out", async () => {
  renderWithAuth(<NoAccess />, ADMIN);
  expect(
    screen.getByRole("heading", { name: "You don't have access" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "This app is for hospital staff. Measured Health platform admin and auditor accounts use the platform admin app.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("Error 403")).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Go to the platform admin app" }),
  ).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
});
```

```tsx
it("links to the platform admin app when its address is set", () => {
  vi.stubEnv("NEXT_PUBLIC_ADMIN_APP_URL", "https://admin.example.org");
  renderWithAuth(<NoAccess />, ADMIN);
  expect(
    screen.getByRole("link", { name: "Go to the platform admin app" }),
  ).toHaveAttribute("href", "https://admin.example.org");
});
```

and add:

```tsx
it("sends a hospital admin to the admin side, not the 403 page", async () => {
  renderWithAuth(<NoAccess />, { ...TEST_USER, roles: ["hospital_admin"] });
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
  expect(screen.queryByText("Error 403")).toBeNull();
});
```

Create `components/auth/demo-hint.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { DemoHint } from "./demo-hint";

afterEach(() => vi.unstubAllEnvs());

describe("DemoHint", () => {
  it("offers the hospital admin, medical director and platform admin samples", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    const pick = vi.fn();
    render(<DemoHint onPick={pick} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: `Use Hospital admin (${DEMO_EMAILS.hospitalAdmin})`,
      }),
    );
    expect(pick).toHaveBeenCalledWith(DEMO_EMAILS.hospitalAdmin);
    expect(
      screen.getByRole("button", {
        name: `Use Medical director (${DEMO_EMAILS.director})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Use Platform admin (${DEMO_EMAILS.platformAdmin})`,
      }),
    ).toHaveTextContent("Shows the 403 page");
  });

  it("shows nothing outside the demo", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const { container } = render(<DemoHint onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/auth/mock.test.ts components/auth/no-access.test.tsx components/auth/demo-hint.test.tsx`
Expected: FAIL: no `DEMO_EMAILS`; the 403 copy still says "This page is for
clinicians"; no Hospital admin or Medical director sample.

- [ ] **Step 3: The sample people and the 403 wording**

In `lib/auth/mock.ts`, replace `SAMPLE_ACCOUNTS` with:

```ts
/** The demo's sample logins. Task 3's sample hospital lists the two admins. */
export const DEMO_EMAILS = {
  clinician: "a.reyes@havanahospital.org",
  twoStep: "mfa.okafor@havanahospital.org",
  newAccount: "new.bello@havanahospital.org",
  hospitalAdmin: "admin.nwosu@havanahospital.org",
  director: "director.obi@havanahospital.org",
  platformAdmin: "platform.bakare@measured-health.example",
  locked: "locked.eze@havanahospital.org",
} as const;

/** Sample accounts for the demo's sign-in page. Any other email works too. */
export const SAMPLE_ACCOUNTS = [
  {
    email: DEMO_EMAILS.clinician,
    label: "Clinician",
    note: "Signs straight in",
  },
  {
    email: DEMO_EMAILS.twoStep,
    label: "Clinician with two-step",
    note: "Code 123456",
  },
  {
    email: DEMO_EMAILS.newAccount,
    label: "New account",
    note: "First sign-in steps",
  },
  {
    email: DEMO_EMAILS.hospitalAdmin,
    label: "Hospital admin",
    note: "Staff, settings and usage; no clinical screens",
  },
  {
    email: DEMO_EMAILS.director,
    label: "Medical director",
    note: "Clinician and hospital admin",
  },
  {
    email: DEMO_EMAILS.platformAdmin,
    label: "Platform admin",
    note: "Shows the 403 page",
  },
  {
    email: DEMO_EMAILS.locked,
    label: "Locked account",
    note: "Shows the lock",
  },
] as const;
```

Replace the `admin` entry of `PEOPLE` and add `director` and `platform`:

```ts
  admin: {
    displayName: "Grace Nwosu",
    fullName: "Grace Nwosu",
    roleTitle: "Hospital IT lead",
    specialty: null,
  },
  director: {
    displayName: "Dr. Obi",
    fullName: "Dr. Ngozi Obi",
    roleTitle: "Medical director",
    specialty: "Emergency medicine",
  },
  platform: {
    displayName: "Tunde Bakare",
    fullName: "Tunde Bakare",
    roleTitle: "Platform admin",
    specialty: null,
  },
```

(the `auditor` entry stays). Above `createMockAuthClient`, add:

```ts
/** The first word of the login picks the roles (memory-only demo). */
const ROLES_FOR: Record<string, Role[]> = {
  admin: ["hospital_admin"],
  director: ["clinician", "hospital_admin"],
  platform: ["admin"],
  auditor: ["auditor"],
};
```

and in `signIn` replace the Task 1 role pick with:

```ts
const u = userFor(key, ROLES_FOR[word] ?? ["clinician"], true);
```

In `components/auth/no-access.tsx`, replace the paragraph and the link:

```tsx
        <p className="mx-auto my-3 max-w-[420px] leading-relaxed text-ink-2">
          This app is for hospital staff. Measured Health platform admin and
          auditor accounts use the platform admin app.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {adminUrl && (
            <a
              href={adminUrl}
              className="inline-flex min-h-11 items-center rounded-full bg-mint px-5 font-semibold text-white"
            >
              Go to the platform admin app
            </a>
          )}
```

(the Sign out button and the rest stay).

In `tests/e2e/helpers.ts`, add at the end:

```ts
/** The demo's sample logins (lib/auth/mock.ts). */
export { DEMO_EMAILS } from "../../lib/auth/mock";
```

In `tests/e2e/account.spec.ts`, add `DEMO_EMAILS` to the `./helpers` import
and replace the test `"an admin account sees the 403 page, never the clinical app"`
with:

```ts
test("a platform admin account sees the 403 page, never the clinical app", async ({
  page,
}) => {
  await signIn(page, DEMO_EMAILS.platformAdmin);
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(
    page.getByRole("heading", { name: "You don't have access" }),
  ).toBeVisible();
  await expect(page.getByText("Error 403")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
```

Add to `CHANGELOG.md` under _Unreleased_ → Changed (create the heading
under Added if missing):

```markdown
- The 403 page is now only for Measured Health platform admin and auditor
  accounts, and points them to the platform admin app. Hospital admins use
  the hospital admin side instead.
- The demo's sign-in page lists a hospital admin, a medical director
  (clinician and hospital admin) and a platform admin (the 403 page).
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/auth components/auth`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/auth components/auth tests/e2e/account.spec.ts tests/e2e/helpers.ts CHANGELOG.md
git commit -m "Add hospital admin and director demo accounts; 403 for platform"
```

---

### Task 3: The admin contract, the client interface and the sample hospital

**Files:**

- Create: `lib/api/admin-contract.ts`, `lib/api/admin.ts`,
  `lib/api/mock-admin.ts`, `lib/api/mock-admin.test.ts`, `tests/admin.ts`
- Test: `lib/api/mock-admin.test.ts`

**Interfaces:**

- Consumes: `WriteOpts` (`lib/api/contract.ts`), `ApiError`
  (`lib/api/errors.ts`), `DEMO_EMAILS` (`lib/auth/mock.ts`, Task 2),
  `getAuthClient` (`lib/auth/client.ts`).
- Produces (`lib/api/admin-contract.ts`): `StaffRole`, `StaffStatus`,
  `SignInMethod`, `StaffIssue`, `StaffOut`, `InviteIn`, `InviteSkipReason`,
  `InviteOut`, `StaffPatchIn`, `SsoStatus`, `HospitalSettingsOut`,
  `SettingsEditable`, `SettingsPatchIn`, `UsagePeriod`, `ConfidenceLevel`,
  `UsageOut`, `ActivityType`, `ActivityKind`, `ActivityEventOut`,
  `ActivityQuery`, `ActivityPageOut`, `OversightItemOut`, `OversightOut`,
  `ReviewerOut` (exact shapes below).
- Produces (`lib/api/admin.ts`):
  - `type StaffAction = "deactivate" | "reactivate" | "password-reset" | "reset-mfa" | "remind" | "resend-invite"`;
  - `interface AdminClient` (13 methods below);
  - `getAdminClient(): AdminClient` (mock when `NEXT_PUBLIC_USE_MOCK=true`,
    otherwise live; the live client comes in Task 4).
- Produces (`lib/api/mock-admin.ts`): `MOCK_HOSPITAL = "Havana Hospital"`,
  `ACTIVITY_PAGE_SIZE = 50`,
  `createMockAdmin(opts?: { now?: () => number; me?: () => Promise<string | null>; delayMs?: number }): AdminClient`.
  Seeded staff ids: `s-reyes`, `s-obi`, `s-nwosu`, `s-okafor`, `s-bello`,
  `s-mensah`, `s-adeyemi`, `s-sani`, `s-eze`, `s-udo`, `s-owusu`,
  `s-danjuma`, `s-long`; correction ids `c-118`, `c-117`, `c-116`.
- Produces (`tests/admin.ts`): `makeStaff(over?: Partial<StaffOut>): StaffOut`,
  `makeEvent(over?: Partial<ActivityEventOut>): ActivityEventOut`,
  `mockAdminAs(email: string | null): AdminClient` (a `createMockAdmin` with
  `delayMs: 0`, a fixed clock and that person as "you"),
  `screenAdminAs(email: string | null): AdminClient` (the same on the real
  clock, for component tests), `ADMIN_NOW`.

- [ ] **Step 1: Write the contract and the interface**

Create `lib/api/admin-contract.ts`:

```ts
// The hospital admin API, hand-written from Plan 4's assumed contract
// (spec §10 items 2 and 3). To be replaced by types generated from the
// backend OpenAPI schema. Nothing here can carry question text, results or
// patient details: keep it that way.

export type StaffRole = "clinician" | "hospital_admin";
export type StaffStatus = "active" | "invited" | "deactivated";
export type SignInMethod = "sso" | "password_mfa" | "password";
export type StaffIssue = "mfa_not_set_up" | "invite_expired";

export interface StaffOut {
  id: string;
  full_name: string;
  display_name: string;
  email: string;
  roles: StaffRole[];
  specialty: string | null;
  can_review: boolean;
  /** Specialties they review in; empty when `can_review` is false. */
  review_specialties: string[];
  status: StaffStatus;
  issues: StaffIssue[];
  sign_in: SignInMethod | null;
  last_active_at: string | null; // ISO 8601
  joined_at: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  /** The signed-in admin's own row (the API decides, R15). */
  is_you: boolean;
  /** Sent back on edits; a stale one gets 409 `conflict` (R7). */
  version: number;
}

export interface InviteIn {
  emails: string[];
  roles: StaffRole[];
  specialty: string | null;
}
export type InviteSkipReason =
  "already_staff" | "domain_not_allowed" | "invalid_email" | "duplicate";
export interface InviteOut {
  invited: StaffOut[];
  skipped: { email: string; reason: InviteSkipReason }[];
}

export interface StaffPatchIn {
  version: number;
  roles?: StaffRole[];
  specialty?: string | null;
  can_review?: boolean;
  review_specialties?: string[];
}

export type SsoStatus = "connected" | "not_set_up" | "error";

export interface HospitalSettingsOut {
  hospital_name: string;
  review_overdue_hours: number;
  reviewers_share_specialty: boolean;
  require_mfa_for_clinicians: boolean;
  idle_timeout_minutes: number;
  allow_trust_device: boolean;
  /** Read-only here: Measured Health configures sign-in. */
  sso: { status: SsoStatus; domain: string | null };
  allowed_email_domains: string[];
  /** The hospital's specialties, for pickers. */
  specialties: string[];
  /** The choices Measured Health allows. */
  limits: { review_overdue_hours: number[]; idle_timeout_minutes: number[] };
  version: number;
}
export type SettingsEditable = Pick<
  HospitalSettingsOut,
  | "review_overdue_hours"
  | "reviewers_share_specialty"
  | "require_mfa_for_clinicians"
  | "idle_timeout_minutes"
  | "allow_trust_device"
>;
export type SettingsPatchIn = Partial<SettingsEditable> & { version: number };

export type UsagePeriod = "this_month" | "last_month" | "last_90_days";
export type ConfidenceLevel = "high" | "caution" | "review" | "failed";

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
}

export type ActivityType =
  | "sign_in"
  | "consultation"
  | "feedback"
  | "review"
  | "account"
  | "admin"
  | "security";

export type ActivityKind =
  | "signed_in"
  | "signed_in_without_mfa"
  | "sign_in_locked"
  | "consultation_run"
  | "result_agreed"
  | "correction_suggested"
  | "correction_approved"
  | "correction_rejected"
  | "correction_withdrawn"
  | "invite_sent"
  | "invite_cancelled"
  | "invite_accepted"
  | "roles_changed"
  | "specialty_changed"
  | "reviewer_changed"
  | "deactivated"
  | "reactivated"
  | "removed"
  | "password_reset_sent"
  | "mfa_reset"
  | "mfa_reminder_sent"
  | "settings_changed"
  | "reviewers_reminded"
  | "reviewer_assigned"
  | "policy_breach";

/** One audit event. Structured fields only; never free text (R9). */
export interface ActivityEventOut {
  id: string;
  at: string;
  type: ActivityType;
  /** Unknown kinds are tolerated and shown generically. */
  kind: ActivityKind | (string & {});
  /** Null for the system. */
  actor: { display_name: string } | null;
  target: { display_name: string } | null;
  specialty: string | null;
  confidence: ConfidenceLevel | null;
  /** e.g. "Chrome on Windows". */
  device: string | null;
  /** e.g. failed sign-ins before a lock. */
  count: number | null;
  flag: "policy" | "alert" | null;
}

export interface ActivityQuery {
  type?: ActivityType;
  /** Part of a name, matched against who did it and who it was done to. */
  person?: string;
  /** Events where this staff member is the actor or the target. */
  staff_id?: string;
  from?: string;
  to?: string;
  flagged?: boolean;
  cursor?: string;
  limit?: number;
}
export interface ActivityPageOut {
  events: ActivityEventOut[];
  next_cursor: string | null;
}

export interface OversightItemOut {
  id: string;
  /** Short reference, e.g. "C-118". */
  ref: string;
  suggested_by: { display_name: string };
  specialty: string | null;
  submitted_at: string;
  eligible_reviewers: number;
  assigned_to: { display_name: string } | null;
  reminded_at: string | null;
}
export interface OversightOut {
  overdue_after_hours: number;
  waiting: number;
  median_decision_hours: number | null;
  decided_this_week: number;
  items: OversightItemOut[];
  reviewers_by_specialty: { specialty: string; reviewers: number }[];
}

export interface ReviewerOut {
  id: string;
  display_name: string;
  specialty: string | null;
}
```

Create `lib/api/admin.ts`:

```ts
import type {
  ActivityPageOut,
  ActivityQuery,
  HospitalSettingsOut,
  InviteIn,
  InviteOut,
  OversightOut,
  ReviewerOut,
  SettingsPatchIn,
  StaffOut,
  StaffPatchIn,
  UsageOut,
  UsagePeriod,
} from "./admin-contract";
import type { WriteOpts } from "./contract";
import { createLiveAdminClient } from "./live-admin";
import { createMockAdmin } from "./mock-admin";

export type StaffAction =
  | "deactivate"
  | "reactivate"
  | "password-reset"
  | "reset-mfa"
  | "remind"
  | "resend-invite";

/** The hospital admin side's calls. Everything is scoped to one hospital. */
export interface AdminClient {
  listStaff(): Promise<StaffOut[]>;
  inviteStaff(i: InviteIn, opts?: WriteOpts): Promise<InviteOut>;
  updateStaff(id: string, p: StaffPatchIn, opts?: WriteOpts): Promise<StaffOut>;
  staffAction(
    id: string,
    action: StaffAction,
    opts?: WriteOpts,
  ): Promise<StaffOut>;
  removeStaff(id: string, opts?: WriteOpts): Promise<void>;
  getSettings(): Promise<HospitalSettingsOut>;
  updateSettings(
    p: SettingsPatchIn,
    opts?: WriteOpts,
  ): Promise<HospitalSettingsOut>;
  getUsage(period: UsagePeriod): Promise<UsageOut>;
  listActivity(q: ActivityQuery): Promise<ActivityPageOut>;
  getOversight(): Promise<OversightOut>;
  listEligibleReviewers(correctionId: string): Promise<ReviewerOut[]>;
  remindReviewers(correctionId: string, opts?: WriteOpts): Promise<void>;
  assignReviewer(
    correctionId: string,
    staffId: string,
    opts?: WriteOpts,
  ): Promise<void>;
}

let admin: AdminClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAdminClient(): AdminClient {
  return (admin ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAdmin()
      : createLiveAdminClient());
}
```

Create a stub `lib/api/live-admin.ts` so the import resolves (Task 4
replaces it):

```ts
import type { AdminClient } from "./admin";

/** Replaced in Task 4. */
export function createLiveAdminClient(): AdminClient {
  throw new Error("The live hospital admin client arrives in Task 4");
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/admin.ts`:

```ts
import type { AdminClient } from "@/lib/api/admin";
import type { ActivityEventOut, StaffOut } from "@/lib/api/admin-contract";
import { createMockAdmin } from "@/lib/api/mock-admin";

/** The sample hospital's clock in tests: 16 Oct 2026, 10:00 UTC. */
export const ADMIN_NOW = Date.UTC(2026, 9, 16, 10, 0, 0);

export function makeStaff(over: Partial<StaffOut> = {}): StaffOut {
  return {
    id: "s-test",
    full_name: "Dr. Test Person",
    display_name: "Dr. Person",
    email: "t.person@havanahospital.org",
    roles: ["clinician"],
    specialty: "Internal Medicine",
    can_review: false,
    review_specialties: [],
    status: "active",
    issues: [],
    sign_in: "sso",
    last_active_at: new Date(ADMIN_NOW - 3_600_000).toISOString(),
    joined_at: new Date(ADMIN_NOW - 90 * 86_400_000).toISOString(),
    invited_at: null,
    invite_expires_at: null,
    is_you: false,
    version: 1,
    ...over,
  };
}

export function makeEvent(
  over: Partial<ActivityEventOut> = {},
): ActivityEventOut {
  return {
    id: "e-test",
    at: new Date(ADMIN_NOW - 600_000).toISOString(),
    type: "sign_in",
    kind: "signed_in",
    actor: { display_name: "Dr. Okafor" },
    target: null,
    specialty: null,
    confidence: null,
    device: null,
    count: null,
    flag: null,
    ...over,
  };
}

/** The sample hospital, instant, at ADMIN_NOW, with `email` as "you". */
export const mockAdminAs = (email: string | null): AdminClient =>
  createMockAdmin({
    now: () => ADMIN_NOW,
    me: async () => email,
    delayMs: 0,
  });

/** The same on the real clock, for screens (they read `Date.now()`). */
export const screenAdminAs = (email: string | null): AdminClient =>
  createMockAdmin({ me: async () => email, delayMs: 0 });
```

Create `lib/api/mock-admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { ADMIN_NOW, mockAdminAs } from "@/tests/admin";
import { ApiError } from "./errors";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
  return "ok";
};
const director = () => mockAdminAs(DEMO_EMAILS.director);
const row = async (a: ReturnType<typeof director>, id: string) =>
  (await a.listStaff()).find((s) => s.id === id)!;

describe("the sample hospital", () => {
  it("lists 13 synthetic staff and marks who you are", async () => {
    const a = director();
    const staff = await a.listStaff();
    expect(staff).toHaveLength(13);
    expect(staff.filter((s) => s.is_you).map((s) => s.id)).toEqual(["s-obi"]);
    expect(
      (await mockAdminAs(DEMO_EMAILS.hospitalAdmin).listStaff()).find(
        (s) => s.is_you,
      )?.id,
    ).toBe("s-nwosu");
    expect((await mockAdminAs(null).listStaff()).some((s) => s.is_you)).toBe(
      false,
    );
  });

  it("has the states the screens need", async () => {
    const staff = await director().listStaff();
    const by = (id: string) => staff.find((s) => s.id === id)!;
    expect(by("s-mensah").issues).toEqual(["mfa_not_set_up"]);
    expect(by("s-adeyemi")).toMatchObject({ status: "invited" });
    expect(Date.parse(by("s-adeyemi").invite_expires_at!)).toBeGreaterThan(
      ADMIN_NOW,
    );
    expect(by("s-sani").issues).toEqual(["invite_expired"]);
    expect(by("s-eze").status).toBe("deactivated");
    expect(by("s-nwosu").roles).toEqual(["hospital_admin"]);
    expect(by("s-obi").roles).toEqual(["clinician", "hospital_admin"]);
  });

  it("returns copies, so a caller can't change the hospital by accident", async () => {
    const a = director();
    (await a.listStaff())[0]!.full_name = "changed";
    expect((await a.listStaff())[0]!.full_name).not.toBe("changed");
  });

  it("refuses changes to your own access (403 self_change)", async () => {
    const a = director();
    const me = await row(a, "s-obi");
    expect(await code(a.staffAction("s-obi", "deactivate"))).toBe(
      "403 self_change",
    );
    expect(await code(a.removeStaff("s-obi"))).toBe("403 self_change");
    expect(
      await code(
        a.updateStaff("s-obi", { version: me.version, roles: ["clinician"] }),
      ),
    ).toBe("403 self_change");
    // Your specialty is still yours to change.
    expect(
      await code(
        a.updateStaff("s-obi", { version: me.version, specialty: "Surgery" }),
      ),
    ).toBe("ok");
  });

  it("keeps at least one active hospital admin (409 last_admin)", async () => {
    // An admin who isn't on the list, so "yourself" never applies here.
    const a = mockAdminAs(null);
    await a.staffAction("s-nwosu", "deactivate");
    // Dr. Obi is now the only active hospital admin.
    expect(await code(a.staffAction("s-obi", "deactivate"))).toBe(
      "409 last_admin",
    );
    expect(await code(a.removeStaff("s-obi"))).toBe("409 last_admin");
    const obi = await row(a, "s-obi");
    expect(
      await code(
        a.updateStaff("s-obi", { version: obi.version, roles: ["clinician"] }),
      ),
    ).toBe("409 last_admin");
    expect(await code(a.staffAction("s-nwosu", "reactivate"))).toBe("ok");
    expect(await code(a.staffAction("s-obi", "deactivate"))).toBe("ok");
  });

  it("a stale version is refused (409 conflict), and an unknown id is 404", async () => {
    const a = director();
    const before = await row(a, "s-bello");
    await a.updateStaff("s-bello", {
      version: before.version,
      specialty: "Cardiology",
    });
    expect(
      await code(
        a.updateStaff("s-bello", {
          version: before.version,
          specialty: "Surgery",
        }),
      ),
    ).toBe("409 conflict");
    expect(await code(a.staffAction("nobody", "deactivate"))).toBe(
      "404 not_found",
    );
    expect(await code(a.removeStaff("nobody"))).toBe("404 not_found");
  });

  it("deactivates, reactivates and removes, each recorded in the log", async () => {
    const a = director();
    expect((await a.staffAction("s-bello", "deactivate")).status).toBe(
      "deactivated",
    );
    expect(await code(a.staffAction("s-bello", "deactivate"))).toBe(
      "409 conflict",
    );
    expect((await a.staffAction("s-bello", "reactivate")).status).toBe(
      "active",
    );
    await a.removeStaff("s-eze");
    expect((await a.listStaff()).some((s) => s.id === "s-eze")).toBe(false);
    const log = (await a.listActivity({ type: "admin" })).events.map(
      (e) => e.kind,
    );
    expect(log.slice(0, 3)).toEqual(["removed", "reactivated", "deactivated"]);
  });

  it("resets 2-step, reminds, and resends an expired invite for 7 days", async () => {
    const a = director();
    expect((await a.staffAction("s-bello", "reset-mfa")).issues).toContain(
      "mfa_not_set_up",
    );
    expect(await code(a.staffAction("s-okafor", "reset-mfa"))).toBe(
      "409 conflict",
    ); // hospital account
    expect(await code(a.staffAction("s-mensah", "remind"))).toBe("ok");
    expect(await code(a.staffAction("s-okafor", "remind"))).toBe(
      "409 conflict",
    );
    const sani = await a.staffAction("s-sani", "resend-invite");
    expect(sani.issues).toEqual([]);
    expect(Date.parse(sani.invite_expires_at!)).toBe(
      ADMIN_NOW + 7 * 86_400_000,
    );
  });

  it("invites new people and skips what it can't invite", async () => {
    const a = director();
    const r = await a.inviteStaff({
      emails: [
        "n.ade@havanahospital.org",
        "N.Ade@havanahospital.org",
        "k.mensah@havanahospital.org",
        "j.eze@havanahospital.org",
        "someone@gmail.com",
        "not-an-email",
      ],
      roles: ["clinician"],
      specialty: "Paediatrics",
    });
    expect(r.invited.map((s) => s.email)).toEqual(["n.ade@havanahospital.org"]);
    expect(r.invited[0]).toMatchObject({
      status: "invited",
      specialty: "Paediatrics",
    });
    expect(r.skipped).toEqual([
      { email: "n.ade@havanahospital.org", reason: "duplicate" },
      { email: "k.mensah@havanahospital.org", reason: "already_staff" },
      { email: "j.eze@havanahospital.org", reason: "already_staff" },
      { email: "someone@gmail.com", reason: "domain_not_allowed" },
      { email: "not-an-email", reason: "invalid_email" },
    ]);
  });

  it("saves settings within the limits, and refuses a stale save", async () => {
    const a = director();
    const s = await a.getSettings();
    expect(s.sso).toEqual({
      status: "connected",
      domain: "havanahospital.org",
    });
    const saved = await a.updateSettings({
      version: s.version,
      allow_trust_device: false,
    });
    expect(saved).toMatchObject({
      allow_trust_device: false,
      version: s.version + 1,
    });
    expect(
      await code(
        a.updateSettings({ version: s.version, idle_timeout_minutes: 5 }),
      ),
    ).toBe("409 conflict");
    expect(
      await code(
        a.updateSettings({ version: saved.version, idle_timeout_minutes: 7 }),
      ),
    ).toBe("422 invalid");
  });

  it("gives usage as counts that add up", async () => {
    const u = await director().getUsage("this_month");
    const c = u.confidence;
    expect(c.high + c.caution + c.review + c.failed).toBe(u.consultations);
    expect(u.by_specialty.reduce((n, s) => n + s.consultations, 0)).toBe(
      u.consultations,
    );
  });

  it("pages the activity log and filters it", async () => {
    const a = director();
    const first = await a.listActivity({});
    expect(first.events).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();
    const second = await a.listActivity({ cursor: first.next_cursor! });
    expect(second.events[0]!.id).not.toBe(first.events[0]!.id);
    const flagged = (await a.listActivity({ flagged: true })).events;
    expect(flagged.map((e) => e.flag).sort()).toEqual(["alert", "policy"]);
    const okafor = (await a.listActivity({ person: "okafor" })).events;
    expect(okafor.length).toBeGreaterThan(0);
    expect(
      okafor.every((e) =>
        `${e.actor?.display_name} ${e.target?.display_name}`.includes("Okafor"),
      ),
    ).toBe(true);
  });

  it("oversees waiting corrections without clinical content", async () => {
    const a = director();
    const o = await a.getOversight();
    expect(
      o.items.map((i) => [i.ref, i.specialty, i.eligible_reviewers]),
    ).toEqual([
      ["C-118", "Paediatrics", 1],
      ["C-117", "Internal Medicine", 3],
      ["C-116", "Infectious disease", 2],
    ]);
    expect(JSON.stringify(o)).not.toMatch(
      /question|diagnosis|response|symptom/i,
    );
    const reviewers = await a.listEligibleReviewers("c-118");
    expect(reviewers.map((r) => r.display_name)).toEqual(["Dr. Udo"]);
    expect(await code(a.assignReviewer("c-118", "s-bello"))).toBe(
      "422 not_eligible",
    );
    await a.assignReviewer("c-118", "s-udo");
    await a.remindReviewers("c-117");
    const after = await a.getOversight();
    expect(after.items[0]!.assigned_to).toEqual({ display_name: "Dr. Udo" });
    expect(after.items[1]!.reminded_at).not.toBeNull();
    expect(await code(a.remindReviewers("c-999"))).toBe("404 not_found");
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/api/mock-admin.test.ts`
Expected: FAIL: `Cannot find module './mock-admin'` (via `tests/admin.ts`).

- [ ] **Step 4: Build the sample hospital**

Create `lib/api/mock-admin.ts`:

```ts
import { getAuthClient } from "../auth/client";
import { DEMO_EMAILS } from "../auth/mock";
import type { AdminClient, StaffAction } from "./admin";
import type {
  ActivityEventOut,
  ActivityType,
  HospitalSettingsOut,
  InviteOut,
  OversightItemOut,
  SignInMethod,
  StaffIssue,
  StaffOut,
  StaffRole,
  StaffStatus,
  UsageOut,
  UsagePeriod,
} from "./admin-contract";
import { ApiError } from "./errors";

export const MOCK_HOSPITAL = "Havana Hospital";
export const ACTIVITY_PAGE_SIZE = 50;
const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const INVITE_MS = 7 * D;
const EMAIL = /^[^\s@<>()[\]",;:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const iso = (ms: number) => new Date(ms).toISOString();
const copy = <T>(v: T): T => structuredClone(v);
const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

type Seed = {
  id: string;
  name: string;
  display: string;
  email: string;
  roles: StaffRole[];
  specialty: string | null;
  status?: StaffStatus;
  issues?: StaffIssue[];
  signIn?: SignInMethod | null;
  activeAgo?: number | null;
  inviteExpiresIn?: number;
  review?: string[];
};

function person(now: number, p: Seed): StaffOut {
  const status = p.status ?? "active";
  const review = p.review ?? [];
  const ago = p.activeAgo ?? null;
  return {
    id: p.id,
    full_name: p.name,
    display_name: p.display,
    email: p.email,
    roles: p.roles,
    specialty: p.specialty,
    can_review: review.length > 0,
    review_specialties: review,
    status,
    issues: p.issues ?? [],
    sign_in:
      p.signIn !== undefined ? p.signIn : status === "active" ? "sso" : null,
    last_active_at: ago === null ? null : iso(now - ago),
    joined_at: status === "invited" ? null : iso(now - 200 * D),
    invited_at: status === "invited" ? iso(now - 2 * D) : null,
    invite_expires_at:
      p.inviteExpiresIn === undefined ? null : iso(now + p.inviteExpiresIn),
    is_you: false,
    version: 1,
  };
}

/** 13 synthetic people at Havana Hospital. Names are invented. */
function seedStaff(now: number): StaffOut[] {
  return [
    {
      id: "s-reyes",
      name: "Dr. Ana Reyes",
      display: "Dr. Reyes",
      email: DEMO_EMAILS.clinician,
      roles: ["clinician"],
      specialty: "Internal Medicine",
      activeAgo: 0,
      review: ["Internal Medicine"],
    },
    {
      id: "s-obi",
      name: "Dr. Ngozi Obi",
      display: "Dr. Obi",
      email: DEMO_EMAILS.director,
      roles: ["clinician", "hospital_admin"],
      specialty: "Emergency medicine",
      activeAgo: 5 * MIN,
      review: ["Emergency medicine", "Infectious disease"],
    },
    {
      id: "s-nwosu",
      name: "Grace Nwosu",
      display: "Grace Nwosu",
      email: DEMO_EMAILS.hospitalAdmin,
      roles: ["hospital_admin"],
      specialty: null,
      activeAgo: 20 * MIN,
    },
    {
      id: "s-okafor",
      name: "Dr. Chidi Okafor",
      display: "Dr. Okafor",
      email: "c.okafor@havanahospital.org",
      roles: ["clinician"],
      specialty: "Infectious disease",
      activeAgo: 2 * H,
      review: ["Infectious disease"],
    },
    {
      id: "s-bello",
      name: "Dr. Tunde Bello",
      display: "Dr. Bello",
      email: "t.bello@havanahospital.org",
      roles: ["clinician"],
      specialty: "Internal Medicine",
      signIn: "password_mfa",
      activeAgo: D,
      review: ["Internal Medicine"],
    },
    {
      id: "s-mensah",
      name: "Dr. Kofi Mensah",
      display: "Dr. Mensah",
      email: "k.mensah@havanahospital.org",
      roles: ["clinician"],
      specialty: "Cardiology",
      issues: ["mfa_not_set_up"],
      signIn: "password",
      activeAgo: null,
      review: ["Cardiology", "Internal Medicine"],
    },
    {
      id: "s-adeyemi",
      name: "Dr. Funmi Adeyemi",
      display: "Dr. Adeyemi",
      email: "f.adeyemi@havanahospital.org",
      roles: ["clinician"],
      specialty: "Paediatrics",
      status: "invited",
      inviteExpiresIn: 5 * D,
    },
    {
      id: "s-sani",
      name: "Dr. Halima Sani",
      display: "Dr. Sani",
      email: "h.sani@havanahospital.org",
      roles: ["clinician"],
      specialty: "Obstetrics",
      status: "invited",
      issues: ["invite_expired"],
      inviteExpiresIn: -D,
    },
    {
      id: "s-eze",
      name: "Dr. James Eze",
      display: "Dr. Eze",
      email: "j.eze@havanahospital.org",
      roles: ["clinician"],
      specialty: "Surgery",
      status: "deactivated",
      activeAgo: 21 * D,
    },
    {
      id: "s-udo",
      name: "Dr. Amaka Udo",
      display: "Dr. Udo",
      email: "a.udo@havanahospital.org",
      roles: ["clinician"],
      specialty: "Paediatrics",
      activeAgo: 3 * H,
      review: ["Paediatrics"],
    },
    {
      id: "s-owusu",
      name: "Dr. Samuel Owusu",
      display: "Dr. Owusu",
      email: "s.owusu@havanahospital.org",
      roles: ["clinician"],
      specialty: "Emergency medicine",
      signIn: "password_mfa",
      activeAgo: 6 * H,
      review: ["Emergency medicine"],
    },
    {
      id: "s-danjuma",
      name: "Dr. Yusuf Danjuma",
      display: "Dr. Danjuma",
      email: "y.danjuma@havanahospital.org",
      roles: ["clinician"],
      specialty: "Internal Medicine",
      activeAgo: 4 * D,
      review: ["Internal Medicine"],
    },
    {
      id: "s-long",
      name: "Dr. Oluwaseun Adebayo-Ogunleye-Fashola",
      display: "Dr. Adebayo-Ogunleye-Fashola",
      email: "o.adebayo-ogunleye-fashola@havanahospital.org",
      roles: ["clinician"],
      specialty: "Infectious disease",
      activeAgo: 9 * D,
      review: ["Infectious disease"],
    },
  ].map((p) => person(now, p as Seed));
}

function seedSettings(): HospitalSettingsOut {
  return {
    hospital_name: MOCK_HOSPITAL,
    review_overdue_hours: 4,
    reviewers_share_specialty: true,
    require_mfa_for_clinicians: true,
    idle_timeout_minutes: 15,
    allow_trust_device: true,
    sso: { status: "connected", domain: "havanahospital.org" },
    allowed_email_domains: ["havanahospital.org"],
    specialties: [
      "Cardiology",
      "Emergency medicine",
      "Infectious disease",
      "Internal Medicine",
      "Obstetrics",
      "Paediatrics",
      "Surgery",
    ],
    limits: {
      review_overdue_hours: [1, 2, 4, 8, 24],
      idle_timeout_minutes: [5, 10, 15, 30],
    },
    version: 1,
  };
}

const USAGE: Record<UsagePeriod, Omit<UsageOut, "period" | "from" | "to">> = {
  this_month: {
    consultations: 1284,
    active_clinicians: 39,
    agreement_rate: 0.82,
    median_review_hours: 3.1,
    confidence: { high: 796, caution: 347, review: 103, failed: 38 },
    by_specialty: [
      { specialty: "Internal Medicine", consultations: 412 },
      { specialty: "Paediatrics", consultations: 318 },
      { specialty: "Emergency medicine", consultations: 251 },
      { specialty: "Infectious disease", consultations: 203 },
      { specialty: "Cardiology", consultations: 100 },
    ],
  },
  last_month: {
    consultations: 1102,
    active_clinicians: 36,
    agreement_rate: 0.79,
    median_review_hours: 3.6,
    confidence: { high: 650, caution: 320, review: 99, failed: 33 },
    by_specialty: [
      { specialty: "Internal Medicine", consultations: 360 },
      { specialty: "Paediatrics", consultations: 280 },
      { specialty: "Emergency medicine", consultations: 220 },
      { specialty: "Infectious disease", consultations: 160 },
      { specialty: "Cardiology", consultations: 82 },
    ],
  },
  last_90_days: {
    consultations: 3510,
    active_clinicians: 44,
    agreement_rate: 0.8,
    median_review_hours: 3.4,
    confidence: { high: 2120, caution: 960, review: 320, failed: 110 },
    by_specialty: [
      { specialty: "Internal Medicine", consultations: 1120 },
      { specialty: "Paediatrics", consultations: 860 },
      { specialty: "Emergency medicine", consultations: 700 },
      { specialty: "Infectious disease", consultations: 560 },
      { specialty: "Cardiology", consultations: 270 },
    ],
  },
};

function periodRange(
  p: UsagePeriod,
  now: number,
): { from: string; to: string } {
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (p === "this_month") return { from: iso(monthStart), to: iso(now) };
  if (p === "last_month")
    return {
      from: iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)),
      to: iso(monthStart - 1),
    };
  return { from: iso(now - 90 * D), to: iso(now) };
}

type EventSeed = Partial<ActivityEventOut> &
  Pick<ActivityEventOut, "type" | "kind"> & { ago: number };

function event(now: number, n: number, e: EventSeed): ActivityEventOut {
  const { ago, ...rest } = e;
  return {
    id: `e-${n}`,
    at: iso(now - ago),
    actor: null,
    target: null,
    specialty: null,
    confidence: null,
    device: null,
    count: null,
    flag: null,
    ...rest,
  };
}

const who = (display_name: string) => ({ display_name });

/** About 130 events over 60 days, newest first. */
function seedActivity(now: number): ActivityEventOut[] {
  const named: EventSeed[] = [
    {
      ago: 10 * MIN,
      type: "admin",
      kind: "specialty_changed",
      actor: who("Dr. Obi"),
      target: who("Dr. Mensah"),
      specialty: "Cardiology",
    },
    {
      ago: 13 * MIN,
      type: "review",
      kind: "correction_approved",
      actor: who("Dr. Okafor"),
      specialty: "Infectious disease",
    },
    {
      ago: 20 * MIN,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Bello"),
      specialty: "Internal Medicine",
      confidence: "caution",
    },
    {
      ago: 31 * MIN,
      type: "sign_in",
      kind: "signed_in_without_mfa",
      actor: who("Dr. Mensah"),
      device: "Chrome on Windows",
      flag: "policy",
    },
    {
      ago: 49 * MIN,
      type: "account",
      kind: "invite_accepted",
      actor: who("Dr. Udo"),
    },
    {
      ago: 56 * MIN,
      type: "security",
      kind: "sign_in_locked",
      target: who("Dr. Bello"),
      count: 5,
      flag: "alert",
    },
    {
      ago: 71 * MIN,
      type: "feedback",
      kind: "correction_suggested",
      actor: who("Dr. Owusu"),
      specialty: "Emergency medicine",
    },
    {
      ago: 2 * H,
      type: "sign_in",
      kind: "signed_in",
      actor: who("Dr. Reyes"),
      device: "Safari on iPhone",
    },
    {
      ago: 3 * H,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Okafor"),
      specialty: "Infectious disease",
      confidence: "high",
    },
    {
      ago: 5 * H,
      type: "feedback",
      kind: "result_agreed",
      actor: who("Dr. Udo"),
      specialty: "Paediatrics",
    },
    {
      ago: D,
      type: "consultation",
      kind: "consultation_run",
      actor: who("Dr. Danjuma"),
      specialty: "Internal Medicine",
      confidence: "review",
    },
    {
      ago: 2 * D,
      type: "admin",
      kind: "invite_sent",
      actor: who("Dr. Obi"),
      target: who("Dr. Adeyemi"),
    },
    {
      ago: 3 * D,
      type: "admin",
      kind: "settings_changed",
      actor: who("Grace Nwosu"),
    },
    {
      ago: 21 * D,
      type: "admin",
      kind: "deactivated",
      actor: who("Dr. Obi"),
      target: who("Dr. Eze"),
    },
  ];
  const people = [
    "Dr. Reyes",
    "Dr. Okafor",
    "Dr. Bello",
    "Dr. Udo",
    "Dr. Owusu",
    "Dr. Danjuma",
  ];
  const routine = Array.from({ length: 120 }, (_, i): EventSeed => ({
    ago: 4 * H + i * 12 * H,
    type: "sign_in",
    kind: "signed_in",
    actor: who(people[i % people.length]!),
    device: i % 2 ? "Chrome on Windows" : "Safari on iPhone",
  }));
  return [...named, ...routine]
    .sort((a, b) => a.ago - b.ago)
    .map((e, i) => event(now, i + 1, e));
}

type Correction = Omit<OversightItemOut, "eligible_reviewers"> & {
  suggesterId: string;
};

function seedCorrections(now: number): Correction[] {
  return [
    {
      id: "c-118",
      ref: "C-118",
      suggested_by: who("Dr. Reyes"),
      suggesterId: "s-reyes",
      specialty: "Paediatrics",
      submitted_at: iso(now - 5 * H),
      assigned_to: null,
      reminded_at: null,
    },
    {
      id: "c-117",
      ref: "C-117",
      suggested_by: who("Dr. Bello"),
      suggesterId: "s-bello",
      specialty: "Internal Medicine",
      submitted_at: iso(now - 3 * H),
      assigned_to: null,
      reminded_at: null,
    },
    {
      id: "c-116",
      ref: "C-116",
      suggested_by: who("Dr. Okafor"),
      suggesterId: "s-okafor",
      specialty: "Infectious disease",
      submitted_at: iso(now - 42 * MIN),
      assigned_to: null,
      reminded_at: null,
    },
  ];
}

/**
 * The demo's hospital admin API: one hospital, memory only (a reload resets
 * it), never stored. It enforces the same guards the backend must (R5, R7).
 */
export function createMockAdmin({
  now = () => Date.now(),
  me = async () => (await getAuthClient().getSession())?.user.email ?? null,
  delayMs = 150,
}: {
  now?: () => number;
  me?: () => Promise<string | null>;
  delayMs?: number;
} = {}): AdminClient {
  let staff = seedStaff(now());
  let settings = seedSettings();
  let activity = seedActivity(now());
  const corrections = seedCorrections(now());
  let nextId = 1;

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };
  const youEmail = async () => (await me())?.toLowerCase() ?? null;
  const mark = async (rows: StaffOut[]) => {
    const email = await youEmail();
    return rows.map((s) => ({
      ...copy(s),
      is_you: email !== null && s.email.toLowerCase() === email,
    }));
  };
  const find = (id: string) =>
    staff.find((s) => s.id === id) ?? fail(404, "not_found");
  const isYou = async (s: StaffOut) =>
    s.email.toLowerCase() === (await youEmail());
  const activeAdmins = () =>
    staff.filter(
      (s) => s.status === "active" && s.roles.includes("hospital_admin"),
    ).length;
  const isLastAdmin = (s: StaffOut) =>
    s.status === "active" &&
    s.roles.includes("hospital_admin") &&
    activeAdmins() <= 1;
  const actorName = async () => {
    const email = await youEmail();
    return (
      staff.find((s) => s.email.toLowerCase() === email)?.display_name ??
      "Hospital admin"
    );
  };
  const log = async (
    type: ActivityType,
    kind: ActivityEventOut["kind"],
    extra: Partial<ActivityEventOut> = {},
  ) => {
    activity = [
      event(now(), 10_000 + nextId++, {
        ago: 0,
        type,
        kind,
        actor: who(await actorName()),
        ...extra,
      }),
      ...activity,
    ];
  };
  const save = (s: StaffOut): StaffOut => {
    const next = { ...s, version: s.version + 1 };
    staff = staff.map((x) => (x.id === s.id ? next : x));
    return next;
  };
  const reply = async (s: StaffOut) => (await mark([s]))[0]!;

  const reviewersFor = (c: Correction) =>
    staff.filter(
      (s) =>
        s.status === "active" &&
        s.roles.includes("clinician") &&
        s.can_review &&
        s.id !== c.suggesterId &&
        (!settings.reviewers_share_specialty ||
          (c.specialty !== null && s.review_specialties.includes(c.specialty))),
    );
  const findCorrection = (id: string) =>
    corrections.find((c) => c.id === id) ?? fail(404, "not_found");

  return {
    async listStaff() {
      await wait();
      return mark(staff);
    },

    async inviteStaff({ emails, roles, specialty }) {
      await wait();
      const out: InviteOut = { invited: [], skipped: [] };
      const seen = new Set<string>();
      const domains = settings.allowed_email_domains;
      for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        const skip = (reason: InviteOut["skipped"][number]["reason"]) =>
          out.skipped.push({
            email: reason === "invalid_email" ? raw : email,
            reason,
          });
        if (!EMAIL.test(email)) {
          skip("invalid_email");
          continue;
        }
        if (seen.has(email)) {
          skip("duplicate");
          continue;
        }
        seen.add(email);
        if (staff.some((s) => s.email.toLowerCase() === email)) {
          skip("already_staff");
          continue;
        }
        if (domains.length && !domains.includes(email.split("@")[1]!)) {
          skip("domain_not_allowed");
          continue;
        }
        const row: StaffOut = {
          ...person(now(), {
            id: `s-new-${nextId++}`,
            name: email,
            display: email,
            email,
            roles: [...roles],
            specialty,
            status: "invited",
          }),
          invite_expires_at:
            settings.sso.status === "connected" ? null : iso(now() + INVITE_MS),
        };
        staff = [...staff, row];
        out.invited.push(row);
        await log("admin", "invite_sent", { target: who(email) });
      }
      return { invited: await mark(out.invited), skipped: out.skipped };
    },

    async updateStaff(id, p) {
      await wait();
      const s = find(id);
      if (p.version !== s.version) fail(409, "conflict");
      if (p.roles) {
        if (!p.roles.length) fail(422, "invalid");
        const drops = !p.roles.includes("hospital_admin");
        if (drops && s.roles.includes("hospital_admin")) {
          if (await isYou(s)) fail(403, "self_change");
          if (isLastAdmin(s)) fail(409, "last_admin");
        }
      }
      const next = save({
        ...s,
        ...(p.roles ? { roles: [...p.roles] } : {}),
        ...(p.specialty !== undefined ? { specialty: p.specialty } : {}),
        ...(p.can_review !== undefined ? { can_review: p.can_review } : {}),
        ...(p.review_specialties
          ? { review_specialties: [...p.review_specialties] }
          : {}),
      });
      const target = who(s.display_name);
      if (p.roles) await log("admin", "roles_changed", { target });
      if (p.specialty !== undefined)
        await log("admin", "specialty_changed", {
          target,
          specialty: p.specialty,
        });
      if (p.can_review !== undefined || p.review_specialties)
        await log("admin", "reviewer_changed", { target });
      return reply(next);
    },

    async staffAction(id, action: StaffAction) {
      await wait();
      const s = find(id);
      const target = who(s.display_name);
      const passwordUser = s.status === "active" && s.sign_in !== "sso";
      switch (action) {
        case "deactivate": {
          if (await isYou(s)) fail(403, "self_change");
          if (s.status !== "active") fail(409, "conflict");
          if (isLastAdmin(s)) fail(409, "last_admin");
          await log("admin", "deactivated", { target });
          return reply(save({ ...s, status: "deactivated" }));
        }
        case "reactivate": {
          if (s.status !== "deactivated") fail(409, "conflict");
          await log("admin", "reactivated", { target });
          return reply(save({ ...s, status: "active" }));
        }
        case "password-reset": {
          if (!passwordUser) fail(409, "conflict");
          await log("admin", "password_reset_sent", { target });
          return reply(save(s));
        }
        case "reset-mfa": {
          if (!passwordUser) fail(409, "conflict");
          await log("admin", "mfa_reset", { target });
          return reply(
            save({
              ...s,
              sign_in: "password",
              issues: [...new Set<StaffIssue>([...s.issues, "mfa_not_set_up"])],
            }),
          );
        }
        case "remind": {
          if (!s.issues.includes("mfa_not_set_up")) fail(409, "conflict");
          await log("admin", "mfa_reminder_sent", { target });
          return reply(save(s));
        }
        case "resend-invite": {
          if (s.status !== "invited") fail(409, "conflict");
          await log("admin", "invite_sent", { target });
          return reply(
            save({
              ...s,
              issues: s.issues.filter((i) => i !== "invite_expired"),
              invited_at: iso(now()),
              invite_expires_at: iso(now() + INVITE_MS),
            }),
          );
        }
      }
    },

    async removeStaff(id) {
      await wait();
      const s = find(id);
      if (await isYou(s)) fail(403, "self_change");
      if (isLastAdmin(s)) fail(409, "last_admin");
      staff = staff.filter((x) => x.id !== id);
      await log(
        "admin",
        s.status === "invited" ? "invite_cancelled" : "removed",
        { target: who(s.display_name) },
      );
    },

    async getSettings() {
      await wait();
      return copy(settings);
    },

    async updateSettings(p) {
      await wait();
      if (p.version !== settings.version) fail(409, "conflict");
      if (
        (p.review_overdue_hours !== undefined &&
          !settings.limits.review_overdue_hours.includes(
            p.review_overdue_hours,
          )) ||
        (p.idle_timeout_minutes !== undefined &&
          !settings.limits.idle_timeout_minutes.includes(
            p.idle_timeout_minutes,
          ))
      )
        fail(422, "invalid");
      settings = { ...settings, ...p, version: settings.version + 1 };
      await log("admin", "settings_changed");
      return copy(settings);
    },

    async getUsage(period) {
      await wait();
      return { period, ...periodRange(period, now()), ...copy(USAGE[period]) };
    },

    async listActivity(q) {
      await wait();
      const term = q.person ? fold(q.person) : null;
      const staffName = q.staff_id
        ? (staff.find((s) => s.id === q.staff_id)?.display_name ?? "")
        : null;
      const from = q.from ? Date.parse(q.from) : -Infinity;
      const to = q.to ? Date.parse(q.to) : Infinity;
      const all = activity.filter((e) => {
        const t = Date.parse(e.at);
        const names = [e.actor?.display_name, e.target?.display_name];
        return (
          (!q.type || e.type === q.type) &&
          (!q.flagged || e.flag !== null) &&
          t >= from &&
          t <= to &&
          (!term || names.some((n) => n && fold(n).includes(term))) &&
          (staffName === null || names.includes(staffName))
        );
      });
      const start = q.cursor ? Number(q.cursor) : 0;
      const size = Math.min(q.limit ?? ACTIVITY_PAGE_SIZE, ACTIVITY_PAGE_SIZE);
      const end = start + size;
      return {
        events: copy(all.slice(start, end)),
        next_cursor: end < all.length ? String(end) : null,
      };
    },

    async getOversight() {
      await wait();
      const items: OversightItemOut[] = corrections.map((c) => ({
        id: c.id,
        ref: c.ref,
        suggested_by: copy(c.suggested_by),
        specialty: c.specialty,
        submitted_at: c.submitted_at,
        assigned_to: c.assigned_to ? copy(c.assigned_to) : null,
        reminded_at: c.reminded_at,
        eligible_reviewers: reviewersFor(c).length,
      }));
      const reviewers = settings.specialties
        .map((specialty) => ({
          specialty,
          reviewers: staff.filter(
            (s) =>
              s.status === "active" &&
              s.can_review &&
              s.review_specialties.includes(specialty),
          ).length,
        }))
        .sort((a, b) => b.reviewers - a.reviewers);
      return {
        overdue_after_hours: settings.review_overdue_hours,
        waiting: items.length,
        median_decision_hours: 3.1,
        decided_this_week: 12,
        items,
        reviewers_by_specialty: reviewers,
      };
    },

    async listEligibleReviewers(id) {
      await wait();
      return reviewersFor(findCorrection(id)).map((s) => ({
        id: s.id,
        display_name: s.display_name,
        specialty: s.specialty,
      }));
    },

    async remindReviewers(id) {
      await wait();
      const c = findCorrection(id);
      c.reminded_at = iso(now());
      await log("review", "reviewers_reminded", { specialty: c.specialty });
    },

    async assignReviewer(id, staffId) {
      await wait();
      const c = findCorrection(id);
      const r = reviewersFor(c).find((s) => s.id === staffId);
      if (!r) fail(422, "not_eligible");
      c.assigned_to = who(r!.display_name);
      await log("review", "reviewer_assigned", {
        target: who(r!.display_name),
        specialty: c.specialty,
      });
    },
  };
}
```

Note on the sample list: rows are written one per line for reading; Prettier
reflows them, which is fine.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/api/mock-admin.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/api/admin-contract.ts lib/api/admin.ts lib/api/live-admin.ts lib/api/mock-admin.ts lib/api/mock-admin.test.ts tests/admin.ts
git commit -m "Add the hospital admin contract and the sample hospital"
```

---

### Task 4: The live admin client, the BFF routes and the backend asks

**Files:**

- Modify: `lib/api/live-admin.ts` (replace the stub),
  `app/api/v1/[...path]/route.ts`, `app/api/v1/proxy.test.ts`,
  `docs/specs/2026-10-13-ui-design-v3.md` (§10 items 2, 3, 7; §11),
  `ARCHITECTURE.md` (§2, §4.7)
- Create: `lib/api/live-admin.test.ts`
- Test: `lib/api/live-admin.test.ts`, `app/api/v1/proxy.test.ts`

**Interfaces:**

- Consumes: `AdminClient`, `StaffAction` (Task 3), `ApiError`,
  `reportUnauthorized` (`lib/auth/events.ts`), `canUse`, `Area` (Task 1);
  the proxy's helpers and test helpers (`ctx`, `get`, `post`, `session`,
  `fetchMock`).
- Produces:
  - `createLiveAdminClient({ fetchImpl }?: { fetchImpl?: typeof fetch }): AdminClient`,
    calling `/api/v1/hospital/*`;
  - in the proxy: `hospitalShape(method, path)` (module private), exports
    `PATCH` and `DELETE`, and the per-area role rule: `hospital/*` needs
    `canUse(user, "admin")`, everything else `canUse(user, "clinical")`.
    Clinical paths stay `GET`/`POST` only.

The proxy forwards exactly these hospital shapes (anything else under
`hospital` is 404 without calling the API):

| Method   | Path                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `hospital/staff`, `hospital/settings`, `hospital/usage`, `hospital/activity`, `hospital/review-oversight`, `hospital/corrections/{id}/eligible-reviewers`          |
| `POST`   | `hospital/staff/invites`, `hospital/staff/{id}/{deactivate,reactivate,password-reset,reset-mfa,remind,resend-invite}`, `hospital/corrections/{id}/{remind,assign}` |
| `PATCH`  | `hospital/staff/{id}`, `hospital/settings`                                                                                                                         |
| `DELETE` | `hospital/staff/{id}`                                                                                                                                              |

- [ ] **Step 1: Write the failing tests**

Create `lib/api/live-admin.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import { ApiError } from "./errors";
import { createLiveAdminClient } from "./live-admin";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAdminClient({ fetchImpl });
const call = (n = 0) => fetchImpl.mock.calls[n] as [string, RequestInit];
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
});

describe("live admin client", () => {
  it("reads through the hospital routes", async () => {
    fetchImpl.mockResolvedValue(Response.json([]));
    await client().listStaff();
    await client().getUsage("last_month");
    await client().getOversight();
    await client().listEligibleReviewers("c 1");
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/hospital/staff",
      "/api/v1/hospital/usage?period=last_month",
      "/api/v1/hospital/review-oversight",
      "/api/v1/hospital/corrections/c%201/eligible-reviewers",
    ]);
    expect(call()[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("puts only the filters that are set in the activity query", async () => {
    fetchImpl.mockResolvedValue(
      Response.json({ events: [], next_cursor: null }),
    );
    await client().listActivity({});
    await client().listActivity({
      type: "security",
      person: "Dr. O'Neil & co",
      flagged: true,
      from: "2026-10-01T00:00:00.000Z",
      cursor: "50",
    });
    expect(call(0)[0]).toBe("/api/v1/hospital/activity");
    expect(call(1)[0]).toBe(
      "/api/v1/hospital/activity?type=security&person=Dr.+O%27Neil+%26+co&from=2026-10-01T00%3A00%3A00.000Z&flagged=true&cursor=50",
    );
  });

  it("sends writes with their idempotency key", async () => {
    fetchImpl.mockResolvedValue(Response.json({ id: "s-1" }));
    await client().updateStaff(
      "s-1",
      { version: 3, specialty: "Surgery" },
      { idempotencyKey: "k-1" },
    );
    expect(call()).toEqual([
      "/api/v1/hospital/staff/s-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ version: 3, specialty: "Surgery" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "k-1",
        }),
      }),
    ]);
    await client().staffAction("s-1", "reset-mfa", { idempotencyKey: "k-2" });
    expect(call(1)[0]).toBe("/api/v1/hospital/staff/s-1/reset-mfa");
    expect(call(1)[1].body).toBeUndefined();
  });

  it("removes with DELETE and accepts an empty 204", async () => {
    fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      client().removeStaff("s-1", { idempotencyKey: "k-3" }),
    ).resolves.toBeUndefined();
    expect(call()[1].method).toBe("DELETE");
    await client().assignReviewer("c-1", "s-2");
    expect(call(1)).toEqual([
      "/api/v1/hospital/corrections/c-1/assign",
      expect.objectContaining({ body: JSON.stringify({ staff_id: "s-2" }) }),
    ]);
  });

  it("turns refusals into coded errors", async () => {
    fetchImpl.mockResolvedValueOnce(
      Response.json({ code: "last_admin" }, { status: 409 }),
    );
    await expect(client().staffAction("s-1", "deactivate")).rejects.toEqual(
      new ApiError(409, "last_admin"),
    );
    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    await expect(client().listStaff()).rejects.toEqual(
      new ApiError(0, "network"),
    );
  });

  it("signs out once on 401", async () => {
    fetchImpl.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(client().getSettings()).rejects.toEqual(
      new ApiError(401, "session_expired"),
    );
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });
});
```

In `app/api/v1/proxy.test.ts`, change the `TEST_USER` import line to also
import the role type
(`import type { Role } from "@/lib/auth/types";`), change
`import { GET, POST } from "./[...path]/route";` to
`import { DELETE, GET, PATCH, POST } from "./[...path]/route";`, and append
after the last `describe`:

```ts
describe("hospital admin routes", () => {
  const as = (...roles: Role[]) =>
    writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles },
      steps: [],
    });
  const send = (
    method: string,
    body?: string,
    origin = "http://demo.test",
    extra: Record<string, string> = {},
  ) =>
    new Request("http://demo.test/api/v1/hospital", {
      method,
      headers: {
        host: "demo.test",
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body,
    });
  const run = (method: string, path: string[]) => {
    const c = ctx("hospital", ...path);
    if (method === "GET") return GET(get(), c);
    if (method === "POST") return POST(send("POST", "{}"), c);
    if (method === "PATCH") return PATCH(send("PATCH", "{}"), c);
    return DELETE(send("DELETE"), c);
  };

  it.each([
    ["GET", ["staff"]],
    ["GET", ["settings"]],
    ["GET", ["usage"]],
    ["GET", ["activity"]],
    ["GET", ["review-oversight"]],
    ["GET", ["corrections", "c-1", "eligible-reviewers"]],
    ["POST", ["staff", "invites"]],
    ["POST", ["staff", "s-1", "deactivate"]],
    ["POST", ["staff", "s-1", "reactivate"]],
    ["POST", ["staff", "s-1", "password-reset"]],
    ["POST", ["staff", "s-1", "reset-mfa"]],
    ["POST", ["staff", "s-1", "remind"]],
    ["POST", ["staff", "s-1", "resend-invite"]],
    ["POST", ["corrections", "c-1", "remind"]],
    ["POST", ["corrections", "c-1", "assign"]],
    ["PATCH", ["staff", "s-1"]],
    ["PATCH", ["settings"]],
    ["DELETE", ["staff", "s-1"]],
  ])("forwards %s %j for a hospital admin", async (method, path) => {
    await as("hospital_admin");
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res = await run(method, path);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/v1/hospital/${path.join("/")}`);
    expect(init.method).toBe(method);
  });

  it.each([
    ["GET", []],
    ["GET", ["staff", "s-1"]],
    ["POST", ["staff"]],
    ["POST", ["staff", "s-1"]],
    ["POST", ["staff", "s-1", "delete"]],
    ["POST", ["staff", "invites", "deactivate"]],
    ["PATCH", ["staff"]],
    ["PATCH", ["staff", "invites"]],
    ["DELETE", ["staff", "invites"]],
    ["DELETE", ["settings"]],
    ["POST", ["settings"]],
    ["GET", ["corrections", "c-1", "assign"]],
    ["POST", ["corrections", "c-1", "approve"]],
    ["POST", ["staff", "s-1", "deactivate", "x"]],
    ["GET", ["users"]],
    ["POST", ["staff", "s.1", "deactivate"]],
  ])("refuses %s %j without calling the API", async (method, path) => {
    await as("hospital_admin");
    const res = await run(method, path);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses PATCH and DELETE on clinical routes", async () => {
    await session();
    for (const res of [
      await PATCH(send("PATCH", "{}"), ctx("queries", "q1")),
      await DELETE(send("DELETE"), ctx("corrections", "c-1", "approve")),
    ])
      expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses clinical calls for an admin-only session, without calling the API", async () => {
    await as("hospital_admin");
    for (const res of [
      await GET(get(), ctx("queries", "q1")),
      await GET(get(), ctx("corrections")),
      await GET(get(), ctx("readyz")),
      await POST(post("{}"), ctx("feedback")),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses hospital calls for a clinician or a platform admin", async () => {
    for (const roles of [
      ["clinician"],
      ["admin"],
      ["auditor", "hospital_admin"],
    ] as Role[][]) {
      await as(...roles);
      expect((await GET(get(), ctx("hospital", "staff"))).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a medical director use both sides", async () => {
    await as("clinician", "hospital_admin");
    fetchMock.mockImplementation(async () => Response.json({}));
    expect((await GET(get(), ctx("hospital", "staff"))).status).toBe(200);
    expect((await GET(get(), ctx("queries", "q1"))).status).toBe(200);
  });

  it("refuses an admin who owes first sign-in steps", async () => {
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles: ["hospital_admin"] },
      steps: ["mfa"],
    });
    expect((await GET(get(), ctx("hospital", "staff"))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guards writes from other sites and passes the key and filters through", async () => {
    await as("hospital_admin");
    expect(
      (
        await DELETE(
          send("DELETE", undefined, "https://evil.test"),
          ctx("hospital", "staff", "s-1"),
        )
      ).status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await DELETE(
      send("DELETE", undefined, "http://demo.test", {
        "Idempotency-Key": "k-7",
      }),
      ctx("hospital", "staff", "s-1"),
    );
    expect(res.status).toBe(204);
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({ "Idempotency-Key": "k-7" });
    fetchMock.mockResolvedValue(Response.json({ events: [] }));
    await GET(
      get(
        "http://demo.test/api/v1/hospital/activity?type=security&flagged=true",
      ),
      ctx("hospital", "activity"),
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "http://api.test/api/v1/hospital/activity?type=security&flagged=true",
    );
  });

  it("keeps only the refusal code", async () => {
    await as("hospital_admin");
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "last_admin", detail: "user 7 is the only admin" },
        { status: 409 },
      ),
    );
    const res = await run("POST", ["staff", "s-1", "deactivate"]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "last_admin" });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/api/live-admin.test.ts app/api/v1/proxy.test.ts`
Expected: FAIL. The live client is the Task 3 stub ("arrives in Task 4");
the proxy has no `PATCH` or `DELETE` export and answers `hospital/*` with 404.

- [ ] **Step 3: The live client**

Replace `lib/api/live-admin.ts` with:

```ts
import { reportUnauthorized } from "../auth/events";
import type { AdminClient } from "./admin";
import type { ActivityQuery } from "./admin-contract";
import type { WriteOpts } from "./contract";
import { ApiError } from "./errors";

/** The hospital admin API through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveAdminClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AdminClient {
  async function ok<T>(
    path: string,
    method = "GET",
    body?: unknown,
    opts?: WriteOpts,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`/api/v1/hospital${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(opts?.idempotencyKey
            ? { "Idempotency-Key": opts.idempotencyKey }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.status === 401) {
      reportUnauthorized();
      throw new ApiError(401, "session_expired");
    }
    const data = (
      res.status === 204 ? null : await res.json().catch(() => null)
    ) as { code?: unknown } | null;
    if (!res.ok)
      throw new ApiError(
        res.status,
        typeof data?.code === "string" ? data.code : "error",
      );
    return data as T;
  }

  const id = encodeURIComponent;
  const query = (q: ActivityQuery) => {
    const p = new URLSearchParams();
    if (q.type) p.set("type", q.type);
    if (q.person) p.set("person", q.person);
    if (q.staff_id) p.set("staff_id", q.staff_id);
    if (q.from) p.set("from", q.from);
    if (q.to) p.set("to", q.to);
    if (q.flagged) p.set("flagged", "true");
    if (q.cursor) p.set("cursor", q.cursor);
    if (q.limit) p.set("limit", String(q.limit));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return {
    listStaff: () => ok("/staff"),
    inviteStaff: (i, o) => ok("/staff/invites", "POST", i, o),
    updateStaff: (s, p, o) => ok(`/staff/${id(s)}`, "PATCH", p, o),
    staffAction: (s, a, o) => ok(`/staff/${id(s)}/${a}`, "POST", undefined, o),
    async removeStaff(s, o) {
      await ok(`/staff/${id(s)}`, "DELETE", undefined, o);
    },
    getSettings: () => ok("/settings"),
    updateSettings: (p, o) => ok("/settings", "PATCH", p, o),
    getUsage: (period) => ok(`/usage?period=${id(period)}`),
    listActivity: (q) => ok(`/activity${query(q)}`),
    getOversight: () => ok("/review-oversight"),
    listEligibleReviewers: (c) =>
      ok(`/corrections/${id(c)}/eligible-reviewers`),
    async remindReviewers(c, o) {
      await ok(`/corrections/${id(c)}/remind`, "POST", undefined, o);
    },
    async assignReviewer(c, staffId, o) {
      await ok(
        `/corrections/${id(c)}/assign`,
        "POST",
        { staff_id: staffId },
        o,
      );
    },
  };
}
```

- [ ] **Step 4: The proxy: hospital shapes, PATCH and DELETE, a role per area**

In `app/api/v1/[...path]/route.ts`:

1. Replace `import { isClinical } from "@/lib/auth/types";` (Task 1) with
   `import { canUse } from "@/lib/auth/types";`.
2. Change `ALLOWED` to
   `const ALLOWED = new Set(["queries", "feedback", "corrections", "readyz", "hospital"]);`.
3. Below `const MY_LISTS = …`, add:

```ts
const STAFF_ACTIONS = new Set([
  "deactivate",
  "reactivate",
  "password-reset",
  "reset-mfa",
  "remind",
  "resend-invite",
]);
const OVERSIGHT_ACTIONS = new Set(["remind", "assign"]);
const READ_ONLY = new Set(["usage", "activity", "review-oversight"]);

/** The hospital admin side: exactly the shapes the admin client uses (Plan 4). */
function hospitalShape(method: string, path: string[]): boolean {
  const [, area, id, action] = path;
  const n = path.length;
  if (area === "staff") {
    if (n === 2) return method === "GET";
    if (n === 3)
      return id === "invites"
        ? method === "POST"
        : method === "PATCH" || method === "DELETE";
    return (
      n === 4 &&
      method === "POST" &&
      id !== "invites" &&
      STAFF_ACTIONS.has(action ?? "")
    );
  }
  if (area === "settings")
    return n === 2 && (method === "GET" || method === "PATCH");
  if (READ_ONLY.has(area ?? "")) return n === 2 && method === "GET";
  if (area === "corrections" && n === 4)
    return action === "eligible-reviewers"
      ? method === "GET"
      : method === "POST" && OVERSIGHT_ACTIONS.has(action ?? "");
  return false;
}
```

4. At the top of `shapeAllowed`, before `const [first, second, third] = path;`
   becomes used, add:

```ts
if (path[0] === "hospital") return hospitalShape(method, path);
// Clinical calls only read and post (Plans 1–3).
if (method !== "GET" && method !== "POST") return false;
```

and update its comment to
`/** Only the shapes the clients use (Plans 3 and 4). */`. 5. Replace the clinician check in `handle` with:

```ts
// Each side is for its own role, after first sign-in (R2, Plan 4).
const area = path[0] === "hospital" ? "admin" : "clinical";
if (!canUse(s.user, area) || s.steps.length > 0) return forbidden();
```

and change the doc comment above `handle` to
`/** Same-origin proxy for clinical and hospital admin calls: adds the token the browser never sees. */`. 6. At the end, add the two methods:

```ts
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/api app/api`
Expected: PASS (the existing proxy, live and mock tests too).

- [ ] **Step 6: Tell the backend (spec §10 items 2, 3, 7, §11; ARCHITECTURE)**

In `docs/specs/2026-10-13-ui-design-v3.md` §10, replace items 2 and 3 with:

```markdown
2. **Hospitals (tenancy):**
   - a hospital entity, with users belonging to a hospital;
   - a `hospital_admin` role that can be combined with `clinician`. The
     login and session `user` carries **`roles`** (every role, assumed by
     Plan 4); `role` stays the primary one. A hospital admin who isn't a
     clinician gets no clinical endpoints;
   - every staff, settings, usage, activity and oversight endpoint scoped to
     the hospital in the session, needing `hospital_admin`, and audited
     with the actor and the hospital.
3. **Hospital admin endpoints.** **Assumed contract** (Plan 4). The
   frontend calls these until the backend defines them, so please match
   them or tell us what changed. None of them returns question text,
   results or patient details:
   - `GET /hospital/staff` → every person at the hospital: `id`,
     `full_name`, `display_name`, `email`, `roles` (`clinician`,
     `hospital_admin`), `specialty`, `can_review`, `review_specialties`,
     `status` (`active`, `invited`, `deactivated`), `issues`
     (`mfa_not_set_up`, `invite_expired`), `sign_in` (`sso`,
     `password_mfa`, `password` or null), `last_active_at`, `joined_at`,
     `invited_at`, `invite_expires_at`, `is_you` and `version`;
   - `POST /hospital/staff/invites {emails, roles, specialty}` (at most 200)
     → `{invited, skipped: [{email, reason}]}`, `reason` one of
     `already_staff`, `domain_not_allowed`, `invalid_email`, `duplicate`.
     With hospital single sign-on, invitees just sign in; otherwise they get
     an email invite valid for 7 days, then first sign-in;
   - `PATCH /hospital/staff/{id} {version, roles?, specialty?, can_review?,
review_specialties?}` → the person;
   - `POST /hospital/staff/{id}/deactivate` (reversible: they can't sign
     in), `/reactivate`, `/password-reset` (a reset link; signs them out
     everywhere), `/reset-mfa` (they set it up again at next sign-in),
     `/remind` (to set up 2-step) and `/resend-invite` (7 more days) → the
     person;
   - `DELETE /hospital/staff/{id}` → 204: the account is deleted, but past
     consultations, feedback and audit entries are kept and attributed under
     the retention rules; for an invite it cancels the invite;
   - refusals: **403** `self_change` when an admin deactivates or removes
     themselves or drops their own `hospital_admin`; **409** `last_admin`
     when no active hospital admin would be left; **409** `conflict` for a
     stale `version` or an action that doesn't fit the status; **404**
     `not_found`;
   - `GET /hospital/settings` → `hospital_name`, `review_overdue_hours`,
     `reviewers_share_specialty`, `require_mfa_for_clinicians`,
     `idle_timeout_minutes`, `allow_trust_device`, `sso` (`{status,
domain}`, read-only), `allowed_email_domains` (read-only),
     `specialties`, `limits` (the allowed choices) and `version`;
     `PATCH /hospital/settings {version, …}` → the same; **409** `conflict`;
   - `GET /hospital/usage?period=this_month|last_month|last_90_days` →
     counts only: `consultations`, `active_clinicians`, `agreement_rate`,
     `median_review_hours`, `confidence` (`high`, `caution`, `review`,
     `failed` counts) and `by_specialty`;
   - `GET /hospital/activity?type&person&staff_id&from&to&flagged&cursor&limit`
     → `{events, next_cursor}`, newest first, kept 12 months. Each event is
     structured, never free text: `id`, `at`, `type` (`sign_in`,
     `consultation`, `feedback`, `review`, `account`, `admin`, `security`),
     `kind`, `actor` and `target` (`{display_name}`), `specialty`,
     `confidence`, `device`, `count` and `flag` (`policy`, `alert` or
     null). A consultation event carries only its specialty and confidence
     level;
   - `GET /hospital/review-oversight` → `overdue_after_hours`, `waiting`,
     `median_decision_hours`, `decided_this_week`, `items` (`id`, `ref`,
     `suggested_by`, `specialty`, `submitted_at`, `eligible_reviewers`,
     `assigned_to`, `reminded_at`) and `reviewers_by_specialty`; no
     clinical content;
   - `GET /hospital/corrections/{id}/eligible-reviewers`,
     `POST /hospital/corrections/{id}/remind` → 204 and
     `POST /hospital/corrections/{id}/assign {staff_id}` → 204; **409**
     `already_decided`, **422** `not_eligible`. An admin can't approve or
     reject unless they're also a clinician;
   - honour `Idempotency-Key` on every write above, kept as long as for
     `POST /feedback` (items 15 and 19).
```

In item 7, append this sentence to the end of the item: "Put the
hospital's idle timeout and review turnaround on the login `user`
(`idle_timeout_minutes`, `review_overdue_hours`), so the clinical app can
apply them; until then it keeps 15 minutes and 4 hours (Plan 4 R12, R14)."

In §11, replace the bullet "Whether a hospital admin who isn't a clinician
should see the review queue's statistics (counts only), or nothing clinical
at all." with:

```markdown
- ~~Whether a hospital admin who isn't a clinician should see the review
  queue's statistics.~~ Decided (Plan 4 R11): they see Review oversight
  (counts, specialty, age, who suggested it, eligible reviewers) and never
  the clinical content; approving and rejecting stay with clinicians.
```

In `ARCHITECTURE.md` §2, after the bullet starting "**Roles combine in the
clinical app:**", add:

```markdown
- **A hospital admin who isn't a clinician** signs in straight to the
  hospital admin side (Staff). Clinical screens redirect them there, and
  the server refuses them every clinical call.
```

and in §4.7, after the sentence "Designs: `design/v3/hospital-admin.html`.",
add:

```markdown
Routes: `/admin/staff`, `/admin/settings`, `/admin/usage`,
`/admin/activity` and `/admin/activity/oversight`. The calls go through the
same-origin proxy to `/api/v1/hospital/*`, which forwards them only for a
session with the hospital admin role. Until the backend defines them, they
follow the assumed contract in the design spec §10 item 3.
```

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write docs/specs/2026-10-13-ui-design-v3.md ARCHITECTURE.md && npm run typecheck && npm run lint`
Expected: clean.

```bash
git add lib/api/live-admin.ts lib/api/live-admin.test.ts app/api/v1 docs/specs/2026-10-13-ui-design-v3.md ARCHITECTURE.md
git commit -m "Forward the hospital admin routes for hospital admins only"
```

---

### Task 5: Staff rules, the invite parser and the error wording

**Files:**

- Create: `lib/admin/staff.ts`, `lib/admin/staff.test.ts`,
  `lib/admin/invite.ts`, `lib/admin/invite.test.ts`, `lib/admin/errors.ts`,
  `lib/admin/errors.test.ts`
- Modify: `lib/labels.ts`, `lib/labels.test.ts`
- Test: the three new test files, `lib/labels.test.ts`

**Interfaces:**

- Consumes: `StaffOut`, `StaffRole`, `SignInMethod` (Task 3); `ageLabel`
  (`lib/time.ts`); `ApiError`; `makeStaff`, `ADMIN_NOW` (`tests/admin.ts`).
- Produces (`lib/admin/staff.ts`):
  - `type StaffState = "active" | "invited" | "attention" | "deactivated"`;
    `type StaffFilter = "all" | StaffState`;
  - `STAFF_STATE: Record<StaffState, { label: string; tone: "ok" | "brand" | "warn" | "muted" }>`;
  - `ROLE_LABEL: Record<StaffRole, string>`, `SIGN_IN_LABEL: Record<SignInMethod, string>`;
  - `STAFF_FILTERS: readonly { id: StaffFilter; label: string }[]`;
  - `inviteExpired(s, now): boolean`, `staffState(s, now): StaffState`,
    `attentionLabel(s, now): string | null`, `statusText(s, now): string`,
    `inviteNote(s, now): string | null`;
  - `staffCounts(list, now): Record<StaffFilter, number>`,
    `filterStaff(list, filter, search, now): StaffOut[]`,
    `sortName(name): string`;
  - `isActiveAdmin(s): boolean`, `activeAdminCount(list): number`;
  - `type GuardAction = "deactivate" | "remove" | "drop_admin"`,
    `type Guard = { ok: true } | { ok: false; reason: string }`,
    `guardFor(action, target, list): Guard`, `LAST_ADMIN: string`;
  - `lastActiveLabel(iso, now): string | null`,
    `rolesText(roles): string`.
- Produces (`lib/admin/invite.ts`): `INVITE_MAX = 200`, `INVITE_DAYS = 7`,
  `type InviteLineStatus`, `interface InviteLine { email; status }`,
  `INVITE_PROBLEM`, `parseInviteList(text, { existing, domains }): InviteLine[]`,
  `okEmails(lines): string[]`, `SKIP_REASON: Record<InviteSkipReason, string>`.
- Produces (`lib/admin/errors.ts`):
  `interface AdminError { title: string; body: string; gone: boolean; stale: boolean }`,
  `adminError(e: unknown): AdminError`.

- [ ] **Step 1: Write the failing tests**

Create `lib/admin/staff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW, makeStaff } from "@/tests/admin";
import {
  LAST_ADMIN,
  attentionLabel,
  filterStaff,
  guardFor,
  inviteNote,
  lastActiveLabel,
  rolesText,
  staffCounts,
  staffState,
  statusText,
} from "./staff";

const D = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("staffState", () => {
  it("reads status and problems as the four states", () => {
    expect(staffState(makeStaff(), NOW)).toBe("active");
    expect(staffState(makeStaff({ issues: ["mfa_not_set_up"] }), NOW)).toBe(
      "attention",
    );
    expect(
      staffState(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW + D) }),
        NOW,
      ),
    ).toBe("invited");
    expect(
      staffState(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW - 1) }),
        NOW,
      ),
    ).toBe("attention");
    expect(
      staffState(
        makeStaff({ status: "invited", issues: ["invite_expired"] }),
        NOW,
      ),
    ).toBe("attention");
    expect(
      staffState(
        makeStaff({ status: "deactivated", issues: ["mfa_not_set_up"] }),
        NOW,
      ),
    ).toBe("deactivated");
  });

  it("says what needs attention in words", () => {
    expect(attentionLabel(makeStaff({ issues: ["mfa_not_set_up"] }), NOW)).toBe(
      "2-step not set up",
    );
    expect(
      statusText(
        makeStaff({ status: "invited", issues: ["invite_expired"] }),
        NOW,
      ),
    ).toBe("Invite expired");
    expect(statusText(makeStaff(), NOW)).toBe("Active");
    expect(statusText(makeStaff({ status: "deactivated" }), NOW)).toBe(
      "Deactivated",
    );
  });

  it("explains an invite's state", () => {
    expect(
      inviteNote(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW + 5 * D) }),
        NOW,
      ),
    ).toBe("Invite expires in 5 days");
    expect(
      inviteNote(
        makeStaff({
          status: "invited",
          invite_expires_at: iso(NOW + 3_600_000),
        }),
        NOW,
      ),
    ).toBe("Invite expires in 1 day");
    expect(
      inviteNote(
        makeStaff({ status: "invited", invite_expires_at: iso(NOW - D) }),
        NOW,
      ),
    ).toBe("Invite expired. Send a new one.");
    expect(inviteNote(makeStaff({ status: "invited" }), NOW)).toBe(
      "Waiting for their first sign-in with their hospital account",
    );
    expect(inviteNote(makeStaff(), NOW)).toBeNull();
  });
});

describe("filters and search", () => {
  const list = [
    makeStaff({
      id: "a",
      full_name: "Dr. Zoë Ábaro",
      specialty: "Paediatrics",
    }),
    makeStaff({
      id: "b",
      full_name: "Grace Nwosu",
      email: "admin.nwosu@x.org",
      specialty: null,
    }),
    makeStaff({
      id: "c",
      full_name: "Dr. Kofi Mensah",
      issues: ["mfa_not_set_up"],
    }),
    makeStaff({ id: "d", full_name: "Dr. James Eze", status: "deactivated" }),
    makeStaff({
      id: "e",
      full_name: "Dr. Funmi Adeyemi",
      status: "invited",
      invite_expires_at: iso(NOW + D),
    }),
  ];

  it("counts each filter", () => {
    expect(staffCounts(list, NOW)).toEqual({
      all: 5,
      active: 2,
      invited: 1,
      attention: 1,
      deactivated: 1,
    });
  });

  it("filters, sorts by name without the title, and ignores accents and case", () => {
    expect(filterStaff(list, "all", "", NOW).map((s) => s.id)).toEqual([
      "e",
      "b",
      "d",
      "c",
      "a",
    ]);
    expect(filterStaff(list, "active", "", NOW).map((s) => s.id)).toEqual([
      "b",
      "a",
    ]);
    expect(filterStaff(list, "all", "zoe abaro", NOW).map((s) => s.id)).toEqual(
      ["a"],
    );
    expect(filterStaff(list, "all", "PAEDI", NOW).map((s) => s.id)).toEqual([
      "a",
    ]);
    expect(
      filterStaff(list, "all", "admin.nwosu", NOW).map((s) => s.id),
    ).toEqual(["b"]);
    expect(filterStaff(list, "attention", "zoe", NOW)).toEqual([]);
  });
});

describe("guardFor", () => {
  const me = makeStaff({
    id: "me",
    roles: ["clinician", "hospital_admin"],
    is_you: true,
  });
  const other = makeStaff({ id: "o", roles: ["hospital_admin"] });
  const clinician = makeStaff({ id: "c" });

  it("refuses yourself, whatever the action (Review Focus 1)", () => {
    const list = [me, other, clinician];
    expect(guardFor("deactivate", me, list)).toEqual({
      ok: false,
      reason:
        "You can't deactivate your own account. Ask another hospital admin.",
    });
    expect(guardFor("remove", me, list)).toEqual({
      ok: false,
      reason: "You can't remove your own account. Ask another hospital admin.",
    });
    expect(guardFor("drop_admin", me, list)).toEqual({
      ok: false,
      reason:
        "You can't remove your own hospital admin role. Ask another hospital admin.",
    });
  });

  it("keeps the last active admin (Review Focus 4)", () => {
    const solo = [other, clinician];
    for (const a of ["deactivate", "remove", "drop_admin"] as const)
      expect(guardFor(a, other, solo)).toEqual({
        ok: false,
        reason: LAST_ADMIN,
      });
    // An invited or deactivated admin doesn't count as the one keeping it running.
    const withInvite = [
      other,
      makeStaff({ id: "i", roles: ["hospital_admin"], status: "invited" }),
    ];
    expect(guardFor("deactivate", other, withInvite).ok).toBe(false);
  });

  it("allows the rest", () => {
    expect(guardFor("deactivate", other, [me, other])).toEqual({ ok: true });
    expect(guardFor("remove", clinician, [me, clinician])).toEqual({
      ok: true,
    });
  });
});

describe("labels", () => {
  it("shortens last active the way the table shows it", () => {
    expect(lastActiveLabel(null, NOW)).toBeNull();
    expect(lastActiveLabel("garbage", NOW)).toBeNull();
    expect(lastActiveLabel(iso(NOW - 30_000), NOW)).toBe("now");
    expect(lastActiveLabel(iso(NOW - 2 * 3_600_000), NOW)).toBe("2 h");
    expect(lastActiveLabel(iso(NOW - D), NOW)).toBe("1 d");
    expect(lastActiveLabel(iso(NOW - 21 * D), NOW)).toBe("3 w");
  });
  it("names roles in plain words", () => {
    expect(rolesText(["clinician", "hospital_admin"])).toBe(
      "Clinician · Hospital admin",
    );
  });
});
```

Create `lib/admin/invite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INVITE_MAX, okEmails, parseInviteList } from "./invite";

const ctx = {
  existing: ["K.Mensah@havanahospital.org", "j.eze@havanahospital.org"],
  domains: ["havanahospital.org"],
};

describe("parseInviteList (Review Focus 3)", () => {
  it("splits on commas, semicolons, new lines and tabs, and skips blanks", () => {
    const lines = parseInviteList(
      "a@havanahospital.org, b@havanahospital.org;\n\n c@havanahospital.org\td@havanahospital.org,,",
      ctx,
    );
    expect(lines.map((l) => [l.email, l.status])).toEqual([
      ["a@havanahospital.org", "ok"],
      ["b@havanahospital.org", "ok"],
      ["c@havanahospital.org", "ok"],
      ["d@havanahospital.org", "ok"],
    ]);
  });

  it("reads names, angle brackets and mailto:, in any case", () => {
    const lines = parseInviteList(
      'Funmi Adeyemi <F.Adeyemi@HavanaHospital.org>\n"Obi, Ngozi" <n.obi@havanahospital.org>\nmailto:T.Bello@havanahospital.org\nAmaka Udo a.udo@havanahospital.org',
      ctx,
    );
    expect(okEmails(lines)).toEqual([
      "f.adeyemi@havanahospital.org",
      "n.obi@havanahospital.org",
      "t.bello@havanahospital.org",
      "a.udo@havanahospital.org",
    ]);
    expect(lines.every((l) => l.status === "ok")).toBe(true);
  });

  it("names every problem", () => {
    const lines = parseInviteList(
      [
        "n.ade@havanahospital.org",
        "N.ADE@havanahospital.org",
        "k.mensah@havanahospital.org",
        "j.eze@havanahospital.org",
        "someone@gmail.com",
        "f.adeyemi.havanahospital.org",
        "x@havanahospital",
      ].join("\n"),
      ctx,
    );
    expect(lines.map((l) => [l.email, l.status])).toEqual([
      ["n.ade@havanahospital.org", "ok"],
      ["n.ade@havanahospital.org", "duplicate"],
      ["k.mensah@havanahospital.org", "already_staff"],
      ["j.eze@havanahospital.org", "already_staff"],
      ["someone@gmail.com", "domain_not_allowed"],
      ["f.adeyemi.havanahospital.org", "invalid"],
      ["x@havanahospital", "invalid"],
    ]);
  });

  it("allows any domain when the hospital lists none", () => {
    expect(
      parseInviteList("someone@gmail.com", { existing: [], domains: [] })[0]!
        .status,
    ).toBe("ok");
  });

  it("keeps a typed invalid entry as typed, so the person can find it", () => {
    expect(parseInviteList("  Dr Funmi  ", ctx)[0]).toEqual({
      email: "Dr Funmi",
      status: "invalid",
    });
  });

  it("caps a send at 200", () => {
    expect(INVITE_MAX).toBe(200);
  });
});
```

Create `lib/admin/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { FORBIDDEN_TERMS } from "../labels";
import { adminError } from "./errors";

describe("adminError", () => {
  it("maps each refusal to plain words", () => {
    expect(adminError(new ApiError(403, "self_change"))).toMatchObject({
      title: "You can't change your own access",
      gone: false,
      stale: false,
    });
    expect(adminError(new ApiError(409, "last_admin")).title).toBe(
      "The hospital needs a hospital admin",
    );
    expect(adminError(new ApiError(409, "conflict"))).toMatchObject({
      title: "Someone else changed this just now",
      stale: true,
    });
    expect(adminError(new ApiError(404, "not_found"))).toMatchObject({
      gone: true,
    });
    expect(adminError(new ApiError(409, "already_decided"))).toMatchObject({
      title: "This correction has already been decided",
      gone: true,
    });
    expect(adminError(new ApiError(0, "network")).title).toBe(
      "Couldn't reach MHAI",
    );
    expect(adminError(new Error("boom")).title).toBe("Couldn't reach MHAI");
    expect(adminError(new ApiError(503, "error")).title).toBe(
      "MHAI couldn't save this",
    );
    expect(adminError(new ApiError(403, "forbidden")).title).toBe(
      "You can't do this",
    );
  });

  it("never shows a backend term", () => {
    const codes = [
      "self_change",
      "last_admin",
      "conflict",
      "not_found",
      "already_decided",
      "not_eligible",
      "domain_not_allowed",
      "rate_limited",
      "forbidden",
      "invalid",
      "weird_new_code",
    ];
    for (const c of codes) {
      const { title, body } = adminError(new ApiError(409, c));
      for (const t of FORBIDDEN_TERMS)
        expect(`${title} ${body}`).not.toContain(t);
      expect(`${title} ${body}`).not.toContain("_");
    }
  });
});
```

In `lib/labels.test.ts`, add:

```ts
it("forbids the hospital admin codes on screen", () => {
  for (const t of [
    "self_change",
    "last_admin",
    "not_eligible",
    "domain_not_allowed",
    "already_staff",
    "invalid_email",
    "mfa_not_set_up",
    "invite_expired",
    "hospital_admin",
    "password_mfa",
  ])
    expect(FORBIDDEN_TERMS).toContain(t);
});
```

(add `FORBIDDEN_TERMS` to that file's `./labels` import if it isn't there).

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/admin lib/labels.test.ts`
Expected: FAIL: the three modules don't exist; `FORBIDDEN_TERMS` lacks the
admin codes.

- [ ] **Step 3: Write the rules**

Create `lib/admin/staff.ts`:

```ts
import type { SignInMethod, StaffOut, StaffRole } from "../api/admin-contract";
import { ageLabel } from "../time";

export type StaffState = "active" | "invited" | "attention" | "deactivated";
export type StaffFilter = "all" | StaffState;

/** Words and chip tones (spec §7: a word and an icon, never colour alone). */
export const STAFF_STATE: Record<
  StaffState,
  { label: string; tone: "ok" | "brand" | "warn" | "muted" }
> = {
  active: { label: "Active", tone: "ok" },
  invited: { label: "Invited", tone: "brand" },
  attention: { label: "Needs attention", tone: "warn" },
  deactivated: { label: "Deactivated", tone: "muted" },
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  clinician: "Clinician",
  hospital_admin: "Hospital admin",
};

export const SIGN_IN_LABEL: Record<SignInMethod, string> = {
  sso: "Hospital account",
  password_mfa: "Password + 2-step",
  password: "Password",
};

export const STAFF_FILTERS: readonly { id: StaffFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "invited", label: "Invited" },
  { id: "attention", label: "Needs attention" },
  { id: "deactivated", label: "Deactivated" },
];

const D = 86_400_000;
const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

export function inviteExpired(s: StaffOut, now: number): boolean {
  if (s.status !== "invited") return false;
  if (s.issues.includes("invite_expired")) return true;
  const t = time(s.invite_expires_at);
  return t !== null && t <= now;
}

export function staffState(s: StaffOut, now: number): StaffState {
  if (s.status === "deactivated") return "deactivated";
  if (s.status === "invited")
    return inviteExpired(s, now) ? "attention" : "invited";
  return s.issues.length ? "attention" : "active";
}

/** What needs attention, in words; null when nothing does. */
export function attentionLabel(s: StaffOut, now: number): string | null {
  if (inviteExpired(s, now)) return "Invite expired";
  if (s.status === "active" && s.issues.includes("mfa_not_set_up"))
    return "2-step not set up";
  return null;
}

/** The status column: the problem itself when there is one (as the mockup shows). */
export const statusText = (s: StaffOut, now: number): string =>
  attentionLabel(s, now) ?? STAFF_STATE[staffState(s, now)].label;

/** One line about an invite, or null for anyone who isn't invited. */
export function inviteNote(s: StaffOut, now: number): string | null {
  if (s.status !== "invited") return null;
  if (inviteExpired(s, now)) return "Invite expired. Send a new one.";
  const t = time(s.invite_expires_at);
  if (t === null)
    return "Waiting for their first sign-in with their hospital account";
  const days = Math.max(1, Math.ceil((t - now) / D));
  return `Invite expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export function staffCounts(
  list: StaffOut[],
  now: number,
): Record<StaffFilter, number> {
  const c: Record<StaffFilter, number> = {
    all: list.length,
    active: 0,
    invited: 0,
    attention: 0,
    deactivated: 0,
  };
  for (const s of list) c[staffState(s, now)]++;
  return c;
}

const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "Dr. Ana Reyes" sorts as "Ana Reyes". */
export const sortName = (name: string) =>
  name.replace(/^(dr|prof|mr|mrs|ms|nurse)\.?\s+/i, "");

/** Search name, email and specialty; ignores case and accents. */
export function filterStaff(
  list: StaffOut[],
  filter: StaffFilter,
  search: string,
  now: number,
): StaffOut[] {
  const q = fold(search.trim());
  return list
    .filter((s) => filter === "all" || staffState(s, now) === filter)
    .filter(
      (s) =>
        !q ||
        [s.full_name, s.email, s.specialty ?? ""].some((f) =>
          fold(f).includes(q),
        ),
    )
    .sort((a, b) =>
      sortName(a.full_name).localeCompare(sortName(b.full_name), undefined, {
        sensitivity: "base",
      }),
    );
}

export const isActiveAdmin = (s: StaffOut) =>
  s.status === "active" && s.roles.includes("hospital_admin");

export const activeAdminCount = (list: StaffOut[]) =>
  list.filter(isActiveAdmin).length;

export type GuardAction = "deactivate" | "remove" | "drop_admin";
export type Guard = { ok: true } | { ok: false; reason: string };

const SELF: Record<GuardAction, string> = {
  deactivate:
    "You can't deactivate your own account. Ask another hospital admin.",
  remove: "You can't remove your own account. Ask another hospital admin.",
  drop_admin:
    "You can't remove your own hospital admin role. Ask another hospital admin.",
};

export const LAST_ADMIN =
  "The hospital needs at least one active hospital admin. Make someone else a hospital admin first.";

/** Whether an admin may do this to `target` (R5). The API checks again. */
export function guardFor(
  action: GuardAction,
  target: StaffOut,
  list: StaffOut[],
): Guard {
  if (target.is_you) return { ok: false, reason: SELF[action] };
  if (isActiveAdmin(target) && activeAdminCount(list) <= 1)
    return { ok: false, reason: LAST_ADMIN };
  return { ok: true };
}

/** "now", "42 min", "2 h", "3 d", "3 w"; null when never or unknown. */
export function lastActiveLabel(
  iso: string | null,
  now: number,
): string | null {
  const t = time(iso);
  if (t === null) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 2) return "now";
  if (m < 14 * 1440) return ageLabel(t, now);
  return `${Math.round(m / 10_080)} w`;
}

export const rolesText = (roles: StaffRole[]) =>
  roles.map((r) => ROLE_LABEL[r]).join(" · ");
```

Create `lib/admin/invite.ts`:

```ts
import type { InviteSkipReason } from "../api/admin-contract";

/** At most this many people in one send (R8). */
export const INVITE_MAX = 200;
/** An emailed invite's life without hospital sign-on (spec §5.6). */
export const INVITE_DAYS = 7;

export type InviteLineStatus =
  "ok" | "invalid" | "duplicate" | "already_staff" | "domain_not_allowed";

export interface InviteLine {
  /** Lower-cased address, or the text as typed when it isn't one. */
  email: string;
  status: InviteLineStatus;
}

export const INVITE_PROBLEM: Record<Exclude<InviteLineStatus, "ok">, string> = {
  invalid: "Not an email address",
  duplicate: "Listed twice",
  already_staff: "Already on the staff list",
  domain_not_allowed: "Not a hospital email address",
};

/** The API's own reasons, in the same words. */
export const SKIP_REASON: Record<InviteSkipReason, string> = {
  invalid_email: INVITE_PROBLEM.invalid,
  duplicate: INVITE_PROBLEM.duplicate,
  already_staff: INVITE_PROBLEM.already_staff,
  domain_not_allowed: INVITE_PROBLEM.domain_not_allowed,
};

const EMAIL = /^[^\s@<>()[\]",;:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const ANGLE = /<([^<>]*)>/;

function extract(chunk: string): string {
  const angle = ANGLE.exec(chunk);
  let t = (angle ? angle[1]! : chunk).trim();
  if (!angle && /\s/.test(t))
    t = t.split(/\s+/).find((w) => w.includes("@")) ?? t;
  return t
    .replace(/^mailto:/i, "")
    .replace(/^["']+|["']+$/g, "")
    .toLowerCase();
}

/**
 * Reads a typed or pasted list (R8): commas, semicolons, new lines and tabs
 * separate; `Name <email>` and `mailto:` work. A name part before a comma
 * ("Obi, Ngozi <n.obi@…>") belongs to the address after it.
 */
export function parseInviteList(
  text: string,
  ctx: { existing: readonly string[]; domains: readonly string[] },
): InviteLine[] {
  const existing = new Set(ctx.existing.map((e) => e.toLowerCase()));
  const domains = ctx.domains.map((d) => d.toLowerCase());
  const seen = new Set<string>();
  const chunks = text
    .split(/[,;\n\r\t]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const out: InviteLine[] = [];
  chunks.forEach((chunk, i) => {
    const next = chunks[i + 1];
    if (!chunk.includes("@") && next && /<[^<>]*@[^<>]*>/.test(next)) return;
    const email = extract(chunk);
    let status: InviteLineStatus = "ok";
    if (!EMAIL.test(email)) status = "invalid";
    else if (seen.has(email)) status = "duplicate";
    else if (existing.has(email)) status = "already_staff";
    else if (domains.length && !domains.includes(email.split("@")[1]!))
      status = "domain_not_allowed";
    if (status !== "invalid") seen.add(email);
    out.push({ email: status === "invalid" ? chunk : email, status });
  });
  return out;
}

export const okEmails = (lines: InviteLine[]) =>
  lines.filter((l) => l.status === "ok").map((l) => l.email);
```

Create `lib/admin/errors.ts`:

```ts
import { ApiError } from "../api/errors";

export interface AdminError {
  title: string;
  body: string;
  /** The person or item no longer exists (404, or decided elsewhere). */
  gone: boolean;
  /** Someone else changed it; the latest is loading (R7). */
  stale: boolean;
}

const E = (
  title: string,
  body: string,
  extra: Partial<AdminError> = {},
): AdminError => ({ title, body, gone: false, stale: false, ...extra });

/** Plain words for every admin refusal; never a backend code (spec §6). */
export function adminError(e: unknown): AdminError {
  if (!(e instanceof ApiError) || e.status === 0)
    return E("Couldn't reach MHAI", "Check your connection and try again.");
  switch (e.code) {
    case "conflict":
      return E(
        "Someone else changed this just now",
        "We've loaded the latest details. Check them and try again.",
        { stale: true },
      );
    case "not_found":
      return E(
        "This is no longer here",
        "Someone else may have removed it. The list has been refreshed.",
        { gone: true },
      );
    case "self_change":
      return E(
        "You can't change your own access",
        "Ask another hospital admin to do this.",
      );
    case "last_admin":
      return E(
        "The hospital needs a hospital admin",
        "Make someone else a hospital admin first.",
      );
    case "already_decided":
      return E(
        "This correction has already been decided",
        "It has left the list.",
        { gone: true },
      );
    case "not_eligible":
      return E(
        "That person can't review this correction",
        "Pick someone from the list.",
      );
    case "domain_not_allowed":
      return E(
        "That email address isn't allowed",
        "Invites only go to your hospital's email addresses.",
      );
    case "rate_limited":
      return E("Too many changes at once", "Wait a minute and try again.");
  }
  if (e.status === 403)
    return E(
      "You can't do this",
      "Your hospital admin access may have changed. Sign out and in again if this keeps happening.",
    );
  if (e.status >= 500)
    return E("MHAI couldn't save this", "Try again in a moment.");
  return E(
    "Something went wrong",
    "Try again. If it keeps happening, contact Measured Health support.",
  );
}
```

In `lib/labels.ts`, add to the end of `FORBIDDEN_TERMS` (before `] as const`):

```ts
  "self_change",
  "last_admin",
  "not_eligible",
  "domain_not_allowed",
  "already_staff",
  "invalid_email",
  "mfa_not_set_up",
  "invite_expired",
  "hospital_admin",
  "password_mfa",
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/admin lib/labels.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/admin lib/labels.ts lib/labels.test.ts
git commit -m "Add staff rules, the invite list parser and admin error wording"
```

---

### Task 6: Activity wording, report maths and CSV

**Files:**

- Create: `lib/admin/activity.ts`, `lib/admin/activity.test.ts`,
  `lib/admin/report.ts`, `lib/admin/report.test.ts`, `lib/admin/csv.ts`,
  `lib/admin/csv.test.ts`
- Test: the three new test files

**Interfaces:**

- Consumes: `ActivityEventOut`, `ActivityType`, `UsageOut`, `UsagePeriod`,
  `OversightItemOut`, `ConfidenceLevel` (Task 3); `RESULT_LABEL`
  (`lib/labels.ts`); `makeEvent`, `ADMIN_NOW` (`tests/admin.ts`).
- Produces (`lib/admin/activity.ts`): `ACTIVITY_TYPE_LABEL`,
  `ACTIVITY_TYPES`, `FLAG_LABEL`, `ACTIVITY_KEEP_MONTHS = 12`,
  `describeEvent(e): string`, `actorName(e): string`,
  `typeLabel(e): string`, `type ActivityRange = "today" | "7d" | "30d" | "12m"`,
  `ACTIVITY_RANGES`, `rangeStart(r, now): string`,
  `eventClock(iso, now): string`.
- Produces (`lib/admin/report.ts`): `PERIODS`, `CONFIDENCE_ORDER`,
  `shares(c): Record<ConfidenceLevel, number> | null`,
  `percentLabel(rate): string`, `hoursLabel(h): string`,
  `countLabel(n): string`, `SHORT_OF_REVIEWERS = 2`, `isShort(n): boolean`,
  `isOverdueItem(item, overdueHours, now): boolean`,
  `oversightOrder(items): OversightItemOut[]`.
- Produces (`lib/admin/csv.ts`): `CSV_MAX_ROWS = 10_000`, `type Cell`,
  `csvCell(v): string`, `toCsv(header, rows): string`,
  `usageCsv(u, hospital): string`, `activityCsv(events): string`,
  `csvName(what, hospital, now): string`, `downloadCsv(name, csv): void`.

- [ ] **Step 1: Write the failing tests**

Create `lib/admin/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW, makeEvent } from "@/tests/admin";
import {
  actorName,
  describeEvent,
  eventClock,
  rangeStart,
  typeLabel,
} from "./activity";

const who = (display_name: string) => ({ display_name });

describe("describeEvent (R9)", () => {
  it("says what happened, in plain words, from structured fields", () => {
    const cases: [Parameters<typeof makeEvent>[0], string][] = [
      [
        {
          kind: "specialty_changed",
          type: "admin",
          target: who("Dr. Mensah"),
          specialty: "Cardiology",
        },
        "Changed Dr. Mensah's specialty to Cardiology",
      ],
      [
        {
          kind: "correction_approved",
          type: "review",
          specialty: "Infectious disease",
        },
        "Approved a correction · Infectious disease",
      ],
      [
        {
          kind: "consultation_run",
          type: "consultation",
          specialty: "Internal Medicine",
          confidence: "caution",
        },
        "Ran a consultation · Internal Medicine · Use with caution",
      ],
      [
        {
          kind: "consultation_run",
          type: "consultation",
          specialty: null,
          confidence: null,
        },
        "Ran a consultation",
      ],
      [
        {
          kind: "signed_in_without_mfa",
          device: "Chrome on Windows",
          flag: "policy",
        },
        "Signed in without 2-step (setup pending) · Chrome on Windows",
      ],
      [
        {
          kind: "sign_in_locked",
          type: "security",
          actor: null,
          target: who("Dr. Bello"),
          count: 5,
        },
        "5 failed sign-ins for Dr. Bello · account locked",
      ],
      [
        { kind: "invite_accepted", type: "account" },
        "Accepted invite and finished first sign-in",
      ],
      [
        { kind: "deactivated", type: "admin", target: who("Dr. Eze") },
        "Deactivated Dr. Eze",
      ],
      [
        {
          kind: "invite_cancelled",
          type: "admin",
          target: who("n.ade@havanahospital.org"),
        },
        "Cancelled the invite for n.ade@havanahospital.org",
      ],
      [
        {
          kind: "reviewer_assigned",
          type: "review",
          target: who("Dr. Udo"),
          specialty: "Paediatrics",
        },
        "Asked Dr. Udo to review a correction · Paediatrics",
      ],
      [
        { kind: "settings_changed", type: "admin" },
        "Changed hospital settings",
      ],
    ];
    for (const [over, text] of cases)
      expect(describeEvent(makeEvent(over))).toBe(text);
  });

  it("shows an unknown kind generically, never its code", () => {
    expect(
      describeEvent(makeEvent({ kind: "token_rotated_v2", type: "security" })),
    ).toBe("Security activity");
    expect(
      describeEvent(makeEvent({ kind: "x", type: "brand_new" as never })),
    ).toBe("Other activity");
  });

  it("never shows a field the contract doesn't have (privacy)", () => {
    const sneaky = {
      ...makeEvent({
        kind: "consultation_run",
        type: "consultation",
        specialty: "Cardiology",
        confidence: "high",
      }),
      question_text: "54 M chest pain, patient John Smith",
      result: "Unstable angina",
    };
    const text = describeEvent(sneaky);
    expect(text).toBe("Ran a consultation · Cardiology · High confidence");
    expect(text).not.toMatch(/John|angina|chest/);
  });

  it("names who did it, or the system", () => {
    expect(actorName(makeEvent())).toBe("Dr. Okafor");
    expect(actorName(makeEvent({ actor: null }))).toBe("System");
    expect(typeLabel(makeEvent({ type: "sign_in" }))).toBe("Sign-in");
  });
});

describe("time", () => {
  it("starts each range where it should", () => {
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    expect(rangeStart("today", NOW)).toBe(today.toISOString());
    expect(rangeStart("7d", NOW)).toBe(
      new Date(NOW - 7 * 86_400_000).toISOString(),
    );
    expect(rangeStart("12m", NOW)).toBe(
      new Date(NOW - 365 * 86_400_000).toISOString(),
    );
  });
  it("shows today's events as a time and older ones with the date", () => {
    expect(eventClock(new Date(NOW).toISOString(), NOW)).toMatch(
      /^\d{2}:\d{2}$/,
    );
    expect(
      eventClock(new Date(NOW - 3 * 86_400_000).toISOString(), NOW),
    ).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/);
    expect(eventClock("not a date", NOW)).toBe("");
  });
});
```

Create `lib/admin/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW } from "@/tests/admin";
import {
  countLabel,
  hoursLabel,
  isOverdueItem,
  isShort,
  oversightOrder,
  percentLabel,
  shares,
} from "./report";

const item = (id: string, agoMs: number) => ({
  id,
  ref: id,
  suggested_by: { display_name: "Dr. Reyes" },
  specialty: "Paediatrics",
  submitted_at: new Date(NOW - agoMs).toISOString(),
  eligible_reviewers: 1,
  assigned_to: null,
  reminded_at: null,
});

describe("report maths", () => {
  it("shares out the confidence mix in whole percentages", () => {
    expect(
      shares({ high: 796, caution: 347, review: 103, failed: 38 }),
    ).toEqual({
      high: 62,
      caution: 27,
      review: 8,
      failed: 3,
    });
    expect(shares({ high: 0, caution: 0, review: 0, failed: 0 })).toBeNull();
  });

  it("formats rates, hours and counts", () => {
    expect(percentLabel(0.82)).toBe("82%");
    expect(hoursLabel(3.1)).toBe("3.1 h");
    expect(hoursLabel(3)).toBe("3 h");
    expect(hoursLabel(0.5)).toBe("30 min");
    expect(countLabel(1284)).toBe("1,284");
  });

  it("flags short of reviewers below 2, and overdue past the hospital's hours", () => {
    expect([isShort(0), isShort(1), isShort(2)]).toEqual([true, true, false]);
    expect(isOverdueItem(item("a", 5 * 3_600_000), 4, NOW)).toBe(true);
    expect(isOverdueItem(item("b", 3 * 3_600_000), 4, NOW)).toBe(false);
    expect(
      isOverdueItem({ ...item("c", 0), submitted_at: "bad" }, 4, NOW),
    ).toBe(false);
  });

  it("puts the oldest first", () => {
    expect(
      oversightOrder([
        item("new", 60_000),
        item("old", 9_000_000),
        item("mid", 600_000),
      ]).map((i) => i.id),
    ).toEqual(["old", "mid", "new"]);
  });
});
```

Create `lib/admin/csv.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_NOW as NOW, makeEvent } from "@/tests/admin";
import {
  activityCsv,
  csvCell,
  csvName,
  downloadCsv,
  toCsv,
  usageCsv,
} from "./csv";

afterEach(() => vi.restoreAllMocks());

describe("CSV (R10)", () => {
  it("quotes what needs quoting", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("stops a spreadsheet from running a cell", () => {
    for (const bad of ['=HYPERLINK("x")', "+1", "-2", "@SUM(A1)", "\tx", "\rx"])
      expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell(-2)).toBe("-2"); // a real number stays a number
  });

  it("writes a UTF-8 file Excel opens, with CRLF lines", () => {
    expect(toCsv(["A", "B"], [["x", 1]])).toBe("﻿A,B\r\nx,1\r\n");
  });

  it("exports usage as counts only", () => {
    const csv = usageCsv(
      {
        period: "this_month",
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-16T10:00:00.000Z",
        consultations: 1284,
        active_clinicians: 39,
        agreement_rate: 0.82,
        median_review_hours: 3.1,
        confidence: { high: 796, caution: 347, review: 103, failed: 38 },
        by_specialty: [{ specialty: "Paediatrics", consultations: 318 }],
      },
      "Havana Hospital",
    );
    expect(csv.split("\r\n")).toEqual([
      "﻿Measure,Value",
      "Hospital,Havana Hospital",
      "Period,This month (2026-10-01 to 2026-10-16)",
      "Consultations,1284",
      "Active clinicians,39",
      "Agreed with result (%),82",
      "Median review time (hours),3.1",
      "Result: High confidence,796",
      "Result: Use with caution,347",
      "Result: Needs review,103",
      "Result: Couldn't complete,38",
      "Specialty: Paediatrics,318",
      "",
    ]);
  });

  it("exports activity from structured fields only (privacy)", () => {
    const sneaky = {
      ...makeEvent({
        kind: "consultation_run",
        type: "consultation",
        specialty: "Cardiology",
        confidence: "review",
        flag: null,
        at: "2026-10-16T09:31:00.000Z",
        actor: { display_name: "Dr. Bello" },
      }),
      question_text: "chest pain in John Smith",
    };
    const csv = activityCsv([
      sneaky,
      makeEvent({
        kind: "sign_in_locked",
        type: "security",
        actor: null,
        target: { display_name: "=cmd()" },
        count: 5,
        flag: "alert",
        at: "2026-10-16T08:55:00.000Z",
      }),
    ]);
    expect(csv).not.toMatch(/John|chest/);
    expect(csv.split("\r\n").slice(0, 3)).toEqual([
      "﻿Time (UTC),Who,Type,What happened,Flag",
      "2026-10-16T09:31:00.000Z,Dr. Bello,Consultation,Ran a consultation · Cardiology · Needs review,",
      "2026-10-16T08:55:00.000Z,System,Security,5 failed sign-ins for =cmd() · account locked,Alert",
    ]);
  });

  it("names the file after the hospital and the day", () => {
    expect(csvName("activity", "Havana Hospital", NOW)).toBe(
      "havana-hospital-activity-2026-10-16.csv",
    );
  });

  it("downloads from memory and lets the URL go", async () => {
    const create = vi.fn(() => "blob:demo");
    const revoke = vi.fn();
    const original = [URL.createObjectURL, URL.revokeObjectURL] as const;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    try {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      downloadCsv("x.csv", "a,b\r\n");
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledTimes(1);
      expect(document.querySelector("a[download]")).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:demo"));
      expect(localStorage.length + sessionStorage.length).toBe(0);
    } finally {
      [URL.createObjectURL, URL.revokeObjectURL] = original;
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/admin/activity.test.ts lib/admin/report.test.ts lib/admin/csv.test.ts`
Expected: FAIL: the modules don't exist.

- [ ] **Step 3: Write the modules**

Create `lib/admin/activity.ts`:

```ts
import type { ActivityEventOut, ActivityType } from "../api/admin-contract";
import { RESULT_LABEL } from "../labels";

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  sign_in: "Sign-in",
  consultation: "Consultation",
  feedback: "Feedback",
  review: "Review",
  account: "Account",
  admin: "Admin",
  security: "Security",
};
export const ACTIVITY_TYPES = Object.keys(
  ACTIVITY_TYPE_LABEL,
) as ActivityType[];
export const FLAG_LABEL = { policy: "Policy", alert: "Alert" } as const;
/** How long the hospital's log is kept (spec §5.6). */
export const ACTIVITY_KEEP_MONTHS = 12;

const join = (...xs: (string | null | undefined)[]) =>
  xs.filter(Boolean).join(" · ");

export const typeLabel = (e: Pick<ActivityEventOut, "type">) =>
  ACTIVITY_TYPE_LABEL[e.type] ?? "Other";

export const actorName = (e: Pick<ActivityEventOut, "actor">) =>
  e.actor?.display_name || "System";

/**
 * One line per event, built only from the contract's structured fields
 * (R9). Free text from the API is never shown, so nothing clinical can
 * reach the admin side through the log.
 */
export function describeEvent(e: ActivityEventOut): string {
  const t = e.target?.display_name || "someone";
  const level = e.confidence ? RESULT_LABEL[e.confidence] : null;
  switch (e.kind) {
    case "signed_in":
      return join("Signed in", e.device);
    case "signed_in_without_mfa":
      return join("Signed in without 2-step (setup pending)", e.device);
    case "sign_in_locked":
      return `${e.count ?? "Several"} failed sign-ins for ${t} · account locked`;
    case "consultation_run":
      return join("Ran a consultation", e.specialty, level);
    case "result_agreed":
      return join("Agreed with a result", e.specialty);
    case "correction_suggested":
      return join("Suggested a correction", e.specialty);
    case "correction_approved":
      return join("Approved a correction", e.specialty);
    case "correction_rejected":
      return join("Rejected a correction", e.specialty);
    case "correction_withdrawn":
      return join("Withdrew a correction", e.specialty);
    case "invite_sent":
      return `Invited ${t}`;
    case "invite_cancelled":
      return `Cancelled the invite for ${t}`;
    case "invite_accepted":
      return "Accepted invite and finished first sign-in";
    case "roles_changed":
      return `Changed ${t}'s roles`;
    case "specialty_changed":
      return e.specialty
        ? `Changed ${t}'s specialty to ${e.specialty}`
        : `Changed ${t}'s specialty`;
    case "reviewer_changed":
      return `Changed what ${t} can review`;
    case "deactivated":
      return `Deactivated ${t}`;
    case "reactivated":
      return `Reactivated ${t}`;
    case "removed":
      return `Removed ${t}`;
    case "password_reset_sent":
      return `Sent ${t} a password reset`;
    case "mfa_reset":
      return `Reset ${t}'s 2-step verification`;
    case "mfa_reminder_sent":
      return `Reminded ${t} to set up 2-step`;
    case "settings_changed":
      return "Changed hospital settings";
    case "reviewers_reminded":
      return join("Reminded reviewers about a correction", e.specialty);
    case "reviewer_assigned":
      return join(`Asked ${t} to review a correction`, e.specialty);
    case "policy_breach":
      return "Hospital policy not met";
    default:
      return `${typeLabel(e)} activity`;
  }
}

export type ActivityRange = "today" | "7d" | "30d" | "12m";
export const ACTIVITY_RANGES: readonly { id: ActivityRange; label: string }[] =
  [
    { id: "today", label: "Today" },
    { id: "7d", label: "Last 7 days" },
    { id: "30d", label: "Last 30 days" },
    { id: "12m", label: "Last 12 months" },
  ];

const DAY = 86_400_000;

/** ISO start of a range: local midnight for "today". */
export function rangeStart(r: ActivityRange, now: number): string {
  if (r === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = r === "7d" ? 7 : r === "30d" ? 30 : 365;
  return new Date(now - days * DAY).toISOString();
}

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

Create `lib/admin/report.ts`:

```ts
import type {
  ConfidenceLevel,
  OversightItemOut,
  UsageOut,
  UsagePeriod,
} from "../api/admin-contract";

export const PERIODS: readonly { id: UsagePeriod; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90_days", label: "Last 90 days" },
];

export const CONFIDENCE_ORDER: readonly ConfidenceLevel[] = [
  "high",
  "caution",
  "review",
  "failed",
];

/** Whole percentages of the total; null when there's nothing to share out. */
export function shares(
  c: UsageOut["confidence"],
): Record<ConfidenceLevel, number> | null {
  const total = CONFIDENCE_ORDER.reduce((n, k) => n + c[k], 0);
  if (!total) return null;
  return {
    high: Math.round((c.high * 100) / total),
    caution: Math.round((c.caution * 100) / total),
    review: Math.round((c.review * 100) / total),
    failed: Math.round((c.failed * 100) / total),
  };
}

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`;

export const hoursLabel = (h: number) =>
  h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1).replace(/\.0$/, "")} h`;

export const countLabel = (n: number) => n.toLocaleString("en-GB");

/** Fewer eligible reviewers than this is "Short" (R12). */
export const SHORT_OF_REVIEWERS = 2;
export const isShort = (n: number) => n < SHORT_OF_REVIEWERS;

/** Overdue after the hospital's own turnaround (R12), not the clinical placeholder. */
export function isOverdueItem(
  item: Pick<OversightItemOut, "submitted_at">,
  overdueHours: number,
  now: number,
): boolean {
  const t = Date.parse(item.submitted_at);
  return Number.isFinite(t) && now - t > overdueHours * 3_600_000;
}

export const oversightOrder = (items: OversightItemOut[]) =>
  [...items].sort(
    (a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at),
  );
```

Create `lib/admin/csv.ts`:

```ts
import type { ActivityEventOut, UsageOut } from "../api/admin-contract";
import { RESULT_LABEL } from "../labels";
import { FLAG_LABEL, actorName, describeEvent, typeLabel } from "./activity";
import { CONFIDENCE_ORDER, PERIODS } from "./report";

/** The activity export stops here (R10). */
export const CSV_MAX_ROWS = 10_000;

export type Cell = string | number | null;

// A spreadsheet runs a cell that starts with one of these (formula injection).
const RISKY = /^[=+\-@\t\r]/;

export function csvCell(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = RISKY.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 with a byte-order mark (Excel), CRLF lines (RFC 4180). */
export const toCsv = (header: string[], rows: Cell[][]) =>
  "﻿" +
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
  "\r\n";

/** Counts only: there is nothing clinical in usage (spec §5.6). */
export function usageCsv(u: UsageOut, hospital: string): string {
  const period = PERIODS.find((p) => p.id === u.period)?.label ?? "Period";
  const rows: Cell[][] = [
    ["Hospital", hospital],
    ["Period", `${period} (${u.from.slice(0, 10)} to ${u.to.slice(0, 10)})`],
    ["Consultations", u.consultations],
    ["Active clinicians", u.active_clinicians],
    [
      "Agreed with result (%)",
      u.agreement_rate === null ? null : Math.round(u.agreement_rate * 100),
    ],
    ["Median review time (hours)", u.median_review_hours],
    ...CONFIDENCE_ORDER.map((k): Cell[] => [
      `Result: ${RESULT_LABEL[k]}`,
      u.confidence[k],
    ]),
    ...u.by_specialty.map((s): Cell[] => [
      `Specialty: ${s.specialty}`,
      s.consultations,
    ]),
  ];
  return toCsv(["Measure", "Value"], rows);
}

/** The log as shown on screen (R9): structured fields only. */
export const activityCsv = (events: ActivityEventOut[]) =>
  toCsv(
    ["Time (UTC)", "Who", "Type", "What happened", "Flag"],
    events.map((e) => [
      e.at,
      actorName(e),
      typeLabel(e),
      describeEvent(e),
      e.flag ? FLAG_LABEL[e.flag] : null,
    ]),
  );

export const csvName = (
  what: "usage" | "activity",
  hospital: string,
  now: number,
) =>
  `${hospital
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(
      /^-|-$/g,
      "",
    )}-${what}-${new Date(now).toISOString().slice(0, 10)}.csv`;

/** Hands the file to the browser's download. Nothing is stored (R10). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/admin`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/admin
git commit -m "Add activity wording, usage maths and safe CSV exports"
```

---

### Task 7: Query hooks for the admin side

**Files:**

- Create: `lib/admin-queries.ts`, `lib/admin-queries.test.tsx`
- Test: `lib/admin-queries.test.tsx`

**Interfaces:**

- Consumes: `getAdminClient`, `StaffAction` (Task 3); the contract types;
  `ApiError`; `retryDelay`, `shouldRetry`, `useNetwork` (`lib/network.ts`).
- Produces:
  - `OVERSIGHT_POLL_MS = 60_000`;
  - `type ActivityFilter = Omit<ActivityQuery, "cursor" | "limit" | "staff_id">`;
  - `ADMIN_KEYS` (`all`, `staff`, `activityAll`, `activity(f)`,
    `staffActivity(id)`, `settings`, `usage(p)`, `oversight`,
    `reviewers(id)`);
  - reads: `useStaff()`, `useHospitalSettings()`, `useUsage(period)`,
    `useActivity(f)` (infinite, by cursor), `useStaffActivity(id | null)`
    (last 5 events), `useOversight()` (polls every 60 s online, twice as
    slow on 2G or data saver, paused offline),
    `useEligibleReviewers(correctionId | null)`;
  - `fetchAllActivity(f, max): Promise<{ events: ActivityEventOut[]; capped: boolean }>`;
  - cache helpers: `putStaff(qc, row)`, `dropStaff(qc, id)`,
    `refreshStaff(qc)`;
  - writes, each with a fresh `Idempotency-Key` per call, reused on its
    retries: `useInviteStaff()` (`mutate(i: InviteIn, opts?)`),
    `useUpdateStaff()` (`mutate({ id, p }, opts?)`), `useStaffAction()`
    (`mutate({ id, action }, opts?)`), `useRemoveStaff()`
    (`mutate({ id }, opts?)`), `useUpdateSettings()` (`mutate(p, opts?)`),
    `useRemindReviewers()` (`mutate({ id }, opts?)`), `useAssignReviewer()`
    (`mutate({ id, staffId }, opts?)`).

- [ ] **Step 1: Write the failing tests**

Create `lib/admin-queries.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { mockAdminAs } from "@/tests/admin";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
import { ApiError } from "./api/errors";
import {
  fetchAllActivity,
  useActivity,
  useHospitalSettings,
  useInviteStaff,
  useRemoveStaff,
  useStaff,
  useUpdateSettings,
  useUpdateStaff,
} from "./admin-queries";

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(() => {
  qc = new QueryClient();
  holder.client = mockAdminAs(DEMO_EMAILS.director);
});
afterEach(() => vi.restoreAllMocks());

describe("admin queries", () => {
  it("lists the staff", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(13));
  });

  it("sends one idempotency key per invite, reused on its retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // shortest retry delay
    const invite = vi
      .spyOn(holder.client, "inviteStaff")
      .mockRejectedValueOnce(new ApiError(503, "error"))
      .mockResolvedValue({ invited: [], skipped: [] });
    const { result } = renderHook(() => useInviteStaff(), { wrapper });
    const i = {
      emails: ["n.ade@havanahospital.org"],
      roles: ["clinician" as const],
      specialty: null,
    };
    act(() => result.current.mutate(i));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 4000,
    });
    const keys = invite.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    act(() => result.current.mutate(i));
    await waitFor(() => expect(invite).toHaveBeenCalledTimes(3));
    expect(invite.mock.calls[2]![1]?.idempotencyKey).not.toBe(keys[0]);
  });

  it("drops a removed person from the cached list", async () => {
    const { result } = renderHook(
      () => ({ staff: useStaff(), remove: useRemoveStaff() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(13));
    act(() => result.current.remove.mutate({ id: "s-eze" }));
    await waitFor(() =>
      expect(result.current.staff.data?.some((s) => s.id === "s-eze")).toBe(
        false,
      ),
    );
  });

  it("a 404 drops the row; a 409 reloads the list (Review Focus 2)", async () => {
    const list = vi.spyOn(holder.client, "listStaff");
    const update = vi.spyOn(holder.client, "updateStaff");
    const { result } = renderHook(
      () => ({ staff: useStaff(), update: useUpdateStaff() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(13));
    update.mockRejectedValueOnce(new ApiError(404, "not_found"));
    list.mockResolvedValueOnce(
      (await mockAdminAs(DEMO_EMAILS.director).listStaff()).filter(
        (s) => s.id !== "s-bello",
      ),
    );
    act(() =>
      result.current.update.mutate({
        id: "s-bello",
        p: { version: 1, specialty: "Surgery" },
      }),
    );
    await waitFor(() =>
      expect(result.current.staff.data?.some((s) => s.id === "s-bello")).toBe(
        false,
      ),
    );
    const before = list.mock.calls.length;
    update.mockRejectedValueOnce(new ApiError(409, "conflict"));
    act(() =>
      result.current.update.mutate({
        id: "s-okafor",
        p: { version: 0, specialty: "Surgery" },
      }),
    );
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });

  it("reloads the settings after a conflict", async () => {
    const get = vi.spyOn(holder.client, "getSettings");
    vi.spyOn(holder.client, "updateSettings").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    const { result } = renderHook(
      () => ({ settings: useHospitalSettings(), save: useUpdateSettings() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.settings.data).toBeDefined());
    const calls = get.mock.calls.length;
    act(() =>
      result.current.save.mutate({ version: 0, allow_trust_device: false }),
    );
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
  });

  it("pages the log by cursor", async () => {
    const { result } = renderHook(() => useActivity({}), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data!.pages[1]!.events[0]!.id).not.toBe(
      result.current.data!.pages[0]!.events[0]!.id,
    );
  });

  it("fetches every page for an export, and says when it stopped at the cap", async () => {
    const all = await fetchAllActivity({}, 10_000);
    expect(all.capped).toBe(false);
    expect(all.events.length).toBeGreaterThan(100);
    const capped = await fetchAllActivity({}, 60);
    expect(capped).toMatchObject({ capped: true });
    expect(capped.events).toHaveLength(60);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/admin-queries.test.tsx`
Expected: FAIL: `Cannot find module './admin-queries'`.

- [ ] **Step 3: Write the hooks**

Create `lib/admin-queries.ts`:

```ts
"use client";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getAdminClient, type StaffAction } from "./api/admin";
import type {
  ActivityEventOut,
  ActivityQuery,
  InviteIn,
  SettingsPatchIn,
  StaffOut,
  StaffPatchIn,
  UsagePeriod,
} from "./api/admin-contract";
import { ApiError } from "./api/errors";
import { retryDelay, shouldRetry, useNetwork } from "./network";

/** Review oversight refresh, like the clinicians' queue. */
export const OVERSIGHT_POLL_MS = 60_000;

export type ActivityFilter = Omit<
  ActivityQuery,
  "cursor" | "limit" | "staff_id"
>;

export const ADMIN_KEYS = {
  all: ["admin"] as const,
  staff: ["admin", "staff"] as const,
  activityAll: ["admin", "activity"] as const,
  activity: (f: ActivityFilter) => ["admin", "activity", "log", f] as const,
  staffActivity: (id: string) => ["admin", "activity", "staff", id] as const,
  settings: ["admin", "settings"] as const,
  usage: (p: UsagePeriod) => ["admin", "usage", p] as const,
  oversight: ["admin", "oversight"] as const,
  reviewers: (id: string) => ["admin", "reviewers", id] as const,
};

// A 4xx won't change on retry; a 401 has already signed out.
const READ = {
  retry: (n: number, e: unknown) => shouldRetry(n, e),
  retryDelay,
};
// Writes retry network errors and 5xx with the same key, never offline.
const WRITE = {
  networkMode: "always" as const,
  retry: (n: number, e: unknown) => navigator.onLine && shouldRetry(n, e, 2),
  retryDelay,
};
const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : 0);
const newKey = () => crypto.randomUUID();

export const useStaff = () =>
  useQuery({
    queryKey: ADMIN_KEYS.staff,
    queryFn: () => getAdminClient().listStaff(),
    ...READ,
  });

export const useHospitalSettings = () =>
  useQuery({
    queryKey: ADMIN_KEYS.settings,
    queryFn: () => getAdminClient().getSettings(),
    staleTime: 60_000,
    ...READ,
  });

export const useUsage = (period: UsagePeriod) =>
  useQuery({
    queryKey: ADMIN_KEYS.usage(period),
    queryFn: () => getAdminClient().getUsage(period),
    ...READ,
  });

export function useActivity(f: ActivityFilter) {
  return useInfiniteQuery({
    queryKey: ADMIN_KEYS.activity(f),
    queryFn: ({ pageParam }) =>
      getAdminClient().listActivity({
        ...f,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    ...READ,
  });
}

/** The staff panel's "Recent activity": the last five events about them. */
export function useStaffActivity(id: string | null) {
  return useQuery({
    queryKey: ADMIN_KEYS.staffActivity(id ?? ""),
    queryFn: async () =>
      (await getAdminClient().listActivity({ staff_id: id!, limit: 5 })).events,
    enabled: id !== null,
    ...READ,
  });
}

export function useOversight() {
  const net = useNetwork();
  const every = !net.online
    ? false
    : net.slow || net.saveData
      ? OVERSIGHT_POLL_MS * 2
      : OVERSIGHT_POLL_MS;
  return useQuery({
    queryKey: ADMIN_KEYS.oversight,
    queryFn: () => getAdminClient().getOversight(),
    refetchInterval: every,
    ...READ,
  });
}

export function useEligibleReviewers(correctionId: string | null) {
  return useQuery({
    queryKey: ADMIN_KEYS.reviewers(correctionId ?? ""),
    queryFn: () => getAdminClient().listEligibleReviewers(correctionId!),
    enabled: correctionId !== null,
    ...READ,
  });
}

/** Every page of the log for these filters, up to `max` events (R10). */
export async function fetchAllActivity(
  f: ActivityFilter,
  max: number,
): Promise<{ events: ActivityEventOut[]; capped: boolean }> {
  const events: ActivityEventOut[] = [];
  let cursor: string | null = null;
  do {
    const page = await getAdminClient().listActivity({
      ...f,
      ...(cursor ? { cursor } : {}),
    });
    events.push(...page.events);
    cursor = page.next_cursor;
  } while (cursor && events.length < max);
  return {
    events: events.slice(0, max),
    capped: cursor !== null || events.length > max,
  };
}

export function putStaff(qc: QueryClient, row: StaffOut) {
  qc.setQueryData<StaffOut[]>(ADMIN_KEYS.staff, (l) =>
    l?.map((s) => (s.id === row.id ? row : s)),
  );
}

export function dropStaff(qc: QueryClient, id: string) {
  qc.setQueryData<StaffOut[]>(ADMIN_KEYS.staff, (l) =>
    l?.filter((s) => s.id !== id),
  );
}

/** After any staff write: the list (others may have changed it too), the log, oversight. */
export async function refreshStaff(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ADMIN_KEYS.staff }),
    qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll }),
    qc.invalidateQueries({ queryKey: ADMIN_KEYS.oversight }),
  ]);
}

export function useInviteStaff() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ i, key }: { i: InviteIn; key: string }) =>
      getAdminClient().inviteStaff(i, { idempotencyKey: key }),
    ...WRITE,
    onSuccess: (r) =>
      qc.setQueryData<StaffOut[]>(ADMIN_KEYS.staff, (l) =>
        l ? [...l, ...r.invited] : l,
      ),
    onSettled: () => void refreshStaff(qc),
  });
  return {
    ...m,
    mutate: (i: InviteIn, o?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ i, key: newKey() }, o),
  };
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({
      id,
      p,
      key,
    }: {
      id: string;
      p: StaffPatchIn;
      key: string;
    }) => getAdminClient().updateStaff(id, p, { idempotencyKey: key }),
    ...WRITE,
    onSuccess: (row) => putStaff(qc, row),
    // Gone: drop it now. Stale: the refresh below loads the latest (R7).
    onError: (e, v) => {
      if (statusOf(e) === 404) dropStaff(qc, v.id);
    },
    onSettled: () => void refreshStaff(qc),
  });
  return {
    ...m,
    mutate: (
      v: { id: string; p: StaffPatchIn },
      o?: Parameters<typeof m.mutate>[1],
    ) => m.mutate({ ...v, key: newKey() }, o),
  };
}

export function useStaffAction() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({
      id,
      action,
      key,
    }: {
      id: string;
      action: StaffAction;
      key: string;
    }) => getAdminClient().staffAction(id, action, { idempotencyKey: key }),
    ...WRITE,
    onSuccess: (row) => putStaff(qc, row),
    onError: (e, v) => {
      if (statusOf(e) === 404) dropStaff(qc, v.id);
    },
    onSettled: () => void refreshStaff(qc),
  });
  return {
    ...m,
    mutate: (
      v: { id: string; action: StaffAction },
      o?: Parameters<typeof m.mutate>[1],
    ) => m.mutate({ ...v, key: newKey() }, o),
  };
}

export function useRemoveStaff() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) =>
      getAdminClient().removeStaff(id, { idempotencyKey: key }),
    ...WRITE,
    onSuccess: (_d, v) => dropStaff(qc, v.id),
    onError: (e, v) => {
      if (statusOf(e) === 404) dropStaff(qc, v.id);
    },
    onSettled: () => void refreshStaff(qc),
  });
  return {
    ...m,
    mutate: (v: { id: string }, o?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ ...v, key: newKey() }, o),
  };
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ p, key }: { p: SettingsPatchIn; key: string }) =>
      getAdminClient().updateSettings(p, { idempotencyKey: key }),
    ...WRITE,
    onSuccess: (s) => qc.setQueryData(ADMIN_KEYS.settings, s),
    onError: (e) => {
      if (statusOf(e) === 409)
        void qc.invalidateQueries({ queryKey: ADMIN_KEYS.settings });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll });
      void qc.invalidateQueries({ queryKey: ADMIN_KEYS.oversight });
    },
  });
  return {
    ...m,
    mutate: (p: SettingsPatchIn, o?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ p, key: newKey() }, o),
  };
}

function useOversightWrite<V extends { id: string }>(
  send: (v: V, key: string) => Promise<void>,
) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ v, key }: { v: V; key: string }) => send(v, key),
    ...WRITE,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_KEYS.oversight });
      void qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll });
    },
  });
  return {
    ...m,
    mutate: (v: V, o?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ v, key: newKey() }, o),
  };
}

export const useRemindReviewers = () =>
  useOversightWrite<{ id: string }>((v, key) =>
    getAdminClient().remindReviewers(v.id, { idempotencyKey: key }),
  );

export const useAssignReviewer = () =>
  useOversightWrite<{ id: string; staffId: string }>((v, key) =>
    getAdminClient().assignReviewer(v.id, v.staffId, { idempotencyKey: key }),
  );
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/admin-queries.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-queries.ts lib/admin-queries.test.tsx
git commit -m "Add query hooks for staff, settings, usage, activity and oversight"
```

---

### Task 8: One shell, two sides: routes, gates and the sidebar group

**Files:**

- Move (unchanged content, `git mv`): `app/(clinical)/page.tsx`,
  `app/(clinical)/c/`, `app/(clinical)/help/`,
  `app/(clinical)/my-feedback/`, `app/(clinical)/review/` →
  `app/(clinical)/(clinician)/…`
- Create: `app/(clinical)/(clinician)/layout.tsx`,
  `app/(clinical)/admin/layout.tsx`, `app/(clinical)/admin/page.tsx`,
  `components/shell/admin-nav.tsx`
- Modify: `app/(clinical)/layout.tsx`, `components/auth/auth-gate.tsx`,
  `components/auth/auth-gate.test.tsx`, `components/shell/app-shell.tsx`,
  `components/shell/app-shell.test.tsx`, `components/shell/sidebar.tsx`,
  `components/shell/sidebar.test.tsx`, `components/shell/account-menu.tsx`,
  `components/shell/account-menu.test.tsx`,
  `components/account/account-view.tsx`,
  `components/account/account-view.test.tsx`,
  `components/consultation/home.test.tsx` (import path), `CHANGELOG.md`
- Test: the five test files above

**Interfaces:**

- Consumes: `homeFor` (Task 1), `canUse`, `isAdminOnly`, `isHospitalAdmin`,
  `Area`, `ADMIN_HOME` (Task 1); `useStaff` (Task 7); `useRedirect`.
- Produces:
  - `AuthGate({ children, need = "clinical" }: { children: ReactNode; need?: Area | "any" })`:
    `need="any"` admits clinicians and hospital admins; `"clinical"` and
    `"admin"` send anyone else to `homeFor(...)`, mounting nothing;
  - `ADMIN_LINKS` and `AdminNav({ rail }: { rail: boolean })` in
    `components/shell/admin-nav.tsx`: the "Hospital admin" group (Staff,
    Hospital settings, Activity, Usage) with `aria-current="page"` on the
    current one;
  - `Sidebar` shows the clinical block unless `isAdminOnly(user)`, and
    `AdminNav` when `isHospitalAdmin(user)`;
  - `AppShell` mounts `DecisionsProvider`, `DegradedStrip`,
    `CommandPalette`, `ShortcutsDialog` and the ⌘K, ? and N shortcuts only
    when `!isAdminOnly(user)`;
  - `AccountMenu` hides My feedback & corrections, Keyboard shortcuts and
    Help & guide for admin-only people, and shows "Hospital admin" in the
    role line for any hospital admin;
  - `AccountView` hides My feedback for admin-only people.

**Routing after this task (R2, R4):**

```text
app/(clinical)/layout.tsx              AuthGate need="any" + AppShell
app/(clinical)/account/page.tsx        both sides
app/(clinical)/(clinician)/layout.tsx  AuthGate need="clinical"
app/(clinical)/(clinician)/page.tsx, c/[id]/, help/, my-feedback/, review/
app/(clinical)/admin/layout.tsx        AuthGate need="admin"
app/(clinical)/admin/page.tsx          redirect → /admin/staff
app/print/[id]/page.tsx                AuthGate (default need="clinical"), unchanged
```

- [ ] **Step 1: Write the failing tests**

In `components/auth/auth-gate.test.tsx`, add `type Area` to imports
(`import type { Area, Role } from "@/lib/auth/types";`), replace `gated`
with:

```tsx
const gated = (need?: Area | "any") => (
  <AuthGate need={need}>
    <Clinical />
  </AuthGate>
);
const as = (...roles: Role[]) => ({ ...TEST_USER, roles });
```

and add:

```tsx
it("sends an admin-only person from a clinical page to Staff, mounting nothing (Review Focus 5)", async () => {
  Clinical.mockClear();
  renderWithAuth(gated("clinical"), as("hospital_admin"));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
  expect(Clinical).not.toHaveBeenCalled();
});
it("sends a clinician who isn't an admin from an admin page home", async () => {
  Clinical.mockClear();
  renderWithAuth(gated("admin"), as("clinician"));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  expect(Clinical).not.toHaveBeenCalled();
});
it("lets a medical director into both sides", () => {
  renderWithAuth(
    <>
      {gated("clinical")}
      {gated("admin")}
    </>,
    as("clinician", "hospital_admin"),
  );
  expect(screen.getAllByText("clinical screen")).toHaveLength(2);
  expect(replace).not.toHaveBeenCalled();
});
it("the shared shell admits both roles but never a platform account", async () => {
  const { unmount } = renderWithAuth(gated("any"), as("hospital_admin"));
  expect(screen.getByText("clinical screen")).toBeInTheDocument();
  unmount();
  Clinical.mockClear();
  renderWithAuth(gated("any"), as("auditor"));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/no-access"));
  expect(Clinical).not.toHaveBeenCalled();
});
```

In `components/shell/sidebar.test.tsx`, add after the existing mocks:

```tsx
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { TEST_USER } from "@/tests/auth-wrapper";
import { mockAdminAs } from "@/tests/admin";

const adminHolder = vi.hoisted(() => ({
  client: null as unknown as AdminClient,
}));
vi.mock("@/lib/api/admin", () => ({
  getAdminClient: () => adminHolder.client,
}));
```

set `adminHolder.client = mockAdminAs(DEMO_EMAILS.director);` in the
existing `beforeEach`, and add inside `describe("Sidebar", …)`:

```tsx
it("shows no hospital admin group to a clinician", () => {
  renderWithAuth(<Sidebar items={[]} />);
  expect(screen.queryByRole("region", { name: "Hospital admin" })).toBeNull();
});

it("shows a medical director both sides", async () => {
  renderWithAuth(<Sidebar items={items} />, {
    ...TEST_USER,
    roles: ["clinician", "hospital_admin"],
  });
  const group = screen.getByRole("region", { name: "Hospital admin" });
  expect(
    within(group)
      .getAllByRole("link")
      .map((l) => l.getAttribute("aria-label")),
  ).toEqual(["Staff", "Hospital settings", "Activity", "Usage"]);
  expect(within(group).getByRole("link", { name: "Staff" })).toHaveAttribute(
    "href",
    "/admin/staff",
  );
  expect(
    await within(group).findByText("12 members · 2 invites pending"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "New consultation" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Chest pain, 54 M")).toBeInTheDocument();
});

it("shows an admin-only person the admin group and nothing clinical (R3)", () => {
  renderWithAuth(<Sidebar items={items} />, {
    ...TEST_USER,
    roles: ["hospital_admin"],
  });
  expect(
    screen.getByRole("region", { name: "Hospital admin" }),
  ).toBeInTheDocument();
  for (const name of [
    /New consultation/,
    /Search consultations/,
    /Review corrections/,
    /^Help$/,
  ])
    expect(
      screen.queryByRole("link", { name }) ??
        screen.queryByRole("button", { name }),
    ).toBeNull();
  expect(screen.queryByText("Chest pain, 54 M")).toBeNull();
  expect(
    screen.getByText("Hospital admin", { selector: "p" }),
  ).toBeInTheDocument();
});

it("marks the current admin page, also on its sub-pages", () => {
  pathname.value = "/admin/activity/oversight";
  renderWithAuth(<Sidebar items={[]} />, {
    ...TEST_USER,
    roles: ["hospital_admin"],
  });
  expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Staff" })).not.toHaveAttribute(
    "aria-current",
  );
});
```

For the last test, make the pathname mock settable: replace the existing
`next/navigation` mock in that file with

```tsx
const pathname = vi.hoisted(() => ({ value: "/c/q1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
```

reset `pathname.value = "/c/q1";` in `beforeEach`, and add `within` to the
`@testing-library/react` import.

In `components/shell/account-menu.test.tsx`, add:

```tsx
it("gives an admin-only person only their account and sign out", async () => {
  renderWithAuth(<AccountMenu rail={false} />, {
    ...TEST_USER,
    displayName: "Grace Nwosu",
    fullName: "Grace Nwosu",
    roleTitle: "Hospital IT lead",
    specialty: null,
    roles: ["hospital_admin"],
  });
  expect(
    screen.getByText("Hospital IT lead · Hospital admin"),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Account: Grace Nwosu" }),
  );
  expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
    "Profile & security",
    "Sign out",
  ]);
});

it("shows a medical director's admin role in the footer", () => {
  renderWithAuth(<AccountMenu rail={false} />, {
    ...TEST_USER,
    roleTitle: "Medical director",
    roles: ["clinician", "hospital_admin"],
  });
  expect(
    screen.getByText("Medical director · Hospital admin"),
  ).toBeInTheDocument();
});
```

In `components/account/account-view.test.tsx`, add inside
`describe("AccountView feedback", …)`:

```tsx
it("has no feedback section for a hospital admin who isn't a clinician", async () => {
  const getStats = vi.spyOn(holder.client, "getMyFeedbackStats");
  await signedIn({ ...TEST_USER, roles: ["hospital_admin"] });
  expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "My feedback" })).toBeNull();
  expect(screen.queryByRole("link", { name: "My feedback" })).toBeNull();
  expect(getStats).not.toHaveBeenCalled();
});
```

In `components/shell/app-shell.test.tsx`, add `import { TEST_USER } from "@/tests/auth-wrapper";`
and:

```tsx
describe("AppShell for a hospital admin who isn't a clinician", () => {
  it("has no shortcuts, search or decision bell (R3)", async () => {
    render(
      <Providers
        auth={{ initialUser: { ...TEST_USER, roles: ["hospital_admin"] } }}
      >
        <AppShell>
          <p>admin page</p>
        </AppShell>
      </Providers>,
    );
    expect(screen.getByText("admin page")).toBeInTheDocument();
    await userEvent.keyboard("?");
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog", { name: /shortcuts/i })).toBeNull();
    expect(screen.queryByRole("dialog", { name: /search/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Decisions on your corrections/ }),
    ).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
```

In `components/consultation/home.test.tsx`, change
`import Page from "@/app/(clinical)/page";` to
`import Page from "@/app/(clinical)/(clinician)/page";`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/auth/auth-gate.test.tsx components/shell components/account/account-view.test.tsx`
Expected: FAIL: `AuthGate` has no `need`; no "Hospital admin" region; the
account menu lists clinical items for an admin-only person.

- [ ] **Step 3: Move the clinical pages and add the layouts**

```bash
mkdir -p "app/(clinical)/(clinician)"
git mv "app/(clinical)/page.tsx" "app/(clinical)/(clinician)/page.tsx"
git mv "app/(clinical)/c" "app/(clinical)/(clinician)/c"
git mv "app/(clinical)/help" "app/(clinical)/(clinician)/help"
git mv "app/(clinical)/my-feedback" "app/(clinical)/(clinician)/my-feedback"
git mv "app/(clinical)/review" "app/(clinical)/(clinician)/review"
```

Replace `app/(clinical)/layout.tsx` with:

```tsx
import { ViewTransition } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/shell/app-shell";

/** One shell for both sides, so a medical director keeps it when switching (R2). */
export default function ClinicalAppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate need="any">
      <AppShell>
        <ViewTransition name="main-content">{children}</ViewTransition>
      </AppShell>
    </AuthGate>
  );
}
```

Create `app/(clinical)/(clinician)/layout.tsx`:

```tsx
import { AuthGate } from "@/components/auth/auth-gate";

/** Clinical screens: clinicians only. Anyone else goes to their home (R2). */
export default function ClinicianLayout({ children }: LayoutProps<"/">) {
  return <AuthGate need="clinical">{children}</AuthGate>;
}
```

Create `app/(clinical)/admin/layout.tsx`:

```tsx
import { AuthGate } from "@/components/auth/auth-gate";

/** The hospital admin side: hospital admins only (spec §5.6). */
export default function HospitalAdminLayout({
  children,
}: LayoutProps<"/admin">) {
  return <AuthGate need="admin">{children}</AuthGate>;
}
```

Create `app/(clinical)/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/auth/types";

export default function AdminIndex() {
  redirect(ADMIN_HOME);
}
```

- [ ] **Step 4: The gate**

Replace `components/auth/auth-gate.tsx` with:

```tsx
"use client";
import type { ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { canUse, type Area } from "@/lib/auth/types";
import { useRedirect } from "@/lib/auth/use-redirect";

/**
 * Screens for a signed-in person who has finished first sign-in and may use
 * this side (`need`): "clinical", "admin", or "any" (the shared shell and
 * the account page). Everyone else is redirected to their home and nothing
 * mounts meanwhile, so no query for the wrong side runs. After a sign-out
 * the gate redirects again, so Back never leaves a blank page.
 */
export function AuthGate({
  children,
  need = "clinical",
}: {
  children: ReactNode;
  need?: Area | "any";
}) {
  const { status, user, steps } = useAuth();
  const home = status === "signed_in" ? homeFor({ user, steps }) : null;
  let target: string | null = null;
  if (status === "signed_out") target = "/sign-in";
  else if (home === "/welcome" || home === "/no-access") target = home;
  else if (home && need !== "any" && !canUse(user, need)) target = home;
  useRedirect(target);
  if (status !== "signed_in" || target) return null;
  return children;
}
```

- [ ] **Step 5: The shell by role**

In `components/shell/app-shell.tsx`, add the imports
`import { useAuth } from "@/lib/auth/auth-context";` and
`import { isAdminOnly } from "@/lib/auth/types";`. At the top of
`AppShell`, add:

```tsx
// A hospital admin who isn't a clinician gets no clinical tools (R3).
const { user } = useAuth();
const clinical = !isAdminOnly(user);
```

replace the `useShortcuts({...})` call with:

```tsx
useShortcuts(
  clinical
    ? { "mod+k": openSearch, "?": openShortcuts, n: () => navigate("/") }
    : {},
);
```

and replace the returned tree with:

```tsx
const body = (
  <>
    <div className="grid h-[calc(100dvh-var(--demo-h,0px))] grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)]">
      {/* Sidebar reads usePathname(); with cacheComponents it must sit in Suspense. */}
      <div className="hidden md:block xl:hidden">
        <Suspense fallback={null}>
          <Sidebar items={items} rail onOpenSearch={openSearch} />
        </Suspense>
      </div>
      <div className="hidden xl:block">
        <Suspense fallback={null}>
          <Sidebar items={items} onOpenSearch={openSearch} />
        </Suspense>
      </div>
      <main className="canvas-v3 relative flex min-w-0 flex-col overflow-hidden">
        <OfflineStrip />
        {/* The health check is a clinical call. */}
        {clinical && <DegradedStrip />}
        {children}
      </main>
    </div>
    <MobileDrawer
      open={drawer}
      onClose={() => setDrawer(false)}
      items={items}
      onOpenSearch={openSearch}
    />
    {clinical && (
      <>
        <CommandPalette
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
        <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
      </>
    )}
  </>
);
return (
  <Ctx.Provider value={ctx}>
    {/* Polls your corrections and toasts decisions, for clinicians (R9, Plan 3). */}
    {clinical ? <DecisionsProvider>{body}</DecisionsProvider> : body}
  </Ctx.Provider>
);
```

Create `components/shell/admin-nav.tsx`:

```tsx
"use client";
import { Activity, ChartColumn, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import type { StaffOut } from "@/lib/api/admin-contract";
import { useStaff } from "@/lib/admin-queries";
import { cn } from "../ui/cn";

export const ADMIN_LINKS = [
  { href: "/admin/staff", label: "Staff", sub: null, Icon: Users },
  {
    href: "/admin/settings",
    label: "Hospital settings",
    sub: "Review rules, security, sign-in",
    Icon: Settings,
  },
  {
    href: "/admin/activity",
    label: "Activity",
    sub: "Log and review oversight",
    Icon: Activity,
  },
  {
    href: "/admin/usage",
    label: "Usage",
    sub: "Counts only",
    Icon: ChartColumn,
  },
] as const;

/** "12 members · 1 invite pending", as the mockup's sidebar shows. */
function staffLine(list: StaffOut[] | undefined): string | null {
  if (!list) return null;
  const members = list.filter((s) => s.status !== "deactivated").length;
  const invites = list.filter((s) => s.status === "invited").length;
  return `${members} members · ${invites} ${invites === 1 ? "invite" : "invites"} pending`;
}

/** The sidebar's "Hospital admin" group (spec §5.6, R3). */
export function AdminNav({ rail }: { rail: boolean }) {
  const path = usePathname();
  const staff = useStaff();
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="mt-3">
      <h3
        id={heading}
        className={cn(
          "mx-2 mb-1.5 text-[10.5px] uppercase tracking-[.1em] text-ink-3",
          rail && "sr-only",
        )}
      >
        Hospital admin
      </h3>
      <ul className="flex flex-col gap-0.5">
        {ADMIN_LINKS.map(({ href, label, sub, Icon }) => {
          const on = path === href || path.startsWith(`${href}/`);
          const line = href === "/admin/staff" ? staffLine(staff.data) : sub;
          return (
            <li key={href}>
              <Link
                href={href}
                title={label}
                aria-label={label}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-[10px] text-[13px] text-ink-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep",
                  rail ? "w-11 justify-center" : "px-2 py-1.5",
                  on &&
                    "bg-mint-wash text-mint-deep shadow-[inset_3px_0_0_var(--color-mint)]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg",
                    on ? "bg-white" : "bg-lilac text-bloom",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                {!rail && (
                  <span className="min-w-0 leading-tight">
                    <span className="block font-semibold">{label}</span>
                    {line && (
                      <small
                        aria-hidden
                        className="block text-[11px] text-ink-3"
                      >
                        {line}
                      </small>
                    )}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

In `components/shell/sidebar.tsx`, add the imports
`import { useAuth } from "@/lib/auth/auth-context";`,
`import { isAdminOnly, isHospitalAdmin } from "@/lib/auth/types";` and
`import { AdminNav } from "./admin-nav";`, keep `DOT` and `ReviewLink` as
they are, and replace the whole `Sidebar` function with:

```tsx
/** `rail` hides labels (tablet). Labels stay in the accessibility tree via sr-only. */
export function Sidebar({
  items,
  rail = false,
  onOpenSearch,
}: {
  items: SessionItem[];
  rail?: boolean;
  onOpenSearch?: () => void;
}) {
  const path = usePathname();
  const now = useNow(60_000);
  const label = rail ? "sr-only" : "";
  const { user } = useAuth();
  // A hospital admin who isn't a clinician sees no clinical parts (R3).
  const adminOnly = isAdminOnly(user);
  const admin = isHospitalAdmin(user);
  return (
    <nav
      aria-label={adminOnly ? "Hospital admin side" : "Consultations"}
      className={cn(
        "relative flex h-full flex-col border-r border-line bg-gradient-to-b from-white to-[#fbf8fc] py-[18px]",
        rail ? "items-center px-3" : "px-3.5",
      )}
    >
      <div className={cn("pb-4", rail ? "" : "px-1.5")}>
        {rail ? (
          <Mark />
        ) : (
          <>
            <Logo />
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3">
              <span className="relative size-[7px] rounded-full bg-mint after:absolute after:-inset-[3px] after:animate-[ring_calc(var(--t-story)*3.4)_ease-out_infinite] after:rounded-full after:border-[1.5px] after:border-mint" />
              {adminOnly ? "Hospital admin" : "Clinical decision support"}
            </p>
          </>
        )}
      </div>
      {!adminOnly && (
        <>
          <Link
            href="/"
            title="New consultation"
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-mint font-semibold text-white shadow-[0_10px_24px_-10px_var(--color-mint)]",
              rail ? "size-11" : "px-3",
            )}
          >
            <Plus aria-hidden className="size-5" />
            <span className={label}>New consultation</span>
          </Link>
          <OutboxIndicator rail={rail} />
          <button
            type="button"
            onClick={onOpenSearch}
            title="Search consultations (⌘K)"
            className={cn(
              "mt-2.5 flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-bg text-[13px] text-ink-3",
              rail ? "w-11 justify-center" : "px-2.5",
            )}
          >
            <Search aria-hidden className="size-4" />
            <span className={label}>Search consultations</span>
            {!rail && (
              <kbd className="ml-auto rounded border border-lilac-2 px-1.5 font-mono text-[10.5px]">
                ⌘K
              </kbd>
            )}
          </button>
          <ReviewLink rail={rail} on={path === "/review"} />
        </>
      )}
      {admin && <AdminNav rail={rail} />}
      {adminOnly ? (
        // Keeps the account menu at the bottom.
        <div className="flex-1" />
      ) : (
        <div className="mt-2 flex-1 overflow-y-auto">
          {groupHistory(items, now).map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3
                className={cn(
                  "mx-2 mb-1.5 mt-[18px] text-[10.5px] uppercase tracking-[.1em] text-ink-3",
                  rail && "sr-only",
                )}
              >
                {g.label}
              </h3>
              {g.items.map((i) => {
                const on = path === `/c/${i.id}`;
                const status = historyStatus(i);
                return (
                  <Link
                    key={i.id}
                    href={`/c/${i.id}`}
                    title={i.title}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-start gap-2.5 rounded-[10px] p-2 text-[13px] leading-tight hover:bg-bg",
                      on &&
                        "bg-mint-wash shadow-[inset_3px_0_0_var(--color-mint)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg bg-lilac text-bloom",
                        on && "bg-white text-mint-deep",
                        rail && "size-[38px]",
                      )}
                    >
                      <Stethoscope className="size-3.5" />
                    </span>
                    <span className={label}>
                      {i.title}
                      {i.flagged && (
                        <span
                          aria-label="Flagged"
                          className="ml-1.5 inline-block size-[7px] rounded-full bg-[#f0a640]"
                        />
                      )}
                      <small className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                        {status.dot && (
                          <span
                            aria-hidden
                            className={cn(
                              "size-[7px] rounded-full",
                              DOT[status.dot],
                            )}
                          />
                        )}
                        {status.label} · {ago(i.createdAt, now)}
                      </small>
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
          <p
            className={cn(
              "px-2 pt-2 text-[10.5px] text-ink-3",
              rail && "sr-only",
            )}
          >
            History is kept for this session only.
          </p>
        </div>
      )}
      {!adminOnly && (
        <Link
          href="/help"
          title="Help"
          className={cn(
            "mb-1.5 flex min-h-11 items-center gap-2 rounded-[10px] text-[13px] text-ink-2 hover:bg-bg",
            rail ? "size-11 justify-center" : "px-2.5",
          )}
        >
          <CircleHelp aria-hidden className="size-4" />
          <span className={label}>Help</span>
        </Link>
      )}
      <AccountMenu rail={rail} />
    </nav>
  );
}
```

(Everything inside the clinical fragment and the history `div` is today's
markup, unchanged; only the conditions and `AdminNav` are new.)

In `components/shell/account-menu.tsx`, add
`import { isAdminOnly, isHospitalAdmin } from "@/lib/auth/types";`, replace
the `role` line with:

```tsx
const adminOnly = isAdminOnly(user);
// "Medical director · Hospital admin" (mockup footer); clinicians keep their specialty.
const role = [
  user.roleTitle,
  isHospitalAdmin(user) && user.roleTitle !== "Hospital admin"
    ? "Hospital admin"
    : user.specialty,
]
  .filter(Boolean)
  .join(" · ");
```

and replace the three menu items between the "Profile & security" link and
the "Sign out" button with:

```tsx
{
  !adminOnly && (
    <>
      <Link
        role="menuitem"
        href="/my-feedback"
        className={ITEM}
        onClick={() => {
          close(false);
          closeDrawer();
        }}
      >
        <PenLine aria-hidden className="size-4" />
        My feedback &amp; corrections
      </Link>
      <button
        role="menuitem"
        type="button"
        className={ITEM}
        onClick={() => {
          close(false);
          openShortcuts();
        }}
      >
        <Keyboard aria-hidden className="size-4" />
        Keyboard shortcuts
      </button>
      <Link
        role="menuitem"
        href="/help"
        className={ITEM}
        onClick={() => {
          close(false);
          closeDrawer();
        }}
      >
        <CircleHelp aria-hidden className="size-4" />
        Help &amp; guide
      </Link>
    </>
  );
}
```

In `components/account/account-view.tsx`, add
`import { isAdminOnly } from "@/lib/auth/types";`, and after
`if (!user) return null;` add `const clinical = !isAdminOnly(user);`; change
the sections list's last entry to
`...(clinical ? [["feedback", "My feedback"]] : []),` and
`<FeedbackSection />` to `{clinical && <FeedbackSection />}`.

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Hospital admins: a "Hospital admin" group in the sidebar (Staff,
  Hospital settings, Activity, Usage). A medical director who is also a
  clinician sees both sides; a hospital admin who isn't a clinician signs
  straight in to Staff and never sees clinical screens.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components app lib`
Expected: PASS (all existing tests too: they render with a clinician or with
nobody signed in, where `isAdminOnly` is false).

Run: `npm run typecheck && npm run lint`
Expected: clean. `next typegen` (inside `typecheck`) regenerates the route
types for the moved pages and `LayoutProps<"/admin">`.

- [ ] **Step 7: Commit**

```bash
git add app components CHANGELOG.md
git commit -m "Route each role to its side and add the Hospital admin group"
```

---

### Task 9: The staff member panel and editing access

**Files:**

- Create: `components/ui/side-panel.tsx`, `components/admin/chips.tsx`,
  `components/admin/access-editor.tsx`, `components/admin/staff-panel.tsx`,
  `components/admin/staff-panel.test.tsx`, `tests/admin-render.tsx`
- Modify: `components/ui/chip.tsx` (muted tone), `lib/hooks/use-focus-trap.ts`,
  `lib/hooks/use-focus-trap.test.tsx`, `lib/admin/staff.ts`,
  `lib/admin/staff.test.ts`
- Test: `components/admin/staff-panel.test.tsx`,
  `lib/hooks/use-focus-trap.test.tsx`, `lib/admin/staff.test.ts`

**Interfaces:**

- Consumes: `useStaff`, `useHospitalSettings`, `useStaffActivity`,
  `useUpdateStaff` (Task 7); `STAFF_STATE`, `ROLE_LABEL`, `staffState`,
  `statusText`, `inviteNote`, `guardFor`, `sortName` (Task 5);
  `adminError` (Task 5); `describeEvent`, `actorName`, `eventClock`,
  `FLAG_LABEL` (Task 6); `Avatar` (`components/shell/account-menu.tsx`);
  `Banner`, `Button`, `Chip`, `Skeleton`, `useToast`; `useEscape`,
  `useFocusTrap`, `useNow`, `useNetwork`; `screenAdminAs` (Task 3).
- Produces:
  - `Chip` tone `muted`;
  - `SidePanel({ open, onClose, title, children })`: right-hand panel from
    `md`, bottom sheet below; focus trap, Esc (ignored while a modal dialog
    is open on top), a 44 px Close button;
  - `useFocusTrap` leaves Tab alone while a modal `<dialog>` is open on top
    (the browser's modal dialog keeps focus inside itself);
  - `StaffStatusChip({ staff, now })`, `RoleChips({ roles })`,
    `FlagChip({ flag })` in `components/admin/chips.tsx`;
  - `policyBroken(s: StaffOut, requireForClinicians: boolean): boolean` in
    `lib/admin/staff.ts`;
  - `patchFor(row: StaffOut, d: AccessDraft): StaffPatchIn | null` and
    `AccessEditor({ row, list, specialties })`;
  - `StaffPanel({ staffId, onClose }: { staffId: string | null; onClose(): void })`
    (Task 10 adds the account actions inside it);
  - `tests/admin-render.tsx`: `DIRECTOR`, `HOSPITAL_ADMIN` (`User`),
    `renderAdmin(ui, user = DIRECTOR)` (auth, query cache and toasts).

- [ ] **Step 1: Write the failing tests**

Create `tests/admin-render.tsx`:

```tsx
import type { ReactElement } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import type { User } from "@/lib/auth/types";
import { renderWithAuth, TEST_USER } from "./auth-wrapper";

export const DIRECTOR: User = {
  ...TEST_USER,
  username: "director.obi",
  email: DEMO_EMAILS.director,
  displayName: "Dr. Obi",
  fullName: "Dr. Ngozi Obi",
  roleTitle: "Medical director",
  specialty: "Emergency medicine",
  roles: ["clinician", "hospital_admin"],
};

export const HOSPITAL_ADMIN: User = {
  ...TEST_USER,
  username: "admin.nwosu",
  email: DEMO_EMAILS.hospitalAdmin,
  displayName: "Grace Nwosu",
  fullName: "Grace Nwosu",
  roleTitle: "Hospital IT lead",
  specialty: null,
  roles: ["hospital_admin"],
};

/** An admin screen with a signed-in admin, a fresh query cache and toasts. */
export const renderAdmin = (ui: ReactElement, user: User = DIRECTOR) =>
  renderWithAuth(<ToastProvider>{ui}</ToastProvider>, user);
```

In `lib/admin/staff.test.ts`, add `policyBroken` to the import and:

```ts
describe("policyBroken", () => {
  it("warns when 2-step is missing and the hospital requires it", () => {
    const missing = makeStaff({ issues: ["mfa_not_set_up"] });
    expect(policyBroken(missing, true)).toBe(true);
    expect(policyBroken(missing, false)).toBe(false);
    // Hospital admins always need it (spec §10 item 7).
    expect(policyBroken({ ...missing, roles: ["hospital_admin"] }, false)).toBe(
      true,
    );
    expect(policyBroken({ ...missing, status: "deactivated" }, true)).toBe(
      false,
    );
    expect(policyBroken(makeStaff(), true)).toBe(false);
  });
});
```

In `lib/hooks/use-focus-trap.test.tsx`, add (with `useRef` from `react` and
`render`, `screen` from `@testing-library/react` imported if missing):

```tsx
it("leaves Tab to a modal dialog opened on top", () => {
  function Panel() {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(true, ref);
    return (
      <div ref={ref}>
        <button>inside</button>
      </div>
    );
  }
  render(
    <>
      <Panel />
      <dialog open>
        <button>in dialog</button>
      </dialog>
    </>,
  );
  const button = screen.getByRole("button", { name: "in dialog" });
  button.focus();
  const tab = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(false);
  expect(button).toHaveFocus();
});
```

Create `components/admin/staff-panel.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { LAST_ADMIN } from "@/lib/admin/staff";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { StaffPanel } from "./staff-panel";

const onClose = vi.fn();
beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  onClose.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const open = async (id: string) => {
  renderAdmin(<StaffPanel staffId={id} onClose={onClose} />);
  return screen.findByRole("dialog", { name: "Staff member" });
};

describe("StaffPanel", () => {
  it("shows the person, the policy warning and recent activity", async () => {
    const panel = await open("s-mensah");
    expect(
      await within(panel).findByText("Dr. Kofi Mensah"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/k\.mensah@havanahospital\.org/),
    ).toBeInTheDocument();
    expect(within(panel).getByText("2-step not set up")).toBeInTheDocument();
    expect(
      await within(panel).findByText("2-step verification isn't set up"),
    ).toBeInTheDocument();
    expect(
      await within(panel).findByText(
        /Changed Dr. Mensah's specialty to Cardiology · by Dr. Obi/,
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Every change is recorded in the activity log."),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("changes the specialty and saves only that, with the version", async () => {
    const update = vi.spyOn(holder.client, "updateStaff");
    const panel = await open("s-mensah");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Internal Medicine",
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "s-mensah",
        { version: 1, specialty: "Internal Medicine" },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  it("needs at least one role, and review rights need a specialty", async () => {
    const panel = await open("s-okafor");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Clinician" }),
    );
    expect(
      within(panel).getByText("Choose at least one role."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "Clinician" }),
    );
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "Infectious disease" }),
    );
    expect(
      within(panel).getByText(
        "Choose at least one specialty they can review in.",
      ),
    ).toBeInTheDocument();
  });

  it("your own admin role can't be unticked (Review Focus 1)", async () => {
    const panel = await open("s-obi");
    const admin = await within(panel).findByRole("checkbox", {
      name: "Hospital admin",
    });
    expect(admin).toBeChecked();
    expect(admin).toBeDisabled();
    expect(admin).toHaveAccessibleDescription(
      "You can't remove your own hospital admin role. Ask another hospital admin.",
    );
    expect(within(panel).getByText("(you)")).toBeInTheDocument();
  });

  it("the last admin keeps the role (Review Focus 4)", async () => {
    holder.client = screenAdminAs(null);
    await holder.client.staffAction("s-nwosu", "deactivate");
    const panel = await open("s-obi");
    const admin = await within(panel).findByRole("checkbox", {
      name: "Hospital admin",
    });
    expect(admin).toBeDisabled();
    expect(admin).toHaveAccessibleDescription(LAST_ADMIN);
  });

  it("shows the latest after a conflict (Review Focus 2)", async () => {
    const panel = await open("s-bello");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    // Another admin changes Dr. Bello first.
    await holder.client.updateStaff("s-bello", {
      version: 1,
      specialty: "Cardiology",
    });
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(panel).findByText("Someone else changed this just now"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(panel).getByLabelText("Specialty")).toHaveValue(
        "Cardiology",
      ),
    );
  });

  it("says when the person was removed elsewhere (Review Focus 2)", async () => {
    const panel = await open("s-bello");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    await holder.client.removeStaff("s-bello");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(panel).findByText(
        "This person is no longer on the staff list",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Back to staff" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("can't save offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const panel = await open("s-mensah");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
    expect(
      within(panel).getByText("You're offline. Changes need a connection."),
    ).toBeInTheDocument();
  });

  it("closes with Esc", async () => {
    await open("s-mensah");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("wraps a very long name instead of cutting it", async () => {
    const panel = await open("s-long");
    const name = await within(panel).findByText(
      "Dr. Oluwaseun Adebayo-Ogunleye-Fashola",
    );
    expect(name.closest("[class*='overflow-wrap']")).not.toBeNull();
    expect(name.className).not.toMatch(/truncate/);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/staff-panel.test.tsx lib/hooks/use-focus-trap.test.tsx lib/admin/staff.test.ts`
Expected: FAIL: `./staff-panel` doesn't exist; the trap prevents Tab in the
dialog; `policyBroken` isn't exported.

- [ ] **Step 3: The primitives**

In `components/ui/chip.tsx`, add to `TONE`:

```ts
  muted: "bg-lilac-2 text-ink-2",
```

In `lib/hooks/use-focus-trap.ts`, inside `onKey`, right after
`if (e.key !== "Tab") return;`, add:

```ts
// A modal <dialog> opened on top (even one rendered inside this panel,
// which showModal() lifts into the top layer) owns the keyboard.
if ([...document.querySelectorAll("dialog[open]")].some((d) => d !== panel))
  return;
```

Create `components/ui/side-panel.tsx`:

```tsx
"use client";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useEscape } from "@/lib/hooks/use-escape";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";

/**
 * A side panel from `md` (the mockup's staff member panel), a bottom sheet
 * below it (R13). Traps focus, closes on Esc and returns focus on close.
 */
export function SidePanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  // Esc belongs to a confirm dialog opened on top, if there is one.
  useEscape(open, () => {
    if (!document.querySelector("dialog[open]")) onClose();
  });
  useFocusTrap(open, panel);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-ink/35"
      />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-auto rounded-t-[26px] bg-white px-4 pb-6 pt-3 shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-[26px] md:px-6 md:pt-5"
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid size-11 place-items-center rounded-xl text-ink-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
```

Create `components/admin/chips.tsx`:

```tsx
import {
  CheckCircle2,
  Clock,
  Flag,
  ShieldAlert,
  TriangleAlert,
  UserX,
} from "lucide-react";
import type { StaffOut, StaffRole } from "@/lib/api/admin-contract";
import { FLAG_LABEL } from "@/lib/admin/activity";
import {
  ROLE_LABEL,
  STAFF_STATE,
  staffState,
  statusText,
} from "@/lib/admin/staff";
import { Chip } from "../ui/chip";

const STATE_ICON = {
  active: CheckCircle2,
  invited: Clock,
  attention: TriangleAlert,
  deactivated: UserX,
} as const;

/** Status as a word and an icon (spec §7); the problem itself when there is one. */
export function StaffStatusChip({
  staff,
  now,
}: {
  staff: StaffOut;
  now: number;
}) {
  const state = staffState(staff, now);
  const Icon = STATE_ICON[state];
  return (
    <Chip tone={STAFF_STATE[state].tone}>
      <Icon aria-hidden className="size-3.5" />
      {statusText(staff, now)}
    </Chip>
  );
}

export function RoleChips({ roles }: { roles: StaffRole[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Chip key={r} tone={r === "hospital_admin" ? "mint" : "brand"}>
          {ROLE_LABEL[r]}
        </Chip>
      ))}
    </span>
  );
}

export function FlagChip({ flag }: { flag: "policy" | "alert" }) {
  const Icon = flag === "alert" ? ShieldAlert : Flag;
  return (
    <Chip tone={flag === "alert" ? "bad" : "warn"}>
      <Icon aria-hidden className="size-3.5" />
      {FLAG_LABEL[flag]}
    </Chip>
  );
}
```

In `lib/admin/staff.ts`, add:

```ts
/** 2-step missing where the hospital requires it; hospital admins always need it. */
export const policyBroken = (s: StaffOut, requireForClinicians: boolean) =>
  s.status === "active" &&
  s.issues.includes("mfa_not_set_up") &&
  (s.roles.includes("hospital_admin") || requireForClinicians);
```

- [ ] **Step 4: Editing access**

Create `components/admin/access-editor.tsx`:

```tsx
"use client";
import { useId, useState } from "react";
import type {
  StaffOut,
  StaffPatchIn,
  StaffRole,
} from "@/lib/api/admin-contract";
import { useUpdateStaff } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { ROLE_LABEL, guardFor } from "@/lib/admin/staff";
import { useNetwork } from "@/lib/network";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";

const ROLES: readonly StaffRole[] = ["clinician", "hospital_admin"];

export interface AccessDraft {
  roles: StaffRole[];
  specialty: string | null;
  canReview: boolean;
  reviewIn: string[];
}

const fromRow = (s: StaffOut): AccessDraft => ({
  roles: [...s.roles],
  specialty: s.specialty,
  canReview: s.can_review,
  reviewIn: [...s.review_specialties],
});
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const toggle = <T extends string>(xs: T[], x: T): T[] =>
  xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];

/** Only what changed, with the row's version (R7); null when nothing did. */
export function patchFor(row: StaffOut, d: AccessDraft): StaffPatchIn | null {
  const p: StaffPatchIn = { version: row.version };
  if (!same(d.roles, row.roles))
    p.roles = ROLES.filter((r) => d.roles.includes(r));
  if (d.specialty !== row.specialty) p.specialty = d.specialty;
  const canReview = d.canReview && d.roles.includes("clinician");
  if (canReview !== row.can_review) p.can_review = canReview;
  const reviewIn = canReview ? d.reviewIn : [];
  if (!same(reviewIn, row.review_specialties)) p.review_specialties = reviewIn;
  return Object.keys(p).length > 1 ? p : null;
}

function problemOf(d: AccessDraft): string | null {
  if (!d.roles.length) return "Choose at least one role.";
  if (d.canReview && d.roles.includes("clinician") && !d.reviewIn.length)
    return "Choose at least one specialty they can review in.";
  return null;
}

/** Roles, specialty and review rights (hospital-admin.html tab 3). */
export function AccessEditor({
  row,
  list,
  specialties,
}: {
  row: StaffOut;
  list: StaffOut[];
  specialties: string[];
}) {
  const update = useUpdateStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const heading = useId();
  const lockId = useId();
  const offlineId = useId();
  const [draft, setDraft] = useState(() => fromRow(row));
  const [seen, setSeen] = useState(row.version);
  const [error, setError] = useState<AdminError | null>(null);
  // The row changed underneath (this save, or someone else's): start again
  // from it, so nobody saves over a change they haven't seen (R7).
  if (row.version !== seen) {
    setSeen(row.version);
    setDraft(fromRow(row));
  }

  const lock = row.roles.includes("hospital_admin")
    ? guardFor("drop_admin", row, list)
    : ({ ok: true } as const);
  const patch = patchFor(row, draft);
  const problem = problemOf(draft);
  const clinician = draft.roles.includes("clinician");
  const options =
    row.specialty && !specialties.includes(row.specialty)
      ? [row.specialty, ...specialties]
      : specialties;

  function save() {
    if (!patch || problem || !online) return;
    setError(null);
    update.mutate(
      { id: row.id, p: patch },
      {
        onSuccess: () =>
          toast.show({
            title: "Changes saved",
            body: `${row.display_name}'s access is updated.`,
            tone: "ok",
          }),
        onError: (e) => setError(adminError(e)),
      },
    );
  }

  return (
    <section aria-labelledby={heading} className="flex flex-col gap-4">
      <h3 id={heading} className="text-[13px] font-semibold">
        Access
      </h3>
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
          Roles
        </legend>
        <div className="flex flex-wrap gap-x-5">
          {ROLES.map((r) => {
            const locked =
              r === "hospital_admin" && !lock.ok && draft.roles.includes(r);
            return (
              <label
                key={r}
                className="flex min-h-11 items-center gap-2 text-[14px]"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-mint"
                  checked={draft.roles.includes(r)}
                  disabled={locked}
                  aria-describedby={locked ? lockId : undefined}
                  onChange={() =>
                    setDraft((d) => ({ ...d, roles: toggle(d.roles, r) }))
                  }
                />
                {ROLE_LABEL[r]}
              </label>
            );
          })}
        </div>
        {!lock.ok && (
          <p id={lockId} className="text-[12.5px] text-ink-3">
            {lock.reason}
          </p>
        )}
      </fieldset>

      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-2">
        Specialty
        <select
          value={draft.specialty ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, specialty: e.target.value || null }))
          }
          className="min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[14px] font-normal text-ink focus-visible:outline-2 focus-visible:outline-mint-deep"
        >
          <option value="">No specialty</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <fieldset disabled={!clinician}>
        <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
          Reviewing corrections
        </legend>
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="size-4 accent-mint"
            checked={draft.canReview && clinician}
            onChange={() =>
              setDraft((d) => ({ ...d, canReview: !d.canReview }))
            }
          />
          Can review corrections
        </label>
        {!clinician && (
          <p className="text-[12.5px] text-ink-3">
            Only clinicians can review corrections.
          </p>
        )}
        {clinician && draft.canReview && (
          <div
            role="group"
            aria-label="Specialties they can review in"
            className="ml-6 flex flex-wrap gap-x-4"
          >
            {specialties.map((s) => (
              <label
                key={s}
                className="flex min-h-11 items-center gap-2 text-[13.5px]"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-mint"
                  checked={draft.reviewIn.includes(s)}
                  onChange={() =>
                    setDraft((d) => ({ ...d, reviewIn: toggle(d.reviewIn, s) }))
                  }
                />
                {s}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {problem && patch && (
        <p role="alert" className="text-[13px] font-semibold text-bad-deep">
          {problem}
        </p>
      )}
      {error && (
        <Banner tone="bad" title={error.title}>
          {error.body}
        </Banner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!patch || !!problem || !online || update.isPending}
          aria-describedby={!online ? offlineId : undefined}
          onClick={save}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {patch && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(fromRow(row));
              setError(null);
            }}
          >
            Undo changes
          </Button>
        )}
        {!online && (
          <span id={offlineId} className="text-[12.5px] text-ink-3">
            You&apos;re offline. Changes need a connection.
          </span>
        )}
      </div>
    </section>
  );
}
```

Note: the Save button's accessible name stays "Save changes" while idle;
while saving it reads "Saving…" (tests wait for the toast, not the label).

- [ ] **Step 5: The panel**

Create `components/admin/staff-panel.tsx`:

```tsx
"use client";
import { useId } from "react";
import type { HospitalSettingsOut, StaffOut } from "@/lib/api/admin-contract";
import {
  useHospitalSettings,
  useStaff,
  useStaffActivity,
} from "@/lib/admin-queries";
import { actorName, describeEvent, eventClock } from "@/lib/admin/activity";
import { inviteNote, policyBroken, sortName } from "@/lib/admin/staff";
import { useNow } from "@/lib/hooks/use-now";
import { Avatar } from "../shell/account-menu";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { SidePanel } from "../ui/side-panel";
import { Skeleton } from "../ui/skeleton";
import { AccessEditor } from "./access-editor";
import { StaffStatusChip } from "./chips";

const JOINED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function joined(s: StaffOut): string | null {
  const t = s.joined_at ? Date.parse(s.joined_at) : NaN;
  return Number.isFinite(t) ? `joined ${JOINED.format(t)}` : null;
}

/** The staff member side panel (hospital-admin.html tab 3). */
export function StaffPanel({
  staffId,
  onClose,
}: {
  staffId: string | null;
  onClose(): void;
}) {
  const staff = useStaff();
  const settings = useHospitalSettings();
  const now = useNow(60_000);
  const list = staff.data ?? [];
  const row = list.find((s) => s.id === staffId) ?? null;
  return (
    <SidePanel open={staffId !== null} onClose={onClose} title="Staff member">
      {row ? (
        <Member row={row} list={list} settings={settings.data} now={now} />
      ) : staff.isSuccess ? (
        <div role="status">
          <b className="block text-[15px]">
            This person is no longer on the staff list
          </b>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Someone else may have removed them. Nothing was changed.
          </p>
          <Button variant="ghost" className="mt-4" onClick={onClose}>
            Back to staff
          </Button>
        </div>
      ) : (
        <Skeleton className="h-40" />
      )}
    </SidePanel>
  );
}

function Member({
  row,
  list,
  settings,
  now,
}: {
  row: StaffOut;
  list: StaffOut[];
  settings: HospitalSettingsOut | undefined;
  now: number;
}) {
  const activity = useStaffActivity(row.id);
  const recentId = useId();
  const note = inviteNote(row, now);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-3">
        <Avatar name={sortName(row.full_name)} className="size-11 text-sm" />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <b className="block text-[16px]">{row.full_name}</b>
          {row.is_you && <span className="text-[13px] text-ink-3">(you)</span>}
          <small className="block text-[12.5px] text-ink-3">
            {[row.email, joined(row)].filter(Boolean).join(" · ")}
          </small>
          <div className="mt-2">
            <StaffStatusChip staff={row} now={now} />
          </div>
        </div>
      </header>

      {policyBroken(row, settings?.require_mfa_for_clinicians ?? true) && (
        <Banner tone="warn" title="2-step verification isn't set up">
          Hospital policy requires it. {row.display_name} will be asked at next
          sign-in.
        </Banner>
      )}
      {note && <p className="text-[13px] text-ink-2">{note}</p>}

      {settings ? (
        <AccessEditor
          key={row.id}
          row={row}
          list={list}
          specialties={settings.specialties}
        />
      ) : (
        <Skeleton className="h-48" />
      )}

      <section aria-labelledby={recentId}>
        <h3 id={recentId} className="mb-2 text-[13px] font-semibold">
          Recent activity
        </h3>
        {activity.isPending ? (
          <Skeleton className="h-16" />
        ) : activity.isError ? (
          <p className="text-[13px] text-ink-3">
            Couldn&apos;t load recent activity.
          </p>
        ) : activity.data.length ? (
          <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
            {activity.data.map((e) => (
              <li key={e.id} className="[overflow-wrap:anywhere]">
                <span className="font-mono text-[11.5px] text-ink-3">
                  {eventClock(e.at, now)}
                </span>{" "}
                · {describeEvent(e)}
                {e.actor ? ` · by ${actorName(e)}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">Nothing recorded yet.</p>
        )}
      </section>
      <p className="text-[12px] text-ink-3">
        Every change is recorded in the activity log.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/admin lib/hooks lib/admin`
Expected: PASS.

Run: `npx vitest run lib/motion.test.ts && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/ui components/admin lib/hooks lib/admin tests/admin-render.tsx
git commit -m "Add the staff member panel with roles, specialty and review rights"
```

---

### Task 10: Account actions: reset, remind, deactivate, reactivate, remove

**Files:**

- Create: `components/admin/confirm-dialog.tsx`,
  `components/admin/account-actions.tsx`,
  `components/admin/account-actions.test.tsx`
- Modify: `components/admin/staff-panel.tsx`, `CHANGELOG.md`
- Test: `components/admin/account-actions.test.tsx`

**Interfaces:**

- Consumes: `useStaffAction`, `useRemoveStaff` (Task 7); `guardFor`
  (Task 5); `adminError`, `AdminError` (Task 5); `StaffAction` (Task 3);
  `Dialog`, `Banner`, `Button`, `useToast`; `useAuth`; `useNetwork`;
  `StaffPanel` (Task 9); `renderAdmin`, `screenAdminAs`.
- Produces:
  - `ConfirmDialog({ open, title, children, keepLabel, confirmLabel, onKeep, onConfirm, busy, error, offline })`:
    the safe button first (it gets the focus), the destructive one second;
  - `type Confirmable = "password-reset" | "reset-mfa" | "deactivate" | "remove"`;
  - `AccountActions({ row, list, onRemoved }: { row: StaffOut; list: StaffOut[]; onRemoved(): void })`;
  - `RemindButton({ row }: { row: StaffOut })` (the policy warning's "Send
    a reminder");
  - `StaffPanel` renders both.

**Behaviour (hospital-admin.html tab 3, R5):**

| Row                       | Shown when                            | Confirms? | Toast                              |
| ------------------------- | ------------------------------------- | --------- | ---------------------------------- |
| Send password reset       | active, signs in with a password      | yes       | Reset link sent                    |
| Reset 2-step              | active, signs in with a password      | yes       | 2-step reset                       |
| Send a reminder (warning) | 2-step not set up and policy requires | no        | Reminder sent                      |
| Send a new invite         | invited                               | no        | New invite sent                    |
| Deactivate                | active (guarded: self, last admin)    | yes       | Account deactivated                |
| Reactivate                | deactivated                           | no        | Account reactivated                |
| Remove / Cancel invite    | always (guarded: self, last admin)    | yes       | Account removed / Invite cancelled |

A person who signs in with their hospital account gets a note instead of the
two password rows: "Signs in with their hospital account. Their password
and 2-step are managed by the hospital."

- [ ] **Step 1: Write the failing tests**

Create `components/admin/account-actions.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { LAST_ADMIN } from "@/lib/admin/staff";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { StaffPanel } from "./staff-panel";

const onClose = vi.fn();
beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  onClose.mockReset();
});
afterEach(() => vi.restoreAllMocks());

async function open(id: string) {
  renderAdmin(<StaffPanel staffId={id} onClose={onClose} />);
  const panel = await screen.findByRole("dialog", { name: "Staff member" });
  const account = await within(panel).findByRole("region", { name: "Account" });
  return { panel, account };
}
const confirmIn = (name: string) => screen.getByRole("dialog", { name });

describe("AccountActions", () => {
  it("deactivates after a confirmation whose safe button has the focus, then reactivates", async () => {
    const { panel, account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    const dialog = confirmIn("Deactivate this account?");
    expect(
      within(dialog).getByText(/Dr. Tunde Bello can't sign in from now on/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Keep account" }),
    ).toHaveFocus();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    );
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    expect(await within(panel).findByText("Deactivated")).toBeInTheDocument();
    await userEvent.click(
      await within(account).findByRole("button", { name: "Reactivate" }),
    );
    expect(await screen.findByText("Account reactivated")).toBeInTheDocument();
    expect(await within(panel).findByText("Active")).toBeInTheDocument();
  });

  it("Keep account changes nothing", async () => {
    const action = vi.spyOn(holder.client, "staffAction");
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    await userEvent.click(
      within(confirmIn("Deactivate this account?")).getByRole("button", {
        name: "Keep account",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Deactivate this account?" }),
    ).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("you can't deactivate or remove yourself (Review Focus 1)", async () => {
    const { account } = await open("s-obi");
    const deactivate = within(account).getByRole("button", {
      name: "Deactivate",
    });
    expect(deactivate).toBeDisabled();
    expect(deactivate).toHaveAccessibleDescription(
      "You can't deactivate your own account. Ask another hospital admin.",
    );
    expect(
      within(account).getByRole("button", { name: "Remove" }),
    ).toHaveAccessibleDescription(
      "You can't remove your own account. Ask another hospital admin.",
    );
  });

  it("the last admin can't be deactivated or removed (Review Focus 4)", async () => {
    holder.client = screenAdminAs(null);
    await holder.client.staffAction("s-nwosu", "deactivate");
    const { account } = await open("s-obi");
    for (const name of ["Deactivate", "Remove"]) {
      const b = within(account).getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(LAST_ADMIN);
    }
  });

  it("shows an API refusal in plain words, in the dialog", async () => {
    vi.spyOn(holder.client, "staffAction").mockRejectedValueOnce(
      new ApiError(403, "self_change"),
    );
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    const dialog = confirmIn("Deactivate this account?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    );
    expect(
      await within(dialog).findByText("You can't change your own access"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/self_change/)).toBeNull();
  });

  it("removes after a confirmation that names the person, and closes the panel", async () => {
    const { account } = await open("s-eze");
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = confirmIn("Remove this account?");
    expect(
      within(dialog).getByText(/Dr. James Eze \(j\.eze@havanahospital\.org\)/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/This can't be undone/),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove account" }),
    );
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(
      (await holder.client.listStaff()).some((s) => s.id === "s-eze"),
    ).toBe(false);
  });

  it("cancels an invite", async () => {
    const { account } = await open("s-adeyemi");
    expect(
      within(account).queryByRole("button", { name: "Deactivate" }),
    ).toBeNull();
    await userEvent.click(
      within(account).getByRole("button", { name: "Cancel invite" }),
    );
    const dialog = confirmIn("Cancel this invite?");
    expect(
      within(dialog).getByRole("button", { name: "Keep invite" }),
    ).toHaveFocus();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel invite" }),
    );
    expect(await screen.findByText("Invite cancelled")).toBeInTheDocument();
  });

  it("resends an expired invite", async () => {
    const { account } = await open("s-sani");
    await userEvent.click(
      within(account).getByRole("button", { name: "Send a new invite" }),
    );
    expect(await screen.findByText("New invite sent")).toBeInTheDocument();
  });

  it("sends a password reset and resets 2-step only for password sign-in", async () => {
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Send password reset" }),
    );
    await userEvent.click(
      within(confirmIn("Send a password reset?")).getByRole("button", {
        name: "Send reset link",
      }),
    );
    expect(await screen.findByText("Reset link sent")).toBeInTheDocument();
    await userEvent.click(
      within(account).getByRole("button", { name: "Reset 2-step" }),
    );
    await userEvent.click(
      within(confirmIn("Reset 2-step verification?")).getByRole("button", {
        name: "Reset 2-step",
      }),
    );
    expect(await screen.findByText("2-step reset")).toBeInTheDocument();
  });

  it("explains why a hospital-account person has no password actions", async () => {
    const { account } = await open("s-okafor");
    expect(
      within(account).queryByRole("button", { name: "Send password reset" }),
    ).toBeNull();
    expect(
      within(account).getByText(
        "Signs in with their hospital account. Their password and 2-step are managed by the hospital.",
      ),
    ).toBeInTheDocument();
  });

  it("reminds from the policy warning", async () => {
    const { panel } = await open("s-mensah");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Send a reminder" }),
    );
    expect(await screen.findByText("Reminder sent")).toBeInTheDocument();
  });

  it("Esc closes the confirmation first, then the panel", async () => {
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Deactivate this account?" }),
      ).toBeNull(),
    );
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("disables every action offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { account } = await open("s-bello");
    expect(
      within(account).getByText(
        "You're offline. Account changes need a connection.",
      ),
    ).toBeInTheDocument();
    for (const b of within(account).getAllByRole("button"))
      expect(b).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/account-actions.test.tsx`
Expected: FAIL: no "Account" region in the panel.

- [ ] **Step 3: The confirm dialog and the actions**

Create `components/admin/confirm-dialog.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import type { AdminError } from "@/lib/admin/errors";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** The safe button comes first, so it gets the focus (spec §7). */
export function ConfirmDialog({
  open,
  title,
  children,
  keepLabel,
  confirmLabel,
  onKeep,
  onConfirm,
  busy,
  error,
  offline,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  keepLabel: string;
  confirmLabel: string;
  onKeep(): void;
  onConfirm(): void;
  busy: boolean;
  error: AdminError | null;
  offline: boolean;
}) {
  return (
    <Dialog open={open} onClose={onKeep} title={title}>
      <div className="text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
        {children}
      </div>
      {offline && (
        <p className="mt-3 text-[13px] text-ink-3">
          You&apos;re offline. This needs a connection.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onKeep}>
          {keepLabel}
        </Button>
        <Button variant="danger" disabled={busy || offline} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
```

Create `components/admin/account-actions.tsx`:

```tsx
"use client";
import { useId, useState, type ReactNode } from "react";
import type { StaffAction } from "@/lib/api/admin";
import type { StaffOut } from "@/lib/api/admin-contract";
import { useRemoveStaff, useStaffAction } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { INVITE_DAYS } from "@/lib/admin/invite";
import { guardFor, type Guard } from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { useNetwork } from "@/lib/network";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { ConfirmDialog } from "./confirm-dialog";

export type Confirmable =
  "password-reset" | "reset-mfa" | "deactivate" | "remove";

type Copy = { title: string; body: string; keep: string; confirm: string };

function copyFor(c: Confirmable, s: StaffOut, hospital: string): Copy {
  switch (c) {
    case "password-reset":
      return {
        title: "Send a password reset?",
        body: `${s.full_name} gets an email with a link to set a new password, valid for 30 minutes. They're signed out everywhere.`,
        keep: "Cancel",
        confirm: "Send reset link",
      };
    case "reset-mfa":
      return {
        title: "Reset 2-step verification?",
        body: `Use this when ${s.full_name} has lost their phone. They're signed out now and set up 2-step again at their next sign-in.`,
        keep: "Cancel",
        confirm: "Reset 2-step",
      };
    case "deactivate":
      return {
        title: "Deactivate this account?",
        body: `${s.full_name} can't sign in from now on. Their feedback, corrections and the activity log are kept, and you can reactivate them later.`,
        keep: "Keep account",
        confirm: "Deactivate",
      };
    case "remove":
      return s.status === "invited"
        ? {
            title: "Cancel this invite?",
            body: `${s.email} won't be able to use the invite.`,
            keep: "Keep invite",
            confirm: "Cancel invite",
          }
        : {
            title: "Remove this account?",
            body: `${s.full_name} (${s.email}) is removed from ${hospital}. This can't be undone. Past consultations, feedback and the activity log are kept.`,
            keep: "Keep account",
            confirm: "Remove account",
          };
  }
}

function Row({
  title,
  body,
  children,
  note,
  noteId,
}: {
  title: string;
  body: string;
  children: ReactNode;
  note?: string;
  noteId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0 flex-1 basis-[200px]">
        <b className="block text-[13.5px]">{title}</b>
        <span className="text-[12.5px] text-ink-3">{body}</span>
        {note && (
          <p id={noteId} className="mt-1 text-[12.5px] text-ink-2">
            {note}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** "Send a reminder" in the 2-step policy warning. */
export function RemindButton({ row }: { row: StaffOut }) {
  const act = useStaffAction();
  const toast = useToast();
  const { online } = useNetwork();
  const [error, setError] = useState<AdminError | null>(null);
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={!online || act.isPending}
        onClick={() => {
          setError(null);
          act.mutate(
            { id: row.id, action: "remind" },
            {
              onSuccess: () =>
                toast.show({
                  title: "Reminder sent",
                  body: `${row.display_name} will get an email about setting up 2-step.`,
                  tone: "ok",
                }),
              onError: (e) => setError(adminError(e)),
            },
          );
        }}
      >
        Send a reminder
      </Button>
      {error && <span className="text-[12.5px]">{error.title}</span>}
    </span>
  );
}

/** Password, 2-step, invite, deactivate and remove (R5). Destructive ones confirm. */
export function AccountActions({
  row,
  list,
  onRemoved,
}: {
  row: StaffOut;
  list: StaffOut[];
  onRemoved(): void;
}) {
  const act = useStaffAction();
  const remove = useRemoveStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const { user } = useAuth();
  const heading = useId();
  const deactivateNote = useId();
  const removeNote = useId();
  const [pending, setPending] = useState<Confirmable | null>(null);
  const [error, setError] = useState<AdminError | null>(null);

  const hospital = user?.hospital ?? "the hospital";
  const name = row.display_name;
  const invited = row.status === "invited";
  const active = row.status === "active";
  const password = active && row.sign_in !== null && row.sign_in !== "sso";
  const sso = active && row.sign_in === "sso";
  const deactivate: Guard = guardFor("deactivate", row, list);
  const removal: Guard = guardFor("remove", row, list);
  const busy = act.isPending || remove.isPending;

  const ok = (title: string, body: string) =>
    toast.show({ title, body, tone: "ok" });
  const fail = (e: unknown) => {
    const err = adminError(e);
    // Gone: the panel shows "no longer on the staff list" instead.
    if (err.gone) setPending(null);
    setError(err);
  };
  const run = (action: StaffAction, after: () => void) => {
    setError(null);
    act.mutate(
      { id: row.id, action },
      {
        onSuccess: () => {
          setPending(null);
          after();
        },
        onError: fail,
      },
    );
  };

  function confirm() {
    if (!pending || !online) return;
    if (pending === "remove") {
      setError(null);
      remove.mutate(
        { id: row.id },
        {
          onSuccess: () => {
            setPending(null);
            if (invited)
              ok("Invite cancelled", `${row.email} can't use the invite now.`);
            else
              ok(
                "Account removed",
                `${row.full_name} is no longer on the staff list.`,
              );
            onRemoved();
          },
          onError: fail,
        },
      );
      return;
    }
    const after: Record<Exclude<Confirmable, "remove">, () => void> = {
      "password-reset": () =>
        ok("Reset link sent", `${name} was signed out everywhere.`),
      "reset-mfa": () =>
        ok("2-step reset", `${name} will set it up again at next sign-in.`),
      deactivate: () =>
        ok(
          "Account deactivated",
          `${name} can't sign in. You can reactivate them here.`,
        ),
    };
    run(pending, after[pending]);
  }

  const copy = pending ? copyFor(pending, row, hospital) : null;
  const ask = (c: Confirmable) => {
    setError(null);
    setPending(c);
  };

  return (
    <section aria-labelledby={heading}>
      <h3 id={heading} className="mb-1 text-[13px] font-semibold">
        Account
      </h3>
      {!online && (
        <p className="mb-2 text-[12.5px] text-ink-3">
          You&apos;re offline. Account changes need a connection.
        </p>
      )}
      {error && !pending && (
        <div className="mb-2">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      {password && (
        <>
          <Row
            title="Password reset"
            body="Sends a reset link; signs them out everywhere"
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!online || busy}
              onClick={() => ask("password-reset")}
            >
              Send password reset
            </Button>
          </Row>
          <Row
            title="Reset 2-step verification"
            body="For a lost phone. They set it up again at next sign-in."
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!online || busy}
              onClick={() => ask("reset-mfa")}
            >
              Reset 2-step
            </Button>
          </Row>
        </>
      )}
      {sso && (
        <p className="py-2 text-[12.5px] text-ink-3">
          Signs in with their hospital account. Their password and 2-step are
          managed by the hospital.
        </p>
      )}
      {invited && (
        <Row
          title="Invite"
          body={`Sends a fresh invite${row.invite_expires_at ? `, valid for ${INVITE_DAYS} days` : ""}.`}
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={!online || busy}
            onClick={() =>
              run("resend-invite", () =>
                ok("New invite sent", `${row.email} has a new invite.`),
              )
            }
          >
            Send a new invite
          </Button>
        </Row>
      )}
      {active && (
        <Row
          title="Deactivate"
          body="Blocks sign-in at once. Their feedback and corrections are kept."
          note={deactivate.ok ? undefined : deactivate.reason}
          noteId={deactivateNote}
        >
          <Button
            size="sm"
            variant="danger"
            disabled={!online || busy || !deactivate.ok}
            aria-describedby={deactivate.ok ? undefined : deactivateNote}
            onClick={() => ask("deactivate")}
          >
            Deactivate
          </Button>
        </Row>
      )}
      {row.status === "deactivated" && (
        <Row title="Reactivate" body="They can sign in again.">
          <Button
            size="sm"
            variant="ghost"
            disabled={!online || busy}
            onClick={() =>
              run("reactivate", () =>
                ok("Account reactivated", `${name} can sign in again.`),
              )
            }
          >
            Reactivate
          </Button>
        </Row>
      )}
      <Row
        title={invited ? "Cancel invite" : "Remove"}
        body={
          invited
            ? "The invite stops working."
            : "Deletes the account. Past consultations, feedback and the activity log are kept."
        }
        note={removal.ok ? undefined : removal.reason}
        noteId={removeNote}
      >
        <Button
          size="sm"
          variant="danger"
          disabled={!online || busy || !removal.ok}
          aria-describedby={removal.ok ? undefined : removeNote}
          onClick={() => ask("remove")}
        >
          {invited ? "Cancel invite" : "Remove"}
        </Button>
      </Row>
      {copy && (
        <ConfirmDialog
          open
          title={copy.title}
          keepLabel={copy.keep}
          confirmLabel={copy.confirm}
          onKeep={() => {
            setPending(null);
            setError(null);
          }}
          onConfirm={confirm}
          busy={busy}
          error={error}
          offline={!online}
        >
          {copy.body}
        </ConfirmDialog>
      )}
    </section>
  );
}
```

Note: `ConfirmDialog` is rendered inside the panel's DOM but opens with
`showModal()`, so it sits in the top layer; Task 9's focus-trap change leaves
Tab to it, and the panel ignores Esc while it is open.

- [ ] **Step 4: Put them in the panel**

In `components/admin/staff-panel.tsx`, import
`import { AccountActions, RemindButton } from "./account-actions";`, pass
`onClose` down to `Member` (add `onClose={onClose}` to `<Member … />` and
`onClose: () => void` to its props), put the reminder inside the policy
warning:

```tsx
{
  policyBroken(row, settings?.require_mfa_for_clinicians ?? true) && (
    <Banner tone="warn" title="2-step verification isn't set up">
      Hospital policy requires it. {row.display_name} will be asked at next
      sign-in.
      <RemindButton row={row} />
    </Banner>
  );
}
```

and render the actions right after the `AccessEditor` block:

```tsx
<AccountActions row={row} list={list} onRemoved={onClose} />
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Hospital admins can manage each person from the staff member panel:
  change roles, specialty and who can review corrections; send a password
  reset; reset 2-step verification; remind them to set it up; send a new
  invite; deactivate and reactivate; or remove the account. Destructive
  actions ask first, with "Keep" as the default, and nobody can lock
  themselves or the hospital out.
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/admin`
Expected: PASS (Task 9's panel tests too).

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/admin CHANGELOG.md
git commit -m "Add password, 2-step, deactivate and remove actions with guards"
```

---

### Task 11: Invite staff

**Files:**

- Create: `components/admin/invite-dialog.tsx`,
  `components/admin/invite-dialog.test.tsx`
- Test: `components/admin/invite-dialog.test.tsx`

**Interfaces:**

- Consumes: `useStaff`, `useHospitalSettings`, `useInviteStaff` (Task 7);
  `parseInviteList`, `okEmails`, `INVITE_MAX`, `INVITE_DAYS`,
  `INVITE_PROBLEM`, `SKIP_REASON` (Task 5); `ROLE_LABEL`; `adminError`;
  `Dialog`, `Banner`, `Button`, `useToast`; `useNetwork`.
- Produces: `InviteDialog({ onClose }: { onClose(): void })`, mounted only
  while open (so every opening starts empty). Sends
  `InviteIn { emails: okEmails(lines), roles, specialty }`.

**Behaviour (hospital-admin.html tab 2, R8):**

- "Work emails" (one person or a pasted list), the hint "Separate with
  commas, or paste a column from a spreadsheet" and a live count ("2
  people");
- each problem under the box: "someone@gmail.com — Not a hospital email
  address";
- Role (Clinician ticked by default; Hospital admin) and Specialty (the
  hospital's list, or "No specialty");
- with hospital single sign-on: "These people sign in with their hospital
  account, so no password is needed."; otherwise: "They'll get an email
  invite that expires in 7 days, then go through first sign-in.";
- Cancel first, then "Send 2 invites" (singular for one); disabled with a
  reason for no valid address, no role, more than 200, or offline;
- if the API skipped anyone, the dialog stays open and lists them in words
  with "Done"; otherwise it closes with a toast.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/invite-dialog.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { makeStaff, screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { InviteDialog } from "./invite-dialog";

const onClose = vi.fn();
beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  onClose.mockReset();
});
afterEach(() => vi.restoreAllMocks());

async function openDialog() {
  renderAdmin(<InviteDialog onClose={onClose} />);
  const dialog = await screen.findByRole("dialog", { name: "Invite staff" });
  await within(dialog).findByText(/hospital account|email invite/);
  return dialog;
}
async function paste(dialog: HTMLElement, text: string) {
  await userEvent.click(within(dialog).getByLabelText("Work emails"));
  await userEvent.paste(text);
}

describe("InviteDialog", () => {
  it("says invitees just sign in when the hospital uses single sign-on", async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        "These people sign in with their hospital account, so no password is needed.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Work emails")).toHaveFocus();
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Cancel");
  });

  it("says the email invite lasts 7 days without hospital sign-on", async () => {
    const s = await holder.client.getSettings();
    vi.spyOn(holder.client, "getSettings").mockResolvedValue({
      ...s,
      sso: { status: "not_set_up", domain: null },
    });
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        "They'll get an email invite that expires in 7 days, then go through first sign-in.",
      ),
    ).toBeInTheDocument();
  });

  it("shows each problem and sends only the valid new people (Review Focus 3)", async () => {
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(
      dialog,
      "n.ade@havanahospital.org, N.ADE@havanahospital.org\nk.mensah@havanahospital.org\nsomeone@gmail.com; oops",
    );
    expect(within(dialog).getByText("1 person")).toBeInTheDocument();
    const problems = within(dialog).getByRole("list", { name: "Not invited" });
    expect(
      within(problems)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "n.ade@havanahospital.org — Listed twice",
      "k.mensah@havanahospital.org — Already on the staff list",
      "someone@gmail.com — Not a hospital email address",
      "oops — Not an email address",
    ]);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    );
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        {
          emails: ["n.ade@havanahospital.org"],
          roles: ["clinician"],
          specialty: null,
        },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Invite sent")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends the role and specialty with the invite", async () => {
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org\nb.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Hospital admin" }),
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Specialty"),
      "Paediatrics",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 2 invites" }),
    );
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        {
          emails: ["a.new@havanahospital.org", "b.new@havanahospital.org"],
          roles: ["clinician", "hospital_admin"],
          specialty: "Paediatrics",
        },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("2 invites sent")).toBeInTheDocument();
  });

  it("lists what the API skipped, in words (Review Focus 3)", async () => {
    vi.spyOn(holder.client, "inviteStaff").mockResolvedValue({
      invited: [
        makeStaff({
          id: "s-x",
          email: "a.new@havanahospital.org",
          status: "invited",
        }),
      ],
      skipped: [{ email: "b.new@havanahospital.org", reason: "already_staff" }],
    });
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org, b.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 2 invites" }),
    );
    const result = await screen.findByRole("dialog", { name: "Invites sent" });
    expect(
      within(result).getByText("1 invite was sent. These weren't sent:"),
    ).toBeInTheDocument();
    expect(
      within(result).getByText(
        "b.new@havanahospital.org — Already on the staff list",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(result).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("needs a role, and caps a send at 200", async () => {
    const dialog = await openDialog();
    await paste(
      dialog,
      Array.from({ length: 201 }, (_, i) => `p${i}@havanahospital.org`).join(
        "\n",
      ),
    );
    expect(
      within(dialog).getByText("Invite at most 200 people at a time."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send 201 invites" }),
    ).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText("Work emails"));
    await paste(dialog, "p1@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Clinician" }),
    );
    expect(
      within(dialog).getByText("Choose at least one role."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    ).toBeDisabled();
  });

  it("can't send offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    expect(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText("You're offline. Invites need a connection."),
    ).toBeInTheDocument();
  });

  it("Cancel closes without sending", async () => {
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(invite).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/invite-dialog.test.tsx`
Expected: FAIL: `Cannot find module './invite-dialog'`.

- [ ] **Step 3: Write the dialog**

Create `components/admin/invite-dialog.tsx`:

```tsx
"use client";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { InviteOut, StaffRole } from "@/lib/api/admin-contract";
import {
  useHospitalSettings,
  useInviteStaff,
  useStaff,
} from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import {
  INVITE_DAYS,
  INVITE_MAX,
  INVITE_PROBLEM,
  SKIP_REASON,
  okEmails,
  parseInviteList,
  type InviteLineStatus,
} from "@/lib/admin/invite";
import { ROLE_LABEL } from "@/lib/admin/staff";
import { useNetwork } from "@/lib/network";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

const ROLES: readonly StaffRole[] = ["clinician", "hospital_admin"];
const field =
  "w-full rounded-xl border border-lilac-2 bg-white text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/** Invite one person or a pasted list (hospital-admin.html tab 2, R8). */
export function InviteDialog({ onClose }: { onClose(): void }) {
  const staff = useStaff();
  const settings = useHospitalSettings();
  const invite = useInviteStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const emailsId = useId();
  const hintId = useId();
  const problemsId = useId();
  const [text, setText] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>(["clinician"]);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const [result, setResult] = useState<InviteOut | null>(null);

  const s = settings.data;
  const sso = s?.sso.status === "connected";
  const lines = parseInviteList(text, {
    existing: (staff.data ?? []).map((x) => x.email),
    domains: s?.allowed_email_domains ?? [],
  });
  const emails = okEmails(lines);
  const problems = lines.filter(
    (l): l is { email: string; status: Exclude<InviteLineStatus, "ok"> } =>
      l.status !== "ok",
  );
  const tooMany = emails.length > INVITE_MAX;
  const noRole = roles.length === 0;
  const canSend =
    !!s &&
    emails.length > 0 &&
    !tooMany &&
    !noRole &&
    online &&
    !invite.isPending;
  const sendLabel =
    emails.length === 1 ? "Send 1 invite" : `Send ${emails.length} invites`;

  function send() {
    if (!canSend) return;
    setError(null);
    invite.mutate(
      { emails, roles: ROLES.filter((r) => roles.includes(r)), specialty },
      {
        onSuccess: (r) => {
          const n = r.invited.length;
          if (n)
            toast.show({
              title: n === 1 ? "Invite sent" : `${n} invites sent`,
              body: sso
                ? "They can sign in with their hospital account now."
                : `The invites expire in ${INVITE_DAYS} days.`,
              tone: "ok",
            });
          if (r.skipped.length) setResult(r);
          else onClose();
        },
        onError: (e) => setError(adminError(e)),
      },
    );
  }

  if (result) {
    const n = result.invited.length;
    return (
      <Dialog
        open
        onClose={onClose}
        title={n ? "Invites sent" : "No invites sent"}
      >
        <p className="text-sm text-ink-2">
          {n === 1 ? "1 invite was sent." : `${n} invites were sent.`} These
          weren&apos;t sent:
        </p>
        <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto text-[13px]">
          {result.skipped.map((x) => (
            <li
              key={`${x.email}-${x.reason}`}
              className="[overflow-wrap:anywhere]"
            >
              {x.email} — {SKIP_REASON[x.reason] ?? "Not sent"}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Invite staff">
      <p className="text-sm text-ink-2">
        {s === undefined
          ? "Loading your hospital's settings…"
          : sso
            ? "These people sign in with their hospital account, so no password is needed."
            : `They'll get an email invite that expires in ${INVITE_DAYS} days, then go through first sign-in.`}
      </p>

      <label
        htmlFor={emailsId}
        className="mt-4 block text-[12.5px] font-semibold text-ink-2"
      >
        Work emails
      </label>
      <textarea
        id={emailsId}
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={problems.length ? `${hintId} ${problemsId}` : hintId}
        className={`${field} mt-1 p-3 [overflow-wrap:anywhere]`}
      />
      <p
        id={hintId}
        className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-ink-3"
      >
        <span>Separate with commas, or paste a column from a spreadsheet</span>
        <span aria-live="polite">
          {emails.length === 1 ? "1 person" : `${emails.length} people`}
        </span>
      </p>
      {problems.length > 0 && (
        <ul
          id={problemsId}
          aria-label="Not invited"
          className="mt-2 flex max-h-32 flex-col gap-1 overflow-auto text-[12.5px] text-warn-deep"
        >
          {problems.map((l, i) => (
            <li
              key={`${i}-${l.email}`}
              className="flex gap-1.5 [overflow-wrap:anywhere]"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {l.email} — {INVITE_PROBLEM[l.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tooMany && (
        <p
          role="alert"
          className="mt-2 text-[13px] font-semibold text-bad-deep"
        >
          Invite at most {INVITE_MAX} people at a time.
        </p>
      )}

      <fieldset className="mt-4">
        <legend className="text-[12.5px] font-semibold text-ink-2">Role</legend>
        <div className="flex flex-wrap gap-x-5">
          {ROLES.map((r) => (
            <label
              key={r}
              className="flex min-h-11 items-center gap-2 text-[14px]"
            >
              <input
                type="checkbox"
                className="size-4 accent-mint"
                checked={roles.includes(r)}
                onChange={() =>
                  setRoles((x) =>
                    x.includes(r) ? x.filter((y) => y !== r) : [...x, r],
                  )
                }
              />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      {noRole && (
        <p role="alert" className="text-[13px] font-semibold text-bad-deep">
          Choose at least one role.
        </p>
      )}

      <label className="mt-3 flex flex-col gap-1 text-[12.5px] font-semibold text-ink-2">
        Specialty
        <select
          value={specialty ?? ""}
          onChange={(e) => setSpecialty(e.target.value || null)}
          className={`${field} min-h-11 px-3 font-normal text-ink`}
        >
          <option value="">No specialty</option>
          {(s?.specialties ?? []).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>

      {!online && (
        <p className="mt-3 text-[13px] text-ink-3">
          You&apos;re offline. Invites need a connection.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!canSend} onClick={send}>
          {invite.isPending ? "Sending…" : sendLabel}
        </Button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/admin/invite-dialog.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/invite-dialog.tsx components/admin/invite-dialog.test.tsx
git commit -m "Add Invite staff for one person or a pasted list"
```

---

### Task 12: The Staff screen

**Files:**

- Create: `components/admin/admin-frame.tsx`, `components/admin/staff-list.tsx`,
  `components/admin/staff-view.tsx`, `components/admin/staff-view.test.tsx`,
  `app/(clinical)/admin/staff/page.tsx`
- Test: `components/admin/staff-view.test.tsx`

**Interfaces:**

- Consumes: `useStaff` (Task 7); `STAFF_FILTERS`, `staffCounts`,
  `filterStaff`, `lastActiveLabel`, `SIGN_IN_LABEL`, `sortName` (Task 5);
  `StaffStatusChip`, `RoleChips` (Task 9); `StaffPanel` (Tasks 9–10);
  `InviteDialog` (Task 11); `FilterChip`
  (`components/corrections/filter-chip.tsx`); `TopBar`, `MenuButton`,
  `Avatar`; `useIsDesktop` (`lib/hooks/use-media.ts`); `useNow`; `useAuth`.
- Produces:
  - `AdminFrame({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode })`:
    the top bar ("Hospital admin · Havana Hospital"), the eyebrow
    (hospital) and heading; used by every admin page;
  - `StaffTable({ rows, now, onOpen })` (from `md`) and
    `StaffCards({ rows, now, onOpen })` (phones, R13), both with
    "Manage {full name}" buttons;
  - `StaffView()`; the page `/admin/staff`.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/staff-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { StaffView } from "./staff-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const table = () =>
  screen.findByRole("table", { name: "Staff at the hospital" });
const names = (t: HTMLElement) =>
  within(t)
    .getAllByRole("button", { name: /^Manage / })
    .map((b) => b.getAttribute("aria-label")!.replace("Manage ", ""));

describe("StaffView", () => {
  it("lists everyone with roles, specialty, status, sign-in method and last active", async () => {
    renderAdmin(<StaffView />);
    expect(screen.getByRole("heading", { name: "Staff" })).toBeInTheDocument();
    const t = await table();
    expect(names(t)).toHaveLength(13);
    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Name",
      "Roles",
      "Specialty",
      "Status",
      "Signs in with",
      "Last active",
      "Manage",
    ]);
    const mensah = within(t)
      .getByRole("button", { name: "Manage Dr. Kofi Mensah" })
      .closest("tr")!;
    expect(mensah).toHaveTextContent("k.mensah@havanahospital.org");
    expect(mensah).toHaveTextContent("Clinician");
    expect(mensah).toHaveTextContent("Cardiology");
    expect(mensah).toHaveTextContent("2-step not set up");
    expect(mensah).toHaveTextContent("Password");
    expect(within(mensah).getByText("Never")).toHaveClass("sr-only");
    const obi = within(t)
      .getByRole("button", { name: "Manage Dr. Ngozi Obi" })
      .closest("tr")!;
    expect(obi).toHaveTextContent("(you)");
    expect(obi).toHaveTextContent("Hospital admin");
  });

  it("counts each filter and filters", async () => {
    renderAdmin(<StaffView />);
    await table();
    const group = screen.getByRole("group", { name: "Show" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "All · 13",
      "Active · 9",
      "Invited · 1",
      "Needs attention · 2",
      "Deactivated · 1",
    ]);
    await userEvent.click(
      within(group).getByRole("button", { name: "Needs attention · 2" }),
    );
    expect(names(await table())).toEqual([
      "Dr. Halima Sani",
      "Dr. Kofi Mensah",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("2 people shown");
  });

  it("searches name, email and specialty, ignoring accents and case", async () => {
    renderAdmin(<StaffView />);
    await table();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search staff" }),
      "PAED",
    );
    expect(names(await table())).toEqual([
      "Dr. Amaka Udo",
      "Dr. Funmi Adeyemi",
    ]);
  });

  it("says when nothing matches, and clears the search", async () => {
    renderAdmin(<StaffView />);
    await table();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search staff" }),
      "zzz",
    );
    expect(screen.getByText('No one matches "zzz".')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(names(await table())).toHaveLength(13);
  });

  it("opens the panel from Manage and gives the focus back on close", async () => {
    renderAdmin(<StaffView />);
    const manage = within(await table()).getByRole("button", {
      name: "Manage Dr. Kofi Mensah",
    });
    await userEvent.click(manage);
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    expect(
      await within(panel).findByText("Dr. Kofi Mensah"),
    ).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Staff member" })).toBeNull();
    expect(manage).toHaveFocus();
  });

  it("invites someone, who appears as Invited", async () => {
    renderAdmin(<StaffView />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Invite staff" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite staff" });
    await userEvent.click(within(dialog).getByLabelText("Work emails"));
    await userEvent.paste("n.ade@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    );
    const row = (
      await within(await table()).findByRole("button", {
        name: "Manage n.ade@havanahospital.org",
      })
    ).closest("tr")!;
    expect(row).toHaveTextContent("Invited");
  });

  it("shows cards instead of a table on a phone (R13)", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderAdmin(<StaffView />);
    const cards = await screen.findByRole("list", {
      name: "Staff at the hospital",
    });
    expect(screen.queryByRole("table")).toBeNull();
    const mensah = within(cards).getByRole("button", {
      name: "Manage Dr. Kofi Mensah",
    });
    expect(mensah).toHaveTextContent("2-step not set up");
    expect(mensah).toHaveTextContent("Cardiology");
  });

  it("offers Try again when the list can't load", async () => {
    vi.spyOn(holder.client, "listStaff").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<StaffView />);
    expect(
      await screen.findByText("Couldn't load the staff list"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await table();
  });

  it("says admins never see consultations", async () => {
    renderAdmin(<StaffView />, HOSPITAL_ADMIN);
    await table();
    expect(
      screen.getByText(
        "Hospital admins manage people and settings for Havana Hospital only. They never see patients' consultations unless they're also a clinician.",
      ),
    ).toBeInTheDocument();
  });

  it("never cuts a long name", async () => {
    renderAdmin(<StaffView />);
    const t = await table();
    const name = within(t).getByText("Dr. Oluwaseun Adebayo-Ogunleye-Fashola");
    expect(name.className).not.toMatch(/truncate/);
    await waitFor(() =>
      expect(name.closest("[class*='overflow-wrap']")).not.toBeNull(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/staff-view.test.tsx`
Expected: FAIL: `Cannot find module './staff-view'`.

- [ ] **Step 3: The frame, the list and the view**

Create `components/admin/admin-frame.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";

/** Every hospital admin page: top bar, hospital eyebrow and heading (mockup). */
export function AdminFrame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const hospital = user?.hospital ?? "Your hospital";
  return (
    <>
      <TopBar
        title={title}
        sub={`Hospital admin · ${hospital}`}
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[1040px]">
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
                {hospital}
              </p>
              <h2 className="font-display text-[40px] font-black leading-none">
                {title}
              </h2>
            </div>
            {actions && (
              <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
            )}
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
```

Create `components/admin/staff-list.tsx`:

```tsx
"use client";
import { Ellipsis } from "lucide-react";
import type { StaffOut } from "@/lib/api/admin-contract";
import { SIGN_IN_LABEL, lastActiveLabel, sortName } from "@/lib/admin/staff";
import { Avatar } from "../shell/account-menu";
import { RoleChips, StaffStatusChip } from "./chips";

type ListProps = {
  rows: StaffOut[];
  now: number;
  onOpen(id: string): void;
};

/** A dash on screen, a word for screen readers. */
function Missing({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-ink-3">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function Who({ s }: { s: StaffOut }) {
  return (
    <span className="flex items-start gap-2.5">
      <Avatar name={sortName(s.full_name)} />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <b className="block font-semibold">{s.full_name}</b>
        {s.is_you && <span className="text-[12px] text-ink-3">(you)</span>}
        <small className="block text-[12px] text-ink-3">{s.email}</small>
      </span>
    </span>
  );
}

const HEADERS = [
  "Name",
  "Roles",
  "Specialty",
  "Status",
  "Signs in with",
  "Last active",
];

/** The staff table (hospital-admin.html tab 1), from `md`. */
export function StaffTable({ rows, now, onOpen }: ListProps) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <caption className="sr-only">Staff at the hospital</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
            <th scope="col" className="px-2 py-3">
              <span className="sr-only">Manage</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const last = lastActiveLabel(s.last_active_at, now);
            return (
              <tr
                key={s.id}
                onClick={() => onOpen(s.id)}
                className="cursor-pointer border-t border-line align-top hover:bg-bg"
              >
                <td className="px-4 py-3">
                  <Who s={s} />
                </td>
                <td className="px-4 py-3">
                  <RoleChips roles={s.roles} />
                </td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {s.specialty ?? <Missing label="None" />}
                </td>
                <td className="px-4 py-3">
                  <StaffStatusChip staff={s} now={now} />
                </td>
                <td className="px-4 py-3">
                  {s.sign_in ? (
                    SIGN_IN_LABEL[s.sign_in]
                  ) : (
                    <Missing label="Not yet" />
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">
                  {last ?? <Missing label="Never" />}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label={`Manage ${s.full_name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(s.id);
                    }}
                    className="grid size-11 place-items-center rounded-xl text-ink-3 hover:bg-lilac focus-visible:outline-2 focus-visible:outline-mint-deep"
                  >
                    <Ellipsis aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same people as cards on phones (R13): every field, nothing cut off. */
export function StaffCards({ rows, now, onOpen }: ListProps) {
  return (
    <ul aria-label="Staff at the hospital" className="flex flex-col gap-2">
      {rows.map((s) => {
        const last = lastActiveLabel(s.last_active_at, now);
        const meta = [
          s.specialty,
          s.sign_in ? SIGN_IN_LABEL[s.sign_in] : null,
          last ? `Active ${last}` : null,
        ].filter(Boolean);
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-label={`Manage ${s.full_name}`}
              onClick={() => onOpen(s.id)}
              className="card-v3 flex min-h-11 w-full flex-col gap-2 p-3.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-mint-deep"
            >
              <Who s={s} />
              <span className="flex flex-wrap items-center gap-1.5">
                <StaffStatusChip staff={s} now={now} />
                <RoleChips roles={s.roles} />
              </span>
              {meta.length > 0 && (
                <span className="text-[12px] text-ink-3">
                  {meta.join(" · ")}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

Create `components/admin/staff-view.tsx`:

```tsx
"use client";
import { Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { useStaff } from "@/lib/admin-queries";
import {
  STAFF_FILTERS,
  filterStaff,
  staffCounts,
  type StaffFilter,
} from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { useNow } from "@/lib/hooks/use-now";
import { FilterChip } from "../corrections/filter-chip";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { AdminFrame } from "./admin-frame";
import { InviteDialog } from "./invite-dialog";
import { StaffPanel } from "./staff-panel";
import { StaffCards, StaffTable } from "./staff-list";

/** The hospital admin's home (hospital-admin.html tab 1). */
export function StaffView() {
  const q = useStaff();
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const list = q.data ?? [];
  const counts = staffCounts(list, now);
  const rows = filterStaff(list, filter, search, now);
  const hospital = user?.hospital ?? "your hospital";
  const List = desktop ? StaffTable : StaffCards;

  return (
    <AdminFrame
      title="Staff"
      actions={
        <Button onClick={() => setInviting(true)}>
          <UserPlus aria-hidden className="size-4" />
          Invite staff
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <Search aria-hidden className="absolute left-3 size-4 text-ink-3" />
          <span className="sr-only">Search staff</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or specialty"
            className="min-h-11 w-full rounded-xl border border-lilac-2 bg-white pl-9 pr-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep"
          />
        </label>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {STAFF_FILTERS.filter(
            (f) => f.id === "all" || f.id === filter || counts[f.id] > 0,
          ).map((f) => (
            <FilterChip
              key={f.id}
              pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label} · {counts[f.id]}
            </FilterChip>
          ))}
        </div>
      </div>

      {q.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : q.isError ? (
        <Banner tone="bad" title="Couldn't load the staff list">
          Check your connection and try again.
          <span className="mt-2 block">
            <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </span>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="card-v3 p-6 text-center text-[14px] text-ink-2">
          {search ? (
            <>
              <p>No one matches &quot;{search}&quot;.</p>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => setSearch("")}
              >
                Clear search
              </Button>
            </>
          ) : (
            <p>No one here yet.</p>
          )}
        </div>
      ) : (
        <List rows={rows} now={now} onOpen={setOpenId} />
      )}
      {q.isSuccess && (
        <p role="status" className="sr-only">
          {rows.length === 1 ? "1 person shown" : `${rows.length} people shown`}
        </p>
      )}

      <p className="mt-4 text-[12.5px] text-ink-3">
        Hospital admins manage people and settings for {hospital} only. They
        never see patients&apos; consultations unless they&apos;re also a
        clinician.
      </p>

      <StaffPanel staffId={openId} onClose={() => setOpenId(null)} />
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </AdminFrame>
  );
}
```

Create `app/(clinical)/admin/staff/page.tsx`:

```tsx
import type { Metadata } from "next";
import { StaffView } from "@/components/admin/staff-view";

export const metadata: Metadata = { title: "Staff · MHAI" };

export default function StaffPage() {
  return <StaffView />;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/admin`
Expected: PASS.

Run: `npx vitest run lib/motion.test.ts && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin "app/(clinical)/admin/staff"
git commit -m "Add the Staff screen with search, filters, invite and the panel"
```

---

### Task 13: Hospital settings

**Files:**

- Create: `components/admin/settings-view.tsx`,
  `components/admin/settings-view.test.tsx`,
  `app/(clinical)/admin/settings/page.tsx`
- Modify: `components/states/unsaved-guard.tsx` (optional `title` and
  `body`), `CHANGELOG.md`
- Test: `components/admin/settings-view.test.tsx`,
  `components/states/states.test.tsx` (unchanged, must still pass)

**Interfaces:**

- Consumes: `useHospitalSettings`, `useUpdateSettings` (Task 7);
  `SettingsEditable`, `SettingsPatchIn`, `HospitalSettingsOut` (Task 3);
  `adminError`; `AdminFrame` (Task 12); `UnsavedGuard`; `Chip`, `Banner`,
  `Button`, `useToast`; `useNetwork`.
- Produces:
  - `UnsavedGuard({ dirty, onDiscard, title?, body? })` (defaults keep
    today's wording);
  - `settingsPatch(data: HospitalSettingsOut, changes: Partial<SettingsEditable>): SettingsPatchIn | null`
    (exported from `components/admin/settings-view.tsx`);
  - `SettingsView()`; the page `/admin/settings`.

**Behaviour (hospital-admin.html tab 4, R7, R14):**

- **Corrections review:** "Flag as overdue after" (the API's allowed
  hours) and "Reviewers must share the specialty" (a switch, with what Off
  and On mean);
- **Security:** "Require 2-step verification for clinicians" ("Hospital
  admins always need it"), "Sign out after inactivity" (allowed minutes),
  "Allow "trust this device"" ("Skips 2-step for 30 days on a personal
  device");
- **Sign-in (read-only):** hospital single sign-on with its status as a word
  and an icon ("Connected", "Not set up", "Needs attention") and the domain,
  and the allowed email domains; "Measured Health sets these up.";
- "Save changes" (only what changed, with the version) and "Undo changes";
  "Changes are logged and apply at each person's next sign-in.";
- leaving with unsaved changes asks first ("Leave without saving?");
- someone else saved first (409): their values load, yours stay on top, and
  the page says so.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/settings-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/settings",
}));
import { SettingsView, settingsPatch } from "./settings-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => vi.restoreAllMocks());

const ready = () =>
  screen.findByRole("switch", { name: "Reviewers must share the specialty" });

describe("SettingsView", () => {
  it("shows the hospital's rules, with sign-in read-only", async () => {
    renderAdmin(<SettingsView />);
    expect(await ready()).toBeChecked();
    expect(screen.getByLabelText("Flag as overdue after")).toHaveValue("4");
    expect(
      screen.getByRole("switch", {
        name: "Require 2-step verification for clinicians",
      }),
    ).toBeChecked();
    expect(
      screen.getByText("Hospital admins always need it"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sign out after inactivity")).toHaveValue(
      "15",
    );
    expect(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    ).toBeChecked();
    const signIn = screen.getByRole("region", { name: "Sign-in" });
    expect(within(signIn).getByText("Connected")).toBeInTheDocument();
    expect(
      within(signIn).getByText(/Connected to havanahospital\.org/),
    ).toBeInTheDocument();
    expect(within(signIn).getByText("havanahospital.org")).toBeInTheDocument();
    expect(within(signIn).queryByRole("textbox")).toBeNull();
    expect(within(signIn).queryByRole("switch")).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves only what changed, with the version", async () => {
    const update = vi.spyOn(holder.client, "updateSettings");
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Sign out after inactivity"),
      "5",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        { version: 1, allow_trust_device: false, idle_timeout_minutes: 5 },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    ).not.toBeChecked();
  });

  it("keeps your changes when someone else saved first (Review Focus 2)", async () => {
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.selectOptions(
      screen.getByLabelText("Sign out after inactivity"),
      "5",
    );
    // Another admin saves a different setting first.
    await holder.client.updateSettings({ version: 1, review_overdue_hours: 8 });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Someone else saved the settings just now"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Flag as overdue after")).toHaveValue("8"),
    );
    expect(screen.getByLabelText("Sign out after inactivity")).toHaveValue("5");
    const update = vi.spyOn(holder.client, "updateSettings");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        { version: 2, idle_timeout_minutes: 5 },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });

  it("undoes unsaved changes", async () => {
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", {
        name: "Reviewers must share the specialty",
      }),
    );
    expect(
      screen.getByText(/Off: any clinician except the person who suggested it/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo changes" }));
    expect(await ready()).toBeChecked();
  });

  it("asks before leaving with unsaved changes", async () => {
    renderAdmin(
      <>
        <SettingsView />
        <a href="/admin/staff">Go to staff</a>
      </>,
    );
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    await userEvent.click(screen.getByRole("link", { name: "Go to staff" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Leave without saving?",
    });
    expect(
      within(dialog).getByText(
        "Your changes to the hospital settings will be lost.",
      ),
    ).toBeInTheDocument();
  });

  it("can't save offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(
      screen.getByText("You're offline. Saving needs a connection."),
    ).toBeInTheDocument();
  });
});

describe("settingsPatch", () => {
  it("sends only real changes", async () => {
    const s = await screenAdminAs(null).getSettings();
    expect(settingsPatch(s, {})).toBeNull();
    expect(settingsPatch(s, { allow_trust_device: true })).toBeNull();
    expect(settingsPatch(s, { allow_trust_device: false })).toEqual({
      version: 1,
      allow_trust_device: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/settings-view.test.tsx`
Expected: FAIL: `Cannot find module './settings-view'`.

- [ ] **Step 3: Let the unsaved guard speak about settings**

In `components/states/unsaved-guard.tsx`, add two optional props:

```tsx
export function UnsavedGuard({
  dirty,
  onDiscard,
  title = "Discard this draft?",
  body = "If you leave now, what you typed will be lost.",
}: {
  dirty: boolean;
  /** Runs when the clinician confirms Discard, before navigating. */
  onDiscard?(): void;
  title?: string;
  body?: string;
}) {
```

and use them in the dialog: `title={title}` on `<Dialog …>` and `{body}` in
place of the fixed sentence.

- [ ] **Step 4: Write the page**

Create `components/admin/settings-view.tsx`:

```tsx
"use client";
import { CheckCircle2, CircleAlert, Link2Off } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type {
  HospitalSettingsOut,
  SettingsEditable,
  SettingsPatchIn,
  SsoStatus,
} from "@/lib/api/admin-contract";
import { useHospitalSettings, useUpdateSettings } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { useNetwork } from "@/lib/network";
import { UnsavedGuard } from "../states/unsaved-guard";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AdminFrame } from "./admin-frame";

type Changes = Partial<SettingsEditable>;
const KEYS: readonly (keyof SettingsEditable)[] = [
  "review_overdue_hours",
  "reviewers_share_specialty",
  "require_mfa_for_clinicians",
  "idle_timeout_minutes",
  "allow_trust_device",
];

/** Only values that differ from what's saved, with the version (R7). */
export function settingsPatch(
  data: HospitalSettingsOut,
  changes: Changes,
): SettingsPatchIn | null {
  const p: SettingsPatchIn = { version: data.version };
  for (const k of KEYS) {
    const v = changes[k];
    if (v !== undefined && v !== data[k]) Object.assign(p, { [k]: v });
  }
  return Object.keys(p).length > 1 ? p : null;
}

const SSO: Record<
  SsoStatus,
  { label: string; tone: "ok" | "muted" | "warn"; Icon: typeof CheckCircle2 }
> = {
  connected: { label: "Connected", tone: "ok", Icon: CheckCircle2 },
  not_set_up: { label: "Not set up", tone: "muted", Icon: Link2Off },
  error: { label: "Needs attention", tone: "warn", Icon: CircleAlert },
};

const hours = (n: number) => (n === 1 ? "1 hour" : `${n} hours`);

function Setting({
  title,
  sub,
  children,
}: {
  title: ReactNode;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3.5 first:border-t-0">
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="text-[14px] font-semibold">{title}</div>
        <p className="text-[12.5px] text-ink-3">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2">
      {/* The real control sits, transparent, over the track: clickable and labelled. */}
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3
        id={id}
        className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

const select =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/** Hospital settings (hospital-admin.html tab 4). */
export function SettingsView() {
  const q = useHospitalSettings();
  const save = useUpdateSettings();
  const toast = useToast();
  const { online } = useNetwork();
  const overdueId = useId();
  const idleId = useId();
  const [changes, setChanges] = useState<Changes>({});
  const [error, setError] = useState<AdminError | null>(null);

  if (!q.data)
    return (
      <AdminFrame title="Hospital settings">
        {q.isError ? (
          <Banner tone="bad" title="Couldn't load the settings">
            Check your connection and try again.
          </Banner>
        ) : (
          <Skeleton className="h-96 rounded-2xl" />
        )}
      </AdminFrame>
    );

  const data = q.data;
  const value = <K extends keyof SettingsEditable>(k: K): SettingsEditable[K] =>
    (changes[k] ?? data[k]) as SettingsEditable[K];
  const set = <K extends keyof SettingsEditable>(
    k: K,
    v: SettingsEditable[K],
  ) => setChanges((c) => ({ ...c, [k]: v }));
  const patch = settingsPatch(data, changes);
  const sso = SSO[data.sso.status];

  function submit() {
    if (!patch || !online) return;
    setError(null);
    save.mutate(patch, {
      onSuccess: () => {
        setChanges({});
        toast.show({
          title: "Settings saved",
          body: "They apply at each person's next sign-in.",
          tone: "ok",
        });
      },
      onError: (e) => {
        const err = adminError(e);
        // Their values load underneath; yours stay on top (R7).
        setError(
          err.stale
            ? {
                ...err,
                title: "Someone else saved the settings just now",
                body: "We've loaded their changes. Yours are still here: check them and save again.",
              }
            : err,
        );
      },
    });
  }

  return (
    <AdminFrame title="Hospital settings">
      <div className="flex max-w-[760px] flex-col gap-4">
        <Section title="Corrections review">
          <Setting
            title={<label htmlFor={overdueId}>Flag as overdue after</label>}
            sub="Reviewers get a reminder; it shows red in the queue"
          >
            <select
              id={overdueId}
              className={select}
              value={value("review_overdue_hours")}
              onChange={(e) =>
                set("review_overdue_hours", Number(e.target.value))
              }
            >
              {data.limits.review_overdue_hours.map((h) => (
                <option key={h} value={h}>
                  {hours(h)}
                </option>
              ))}
            </select>
          </Setting>
          <Setting
            title="Reviewers must share the specialty"
            sub={
              value("reviewers_share_specialty")
                ? "On: only reviewers in the correction's specialty can review it"
                : "Off: any clinician except the person who suggested it can review"
            }
          >
            <Switch
              label="Reviewers must share the specialty"
              checked={value("reviewers_share_specialty")}
              onChange={(v) => set("reviewers_share_specialty", v)}
            />
          </Setting>
        </Section>

        <Section title="Security">
          <Setting
            title="Require 2-step verification for clinicians"
            sub="Hospital admins always need it"
          >
            <Switch
              label="Require 2-step verification for clinicians"
              checked={value("require_mfa_for_clinicians")}
              onChange={(v) => set("require_mfa_for_clinicians", v)}
            />
          </Setting>
          <Setting
            title={<label htmlFor={idleId}>Sign out after inactivity</label>}
            sub="Shared ward computers: keep this short"
          >
            <select
              id={idleId}
              className={select}
              value={value("idle_timeout_minutes")}
              onChange={(e) =>
                set("idle_timeout_minutes", Number(e.target.value))
              }
            >
              {data.limits.idle_timeout_minutes.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Setting>
          <Setting
            title='Allow "trust this device"'
            sub="Skips 2-step for 30 days on a personal device"
          >
            <Switch
              label='Allow "trust this device"'
              checked={value("allow_trust_device")}
              onChange={(v) => set("allow_trust_device", v)}
            />
          </Setting>
        </Section>

        <Section title="Sign-in">
          <Setting
            title="Hospital single sign-on"
            sub={
              data.sso.domain
                ? `Connected to ${data.sso.domain} · managed by Measured Health`
                : "Managed by Measured Health"
            }
          >
            <Chip tone={sso.tone}>
              <sso.Icon aria-hidden className="size-3.5" />
              {sso.label}
            </Chip>
          </Setting>
          <Setting
            title="Allowed email domains"
            sub="Invites outside these are blocked"
          >
            <span className="flex flex-wrap gap-1.5 font-mono text-[12.5px] [overflow-wrap:anywhere]">
              {data.allowed_email_domains.length
                ? data.allowed_email_domains.map((d) => (
                    <span key={d} className="rounded-lg bg-bg px-2 py-1">
                      {d}
                    </span>
                  ))
                : "Any"}
            </span>
          </Setting>
          <p className="pt-1 text-[12px] text-ink-3">
            Measured Health sets these up. Contact them to change how people
            sign in.
          </p>
        </Section>

        {error && (
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!patch || !online || save.isPending}
            onClick={submit}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {patch && (
            <Button
              variant="ghost"
              onClick={() => {
                setChanges({});
                setError(null);
              }}
            >
              Undo changes
            </Button>
          )}
          <span className="text-[12.5px] text-ink-3">
            {online
              ? "Changes are logged and apply at each person's next sign-in."
              : "You're offline. Saving needs a connection."}
          </span>
        </div>
      </div>
      <UnsavedGuard
        dirty={patch !== null}
        onDiscard={() => setChanges({})}
        title="Leave without saving?"
        body="Your changes to the hospital settings will be lost."
      />
    </AdminFrame>
  );
}
```

Create `app/(clinical)/admin/settings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { SettingsView } from "@/components/admin/settings-view";

export const metadata: Metadata = { title: "Hospital settings · MHAI" };

export default function SettingsPage() {
  return <SettingsView />;
}
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Hospital settings: review turnaround, whether reviewers must share the
  specialty, 2-step for clinicians, the idle timeout and "trust this
  device"; hospital sign-on and allowed email domains are shown read-only.
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/admin/settings-view.test.tsx components/states`
Expected: PASS.

Run: `npx vitest run lib/motion.test.ts && npm run typecheck && npm run lint`
Expected: clean. (The switch's slide uses `--t-fast` and is off under
reduced motion through the global rule `lib/motion.test.ts` checks.)

- [ ] **Step 6: Commit**

```bash
git add components/admin components/states/unsaved-guard.tsx "app/(clinical)/admin/settings" CHANGELOG.md
git commit -m "Add Hospital settings with read-only sign-in details"
```

---

### Task 14: Usage

**Files:**

- Create: `components/admin/usage-view.tsx`,
  `components/admin/usage-view.test.tsx`,
  `app/(clinical)/admin/usage/page.tsx`
- Modify: `CHANGELOG.md`
- Test: `components/admin/usage-view.test.tsx`

**Interfaces:**

- Consumes: `useUsage` (Task 7); `PERIODS`, `CONFIDENCE_ORDER`, `shares`,
  `percentLabel`, `hoursLabel`, `countLabel` (Task 6); `usageCsv`,
  `csvName`, `downloadCsv` (Task 6); `RESULT_LABEL`; `AdminFrame`;
  `useAuth`; `useToast`.
- Produces: `UsageView()`; the page `/admin/usage`.

**Behaviour (hospital-admin.html tab 5):** a period picker (This month,
Last month, Last 90 days) and "Export CSV"; four tiles (Consultations,
Active clinicians, Agreed with result, Median review time; a tile hides when
the API doesn't send its number); "Result confidence" as four rows, each
with the label, its icon, the percentage as text and a bar; "By specialty"
with counts and bars; "Counts only. No patient details or question text
are shown here." Bars are decoration: the numbers are always text.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/usage-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/usage",
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/csv", async (original) => ({
  ...(await original<typeof import("@/lib/admin/csv")>()),
  downloadCsv: download,
}));
import { UsageView } from "./usage-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  download.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const tile = (label: string) => screen.getByText(label).closest("div")!;

describe("UsageView", () => {
  it("shows this month's counts", async () => {
    renderAdmin(<UsageView />);
    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(tile("Consultations")).toHaveTextContent("1,284");
    expect(tile("Active clinicians")).toHaveTextContent("39");
    expect(tile("Agreed with result")).toHaveTextContent("82%");
    expect(tile("Median review time")).toHaveTextContent("3.1 h");
    const mix = screen.getByRole("region", { name: "Result confidence" });
    expect(
      within(mix)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "High confidence62%",
      "Use with caution27%",
      "Needs review8%",
      "Couldn't complete3%",
    ]);
    const by = screen.getByRole("region", { name: "By specialty" });
    expect(within(by).getAllByRole("listitem")[0]).toHaveTextContent(
      "Internal Medicine412",
    );
    expect(
      screen.getByText(
        "Counts only. No patient details or question text are shown here.",
      ),
    ).toBeInTheDocument();
  });

  it("switches the period", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "last_month",
    );
    expect(await screen.findByText("1,102")).toBeInTheDocument();
  });

  it("hides a measure the API doesn't send, and says when there's nothing yet", async () => {
    const u = await holder.client.getUsage("this_month");
    vi.spyOn(holder.client, "getUsage").mockResolvedValue({
      ...u,
      consultations: 0,
      agreement_rate: null,
      median_review_hours: null,
      confidence: { high: 0, caution: 0, review: 0, failed: 0 },
      by_specialty: [],
    });
    renderAdmin(<UsageView />);
    expect(
      await screen.findByText("No consultations in this period."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Agreed with result")).toBeNull();
    expect(screen.queryByText("Median review time")).toBeNull();
  });

  it("exports the counts as CSV, built in memory", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^havana-hospital-usage-\d{4}-\d{2}-\d{2}\.csv$/),
      expect.stringContaining("Consultations,1284"),
    );
    expect(await screen.findByText("Usage exported")).toBeInTheDocument();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("can't export before the numbers load", async () => {
    vi.spyOn(holder.client, "getUsage").mockReturnValue(new Promise(() => {}));
    renderAdmin(<UsageView />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/usage-view.test.tsx`
Expected: FAIL: `Cannot find module './usage-view'`.

- [ ] **Step 3: Write the page**

Create `components/admin/usage-view.tsx`:

```tsx
"use client";
import {
  CheckCircle2,
  Download,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { ConfidenceLevel, UsagePeriod } from "@/lib/api/admin-contract";
import { useUsage } from "@/lib/admin-queries";
import { csvName, downloadCsv, usageCsv } from "@/lib/admin/csv";
import {
  CONFIDENCE_ORDER,
  PERIODS,
  countLabel,
  hoursLabel,
  percentLabel,
  shares,
} from "@/lib/admin/report";
import { useAuth } from "@/lib/auth/auth-context";
import { RESULT_LABEL } from "@/lib/labels";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AdminFrame } from "./admin-frame";

const LEVEL: Record<
  ConfidenceLevel,
  { Icon: typeof CheckCircle2; bar: string; text: string }
> = {
  high: { Icon: ShieldCheck, bar: "bg-ok", text: "text-ok-deep" },
  caution: { Icon: TriangleAlert, bar: "bg-warn", text: "text-warn-deep" },
  review: { Icon: OctagonAlert, bar: "bg-bad", text: "text-bad-deep" },
  failed: { Icon: XCircle, bar: "bg-ink-3", text: "text-ink-2" },
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-v3 px-5 py-4">
      <b className="block font-display text-[34px] font-black leading-none">
        {value}
      </b>
      <span className="mt-1 block text-[12.5px] text-ink-3">{label}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3 id={id} className="mb-3 text-[14px] font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Usage in counts only (hospital-admin.html tab 5). */
export function UsageView() {
  const [period, setPeriod] = useState<UsagePeriod>("this_month");
  const q = useUsage(period);
  const { user } = useAuth();
  const toast = useToast();
  const periodId = useId();
  const hospital = user?.hospital ?? "Hospital";
  const u = q.data;
  const mix = u ? shares(u.confidence) : null;
  const top = u
    ? Math.max(1, ...u.by_specialty.map((s) => s.consultations))
    : 1;

  return (
    <AdminFrame
      title="Usage"
      actions={
        <>
          <label htmlFor={periodId} className="sr-only">
            Period
          </label>
          <select
            id={periodId}
            value={period}
            onChange={(e) => setPeriod(e.target.value as UsagePeriod)}
            className="min-h-11 rounded-full border border-line bg-white px-4 text-[13px] focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            disabled={!u}
            onClick={() => {
              if (!u) return;
              downloadCsv(
                csvName("usage", hospital, Date.now()),
                usageCsv(u, hospital),
              );
              toast.show({
                title: "Usage exported",
                body: "Counts only. The file is in your downloads.",
                tone: "ok",
              });
            }}
          >
            <Download aria-hidden className="size-4" />
            Export CSV
          </Button>
        </>
      }
    >
      {q.isError ? (
        <Banner tone="bad" title="Couldn't load usage">
          Check your connection and try again.
        </Banner>
      ) : !u ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Consultations" value={countLabel(u.consultations)} />
            <Tile
              label="Active clinicians"
              value={countLabel(u.active_clinicians)}
            />
            {u.agreement_rate !== null && (
              <Tile
                label="Agreed with result"
                value={percentLabel(u.agreement_rate)}
              />
            )}
            {u.median_review_hours !== null && (
              <Tile
                label="Median review time"
                value={hoursLabel(u.median_review_hours)}
              />
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Result confidence">
              {mix ? (
                <ul className="flex flex-col gap-2.5">
                  {CONFIDENCE_ORDER.map((k) => {
                    const { Icon, bar, text } = LEVEL[k];
                    return (
                      <li key={k} className="text-[13px]">
                        <span className="flex items-center gap-2">
                          <Icon aria-hidden className={cn("size-4", text)} />
                          <span className="flex-1">{RESULT_LABEL[k]}</span>
                          <b className="font-mono">{mix[k]}%</b>
                        </span>
                        <span
                          aria-hidden
                          className="mt-1 block h-1.5 rounded-full bg-lilac"
                        >
                          <span
                            className={cn("block h-full rounded-full", bar)}
                            style={{ width: `${mix[k]}%` }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">
                  No consultations in this period.
                </p>
              )}
            </Card>
            <Card title="By specialty">
              {u.by_specialty.length ? (
                <ul className="flex flex-col gap-2.5">
                  {u.by_specialty.map((s) => (
                    <li key={s.specialty} className="text-[13px]">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 [overflow-wrap:anywhere]">
                          {s.specialty}
                        </span>
                        <b className="font-mono">
                          {countLabel(s.consultations)}
                        </b>
                      </span>
                      <span
                        aria-hidden
                        className="mt-1 block h-1.5 rounded-full bg-lilac"
                      >
                        <span
                          className="block h-full rounded-full bg-mint"
                          style={{
                            width: `${Math.round((s.consultations * 100) / top)}%`,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">Nothing to show yet.</p>
              )}
            </Card>
          </div>
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-3">
        Counts only. No patient details or question text are shown here.
      </p>
    </AdminFrame>
  );
}
```

Create `app/(clinical)/admin/usage/page.tsx`:

```tsx
import type { Metadata } from "next";
import { UsageView } from "@/components/admin/usage-view";

export const metadata: Metadata = { title: "Usage · MHAI" };

export default function UsagePage() {
  return <UsageView />;
}
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Usage for hospital admins, in counts only: consultations, active
  clinicians, agreement rate, median review time, the confidence mix and
  the specialty breakdown, with a CSV export made on the device.
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/admin/usage-view.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin "app/(clinical)/admin/usage" CHANGELOG.md
git commit -m "Add Usage in counts only with a CSV export"
```

---

### Task 15: The activity log

**Files:**

- Create: `components/admin/activity-tabs.tsx`,
  `components/admin/activity-view.tsx`,
  `components/admin/activity-view.test.tsx`,
  `app/(clinical)/admin/activity/page.tsx`
- Modify: `CHANGELOG.md`
- Test: `components/admin/activity-view.test.tsx`

**Interfaces:**

- Consumes: `useActivity`, `fetchAllActivity`, `useOversight`,
  `ActivityFilter` (Task 7); `describeEvent`, `actorName`, `typeLabel`,
  `eventClock`, `ACTIVITY_TYPES`, `ACTIVITY_TYPE_LABEL`, `ACTIVITY_RANGES`,
  `rangeStart`, `ACTIVITY_KEEP_MONTHS` (Task 6); `activityCsv`, `csvName`,
  `downloadCsv`, `CSV_MAX_ROWS` (Task 6); `isOverdueItem`, `countLabel`
  (Task 6); `FlagChip` (Task 9); `AdminFrame` (Task 12); `FilterChip`;
  `useIsDesktop`; `adminError`.
- Produces:
  - `ActivityTabs({ current }: { current: "log" | "oversight" })`: two
    links ("Log", "Review oversight · 1 overdue") with `aria-current`;
  - `ActivityView()`; the page `/admin/activity`.

**Behaviour (hospital-admin.html tab 6, R9, R10):** newest first; columns
Time, Who, Type, What happened, with "Policy" and "Alert" flags as a word
and an icon; filters: "Filter by person" (applied 300 ms after typing
stops), type ("All types" or one), dates (Today, Last 7 days, Last 30 days,
Last 12 months; Last 7 days by default, so a quiet morning still shows
something) and "Flagged only"; "Load more" by cursor; "Export CSV" fetches
every page for the current filters (at most 10,000 events) and builds the
file in memory; the footer "Kept for 12 months. No question text, results
or patient details are recorded here." Cards instead of a table on phones.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/activity-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { makeEvent, screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/activity",
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/csv", async (original) => ({
  ...(await original<typeof import("@/lib/admin/csv")>()),
  downloadCsv: download,
}));
import { ActivityView } from "./activity-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  download.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const log = () =>
  screen.findByRole("table", { name: "Activity at the hospital" });
const rows = (t: HTMLElement) => within(t).getAllByRole("row").slice(1);
const rowWith = async (text: string) =>
  (await within(await log()).findByText(text)).closest("tr")!;

describe("ActivityView", () => {
  it("lists what happened, newest first, consultations by specialty and confidence only", async () => {
    renderAdmin(<ActivityView />);
    const first = rows(await log())[0]!;
    expect(first).toHaveTextContent("Dr. Obi");
    expect(first).toHaveTextContent("Admin");
    expect(first).toHaveTextContent(
      "Changed Dr. Mensah's specialty to Cardiology",
    );
    expect(
      await rowWith(
        "Ran a consultation · Internal Medicine · Use with caution",
      ),
    ).toHaveTextContent("Consultation");
  });

  it("flags security and policy events with a word and an icon", async () => {
    renderAdmin(<ActivityView />);
    expect(
      await rowWith("5 failed sign-ins for Dr. Bello · account locked"),
    ).toHaveTextContent("Alert");
    expect(
      await rowWith(
        "Signed in without 2-step (setup pending) · Chrome on Windows",
      ),
    ).toHaveTextContent("Policy");
  });

  it("filters by type and by flagged only", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Type"), "security");
    await waitFor(async () => expect(rows(await log())).toHaveLength(1));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "");
    await userEvent.click(screen.getByRole("button", { name: "Flagged only" }));
    await waitFor(async () => expect(rows(await log())).toHaveLength(2));
  });

  it("filters by person once typing stops", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter by person" }),
      "okafor",
    );
    await waitFor(async () => {
      const r = rows(await log());
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) expect(row).toHaveTextContent("Dr. Okafor");
    });
  });

  it("loads older events by page", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Dates"), "12m");
    await waitFor(async () => expect(rows(await log())).toHaveLength(50));
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(async () => expect(rows(await log())).toHaveLength(100));
  });

  it("exports every page for the filters as a CSV built in memory", async () => {
    const list = vi.spyOn(holder.client, "listActivity");
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Dates"), "12m");
    await waitFor(async () => expect(rows(await log())).toHaveLength(50));
    const before = list.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(list.mock.calls.length - before).toBe(3); // 134 events, 50 a page
    const [name, csv] = download.mock.calls[0] as [string, string];
    expect(name).toMatch(/^havana-hospital-activity-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.startsWith("﻿Time (UTC),Who,Type,What happened,Flag\r\n")).toBe(
      true,
    );
    expect(csv.trim().split("\r\n")).toHaveLength(135);
    expect(await screen.findByText("Activity exported")).toBeInTheDocument();
  });

  it("never shows a field the contract doesn't have (privacy)", async () => {
    vi.spyOn(holder.client, "listActivity").mockResolvedValue({
      events: [
        {
          ...makeEvent({
            kind: "consultation_run",
            type: "consultation",
            specialty: "Cardiology",
            confidence: "high",
          }),
          question_text: "54 M, John Smith, chest pain",
        } as never,
      ],
      next_cursor: null,
    });
    renderAdmin(<ActivityView />);
    expect(
      await rowWith("Ran a consultation · Cardiology · High confidence"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/John Smith|chest pain/)).toBeNull();
  });

  it("says how long the log is kept, and links the two tabs", async () => {
    renderAdmin(<ActivityView />);
    await log();
    expect(
      screen.getByText(
        "Kept for 12 months. No question text, results or patient details are recorded here.",
      ),
    ).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Activity" });
    expect(within(tabs).getByRole("link", { name: "Log" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await within(tabs).findByRole("link", {
        name: "Review oversight · 1 overdue",
      }),
    ).toHaveAttribute("href", "/admin/activity/oversight");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/activity-view.test.tsx`
Expected: FAIL: `Cannot find module './activity-view'`.

- [ ] **Step 3: The tabs and the log**

Create `components/admin/activity-tabs.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useOversight } from "@/lib/admin-queries";
import { isOverdueItem } from "@/lib/admin/report";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "../ui/cn";

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
  ] as const;
  return (
    <nav
      aria-label="Activity"
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

Create `components/admin/activity-view.tsx`:

```tsx
"use client";
import { Download, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ActivityEventOut, ActivityType } from "@/lib/api/admin-contract";
import {
  fetchAllActivity,
  useActivity,
  type ActivityFilter,
} from "@/lib/admin-queries";
import {
  ACTIVITY_KEEP_MONTHS,
  ACTIVITY_RANGES,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  actorName,
  describeEvent,
  eventClock,
  rangeStart,
  typeLabel,
  type ActivityRange,
} from "@/lib/admin/activity";
import {
  CSV_MAX_ROWS,
  activityCsv,
  csvName,
  downloadCsv,
} from "@/lib/admin/csv";
import { adminError } from "@/lib/admin/errors";
import { countLabel } from "@/lib/admin/report";
import { useAuth } from "@/lib/auth/auth-context";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { useNow } from "@/lib/hooks/use-now";
import { useNetwork } from "@/lib/network";
import { FilterChip } from "../corrections/filter-chip";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { ActivityTabs } from "./activity-tabs";
import { AdminFrame } from "./admin-frame";
import { FlagChip } from "./chips";

/** The value, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";

function What({ e }: { e: ActivityEventOut }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 [overflow-wrap:anywhere]">
      <span>{describeEvent(e)}</span>
      {e.flag && <FlagChip flag={e.flag} />}
    </span>
  );
}

/** What happened at the hospital (hospital-admin.html tab 6). */
export function ActivityView() {
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const { online } = useNetwork();
  const toast = useToast();
  const typeId = useId();
  const datesId = useId();
  const [person, setPerson] = useState("");
  const settledPerson = useSettled(person.trim(), 300);
  const [type, setType] = useState<ActivityType | "">("");
  const [range, setRange] = useState<ActivityRange>("7d");
  const [from, setFrom] = useState(() => rangeStart("7d", Date.now()));
  const [flagged, setFlagged] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hospital = user?.hospital ?? "Hospital";

  const filter: ActivityFilter = {
    from,
    ...(type ? { type } : {}),
    ...(settledPerson ? { person: settledPerson } : {}),
    ...(flagged ? { flagged: true } : {}),
  };
  const q = useActivity(filter);
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAllActivity(filter, CSV_MAX_ROWS);
      downloadCsv(
        csvName("activity", hospital, Date.now()),
        activityCsv(all.events),
      );
      toast.show({
        title: "Activity exported",
        body: all.capped
          ? `Only the newest ${countLabel(CSV_MAX_ROWS)} events are in the file. Narrow the dates to export older ones.`
          : `${countLabel(all.events.length)} events. No clinical content is in the file.`,
        tone: "ok",
      });
    } catch (e) {
      toast.show({
        title: "Couldn't export the activity",
        body: adminError(e).body,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminFrame
      title="Activity"
      actions={
        <Button
          variant="ghost"
          disabled={!online || exporting || !q.isSuccess}
          onClick={() => void exportCsv()}
        >
          <Download aria-hidden className="size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      }
    >
      <ActivityTabs current="log" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[200px] flex-1 items-center">
          <Search aria-hidden className="absolute left-3 size-4 text-ink-3" />
          <span className="sr-only">Filter by person</span>
          <input
            type="search"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Filter by person"
            className={`${control} w-full pl-9`}
          />
        </label>
        <label htmlFor={typeId} className="sr-only">
          Type
        </label>
        <select
          id={typeId}
          value={type}
          onChange={(e) => setType(e.target.value as ActivityType | "")}
          className={control}
        >
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label htmlFor={datesId} className="sr-only">
          Dates
        </label>
        <select
          id={datesId}
          value={range}
          onChange={(e) => {
            const r = e.target.value as ActivityRange;
            setRange(r);
            setFrom(rangeStart(r, Date.now()));
          }}
          className={control}
        >
          {ACTIVITY_RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <FilterChip pressed={flagged} onClick={() => setFlagged((f) => !f)}>
          Flagged only
        </FilterChip>
      </div>

      {q.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : q.isError ? (
        <Banner tone="bad" title="Couldn't load the activity">
          Check your connection and try again.
        </Banner>
      ) : events.length === 0 ? (
        <p className="card-v3 p-6 text-center text-[14px] text-ink-2">
          Nothing matches these filters.
        </p>
      ) : desktop ? (
        <div className="card-v3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <caption className="sr-only">Activity at the hospital</caption>
            <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
              <tr>
                {["Time", "Who", "Type", "What happened"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-ink-3">
                    {eventClock(e.at, now)}
                  </td>
                  <td className="px-4 py-3 [overflow-wrap:anywhere]">
                    {actorName(e)}
                  </td>
                  <td className="px-4 py-3">{typeLabel(e)}</td>
                  <td className="px-4 py-3">
                    <What e={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul
          aria-label="Activity at the hospital"
          className="flex flex-col gap-2"
        >
          {events.map((e) => (
            <li key={e.id} className="card-v3 p-3.5 text-[13px]">
              <span className="flex flex-wrap gap-x-2 text-[12px] text-ink-3">
                <span className="font-mono">{eventClock(e.at, now)}</span>
                <span>{typeLabel(e)}</span>
                <span className="[overflow-wrap:anywhere]">{actorName(e)}</span>
              </span>
              <span className="mt-1 block">
                <What e={e} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-3">
        Kept for {ACTIVITY_KEEP_MONTHS} months. No question text, results or
        patient details are recorded here.
      </p>
    </AdminFrame>
  );
}
```

Create `app/(clinical)/admin/activity/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ActivityView } from "@/components/admin/activity-view";

export const metadata: Metadata = { title: "Activity · MHAI" };

export default function ActivityPage() {
  return <ActivityView />;
}
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- The hospital's activity log: sign-ins, consultations (specialty and
  confidence only), feedback, review decisions, account changes and flagged
  security events, with filters and a CSV export made on the device.
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/admin/activity-view.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin "app/(clinical)/admin/activity/page.tsx" CHANGELOG.md
git commit -m "Add the hospital activity log with filters and CSV export"
```

---

### Task 16: Review oversight

**Files:**

- Create: `components/admin/oversight-view.tsx`,
  `components/admin/assign-dialog.tsx`,
  `components/admin/oversight-view.test.tsx`,
  `app/(clinical)/admin/activity/oversight/page.tsx`
- Modify: `components/admin/chips.tsx` (Short and Overdue chips),
  `CHANGELOG.md`
- Test: `components/admin/oversight-view.test.tsx`

**Interfaces:**

- Consumes: `useOversight`, `useEligibleReviewers`, `useRemindReviewers`,
  `useAssignReviewer` (Task 7); `isOverdueItem`, `isShort`,
  `oversightOrder`, `hoursLabel` (Task 6); `ageLabel` (`lib/time.ts`);
  `adminError`; `ActivityTabs` (Task 15); `AdminFrame`; `ConfirmDialog` is
  not used (nothing here is destructive); `Dialog`, `Button`, `Chip`,
  `useToast`; `useAuth`, `isClinical`.
- Produces:
  - `ShortChip()` ("Short", with an icon) and
    `OverdueChip({ hours }: { hours: number })` ("Over 4 h") in
    `components/admin/chips.tsx`;
  - `AssignDialog({ item, onClose }: { item: OversightItemOut; onClose(): void })`;
  - `OversightView()`; the page `/admin/activity/oversight`.

**Behaviour (hospital-admin.html tab 7, R11, R12):** four tiles (Waiting,
Overdue (over N h), Median time to decision, Decided this week); the
waiting corrections, oldest first: "#C-118 · suggested by Dr. Reyes",
specialty, how long it has waited (with "Over 4 h" when overdue), eligible
reviewers (with "Short" under 2), "Assigned to …" or "Reminded …", and
Remind and Assign reviewer; "Reviewers by specialty" with "Short" and a link
"Consider adding a reviewer in Staff"; "You see the specialty and how long
it's waited, never the clinical content." Approve and Reject never appear:
a clinician admin gets "To approve or reject, use Review corrections" (a
link); an admin-only person reads "Only clinicians can approve or reject
corrections." A correction decided meanwhile (409 `already_decided`)
leaves the list with a toast.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/oversight-view.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/activity/oversight",
}));
import { OversightView } from "./oversight-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => vi.restoreAllMocks());

const table = () =>
  screen.findByRole("table", { name: "Corrections waiting for review" });
const rowFor = async (ref: string) =>
  (await within(await table()).findByText(new RegExp(`#${ref}`))).closest(
    "tr",
  )!;

describe("OversightView", () => {
  it("shows what's waiting with specialty, age and eligible reviewers, oldest first", async () => {
    renderAdmin(<OversightView />);
    const t = await table();
    const refs = within(t)
      .getAllByText(/^#C-\d+/)
      .map((n) => n.textContent!.slice(0, 6));
    expect(refs).toEqual(["#C-118", "#C-117", "#C-116"]);
    const c118 = await rowFor("C-118");
    expect(c118).toHaveTextContent("suggested by Dr. Reyes");
    expect(c118).toHaveTextContent("Paediatrics");
    expect(c118).toHaveTextContent("5 h");
    expect(c118).toHaveTextContent("Over 4 h");
    expect(c118).toHaveTextContent("1");
    expect(c118).toHaveTextContent("Short");
    expect(await rowFor("C-117")).not.toHaveTextContent("Short");
    expect(
      screen.getByText("Waiting", { selector: "span" }).closest("div"),
    ).toHaveTextContent("3");
    expect(
      screen.getByText("Overdue (over 4 h)").closest("div"),
    ).toHaveTextContent("1");
    expect(document.body.textContent).not.toMatch(
      /diagnosis|symptom|question/i,
    );
  });

  it("flags specialties short of reviewers and points to Staff", async () => {
    renderAdmin(<OversightView />);
    const by = await screen.findByRole("region", {
      name: "Reviewers by specialty",
    });
    const paeds = within(by).getByText("Paediatrics").closest("li")!;
    expect(paeds).toHaveTextContent("1");
    expect(paeds).toHaveTextContent("Short");
    expect(
      within(by).getAllByRole("link", {
        name: "Consider adding a reviewer in Staff",
      })[0],
    ).toHaveAttribute("href", "/admin/staff");
  });

  it("reminds the reviewers", async () => {
    const remind = vi.spyOn(holder.client, "remindReviewers");
    renderAdmin(<OversightView />);
    const row = await rowFor("C-117");
    await userEvent.click(
      within(row).getByRole("button", { name: "Remind reviewers about C-117" }),
    );
    expect(remind).toHaveBeenCalledWith("c-117", {
      idempotencyKey: expect.any(String),
    });
    expect(await screen.findByText("Reviewers reminded")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await rowFor("C-117")).toHaveTextContent("Reminded"),
    );
  });

  it("assigns a reviewer from the eligible list", async () => {
    renderAdmin(<OversightView />);
    const row = await rowFor("C-118");
    await userEvent.click(
      within(row).getByRole("button", { name: "Assign a reviewer to C-118" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Assign a reviewer",
    });
    expect(within(dialog).getAllByRole("button")[0]).toHaveTextContent(
      "Cancel",
    );
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: /Dr. Udo/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Assign" }),
    );
    expect(await screen.findByText("Reviewer assigned")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await rowFor("C-118")).toHaveTextContent("Assigned to Dr. Udo"),
    );
  });

  it("drops a correction decided meanwhile, with a notice", async () => {
    vi.spyOn(holder.client, "remindReviewers").mockRejectedValueOnce(
      new ApiError(409, "already_decided"),
    );
    renderAdmin(<OversightView />);
    const row = await rowFor("C-116");
    await userEvent.click(
      within(row).getByRole("button", { name: "Remind reviewers about C-116" }),
    );
    expect(
      await screen.findByText("This correction has already been decided"),
    ).toBeInTheDocument();
  });

  it("never offers approve or reject; a clinician admin is pointed to Review corrections", async () => {
    renderAdmin(<OversightView />);
    await table();
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Review corrections" }),
    ).toHaveAttribute("href", "/review");
  });

  it("tells an admin who isn't a clinician that only clinicians decide", async () => {
    holder.client = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
    renderAdmin(<OversightView />, HOSPITAL_ADMIN);
    await table();
    expect(
      screen.getByText("Only clinicians can approve or reject corrections."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review corrections" }),
    ).toBeNull();
  });

  it("can't remind or assign offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAdmin(<OversightView />);
    const row = await rowFor("C-118");
    for (const b of within(row).getAllByRole("button"))
      expect(b).toBeDisabled();
    expect(
      screen.getByText(
        "You're offline. Reminders and assignments need a connection.",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/admin/oversight-view.test.tsx`
Expected: FAIL: `Cannot find module './oversight-view'`.

- [ ] **Step 3: The chips, the assign dialog and the view**

In `components/admin/chips.tsx`, add `Hourglass` and `UsersRound` to the
`lucide-react` import and:

```tsx
/** Fewer than 2 people can review it (R12). */
export function ShortChip() {
  return (
    <Chip tone="warn">
      <UsersRound aria-hidden className="size-3.5" />
      Short
    </Chip>
  );
}

/** Waiting longer than the hospital's turnaround (R12). */
export function OverdueChip({ hours }: { hours: number }) {
  return (
    <Chip tone="bad">
      <Hourglass aria-hidden className="size-3.5" />
      Over {hours} h
    </Chip>
  );
}
```

Create `components/admin/assign-dialog.tsx`:

```tsx
"use client";
import { useId, useState } from "react";
import type { OversightItemOut } from "@/lib/api/admin-contract";
import { useAssignReviewer, useEligibleReviewers } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { useNetwork } from "@/lib/network";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

/** Pick one eligible reviewer for a waiting correction. Mounted while open. */
export function AssignDialog({
  item,
  onClose,
}: {
  item: OversightItemOut;
  onClose(): void;
}) {
  const reviewers = useEligibleReviewers(item.id);
  const assign = useAssignReviewer();
  const toast = useToast();
  const { online } = useNetwork();
  const group = useId();
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<AdminError | null>(null);

  function send() {
    if (!pick || !online) return;
    setError(null);
    assign.mutate(
      { id: item.id, staffId: pick },
      {
        onSuccess: () => {
          const name = reviewers.data?.find((r) => r.id === pick)?.display_name;
          toast.show({
            title: "Reviewer assigned",
            body: name
              ? `${name} has been asked to review ${item.ref}.`
              : undefined,
            tone: "ok",
          });
          onClose();
        },
        onError: (e) => {
          const err = adminError(e);
          if (err.gone) {
            toast.show({ title: err.title, body: err.body });
            onClose();
          } else setError(err);
        },
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="Assign a reviewer">
      <p className="text-sm text-ink-2">
        {item.ref} · {item.specialty ?? "No specialty"}. Only people who can
        review it are listed.
      </p>
      <fieldset className="mt-3" aria-describedby={group}>
        <legend id={group} className="sr-only">
          Reviewers
        </legend>
        {reviewers.isPending ? (
          <p className="text-[13px] text-ink-3">Loading reviewers…</p>
        ) : reviewers.data?.length ? (
          reviewers.data.map((r) => (
            <label
              key={r.id}
              className="flex min-h-11 items-center gap-2.5 text-[14px] [overflow-wrap:anywhere]"
            >
              <input
                type="radio"
                name="reviewer"
                className="size-4 accent-mint"
                checked={pick === r.id}
                onChange={() => setPick(r.id)}
              />
              <span>
                {r.display_name}
                {r.specialty && (
                  <span className="text-ink-3"> · {r.specialty}</span>
                )}
              </span>
            </label>
          ))
        ) : (
          <p className="text-[13px] text-ink-2">
            Nobody can review this yet. Give someone review rights for this
            specialty in Staff.
          </p>
        )}
      </fieldset>
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!pick || !online || assign.isPending} onClick={send}>
          Assign
        </Button>
      </div>
    </Dialog>
  );
}
```

Create `components/admin/oversight-view.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { OversightItemOut } from "@/lib/api/admin-contract";
import { useOversight, useRemindReviewers } from "@/lib/admin-queries";
import { adminError } from "@/lib/admin/errors";
import {
  hoursLabel,
  isOverdueItem,
  isShort,
  oversightOrder,
} from "@/lib/admin/report";
import { useAuth } from "@/lib/auth/auth-context";
import { isClinical } from "@/lib/auth/types";
import { useNow } from "@/lib/hooks/use-now";
import { useNetwork } from "@/lib/network";
import { ageLabel } from "@/lib/time";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { ActivityTabs } from "./activity-tabs";
import { AdminFrame } from "./admin-frame";
import { AssignDialog } from "./assign-dialog";
import { OverdueChip, ShortChip } from "./chips";

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** "just now", "12 min ago", "2 h ago". */
function agoText(t: number, now: number): string {
  const a = ageLabel(t, now);
  return a === "0 min" ? "just now" : `${a} ago`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-v3 px-5 py-4">
      <b className="block font-display text-[34px] font-black leading-none">
        {value}
      </b>
      <span className="mt-1 block text-[12.5px] text-ink-3">{label}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3 id={id} className="mb-3 text-[14px] font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Keep corrections moving, without clinical content (hospital-admin.html tab 7). */
export function OversightView() {
  const q = useOversight();
  const remind = useRemindReviewers();
  const toast = useToast();
  const now = useNow(60_000);
  const { online } = useNetwork();
  const { user } = useAuth();
  const [assigning, setAssigning] = useState<OversightItemOut | null>(null);
  const o = q.data;

  function sendReminder(item: OversightItemOut) {
    remind.mutate(
      { id: item.id },
      {
        onSuccess: () =>
          toast.show({
            title: "Reviewers reminded",
            body: `${item.specialty ?? "Eligible"} reviewers got a reminder about ${item.ref}.`,
            tone: "ok",
          }),
        onError: (e) => {
          const err = adminError(e);
          toast.show({ title: err.title, body: err.body, ms: 8000 });
        },
      },
    );
  }

  return (
    <AdminFrame title="Activity">
      <ActivityTabs current="oversight" />
      {q.isError ? (
        <Banner tone="bad" title="Couldn't load review oversight">
          Check your connection and try again.
        </Banner>
      ) : !o ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Waiting" value={String(o.waiting)} />
            <Tile
              label={`Overdue (over ${o.overdue_after_hours} h)`}
              value={String(
                o.items.filter((i) =>
                  isOverdueItem(i, o.overdue_after_hours, now),
                ).length,
              )}
            />
            {o.median_decision_hours !== null && (
              <Tile
                label="Median time to decision"
                value={hoursLabel(o.median_decision_hours)}
              />
            )}
            <Tile
              label="Decided this week"
              value={String(o.decided_this_week)}
            />
          </div>

          {!online && (
            <p className="text-[13px] text-ink-3">
              You&apos;re offline. Reminders and assignments need a connection.
            </p>
          )}

          {o.items.length === 0 ? (
            <p className="card-v3 p-6 text-center text-[14px] text-ink-2">
              Nothing is waiting for review.
            </p>
          ) : (
            <div className="card-v3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-[13px]">
                <caption className="sr-only">
                  Corrections waiting for review
                </caption>
                <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
                  <tr>
                    {[
                      "Correction",
                      "Specialty",
                      "Waiting",
                      "Eligible reviewers",
                    ].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3 font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {oversightOrder(o.items).map((i) => {
                    const since = time(i.submitted_at);
                    const reminded = time(i.reminded_at);
                    return (
                      <tr key={i.id} className="border-t border-line align-top">
                        <td className="px-4 py-3 [overflow-wrap:anywhere]">
                          <b className="font-mono">#{i.ref}</b>{" "}
                          <span className="text-ink-3">
                            · suggested by {i.suggested_by.display_name}
                          </span>
                          {i.assigned_to && (
                            <span className="mt-1 block text-[12px] text-ink-2">
                              Assigned to {i.assigned_to.display_name}
                            </span>
                          )}
                          {reminded !== null && (
                            <span className="mt-1 block text-[12px] text-ink-3">
                              Reminded {agoText(reminded, now)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{i.specialty ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono">
                              {since === null ? "—" : ageLabel(since, now)}
                            </span>
                            {isOverdueItem(i, o.overdue_after_hours, now) && (
                              <OverdueChip hours={o.overdue_after_hours} />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono">
                              {i.eligible_reviewers}
                            </span>
                            {isShort(i.eligible_reviewers) && <ShortChip />}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remind reviewers about ${i.ref}`}
                              disabled={!online || remind.isPending}
                              onClick={() => sendReminder(i)}
                            >
                              Remind
                            </Button>
                            <Button
                              size="sm"
                              variant="soft"
                              aria-label={`Assign a reviewer to ${i.ref}`}
                              disabled={!online}
                              onClick={() => setAssigning(i)}
                            >
                              Assign reviewer
                            </Button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Card title="Reviewers by specialty">
            <ul className="flex flex-col gap-2 text-[13px]">
              {o.reviewers_by_specialty.map((r) => (
                <li
                  key={r.specialty}
                  className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]"
                >
                  <span className="flex-1">{r.specialty}</span>
                  <b className="font-mono">{r.reviewers}</b>
                  {isShort(r.reviewers) && (
                    <>
                      <ShortChip />
                      <Link
                        href="/admin/staff"
                        className="text-[12.5px] font-semibold text-mint-deep underline"
                      >
                        Consider adding a reviewer in Staff
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <p className="text-[12.5px] text-ink-3">
            You see the specialty and how long it&apos;s waited, never the
            clinical content.{" "}
            {isClinical(user) ? (
              <>
                To approve or reject, use{" "}
                <Link
                  href="/review"
                  className="font-semibold text-mint-deep underline"
                >
                  Review corrections
                </Link>
                .
              </>
            ) : (
              "Only clinicians can approve or reject corrections."
            )}
          </p>
        </div>
      )}
      {assigning && (
        <AssignDialog item={assigning} onClose={() => setAssigning(null)} />
      )}
    </AdminFrame>
  );
}
```

Create `app/(clinical)/admin/activity/oversight/page.tsx`:

```tsx
import type { Metadata } from "next";
import { OversightView } from "@/components/admin/oversight-view";

export const metadata: Metadata = { title: "Review oversight · MHAI" };

export default function OversightPage() {
  return <OversightView />;
}
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Review oversight for hospital admins: corrections waiting with their
  specialty, how long they've waited and how many people can review them;
  specialties short of reviewers are flagged; remind the reviewers or
  assign one. No clinical content is shown, and only clinicians can
  approve or reject.
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/admin`
Expected: PASS.

Run: `npx vitest run lib/motion.test.ts && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin "app/(clinical)/admin/activity/oversight" CHANGELOG.md
git commit -m "Add review oversight with remind and assign reviewer"
```

---

### Task 17: End to end, the README and the changelog

**Files:**

- Create: `tests/e2e/hospital-admin.spec.ts`
- Modify: `tests/e2e/helpers.ts`, `README.md`, `tests/readme.test.ts`,
  `CHANGELOG.md`
- Test: `tests/e2e/hospital-admin.spec.ts` (desktop and mobile projects),
  `tests/e2e/account.spec.ts` (the platform admin 403 test from Task 2),
  `tests/readme.test.ts`

**Interfaces:**

- Consumes: `signIn`, `openAccountMenu`, `isMobile`, `expectNoStorage`,
  `expectNoForbiddenWords`, `DEMO_EMAILS` (`tests/e2e/helpers.ts`); every
  screen from Tasks 8–16.
- Produces: `openAdmin(page, name: "Staff" | "Hospital settings" | "Activity" | "Usage")`
  in `tests/e2e/helpers.ts`.

- [ ] **Step 1: Write the failing end-to-end tests**

In `tests/e2e/helpers.ts`, add:

```ts
/** From a signed-in screen: opens a Hospital admin page (from the menu on phones). */
export async function openAdmin(
  page: Page,
  name: "Staff" | "Hospital settings" | "Activity" | "Usage",
) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("link", { name, exact: true })
    .filter({ visible: true })
    .click();
}
```

Create `tests/e2e/hospital-admin.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_EMAILS,
  expectNoForbiddenWords,
  expectNoStorage,
  isMobile,
  openAccountMenu,
  openAdmin,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }) => {
  // No staff names, emails or activity in browser storage, and no codes on screen.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

const manage = (page: Page, name: string) =>
  page.getByRole("button", { name: `Manage ${name}`, exact: true });
const panel = (page: Page) =>
  page.getByRole("dialog", { name: "Staff member" });

async function asHospitalAdmin(page: Page) {
  await signIn(page, DEMO_EMAILS.hospitalAdmin);
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Kofi Mensah")).toBeVisible();
}

test("a hospital admin signs in straight to Staff, with nothing clinical", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await expect(
    page.getByRole("heading", { name: "Staff", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("2-step not set up").first()).toBeVisible();
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page
      .getByRole("link", { name: "Staff", exact: true })
      .filter({ visible: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: /New consultation/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Review corrections/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Search consultations/ }),
  ).toHaveCount(0);
});

test("an admin who isn't a clinician can't reach clinical screens", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: /My feedback/ })).toHaveCount(
    0,
  );
  await page.getByRole("menuitem", { name: "Profile & security" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("region", { name: "My feedback" })).toHaveCount(
    0,
  );
  // Close goes to "/", the clinical home: the gate sends this person to Staff.
  await page.getByRole("link", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toHaveCount(0);
});

test("invite people from a pasted list", async ({ page }) => {
  await asHospitalAdmin(page);
  await page.getByRole("button", { name: "Invite staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite staff" });
  await dialog
    .getByLabel("Work emails")
    .fill(
      "a.new@havanahospital.org, B.New@havanahospital.org\nk.mensah@havanahospital.org",
    );
  await expect(
    dialog.getByText("k.mensah@havanahospital.org — Already on the staff list"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Send 2 invites" }).click();
  await expect(page.getByText("2 invites sent")).toBeVisible();
  await expect(manage(page, "a.new@havanahospital.org")).toBeVisible();
  await expect(manage(page, "b.new@havanahospital.org")).toBeVisible();
});

test("deactivate after confirming, then reactivate", async ({ page }) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. Tunde Bello").click();
  const p = panel(page);
  await p.getByRole("button", { name: "Deactivate", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Deactivate this account?",
  });
  await expect(
    confirm.getByRole("button", { name: "Keep account" }),
  ).toBeFocused();
  await confirm
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  await expect(page.getByText("Account deactivated")).toBeVisible();
  await expect(p.getByText("Deactivated", { exact: true })).toBeVisible();
  await p.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByText("Account reactivated")).toBeVisible();
  await expect(p.getByText("Active", { exact: true })).toBeVisible();
});

test("remove an account after confirming", async ({ page }) => {
  await asHospitalAdmin(page);
  await manage(page, "Dr. James Eze").click();
  await panel(page)
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Remove this account?" });
  await expect(confirm).toContainText(
    "Dr. James Eze (j.eze@havanahospital.org)",
  );
  await expect(
    confirm.getByRole("button", { name: "Keep account" }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: "Remove account" }).click();
  await expect(page.getByText("Account removed")).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(manage(page, "Dr. James Eze")).toHaveCount(0);
});

test("can't deactivate or remove yourself", async ({ page }) => {
  await asHospitalAdmin(page);
  await manage(page, "Grace Nwosu").click();
  const p = panel(page);
  await expect(
    p.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeDisabled();
  await expect(
    p.getByText(
      "You can't deactivate your own account. Ask another hospital admin.",
    ),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Remove", exact: true }),
  ).toBeDisabled();
  await expect(
    p.getByRole("checkbox", { name: "Hospital admin" }),
  ).toBeDisabled();
});

test("change and save hospital settings", async ({ page }) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Hospital settings");
  await expect(page).toHaveURL(/\/admin\/settings$/);
  const trust = page.getByRole("switch", { name: 'Allow "trust this device"' });
  await expect(trust).toBeChecked();
  await trust.click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await openAdmin(page, "Staff");
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await openAdmin(page, "Hospital settings");
  await expect(
    page.getByRole("switch", { name: 'Allow "trust this device"' }),
  ).not.toBeChecked();
});

test("a medical director sees both sides in one sidebar", async ({ page }) => {
  await signIn(page, DEMO_EMAILS.director);
  await expect(page).toHaveURL(/\/$/);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  const nav = page
    .getByRole("navigation", { name: "Consultations" })
    .filter({ visible: true });
  await expect(
    nav.getByRole("link", { name: "New consultation" }),
  ).toBeVisible();
  await expect(
    nav.getByRole("region", { name: "Hospital admin" }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await expect(manage(page, "Dr. Ngozi Obi")).toBeVisible();
  await expect(page.getByText("(you)")).toBeVisible();
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("link", { name: "New consultation" })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: /Start a consultation/ }),
  ).toBeVisible();
});

test("the activity log flags security events and exports a CSV", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Activity");
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(
    page.getByText("5 failed sign-ins for Dr. Bello · account locked"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Flagged only" }).click();
  await expect(page.getByText("Alert", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^havana-hospital-activity-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  await expect(page.getByText("Activity exported")).toBeVisible();
});

test("review oversight: remind and assign, without clinical content", async ({
  page,
}) => {
  await asHospitalAdmin(page);
  await openAdmin(page, "Activity");
  await page.getByRole("link", { name: /^Review oversight/ }).click();
  await expect(page).toHaveURL(/\/admin\/activity\/oversight$/);
  await page
    .getByRole("button", { name: "Remind reviewers about C-117" })
    .click();
  await expect(page.getByText("Reviewers reminded")).toBeVisible();
  await page
    .getByRole("button", { name: "Assign a reviewer to C-118" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Assign a reviewer" });
  await dialog.getByRole("radio", { name: /Dr. Udo/ }).check();
  await dialog.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Assigned to Dr. Udo")).toBeVisible();
  await expect(
    page.getByText("Only clinicians can approve or reject corrections."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Approve|Reject/ }),
  ).toHaveCount(0);
});
```

(The platform admin's 403 page is covered by Task 2's
`"a platform admin account sees the 403 page, never the clinical app"` in
`tests/e2e/account.spec.ts`, which also runs on both projects.)

In `tests/readme.test.ts`, add:

```ts
it("documents the hospital admin demo and the 403 sample", () => {
  expect(readme).toMatch(
    /\*\*Hospital admin\.\*\* Sign in with the hospital admin sample/,
  );
  expect(readme).toMatch(/a platform admin \(the\s+403 page\)/);
  expect(readme).not.toMatch(/a hospital\s+admin \(the\s+403 page\)/);
});
```

- [ ] **Step 2: Run them to see what fails**

Run: `npx vitest run tests/readme.test.ts`
Expected: FAIL: the README still says "a hospital admin (the 403 page)".

Run: `npm run e2e -- tests/e2e/hospital-admin.spec.ts tests/e2e/account.spec.ts`
Expected: PASS if Tasks 1–16 are complete (these specs exercise them
end to end). Any failure here is a real bug in an earlier task: fix it
there, with a unit test, before going on.

- [ ] **Step 3: The README and the changelog**

In `README.md`, under "Run on mock data", after the paragraph starting
"**Corrections and review.**", add:

```markdown
**Hospital admin.** Sign in with the hospital admin sample (Grace Nwosu) to
land on **Staff** for Havana Hospital: 13 synthetic people, including one
who hasn't set up 2-step, a waiting invite, an expired one and a
deactivated account. Invite people (one or a pasted list), and open anyone
to change their roles, specialty or review rights, send a password reset,
reset 2-step, deactivate, reactivate or remove them. You can't do that to
yourself or to the last hospital admin. **Hospital settings**, **Usage**
and **Activity** (with **Review oversight**) are in the same sidebar group,
and CSV exports are made on your device. The medical director sample (Dr.
Obi) is a clinician and a hospital admin, so they see both sides. None of
the admin screens shows question text, results or patient details, and
like the rest of the demo it is all in memory only.
```

and under "Share the demo", replace the paragraph starting "The demo starts
at a sign-in page" with:

```markdown
The demo starts at a sign-in page (sample accounts, memory only, so a
reload signs you out). Any email and password works. The page lists sample
accounts you can fill in with one tap: a clinician who signs straight in, a
clinician with two-step (code `123456`, or a real authenticator app using
the secret shown in the demo), a new account (first sign-in), a hospital
admin (Staff, settings, usage and activity; no clinical screens), a medical
director (clinician and hospital admin: both sides), a platform admin (the
403 page) and a locked account. The password `wrong` counts down to a lock,
and "Continue with hospital account" signs in through the demo's hospital
sign-on.
```

Add to `CHANGELOG.md` under _Unreleased_ → Security (create the heading if
missing):

```markdown
- The app's server forwards hospital admin requests only for hospital
  admins, and clinical requests only for clinicians, each only after first
  sign-in.
```

- [ ] **Step 4: Run everything**

Run: `npx prettier --write README.md CHANGELOG.md && npx vitest run tests/readme.test.ts`
Expected: PASS.

Run: `npm run lint && npm run typecheck && npx vitest run`
Expected: clean, all unit tests pass.

Run: `npm run e2e`
Expected: every spec passes on the desktop and mobile projects.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e tests/readme.test.ts README.md CHANGELOG.md
git commit -m "Test the hospital admin side end to end; document the demo"
```

---

## Self-review notes

- **Spec coverage, §5.6:**
  - the "Hospital admin" sidebar group for that role, roles combining, one
    hospital, nothing clinical: Tasks 1, 8 (R1–R3), Tasks 3 and 6 (no
    clinical field exists; the privacy tests in Tasks 6 and 15);
  - **Staff:** the table (name, roles, specialty, status active / invited /
    needs attention / deactivated, sign-in method, last active), search and
    filter chips with counts: Tasks 5 and 12 (cards on phones, R13);
  - **Invite staff:** one or a pasted list, role and specialty; single
    sign-on vs a 7-day emailed invite: Tasks 5 and 11 (R8), resend in
    Task 10;
  - **Staff member panel:** roles, specialty, who can review: Task 9;
    password reset, reset 2-step, deactivate (and reactivate, remove, as the
    product owner asked): Task 10 (R5); the policy warning and recent
    activity: Task 9 (remind: Task 10);
  - **Hospital settings:** turnaround, share specialty, 2-step for
    clinicians, idle timeout, trust this device; SSO status and domains
    read-only: Task 13 (R14);
  - **Usage:** counts only, CSV: Tasks 6 and 14;
  - **Activity log:** every event type, flagged security events,
    consultation rows by specialty and confidence only, filters (person,
    type, date, flagged), CSV, 12 months: Tasks 6 and 15 (R9, R10);
  - **Review oversight:** waiting corrections with specialty, age and
    eligible reviewers; short specialties flagged; Remind and Assign; no
    approve or reject for admins who aren't clinicians; no clinical content:
    Tasks 6 and 16 (R11, R12);
  - **Guards:** your own admin role and yourself (Tasks 5, 9, 10, R5), the
    last admin (same), destructive actions confirm with a safe default
    (Task 10, `ConfirmDialog`), every action audited (backend, Task 4's
    contract; the UI says so in the panel).
- **Spec §5.3 403 page:** platform admins and auditors only, pointing to the
  platform admin app: Task 2; hospital admins redirected away from it:
  Tasks 1, 2.
- **Spec §10 items 2 and 3:** combined roles, tenancy, every admin endpoint
  with refusals, idempotency and no clinical content, written into the spec
  by Task 4; item 7 extended (hospital timeout and turnaround on the login
  user); §11's question about non-clinician admins and review statistics
  answered (R11).
- **Roles routing:** `homeFor` (Task 1), `AuthGate need` and the nested
  route groups (Task 8), the BFF's per-area rule (Task 4), the account page
  shared (Task 8), the print page still clinical only (default `need`).
- **Global constraints honoured in code:** no backend terms (Task 5 adds
  the codes to `FORBIDDEN_TERMS`; every e2e test checks the page); memory
  only (no storage in any admin code; every e2e test ends with
  `expectNoStorage`; CSV through a `Blob`, Task 6); idempotency keys on
  every write (Task 7); 401 through `reportUnauthorized()` (Task 4); word
  plus icon for every status (Tasks 9, 13, 14, 15, 16); focus, Esc and safe
  defaults (Tasks 9, 10, 11, 16); 44 px targets (`min-h-11`, `size-11`);
  names never truncated (Tasks 9 and 12 test it); motion tokens only
  (`lib/motion.test.ts` in Tasks 9, 12, 13).
- **Names used across tasks:** `Role`, `roles`, `isClinical`,
  `isHospitalAdmin`, `isAdminOnly`, `isPlatformAccount`, `canUse`, `Area`,
  `ADMIN_HOME`, `DEMO_EMAILS`, `AdminClient`, `StaffAction`,
  `getAdminClient`, `createMockAdmin`, `mockAdminAs`, `screenAdminAs`,
  `ADMIN_NOW`, `StaffOut`, `StaffState`, `STAFF_STATE`, `guardFor`,
  `LAST_ADMIN`, `policyBroken`, `parseInviteList`, `INVITE_MAX`,
  `INVITE_DAYS`, `adminError`, `describeEvent`, `CSV_MAX_ROWS`,
  `SHORT_OF_REVIEWERS`, `OVERSIGHT_POLL_MS`, `ADMIN_KEYS`,
  `fetchAllActivity`, `AdminFrame`, `SidePanel`, `ConfirmDialog`,
  `StaffPanel`, `AccountActions`, `RemindButton`, `InviteDialog`,
  `ActivityTabs`, `AssignDialog`, the staff ids (`s-obi`, `s-nwosu`,
  `s-mensah`, `s-bello`, `s-eze`, `s-adeyemi`, `s-sani`, `s-okafor`,
  `s-long`), correction ids (`c-118`, `c-117`, `c-116`) and the routes
  `/admin/staff`, `/admin/settings`, `/admin/usage`, `/admin/activity`,
  `/admin/activity/oversight` are defined once and used with the same
  spelling after.
- **Still open (for the spec owners):**
  - the backend contract for every admin endpoint (§10 items 2 and 3) is
    assumed; especially `is_you`, `version`, `issues`, the activity event
    kinds and the oversight shape;
  - applying the hospital's idle timeout and review turnaround in the
    clinical app needs them on the login user (§10 item 7; R12, R14);
  - whether invitees who are only hospital admins should see the clinical
    first sign-in terms (today every first sign-in shows the same terms);
  - whether an admin may change their own specialty and review rights (this
    plan allows it; only their admin role, deactivate and remove are
    refused);
  - bulk actions (R6) and a mobile board for the admin side (R13);
  - whether "Remove" needs a retention review or a waiting period before
    the account is deleted (the backend's retention rules decide).

---

## Amendment (product owner, 2026-10-16): removing staff requires a two-step code

This overrides Tasks 3, 4, 10 and 17 where they differ.

- **Remove** (including "Cancel invite" for an invited person) needs the signed-in admin's current
  two-step code (6-digit authenticator code, or a backup code). Deactivate, reactivate and the
  other account actions keep the normal confirmation.
- **UI (Task 10):** the Remove confirmation dialog shows the shared `CodeInput` (auto-submits on
  the sixth digit) plus a "Use a backup code" option. The destructive button stays disabled until
  a full code is entered; Cancel stays the default focus. A wrong code shows "That code didn't
  work. Try again." and keeps the dialog open (the person is not removed); too many tries shows
  the existing lockout wording. An admin without two-step turned on sees "Turn on two-step
  verification in Profile & security to remove staff." with a link, and cannot remove.
- **Contract (Tasks 3–4):** `DELETE /hospital/staff/{id}` carries the code in the JSON body as
  `{ "mfa_code": "123456" }` (or `{ "backup_code": "ABCD-1234" }`), with the Idempotency-Key.
  Errors: 403 `mfa_required` (two-step not set up), 403 `mfa_invalid` (wrong code), 429
  `mfa_locked`. Add these to spec §10 item 3 as an assumed backend ask, and the codes to
  `FORBIDDEN_TERMS`. The mock accepts `MOCK_CODE` (123456) or a real code for
  `MOCK_TOTP_SECRET`, and the mock backup codes.
- **Tests:** unit — remove sends the code; wrong code keeps the row and shows the error; no
  two-step → blocked with the link; backup code path. E2E (Task 17) — the remove flow enters 123456.

## Amendment (product owner, 2026-10-16): admin-only people see the terms on first sign-in

Overrides Tasks 1–2 where they differ. Every new account, including a hospital admin who is not a
clinician, gets the "Before you start" terms step on first sign-in (then password and two-step as
today). The sample hospital admin and medical director accounts in the demo keep their current
state (terms already accepted) so they sign straight in; the "New account" sample shows the steps.
Test: an admin-only account with `terms` pending goes to /welcome and, after accepting, lands on
/admin/staff.

## Amendment (product owner, 2026-10-17): two-step is required for every admin

Overrides Tasks 1, 2, 4, 8 and 17 where they differ.

- **Hospital admins** (including a clinician who is also a hospital admin) must have two-step
  verification turned on. If a hospital admin signs in without it, the first-sign-in "Set up
  two-step verification" step is added and cannot be skipped; they reach no page (clinical or
  admin) until it is done. The mock enforces this: any account with `hospital_admin` and two-step
  off gets the `mfa` step.
- **Server side (Task 4):** the BFF forwards `/hospital/*` admin routes only for a session whose
  user holds `hospital_admin` **and** has two-step on; otherwise 403 `mfa_required`, which the app
  turns into the setup step. Test both.
- **Platform admins and auditors** (separate platform admin app): two-step required, as the
  backend spec already says. Spec §10 records both as backend asks: the API refuses admin
  endpoints for a session without two-step.
- **Tests:** an admin-only account and a medical director with two-step off are sent to the
  setup step and can't reach /admin/staff or the clinical home until it's done; the BFF refuses
  admin routes without two-step. E2E (Task 17): "New hospital admin" sets up two-step and lands
  on Staff.
