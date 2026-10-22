# Platform admin app: the audit log across hospitals

- **Status:** Approved design (product owner, 22 Oct 2026; all suggested defaults accepted). Plan 9.
- **Builds on:**
  - [Platform admin design](2026-10-17-platform-admin-design.md), the app, its roles and its
    security rules. Its Activity page lists only the platform app's own actions and names this
    log as a later sub-project (§6, §15);
  - the hospital admin's Activity page in the clinical app (Plan 4: filters, Load more, CSV,
    "no clinical content" note);
  - the Analysis design (Plan 6) and the clearance letters (Plan 11): every named drill-down is
    audited, and the audit can be exported for a legal request;
  - the backend's audit log: one append-only log in which each entry is sealed with a
    fingerprint of the one before, checked by `GET /security/audit/verify`, and trimmed by the
    retention job only after it writes a checkpoint;
  - [UI design v3](2026-10-13-ui-design-v3.md) §6–§7.
- **Not in this design:** reading or changing retention settings, and managing legal holds
  (operations sub-project); verifying clearance letters (Plan 11); the analysis itself.

## 1. Why

Measured Health has to be able to answer, for any hospital and any day: **who did what, when,
from where, and was it allowed**. Today:

- each hospital admin sees only their own hospital's Activity, for 12 months;
- the platform app's Activity shows only the platform team's own actions;
- nobody can see the whole log, check that it hasn't been altered, or hand a traceable copy to
  a hospital, a regulator or a lawyer.

The auditor role exists for exactly this, and today it has nothing of its own to read.

## 2. Goals, non-goals and anti-goals

**Goals**

- An **Audit log** page in the platform app: every audited event across every hospital and the
  platform itself, newest first.
- Filters for hospital, person, action type, date range and outcome, plus an exact search by id.
- An **event detail** with everything the log holds about that event, none of it clinical.
- **Named access**: a view of every named drill-down under a clearance letter, by hospital and
  letter, for a legal request.
- **Export** to CSV that is itself recorded, carries its own id and checksum, and can be traced
  back to who made it and why.
- **Integrity check**: run the backend's check, show exactly what it covered, and guide the
  auditor when it fails.
- Show how long the log is kept and what retention has removed.

**Non-goals**

- Changing, hiding or annotating any entry. The log is read-only for everyone, from this app and
  from the API.
- Patient content of any kind (see §5).
- Resolving a patient pseudonym to a name. Only the hospital can do that, from its own records.
- Replacing the hospital admin's Activity page (§10).
- Real-time alerting on suspicious patterns. A later item, once the log is in use.

**Anti-goals.** These would make it a failure even if it technically works.

1. **Leaking patient data through the log.** A name, MRN, question text, answer, finding or free
   text reaches the screen or a file.
2. **An export that can't be traced.** A file leaves the app and nobody can say who made it, why,
   what it contained, or whether it was changed afterwards.
3. **A check that reads "OK" when it couldn't run.** A time-out, an empty range or a malformed
   reply shown as "Intact".
4. **A stale check shown as current.** Last month's "Intact" sitting on the page as if it were
   today's.
5. **Silent gaps.** Entries removed by retention, or a filter that hides an event type, with
   nothing on screen to say so.
6. **The watchers unwatched.** Auditors and platform admins reading or exporting the log without
   that being recorded too.

## 3. Who uses it

