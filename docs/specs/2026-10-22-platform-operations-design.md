# Platform admin app: legal holds and operations

- **Status:** Approved design (product owner, 22 Oct 2026; all suggested defaults accepted). Plan 8 (8a, 8b, 8c).
- **Builds on:**
  - [Platform admin design](2026-10-17-platform-admin-design.md), the app: its roles (§2),
    security and step-up (§4), look (§6), the two-person removal (§7.6) and the contract
    conventions (§13);
  - [Platform analytics design](../../../mhai-web-7c/docs/specs/2026-10-22-platform-analytics-design.md)
    (Plans 7c and 7d), for the sidebar and the bell;
  - `ARCHITECTURE.md` §2 and §5 (the original platform scope: agent status and failed jobs,
    legal holds, platform settings and retention);
  - [UI design v3](2026-10-13-ui-design-v3.md) §6–§8 (wording, accessibility, privacy);
  - the backend's gateway design (mhai-multiagent `docs/specs/2026-10-08-api-gateway-phase1-design.md`
    §4.1, §7, §10–§12), which already plans agent status, the failed-job list, retry and
    cancel, feedback-buffer reset, legal holds, runtime settings and the daily retention
    clean-up.
- **Not in this design:** the cross-hospital audit log and its verify (its own sub-project),
  EMR connections, per-patient erasure requests, per-hospital retention periods.

## 1. Why

The platform team runs the service but today can't, from the app:

- **keep records when the law asks.** A hospital's removal (platform admin design §7.6)
  already checks "legal holds", but nobody can place one. The removal panel says "Legal holds
  are managed in a later release." Meanwhile the daily clean-up deletes records past their
  retention period, hold or no hold, unless a hold exists in the backend;
- **see whether the service is working.** When a hospital phones to say "answers are slow",
  the team has nothing to look at;