| Role               | Can                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Auditor**        | Everything here: read, search, event detail, named access, export, run the integrity check     |
| **Platform admin** | The same (design call: the backend's role table already gives `admin` the audit). Nobody edits |

- Auditors are the main users. The page is built for them: dense, exact, nothing hidden behind
  summaries.
- **Reading the log is recorded** (anti-goal 6): opening the page, each new set of filters, each
  id search, opening an event, and every export and check (design call: one entry per filter set,
  not per page loaded, so the log doesn't drown in its own reads). Those entries appear in the
  log like any other, under the action type **Audit**.
- The sidebar gains **Audit log**, after Activity: Hospitals · Analytics · Team · Activity ·
  Audit log · Account.

## 4. What an event holds

Every event is structured. The app builds each line from fields, never from free text sent by
the server (as on the hospital Activity page), so nothing clinical can arrive by accident.

| Field          | What it is                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **When**       | The server's time, to the second. Shown in local time; UTC in the detail and the CSV                                                       |
| **Who**        | The person (name, role, and whether they are hospital staff or Measured Health), or **System** for a backend job                           |
| **Hospital**   | The hospital it happened at or to, or **Platform** for platform-wide actions. A removed hospital keeps its name, marked "(removed)"        |
| **Action**     | A type (below) and a kind, shown in plain words: "Deactivated Northgate General", "Signed in", "Opened a named patient list"               |
| **Target**     | What it was done to: a staff member, a hospital, a setting, a clearance, an export. A patient only ever as a pseudonymous id               |
| **Outcome**    | **Succeeded**, **Refused** (not allowed: wrong role, wrong code, locked) or **Failed** (an error)                                          |
| **From where** | IP address, and a short device description (browser and operating system, from the browser's own report). No location lookup (design call) |
| **Flags**      | **Security** (named access, own-role change, step-up refused, sign-in locked) and **Policy**, as on the hospital page                      |
| **Links**      | Reason given (from a fixed list, plus its note only where the action allows one), clearance id, export id, the request id                  |
| **Entry**      | The entry's position in the log and its fingerprint, so a printed or exported entry can be matched to the log                              |

**Action types** (the filter): Sign-in · Account · Staff and roles · Hospital settings ·
Consultation · Review · Alerts · Analysis · **Named access** · Platform · Export · Audit ·
Retention · Security.

A consultation entry carries only its specialty and confidence level, as today.

## 5. Patient data never enters the log view (anti-goal 1)

- **Never shown, never in a file:** patient names, MRNs, dates of birth, addresses, question
  text, answers, findings, or any free text typed by a clinician.
- **Named drill-down is audited without names** (Plan 6, §5). Its entry records: who, when,
  which hospital, which clearance letter, the view and filters as structured values (view name,
  date range, location type; never a typed search), how many patients, and the **pseudonymous
  ids** of the patients on the list. The pseudonym is the hospital-stable id from the Analysis
  design, not the MRN.
- **Pseudonymous ids are shown on request**, in the event detail behind **Show patient ids**,
  which is itself recorded (design call). The list never shows them by default.
- **De-identified drill-downs** are recorded the same way, without the Security flag.
- **Fail closed:** the app checks every field it shows against its expected shape (ids match
  `[A-Za-z0-9_-]+`, kinds and reasons from fixed lists, notes only on actions that allow one). An
  event that doesn't fit is shown as "This entry can't be displayed" with its id and position,
  never its raw content, and the server is told (design call). The same rule writes the row into
  a CSV as "Not displayable".
- **Server duty:** the backend strips patient data before the entry is written (the gateway
  already keeps the payload free of patient data and stores clinical text only as a hash). The
  app's check is a second guard, not the first.

## 6. The page

**Header:** "Audit log", **Export CSV**, and a one-line integrity status that links to the
Integrity tab, e.g. "Integrity: Intact · checked 06:00 today" (§8).

**Tabs:** **Events** (default) · **Named access** · **Exports** · **Integrity**.

### 6.1 Events

- **Filters:**
  - **Hospital:** All hospitals, Platform only, or one hospital (removed hospitals included);
  - **Person:** a picker that searches by name or email and selects one person by id, so the
    filter is exact and two people with the same name stay apart (design call);
  - **Action type:** the list in §4, more than one allowed;
  - **Dates:** Today, Last 7 days, Last 30 days, Last 12 months, or a custom range of whole
    days. Any range inside what the log still holds;
  - **Outcome:** All, Succeeded, Refused, Failed;
  - **Flagged only.**
- **Search:** an exact id: event id, request id, export id, clearance id, or a patient
  pseudonym. A pseudonym search answers "who looked at this patient's entry on a list" for a
  legal request, and is recorded with the pseudonym searched (design call).
- **The list:** a table (time, who, hospital, action, outcome, flags) on desktop, cards on
  phones. Newest first, 50 per page, **Load more** by cursor. The server sends a count for the
  filters ("1,284 events") or "More than 10,000".
- **Nothing in the URL** and nothing in browser storage: filters, searches and ids stay on the
  page, as the app's privacy rule says. Links between tabs carry state in memory only.
- **Event detail:** a side panel (full page on phones) with every field in §4, the entry's
  position and fingerprint, and, for named access, the clearance letter's id, status and dates
  with a link to the Named access tab.
- **Gaps are shown** (anti-goal 5): when the date range reaches back past the oldest entry still
  kept, a line says "Entries before 3 Jan 2021 were removed by retention on 4 Jan 2027 (checkpoint
  recorded)". A filter never hides Audit or Retention entries silently: they are in the type
  list like every other type.
- States: loading, "Nothing matches these filters", "Couldn't load the audit log" with Try
  again, and offline (Load more, search and export disabled with the reason), as elsewhere in
  the app.

### 6.2 Named access

- One row per named drill-down, grouped by hospital and clearance letter: who, when, the view,
  how many patients, the letter (id, status, valid from and to, verified by whom).
- Filters: hospital, person, letter, dates.
- **Export for a legal request** (§7.3): the entries plus the letters they cite.
- A note on the tab: "Names and MRNs are never recorded here. Patients appear only by the
  hospital's pseudonymous id; the hospital can match them to its own records."

### 6.3 Exports

Every export ever made from the log (§7): who, when, reason, filters in words, row count, file
checksum, and whether it was capped. Read-only. This is how an export is traced (anti-goal 2).

### 6.4 Integrity

See §8.

**Footer on every tab:** "Kept for at least 6 years. The oldest entry is from {date}. No
question text, answers or patient names are recorded here. Times on screen are local; files
use UTC."

## 7. Export

### 7.1 Rules for every export (anti-goal 2)

- **Built by the server, not the app** (design call, unlike the Analytics CSV): the server can
  record exactly what was in the file, apply the patient rules once, and handle large ranges.
- **A reason is required:** **Legal request**, **Hospital request**, **Regulator request**,
  **Internal review**, **Security investigation**, or **Other** with a note (up to 200
  characters, no patient details). Plus an optional reference (a case or ticket number).
- **Two-step code** for every export (design call: a file leaves the protected network, so it
  gets the same step-up as deactivating a hospital).
- **Recorded before the file is released:** who, when, reason, reference, filters, row count,
  the file's checksum and an **export id**. If the record can't be written, no file is given.
- **The file names itself:** the file name and its first lines carry the export id, who made it,
  when (UTC), the filters and the reason. Every row carries the entry's position and fingerprint,
  so anyone can later check a row against the log.
- **Download once, within 15 minutes** of creation (design call). The file isn't kept by the
  server; a new copy is a new export, recorded again.
- **The checksum is shown** on screen and in the Exports tab, so a file handed over can be
  checked against the record.

### 7.2 Size

- Up to **50,000 rows** per export (design call). Over that, the dialog says how many match and
  asks to narrow the dates or filters. Never a silent cut: the toast and the file's header say
  "capped" if the server ever caps.
- Larger exports (for a full legal hold, say) are an operations task, not this page.

### 7.3 Named-access export for a legal request

- One hospital and one or more letters, or one hospital and a date range.
- A package (ZIP) holding the CSV of named-access entries, with pseudonymous ids, and a copy of
  each letter cited. Same reason, two-step code, record, export id, checksum and once-only
  download as above.
- The CSV holds pseudonymous ids only. Named lists themselves can't be exported (Plan 6 §6).

## 8. Integrity check

The backend seals each entry with a fingerprint of the one before. The check walks the log from
the latest retention checkpoint to the newest entry and reports whether every link holds.

### 8.1 What the screen shows

One of four states, each with words and an icon, never colour alone:

| State              | Shown as                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intact**         | "No changes found. Checked 1,204,331 entries, from the checkpoint of 4 Jan 2027 to entry 9,881,204 (22 Oct 2026 06:00 UTC)."                                                       |
| **Broken**         | "The log has been altered or damaged. The first entry that doesn't match is 9,880,117 (21 Oct 2026 23:14 UTC). Entries from there on can't be trusted until this is investigated." |
| **Couldn't check** | "The check didn't finish, so the log's integrity is unknown." With the reason (timed out, not reachable, unexpected reply) and Try again                                           |
| **Checking…**      | Progress in entries, with the range being checked                                                                                                                                  |

- **"Intact" needs proof** (anti-goal 3). The app shows Intact only when the reply says valid
  **and** names a range: entries checked above zero, a starting checkpoint (or "the first
  entry"), and the last entry and time checked. Anything missing, a time-out, an error or an
  unexpected shape shows **Couldn't check**, never Intact.
- **Coverage is always spelled out**: from where to where, how many entries, and that entries
  older than the checkpoint were removed by retention (with the checkpoint's date and count).
- **Age is always shown** (anti-goal 4): "Checked 06:00 today" in the header. Past 26 hours the
  header reads "Not checked since {date}" in warning style, not Intact.
- **History:** a list of past checks (when, who or the daily schedule, state, range).

### 8.2 When it runs

- **Daily, by the backend**, at 06:00 UTC (design call), and on demand with **Run check now**
  (auditors and platform admins). Every run, scheduled or manual, writes its own entry.
- A run is a background job: the page can be left and the result waits in the history.
- One run at a time; asking again while one runs shows the running one.

### 8.3 When it fails

On **Broken**, the app:

- shows a banner on every tab of the audit log and on the app's home page for everyone:
  "The audit log failed its integrity check on {date}. See Integrity.";
- tells every auditor and platform admin at once, by the bell and by email (Plan 7d channels);
- marks every event from the first broken entry onward with "After an integrity failure" in
  the list, the detail and any CSV.

The **auditor's steps**, shown on the Integrity tab:

1. **Don't treat later entries as evidence** until the failure is explained.
2. **Note the first broken entry** (shown, with **Copy**) and open it to see what it was.
3. **Run the check again** to rule out a passing fault. A second Broken confirms it; a later
   Intact doesn't erase the first result, which stays in the history.
4. **Report it** to Measured Health's security lead (named on the tab, contacted outside the
   app). The app has already notified the platform team.
5. **Export the entries around the break** (reason: Security investigation) to preserve what
   is there now.
6. **Record the outcome** when the investigation ends: an auditor adds an outcome note to the
   failed check (design call; the note is a new entry, the failed check is never changed).

**Repair isn't done in the app.** If the log has to be re-anchored, a backend procedure writes
a new checkpoint that says why, and every later check names it ("checked from the re-anchor of
{date} after incident {ref}"). The banner clears only when a check after the re-anchor is Intact
and the outcome note exists.

## 9. Retention

- **The log is kept at least 6 years** (the backend's placeholder; settings refuse less). Named
  access entries and the letters they cite follow the same rule, and a letter is kept as long as
  any entry that cites it.
- **A legal hold keeps a hospital's entries** past the period until the hold ends.
- **A removed hospital's entries stay** for the full period: "only the audit trail remains" (the
  platform admin design, §7.6).
- **Removal is visible**: the retention job writes a checkpoint first and one entry per run with
  counts. The page shows the oldest entry kept and the last removal (§6.1, §8.1).
- This page shows the rules; changing the period is an operations setting, not here.

## 10. The hospital admin's Activity versus this log

|             | Hospital admin's Activity (clinical app)    | Platform audit log (this app)                                           |
| ----------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Who sees it | That hospital's admins                      | Auditors and platform admins                                            |
| What        | That hospital's events                      | Every hospital, the platform, backend jobs, and reads of the log itself |
| How long    | 12 months on screen                         | At least 6 years                                                        |
| From where  | Device only                                 | IP address and device                                                   |
| Outcomes    | Mainly what succeeded, plus locked sign-ins | Succeeded, Refused and Failed                                           |
| Integrity   | Not shown                                   | Check, history, failure steps                                           |
| Export      | CSV, up to 10,000 rows, built in the app    | Server-built, recorded, checksummed, up to 50,000 rows                  |

- **Same source.** Both read the one log; the hospital page is a filtered, shorter view of it, so
  the two never disagree.
- **Platform actions on a hospital** (deactivate, single sign-on changes, letter verified or
  revoked) show in that hospital's Activity as "Measured Health · platform admin", without the
  person's name (design call: the name is in this log for accountability; the hospital sees that
  the platform acted).
- **Reads of the log** by auditors and platform admins don't appear in a hospital's Activity.
- The platform app's existing **Activity** page stays as the platform team's quick view of its
  own changes (design call); the Audit log is the record.

## 11. Accessibility

As UI design §7: keyboard reachable, visible focus, status words with icons, tables with proper
headers, labelled dialogs and panels, 44 px targets on phones, reduced motion respected. The
integrity states are announced to screen readers when they change.

## 12. Demo (sample data)

- A sample log across every demo hospital and the platform: sign-ins (some refused, one
  locked), staff changes, consultations (specialty and confidence only), a deactivation, a
  removal, de-identified and named drill-downs under a verified letter, exports, retention runs
  and a checkpoint.
- The integrity check returns **Intact** in the demo. Broken and Couldn't check are reached
  through the mock in tests, not by a switch on screen.
- Demo accounts as in the platform demo; two-step code `123456`. Exports download a sample file
  marked "Demo".

## 13. Backend this design needs (assumed contract)

Add to the backend requirements (mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md`
§14, as §14.8). It follows the §14 conventions: `X-MHAI-Audience: platform`, two-step required,
opaque ids, `Idempotency-Key` on writes, errors as `{code}`. These are platform-audience forms
of the gateway's `GET /security/audit` and `GET /security/audit/verify`, over the same log.

- `GET /platform/audit?hospital&person&type&outcome&flagged&from&to&q&cursor&limit` →
  `{events, next_cursor, total, total_capped, oldest_kept_at, last_checkpoint}`. Each event: `id`,
  `seq`, `hash`, `at`, `actor` (`{id, name, role, kind: staff|platform|system}`), `hospital`
  (`{id, name, removed}` or null), `type`, `kind`, `target` (`{kind, id, name?}`; a patient
  target has `pseudonym` only), `outcome` (`succeeded`, `refused`, `failed`), `ip`, `device`,
  `flag`, `reason`, `note` (only on kinds that allow one), `refs` (`clearance_id`, `export_id`,
  `request_id`), `after_break` (boolean).
  - `hospital=platform` selects platform-only events; `q` matches an id or pseudonym exactly.
  - Every call with a new filter set writes an `audit_viewed` entry with the filters.
- `GET /platform/audit/{id}` → the event, with `patients: {count}` for drill-downs.
  `GET /platform/audit/{id}/patients` → `{pseudonyms}`; writes `audit_patients_viewed`.
- `GET /platform/audit/named-access?hospital&person&clearance&from&to&cursor` → named drill-down
  events with their letter (`{id, status, valid_from, valid_to, verified_by}`).
- `POST /platform/audit/exports {kind: events|named_access, filters, reason, note?, reference?,
mfa_code | backup_code}` → `{export_id, rows, capped, checksum, expires_at}`; **422**
  `too_many_rows` with `{rows}` over 50,000; the export entry is written before this returns.
  `GET /platform/audit/exports/{id}/file` → the file, once, before `expires_at` (**410** `gone`
  after). `GET /platform/audit/exports?cursor` → past exports.
- `POST /platform/audit/verify` → `{run_id}` (returns the running one if any).
  `GET /platform/audit/verify/runs?cursor` and `GET /platform/audit/verify/runs/{id}` →
  `{id, started_at, finished_at, by (person or schedule), state: running|intact|broken|error,
entries_checked, from_checkpoint ({id, at, purged_count, reason}) | null, to_seq, to_at,
first_broken_seq?, first_broken_at?, error_code?, outcome_note?}`.
  `POST /platform/audit/verify/runs/{id}/outcome {note, version}` (auditors; broken runs only).
- **Server duties:**
  - no patient data in any entry, field or file; patients only as pseudonyms;
  - `intact` only when the whole range was walked; anything short of that is `error`;
  - the daily check, and the bell and email to every auditor and platform admin on `broken`;
  - the export record written before the file is released; no file without a record;
  - every read, search, export and check is itself an entry;
  - the log stays append-only: no endpoint changes or removes an entry.

## 14. Delivery

- **Plan 9: the Audit log page.** Events with filters, search and detail; Named access;
  Exports; Integrity; on sample data, with e2e on desktop and phone. Its own PR. If it grows too
  large, Integrity and Named access split out as Plan 9b (design call).

## 15. Testing (what must be proved)

- **No patient data:** an event or file carrying a name-shaped or free-text field outside the
  allowed kinds shows "can't be displayed" and writes "Not displayable"; pseudonyms appear only
  in the detail on request and in the named-access export.
- **Integrity:** Intact only with a full range; a missing field, zero entries, time-out or error
  shows Couldn't check; Broken shows the first entry, the banner and the marks; a check older
  than 26 hours is never shown as current; a later Intact doesn't erase a Broken.
- **Export:** reason and two-step required; no file without an export id; the id and checksum
  show on screen and in the Exports tab; over 50,000 rows asks to narrow; a second download is
  refused.
- **Reads are recorded:** filters, searches, detail, patient ids, exports and checks each make
  an entry.
- **Gaps:** a range older than the oldest entry says what retention removed.
- **Roles:** auditors and platform admins both read; the proxy allows only the paths above.
- **Nothing in the URL or browser storage.**
- **States and phone:** loading, empty, couldn't load, offline; cards at 390 px.

## 16. Decisions

- Design calls, open to change:
  - platform admins read the log as auditors do; nobody edits it;
  - reads of the log are recorded once per filter set;
  - IP address and device shown, no location lookup;
  - pseudonymous ids shown only on request, and that is recorded;
  - person filter by picked person, not free text;
  - exports built by the server, with a reason, a two-step code, a checksum, a 50,000-row cap
    and a once-only download within 15 minutes;
  - the daily check at 06:00 UTC, stale after 26 hours;
  - a broken check notifies everyone and stays until a later Intact and an outcome note;
  - platform actions show in a hospital's Activity as "Measured Health · platform admin";
  - the existing Activity page stays.

## 17. Questions for the product owner

1. **How long is the log kept?** The backend's 6 years is a placeholder. _Suggested default: 6
   years minimum, longer under a legal hold, confirmed with the compliance lead before go-live._
2. **Should platform admins see the whole log, or only auditors?** Platform admins' own actions
   are in it. _Suggested default: both read, nobody edits, and every read is recorded._
3. **What does an export need?** _Suggested default: a reason from the list, the person's
   two-step code, up to 50,000 rows, downloadable once within 15 minutes._
4. **Who is told when the integrity check fails, and how?** _Suggested default: every auditor
   and platform admin by bell and email at once, plus the security lead outside the app._
5. **Should a hospital see which Measured Health person acted on it?** _Suggested default: the
   hospital's Activity says "Measured Health · platform admin"; the name is only in this log._
6. **Show full IP addresses to auditors and platform admins?** _Suggested default: yes, full
   IP and device, never a location lookup, never in a hospital's Activity._

## Decisions on the questions above

Product owner, 22 Oct 2026: every suggested default above is accepted as the decision.