- **deal with failed work.** Jobs that fail for good (a question that couldn't be answered, a
  document that couldn't be read) sit in a queue nobody can see, retry or clear;
- **change the few runtime settings safely.** Retention periods, the triage gate and the
  feedback-buffer reset exist in the backend with no screen and no safe-change rules.

The order of importance (design call): **legal holds** first, because removal and the daily
clean-up depend on them and a mistake there can't be undone; then **system health** and
**failed jobs**; then **settings**.

## 2. Goals, non-goals and anti-goals

**Goals**

- **Legal holds:** place, view and lift a hold on a hospital's records, optionally narrowed to
  a date range, with a reason, a reference number and who asked for it. Lifting needs two
  different platform admins. An active hold blocks the hospital's removal and the daily
  clean-up of the records it covers.
- **System health:** one page that says whether the service is working, with questions
  waiting, failed jobs, recent errors by kind, and answer times. Counts only.
- **Failed jobs:** list, retry and cancel, singly or a few at a time. Cancel needs the
  person's two-step code.
- **Platform settings:** retention periods, the triage gate and the feedback-buffer reset,
  each with a preview or a plain statement of the effect, a confirm step, step-up, and
  two people for the changes that delete data or switch on a clinical feature.
- **Audit:** every change here appears in Activity with who, when, what and why.

**Non-goals**

- Patient-level holds, or any patient, question or answer detail in this app (see §4.2 and
  the questions at the end).
- Alerting and on-call paging; this is a page people look at, not a monitoring tool.
- Per-hospital health or per-hospital settings.
- Editing thresholds for "Slower than usual"; the backend owns them.
- Logs, stack traces or job contents.

**Anti-goals.** These would make it a failure even if it technically works.

1. **Records deleted while a hold covers them**, by the daily clean-up or by a removal.
2. **A hold lifted by one person, or by mistake**, with no way back before data goes.
3. **Patient details in a hold's free text**, which then spreads through Activity and email.
4. **A green page while the service is down**: "Working normally" shown when the app couldn't
   check, or old figures shown as current.
5. **A retry that does harm**: a clinician gets a second, different answer, or an old
   question is answered long after it mattered, with nobody warned.
6. **A setting changed silently or by one slip**: a shortened retention period that deletes
   years of records at the next clean-up, or triage switched on without clinical sign-off.
7. **Too much to read**: raw error text, internal names, or a wall of numbers.

## 3. Who uses it

| Role               | Can                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Platform admin** | Everything here                                                                           |
| **Auditor**        | Read everything here, including hold reasons and references; change nothing (design call) |

- Every page follows the platform admin design §4: two-step always, auditors' writes refused
  in the proxy and hidden on screen, `Idempotency-Key` on every write, a 15-minute idle limit.
- **Step-up** (the person's current two-step or backup code) is needed for: placing a hold;
  requesting and approving a hold's lift; cancelling failed jobs; every settings change; the
  feedback-buffer reset. Retrying a failed job does not need it (design call: retry repeats
  work the system already accepted and changes no data a person entered).
- **Two people** (a request, then a different platform admin's approval, each with step-up)
  for: lifting a hold; shortening a retention period; switching the triage gate on. The
  requester can't approve; either platform admin can cancel; a request not approved within
  **7 days** lapses (design call). This is the same pattern as removal (§7.6), with the same
  "Waiting for a different platform admin" wording and the server's `requested_by_you`.

**Sidebar** (design call): Hospitals · Analytics · **Legal holds** · **System** · **Settings** ·
Team · Activity · Account. **System** has two tabs, **Health** and **Failed jobs**.

## 4. Legal holds (Plan 8a)

### 4.1 What a hold is

A legal hold tells the service to **keep** a hospital's records, past their retention period
and through any removal request, until the hold is lifted. It never hides or locks records
from the hospital; staff keep working as normal.

- **What it covers** (design call): one hospital, either **all its records** or **records
  created between two dates** (inclusive, the hospital's time zone). "Records" means
  everything the retention rules delete: questions and answers, decisions, feedback,
  corrections, documents and the audit log.
- **Several holds can cover the same hospital**; each is placed and lifted on its own. A
  record is kept while any active hold covers it.
- **A hold never expires on its own.** It has a **review date** (default 6 months from
  placing, design call); on that date it shows **Review due** on the list and the hospital
  page, and (with Plan 7d) in the bell. Nothing else happens.
- A hold can be placed on a hospital in any state except **Removed** (there is nothing left).

### 4.2 Narrower holds: a patient

The backend's holds table already allows a hold on a single question, document or patient.
This design **does not offer patient or question holds in the platform app** (design call):

- the platform app never shows or takes patient details (platform admin design §4);
- finding "this patient's records" needs the hospital's patient number, which is patient
  data in this app, in Activity and in the backend's audit;
- a hospital-wide hold, narrowed by dates if needed, always keeps at least what a patient
  hold would. Keeping more than needed for a while is the safe failure; deleting too much is
  not.

If a patient-level hold is needed, it belongs on the hospital side (a hospital admin, who may
see that patient's number) and needs the Analysis privacy design first. This is question 2 at
the end.

### 4.3 The Legal holds page

**Header:** "Legal holds", **Place a hold** (platform admins).

**A table** (cards on phones): hospital; what it covers ("All records" or "Records from 1 Jan
2025 to 30 Jun 2025"); reason; reference; placed by and date; review date; status:

- **Active**;
- **Review due** (active, review date passed);
- **Lift requested** (still active: records stay kept until a second admin approves);
- **Lifted** (by whom, when, why).

Filter by status (default: Active, Review due and Lift requested) and by hospital; search by
reference. Lifted holds stay listed for good under the Lifted filter; a hold is never
deleted (design call).

**A hold's page:** every field above, plus the note, who asked for it, the full history
(placed, review date changed, lift requested, cancelled, approved) and the lift controls.

### 4.4 Place a hold

Any platform admin. A dialog:

- **Hospital** (search by name or short code), or pre-filled when opened from a hospital's
  page;
- **What it covers:** All records, or From–To dates (From can be in the past; To can be empty,
  meaning "until lifted", design call);
- **Reason:** Court case or claim · Regulator or inspector request · Complaint ·
  Internal investigation · Other (note required);
- **Reference number** (required, up to 100 characters): the case, matter or letter
  reference;
- **Asked for by** (required, up to 200 characters): the person or body that asked, e.g. "The
  hospital's legal counsel";
- **Note** (optional, up to 500 characters);
- **Review date** (default 6 months ahead);
- the person's two-step code.

Every free-text field carries the hint **"Don't include patient names, hospital numbers or
dates of birth."** (anti-goal 3). The app can't check this, and doesn't pretend to; the
server applies the same rule it applies to other admin text (design call).

Placing takes effect at once and needs **one** person (design call): keeping records is the
safe direction, and a hold is often urgent.

After placing, the hold's page shows "Active · placed by {name} · {date}".

**Editing:** only the review date and the note can change (with `version`; "Changed by
someone else" on a clash). What it covers, the reason and the reference can't: to cover more,
place another hold; to cover less, place the narrower hold, then lift the wider one
(design call: no edit can quietly shrink a hold).

### 4.5 Lift a hold (two people)

1. **Request:** a platform admin chooses **Request lift**, gives a reason (**The case is
   closed** · **The request was withdrawn** · **Placed by mistake** · **Other** with a
   note), the **authority** for lifting (required, e.g. "Counsel's letter 14 Oct 2026, ref
   ABC-123"), and their two-step code. The hold shows **Lift requested** and **stays active**.
2. **The effect, shown before approving:** "When this hold is lifted, records it alone was
   keeping become due for the daily clean-up. About {n} records are already past their
   retention period and would be deleted in the clean-up after {date}." The count comes from
   the server and is a whole-hospital count, never broken down by patient.
3. **Approve:** a **different** platform admin approves with their own two-step code. The
   requester sees "Waiting for a different platform admin".
4. **Grace period** (design call): a lifted hold keeps protecting its records for **7 more
   days**. The hold shows **Lifted · records released on {date}**; any platform admin can
   **Undo lift** in that time (one person, step-up: it puts the hold back, the safe
   direction). After the grace period the daily clean-up treats the records as normal.

Either platform admin can cancel a lift request. Requested, cancelled, lapsed, approved,
undone and released are all audited.

### 4.6 How a hold blocks removal and the clean-up

- **Removal (§7.6):** a hospital's removal `checks.legal_holds` counts its holds that are
  Active, Review due, Lift requested, or Lifted but still inside the grace period. Any of these
  blocks the request and the approval, as today. The removal panel's "Legal holds are managed
  in a later release." becomes a link: "1 legal hold is active · **View holds**".
- **A hold placed during a removal** (design call): if the hospital is **Removal pending**,
  the request becomes blocked. If it is **Removal scheduled**, the server stops the removal if
  it hasn't started and returns the hospital to **Removal pending** (blocked); the hold's page
  says so. If the removal has already started deleting, the server refuses the hold with
  "This hospital's removal has already started" and the platform team must act outside the
  app at once. The server checks holds again immediately before it deletes anything.
- **The daily clean-up** leaves out every record under a hold (by hospital and creation
  date), in the clean-up itself, as the gateway design already plans. Its run summary reports
  "{n} records kept because of legal holds" as a count only.
- **The hospital page** gains a **Legal holds** section: active holds with links, and
  **Place a hold**. The hospitals list shows a "Hold" tag beside a hospital with one, with the
  word, never colour alone.

### 4.7 Audit

Placed, edited (review date, note), lift requested, lift cancelled, lift lapsed, lifted,
lift undone and records released all go to Activity with the actor, the hospital, the hold
and the reason. Activity shows the hold's reference but not its note (design call: the note
is the field most likely to carry something it shouldn't).

## 5. System health (Plan 8b)

### 5.1 The Health tab

For platform admins and auditors. Counts and times only; no hospital, clinician or patient
names, no question text, no error messages.

- **Overall status**, at the top, in words and an icon: **Working normally**, **Slower than
  usual**, **Having problems**, or **Couldn't check**. The server decides the first three.
- **Parts of the service**, one row each with the same four words and "since {time}":
  - Sign-in and the app;
  - Answering questions (the workers);
  - Checking evidence;
  - Reading documents;
  - Finding guidelines;
  - Records clean-up (last run, and whether it finished);
  - Triage (On or Off; Off is not a problem).
- **Questions waiting:** how many, and how long the oldest has waited.
- **Failed jobs:** how many now, and new in the last 24 hours, with a link to the Failed jobs
  tab.
- **Answer time:** for the last hour and the last 24 hours, "Half within {x} s · 95 in 100
  within {y} s", overall and by step (Protecting patient privacy, Finding guidelines, Writing
  the answer, Checking evidence), using the UI design v3 §6 words.
- **Recent errors:** counts by kind, last hour and last 24 hours, in plain words: "Took too
  long", "Couldn't reach a service", "Unreadable document", "Request refused as invalid",
  "Other". No messages.
- **Versions** (collapsed): the version labels of the running parts, as the server sends them,
  so a change in behaviour can be matched to a release.

### 5.2 Rules

- **Fail closed** (anti-goal 4): if the health call fails, or its `updated_at` is more than 2
  minutes old, the overall status is **Couldn't check** with the time of the last good
  reading. Never green from old data, never zeros where loading failed. Each block has its own
  "Couldn't load" with Try again.
- **Refresh:** every 30 seconds while the tab is open and visible, plus **Refresh now**
  (design call). It stops when the page is hidden, so it doesn't keep the session alive past
  the idle limit (the refresh doesn't count as activity).
- **"Updated {time}"**, from the server, on the page.
- **Optional:** while the overall status is **Having problems**, a one-line banner across the
  whole platform app: "The service is having problems · View health". Mark as optional; it
  can follow if the page alone proves enough.

## 6. Failed jobs (Plan 8b)

### 6.1 The Failed jobs tab

A job "fails" when the backend has given up on it: a permanent error, or the third transient
one. Failed jobs wait here; nothing retries them on its own.

**A table** (cards on phones), newest first:

- **What:** Answer a question · Save feedback · Approve a correction · Read a document ·
  Triage · Search guidelines · Reset learning data · Records clean-up;
- **Hospital** (name, or "Platform" for platform-wide work);
- **Failed** (time), **first tried** (time), **attempts**;
- **Why:** the plain error kind (§5.1), never the message;
- **Reference:** the job's opaque id, with **Copy**, to match backend logs;
- **Status:** **Failed**, **Retrying**, **Retried** (and then finished or failed again),
  **Cancelled** (by whom, when).

Filter by status (default Failed), what, hospital and why. Retried and cancelled jobs stay
listed for 30 days (design call).

### 6.2 Retry

- Any platform admin; one job, or up to 50 chosen (design call). A confirm dialog, no step-up.
- **Old questions** (anti-goal 5): if a chosen "Answer a question" job was first tried more than
  24 hours ago, the dialog says "{n} of these questions were asked more than a day ago. The
  clinicians may have asked again or no longer need the answer." and the safe default is
  **Don't retry**.
- **Never twice:** a retry carries an `Idempotency-Key`; the backend's jobs check their
  subject's state first (a question already answered is skipped). A job that is no longer
  Failed returns "Already retried or finished" and the row refreshes.
- A retried job that fails again comes back to the list as Failed with its attempts.

### 6.3 Cancel

- Any platform admin; one job, or up to 50 chosen. A dialog with a reason (**No longer
  needed** · **Can't succeed** · **Other** with a note) and the person's two-step code. The safe
  default is **Keep**.
- The effect is said plainly: for a question, "The clinician will see 'Couldn't complete'
  and can ask again"; for a document, "The document won't be read; the clinician can upload it
  again"; for a correction, "The correction stays waiting and can be approved again".
- A records clean-up job can be cancelled (it runs again the next day); cancelling one never
  deletes anything.
- Cancelled jobs are kept as a record, not deleted.

## 7. Platform settings (Plan 8c)

The **Settings** page has three sections. Every setting shows its current value, "Changed by
{name} · {date}", and a link to its history in Activity. Every change asks for a reason and
the person's two-step code, sends `version`, and shows "Changed by someone else" and reloads
on a clash, never overwrites.

### 7.1 Records retention

- **A table:** what's kept (Questions and answers · Documents · Waiting corrections · Audit
  log, as the backend lists them), how long (in years, or months under a year), the minimum
  allowed (from the server; the audit log never under 6 years), the last clean-up (date,
  "{n} deleted", "{n} kept for legal holds", finished or not) and the next.
- **Longer:** one platform admin, step-up. Takes effect at once (keeping more is safe).
- **Shorter** (anti-goal 6): a **preview** first, from the server: "With 3 years, about
  {n} records would be deleted in the next clean-up. Records under a legal hold are kept."
  Then a request with a reason and step-up, and a **different** platform admin's approval with
  step-up (§3). Until approved, the old period applies; the page shows "Change to 3 years
  waiting for a different platform admin". The preview is shown again to the approver,
  freshly counted.
- **Below the minimum** is refused by the server; the app doesn't offer it.
- **Pause clean-up (optional):** one platform admin, step-up and a reason, for an emergency
  (for example while a hold is being arranged). Resuming is the same. While paused, the page
  and the Health tab say "Records clean-up paused by {name} since {date}". Pausing only ever
  keeps more.
- The numbers are the backend's placeholders until Measured Health's compliance lead confirms
  them (gateway design §12); the page doesn't present them as legal advice.

### 7.2 Triage gate

Triage gives early risk scores. It is built but switched off until validated; while off,
clinicians are told it isn't available and nothing is simulated.

- **Shows:** On or Off; whether it's **ready** to switch on (the server checks that the
  validated scoring files are in place and match their validation report), in plain words:
  "Ready to switch on" or "Not ready: the validation report is missing"; who changed it last.
- **Switch off:** one platform admin, step-up, reason. At once. Switching off is the safe
  direction and may be urgent.
- **Switch on:** only when ready. Two people (§3), each with step-up. The request needs a
  **clinical sign-off reference** (who approved it clinically, and the reference of their
  sign-off). The server records it with the checksum it checked. If the check fails between
  request and approval, approval is refused with "No longer ready to switch on".
- Platform-wide only (design call); per-hospital switching is later if needed.

### 7.3 Clear unapproved learning data (feedback-buffer reset)

The service learns from clinicians' feedback. Feedback that no second clinician has approved
waits in a buffer. Clearing it is for when that buffer holds bad input (a test run, a misused
account).

- **Shows:** how many items are waiting, and the last reset (by whom, when, why).
- **Clear:** one platform admin (design call), a dialog stating "This clears {n} items of
  unapproved feedback. Approved corrections and guidelines are not touched. This can't be
  undone.", a reason, and step-up. The safe default is **Cancel**. The app sends the
  backend's confirm word itself; the person doesn't type one (the two-step code is the
  deliberate act).
- It runs as a job: the section shows "Clearing…" then "Cleared {n} items · {time}". If it
  fails, it appears in Failed jobs.

### 7.4 Pending two-person changes

The Settings page lists any waiting request (retention shortened, triage on) at the top, with
**Approve** or "Waiting for a different platform admin", and **Cancel**. Requests lapse after 7
days.

## 8. Rules that apply everywhere

- **Plain words** (UI design v3 §6): no internal names, job type names, queue names, error
  classes or model names in the interface; the mapping lives in one label file, as today.
- **Counts only.** No patient, clinician, question or answer content on any page in this
  design. The hold counts in §4.5 and §7.1 are whole-hospital or platform totals.
- **Nothing stored in the browser**; nothing from these pages in the URL except opaque ids and
  filter values.
- **States:** every list and block has loading, empty ("No legal holds", "No failed jobs"),
  "Couldn't load" with Try again, and offline (actions disabled with the reason).
- **Accessibility** (UI design v3 §7): statuses with words and icons, never colour alone;
  destructive dialogs default to the safe choice; keyboard reachable; 44 px targets on phones.
- **Getting told (with Plan 7d, optional):** the bell gains: a request waiting for you to
  approve; a hold's review date reached; overall health **Having problems** for more than 10
  minutes. No email from this design.

## 9. Backend this design needs (assumed contract)

Add to the backend requirements (mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md`
§14, as §14.8). It follows the §14 conventions: `X-MHAI-Audience: platform`, two-step
required, auditors refused writes (**403** `forbidden`), `Idempotency-Key` on every write,
opaque ids, errors as `{code}`, step-up as `mfa_code` or `backup_code` (**403**
`mfa_invalid`, **429** `mfa_locked`), and `version` with **409** `conflict` on edits.

The gateway design already has `/admin/legal-holds`, `/agents/status`, `/admin/dlq`,
`/admin/jobs/cancel`, `/admin/feedback-buffer/reset` and `/admin/settings`. The platform app's
proxy allows only `/platform/*` shapes, so these are asked for as `/platform/*` endpoints
(design call); the backend may build them on the existing handlers. Auditors need read access
to all `GET`s below (the gateway gives agent status to admins only).

**Two-person requests** share one shape: `{id, kind, requested_by, requested_at, reason,
requested_by_you, expires_at}`, approved with `{mfa_code}` (**409** `same_person`, **409**
`expired`), cancelled with no body (a hold lift's approve, cancel and undo also send the
hold's `version`: see Legal holds). `kind` is one of `hold_lift`, `retention_shorten` and
`triage_on`. `requested_by_you` is set per caller, and is the only thing that decides who may
approve. A request lapses 7 days after `requested_at` (`expires_at`).

**Legal holds**

- `GET /platform/legal-holds?status&hospital&q&cursor` → `{holds, next_cursor}`. A hold:
  `id`, `hospital` (`{id, name}`), `scope` (`{from, to}`, both null for all records),
  `reason` (`court_case`, `regulator`, `complaint`, `investigation`, `other`), `reference`,
  `asked_by`, `note`, `placed_by`, `placed_at`, `review_on`, `status` (`active`,
  `review_due`, `lift_requested`, `lifted`), `lift` (the two-person request plus
  `authority`, `approved_by`, `approved_at`, `released_on`) or null, `stopped_removal`
  (boolean: placing it sent a scheduled removal back to pending), `version`.
- The `status` filter is one of `open` (active, review due and lift requested; the default),
  `active`, `review_due`, `lift_requested`, `lifted` or `all`.
- `GET /platform/legal-holds/{id}` → the hold with `history` (events, newest first).
- `POST /platform/legal-holds {hospital_id, from?, to?, reason, note?, reference, asked_by,
review_on, mfa_code}` → the hold. **409** `hospital_removed`; **409** `removal_started`;
  **422** `invalid_range`.
- `PATCH /platform/legal-holds/{id} {review_on?, note?, version}`.
- `POST /platform/legal-holds/{id}/lift {reason, note?, authority, mfa_code}`, with `reason`
  one of `case_closed`, `withdrawn`, `mistake` or `other` → the hold,
  `lift_requested`, with `lift.records_due` (the count in §4.5) and `lift.due_after`.
- `POST …/lift/approve {version, mfa_code}` → `lifted`, `released_on` 7 days on;
  `POST …/lift/cancel {version}`; `POST …/lift/undo {version, mfa_code}` (only before
  `released_on`) → `active`. Each sends the hold's `version` as the person saw it, so it acts
  only on the request they saw: a mismatch (for example, the request was cancelled and a new
  one made meanwhile) is **409** `conflict` ("Changed by someone else"). A lapsed request is
  still **409** `expired` on approval.
- `GET /platform/hospitals` items gain `legal_holds_active`; `GET /platform/hospitals/{id}`
  gains `legal_holds` (those that keep records, short form). Despite the name, `legal_holds_active`
  counts the holds that keep records: active, review due, lift requested, or lifted within
  the 7-day grace period, before their `released_on` (the same set as
  `removal.checks.legal_holds`).

**Server duties for holds** (the app can't keep these):

- the daily clean-up and every other deletion path (removal, a future erasure request) leave
  out every record covered by a hold that is active, review due, lift requested, or lifted
  before its `released_on`, in the deletion query itself;
- `removal.checks.legal_holds` counts the same set;
- placing a hold on a `removal_scheduled` hospital stops the removal if it hasn't started
  (back to `removal_pending`, blocked); the removal re-checks holds just before deleting;
- `review_due` is set by the server from `review_on`; a hold never lifts itself;
- holds are never deleted; every change is audited.

**Health**

- `GET /platform/health` → `{updated_at, overall, parts, queue, failed_jobs, timing, errors,
versions, triage, clean_up}`:
  - `overall` and each part's `status`: `ok`, `slow`, `problem` (the server's thresholds);
    `parts`: `[{key, status, since}]` with `key` one of `app`, `workers`, `evidence`,
    `documents`, `guidelines`, `clean_up`;
  - `queue`: `{waiting, oldest_wait_s}`; `failed_jobs`: `{now, last_24h}`;
  - `timing`: `{last_hour, last_24h}`, each `{overall: {p50_ms, p95_ms}, steps: [{step, p50_ms,
p95_ms}]}`, with `step` one of `privacy`, `guidelines`, `answer` or `evidence`;
  - `errors`: `[{kind, last_hour, last_24h}]`, `kind` one of `timeout`, `unreachable`,
    `unreadable`, `invalid`, `other`;
  - `versions`: `[{part, label}]`; `triage`: `{enabled}`; `clean_up`: `{last_run_at, ok,
paused, paused_by, paused_at}`.
    No hospital, user or content anywhere in it.

**Failed jobs**

- `GET /platform/jobs?status&type&hospital&kind&cursor` → `{jobs, next_cursor}`. A job: `id`,
  `type` (`run_query`, `submit_feedback`, `approve_correction`, `ingest_document`,
  `run_triage`, `kb_search`, `feedback_buffer_reset`, `retention_purge`), `hospital`
  (`{id, name}` or null), `created_at`, `failed_at`, `attempts`, `kind` (as `errors`),
  `status` (`failed`, `retrying`, `retried`, `cancelled`), `cancelled_by`, `cancelled_at`.
  Never the subject, the user or the error message.
- `POST /platform/jobs/retry {ids}` (1–50) → `{retried, skipped}` (each an array of job ids); a
  job no longer `failed` is skipped, not an error.
- `POST /platform/jobs/cancel {ids, reason, note?, mfa_code}` (1–50), with `reason` one of
  `no_longer_needed`, `cant_succeed` or `other` → `{cancelled, skipped}` (each an array of job
  ids).
  The subject moves to its failed state (a question shows "Couldn't complete").
- Retried and cancelled jobs stay listed for 30 days.

**Settings**

- `GET /platform/settings` → `{retention, triage, feedback_buffer, pending}`:
  - `retention`: `{paused, paused_by, paused_at, confirmed, items: [{type, days, minimum_days,
last_run: {at, ok, deleted, kept_for_holds}, next_run_at, changed_by, changed_at, version}]}`,
    with `type` one of `records`, `documents`, `pending_corrections` or `audit_log`, and
    `confirmed` false until the compliance lead has confirmed the periods;
  - `triage`: `{enabled, ready, not_ready_reason, changed_by, changed_at, version}`, with
    `not_ready_reason` one of `missing_report`, `missing_files` or `checksum_mismatch` (null
    when ready);
  - `feedback_buffer`: `{waiting, running, failed_job_id, last_reset: {by, at, reason,
cleared}}`: `running` while a reset is under way, `failed_job_id` the failed reset's job (or
    null);
  - `pending`: the two-person requests, each with `from` and `to`.
- `GET /platform/settings/retention/{type}/preview?days` → `{would_delete}`.
- `PUT /platform/settings/retention/{type} {days, reason, mfa_code, version}`: longer applies
  at once; shorter returns **202** with the pending request; **422** `below_minimum`.
- `PUT /platform/settings/retention-pause {paused, reason, mfa_code}` (optional).
- `PUT /platform/settings/triage {enabled, reason, clinical_signoff?, mfa_code, version}`:
  off applies at once; on returns **202** with the pending request, **409** `not_ready`; the
  approval re-checks readiness (**409** `not_ready`).
- `POST /platform/settings/requests/{id}/approve {mfa_code}`, `POST …/cancel`.
- `POST /platform/settings/feedback-buffer/reset {reason, mfa_code}` → **202** `{job_id}`; the
  backend supplies its own confirm word.
- Every other settings write answers with the whole `SettingsOut` (the `GET` shape), whether
  it is **200** (applied) or **202** (a pending request).

**Activity** gains the events above, with the hold's reference but never its note.

## 10. Delivery

Each on sample data in the demo, with its own PR and end-to-end tests on desktop and phone.

1. **Plan 8a: legal holds.** The page, place, review date, two-person lift with the grace
   period and undo, the hospital page section, the "Hold" tag, and the removal panel's link.
   Demo data: holds in every state, including one blocking the existing "Removal pending"
   hospital and one lifted inside its grace period.
2. **Plan 8b: system health and failed jobs.** The System page and its two tabs. Demo data: a
   switch on the sample backend between normal, slower and problems, and failed jobs of every
   type and kind, including an old question.
3. **Plan 8c: settings.** Retention with preview and two-person shortening, the triage gate
   (one demo where it's not ready), the reset. The optional pause and the health banner come
   last, if wanted.

The contract (§9) goes into the backend requirements with 8a, so the backend can start on
holds first.

## 11. Testing (what must be proved)

- **Holds block deletion:** with a hold active, review due, lift requested, or lifted inside
  its grace period, the removal request and approval are blocked and show the count; after
  release, they aren't. (The clean-up's own exclusion is the backend's test.)
- **Two people:** lifting a hold, shortening retention and switching triage on refuse the
  requester's approval, show "Waiting for a different platform admin", can be cancelled by
  either, and lapse after 7 days.
- **Step-up:** every action listed in §3 asks for the code; a wrong code shows the error; a
  locked code shows the wait; retry doesn't ask.
- **No shrinking edits:** a hold's scope, reason and reference can't be edited.
- **Privacy:** no page or Activity entry shows a hold's note outside its own page; no job
  shows content; free-text fields show the hint.
- **Health fails closed:** a failed or 2-minute-old reading shows **Couldn't check**, never
  Working normally, never zeros.
- **Retry safety:** the old-question warning defaults to Don't retry; a job no longer failed is
  skipped and the row refreshes.
- **Settings:** shortening shows the preview to both people; below the minimum isn't offered;
  triage on isn't offered when not ready; a version clash reloads.
- **Auditors:** see everything, change nothing (screen and proxy).
- **Proxy:** only the §9 shapes pass; anything else is refused before the API.
- **States and phone:** loading, empty, couldn't load, offline; 390 px with 44 px targets.

## 12. Decisions

None yet from the product owner. Design calls, open to change:

- order: holds, then health and failed jobs, then settings; three PRs;
- sidebar: Legal holds, System (Health, Failed jobs), Settings;
- auditors read everything here, including hold reasons and references;
- holds cover a whole hospital, optionally a date range; no patient holds in the platform app;
- placing a hold: one person with step-up; lifting: two people, then a 7-day grace period with
  undo;
- holds never expire; review date default 6 months; never deleted; only review date and note
  editable;
- Activity shows a hold's reference but not its note;
- two-person requests lapse after 7 days;
- retry without step-up, cancel with step-up, at most 50 at a time; warn on questions over 24
  hours old;
- health refreshes every 30 seconds while visible; over 2 minutes old means Couldn't check;
- retention: longer by one person, shorter by two with a preview; pause clean-up optional;
- triage: off by one person, on by two with a clinical sign-off reference, platform-wide only;
- the learning-data reset: one person with step-up, no typed word;
- new `/platform/*` endpoints rather than calling the gateway's `/admin/*` ones.

## 13. Questions for the product owner

1. **Who may lift a legal hold?** Is two platform admins in the app enough, or must lifting
   also record a named legal approver outside the team? _Suggested default:_ two different
   platform admins, each with step-up, plus a required "authority" field naming the legal
   approval, and a 7-day grace period with undo.
2. **Do we need holds on a single patient?** _Suggested default:_ not in the platform app.
   Hospital-wide holds, narrowed by dates, cover every case by keeping more; patient holds, if
   needed, come later on the hospital side after the Analysis privacy design.
3. **What are the real retention periods, and who confirms them?** The backend has
   placeholders (6 years for records and documents, 1 year for waiting corrections, at least 6
   years for the audit log). _Suggested default:_ keep the placeholders, show them as
   "not yet confirmed" until Measured Health's compliance lead signs off, and allow shortening
   only with two people and a preview.
4. **Should the app be able to switch triage on at all?** _Suggested default:_ yes, but only
   when the backend reports it ready, with two platform admins and a clinical sign-off
   reference; switching off is one admin, at once.
5. **May auditors see a hold's reason, reference and note?** _Suggested default:_ yes; they
   are auditors, and the hint keeps patient details out of the text. Activity shows the
   reference only.
6. **Do we need the two optional extras: a "pause clean-up" switch for emergencies, and a
   banner across the whole app when the service has problems?** _Suggested default:_ build
   both last (Plan 8c), as optional, and leave them out if time is short.

## Decisions on the questions above

Product owner, 22 Oct 2026: every suggested default above is accepted as the decision.
