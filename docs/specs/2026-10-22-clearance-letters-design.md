# Analysis clearance letters

- **Status:** Approved design (product owner, 22 Oct 2026; all suggested defaults accepted). Plan 11.
- **Sign-off: still pending.** Clinical, privacy and legal sign-off for named drill-down has
  **not** been given (product owner, 22 Oct 2026). This plan builds the clearance workflow on
  sample data. In live mode, named drill-down stays **switched off** until all three sign-offs
  are recorded. The switch, and how it is flipped, is designed in §4.
- **Builds on:**
  - [Analysis design](../../../mhai-web-6/docs/specs/2026-10-17-analysis-design.md) (Plan 6),
    §5 "Drill-down to patients" and §6 privacy rules;
  - [Platform admin design](2026-10-17-platform-admin-design.md) (Plans 7a and 7b): roles,
    step-up codes, the two-person removal pattern (§7.6);
  - [UI design v3](2026-10-13-ui-design-v3.md) §5.6 (hospital admin side), §6–§8;
  - the cross-hospital audit log (Plan 9), which records every event in §9.
- **Not in this design:** cross-hospital named drill-down (platform staff never see names);
  the Analysis page itself (Plan 6); legal holds (operations sub-project).

## 1. Why

Plan 6 lets hospital admins and analysts open the patients behind a number. By default they see
a pseudonymous list. Names and MRNs need **clearance**: a letter from hospital leadership,
uploaded into MHAI, checked by Measured Health, current, and covering that person. This plan
builds that clearance: upload, verify, expire, renew and revoke. It also builds the gate that
keeps names hidden whenever any part of it is missing.

## 2. Goals, non-goals and anti-goals

**Goals**

- Hospital admins upload a letter, name the people it covers, enter its end date (at most 12
  months away), see its status, renew it and revoke it.
- Platform admins work a queue of letters, view each one safely inside the app, and verify or
  reject it with a reason and their two-step code. They can revoke any letter at any time.
- Access ends at once at expiry or revocation, including on screens already open.
- Every named view is recorded in the audit log, citing the letter.
- One explicit, audited switch keeps named drill-down off in live mode until sign-off.

**Non-goals**

- Judging whether the letter is legally sufficient. Measured Health checks that it is
  plausible and matches what was entered (§6.3); the hospital owns its content.
- Electronic signing of letters inside MHAI.
- Exporting or printing named lists (Plan 6 §6 forbids it).

**Anti-goals.** Any of these makes the plan a failure even if it technically works.

1. **Names without a verified, current letter.** Names show for someone not covered by a
   verified letter whose end date has not passed, or while the switch is off.
2. **Self-verification.** A letter is verified by someone from the uploading hospital, or by
   anyone with an account there.
3. **Access surviving revocation.** Names stay on a screen, in a tab or in a session after
   expiry, revocation, a role change or a deactivation.
4. **The letter leaking.** The document is cached by a browser, shown as a thumbnail, put in a
   URL, logged, or reachable by anyone outside the hospital's admins and Measured Health.

## 3. Who uses it

| Who                                           | Where                                                 | Can                                                                 |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Hospital admin                                | Clinical app, Hospital admin group → **Named access** | Upload, view, renew, narrow and revoke their hospital's letters     |
| Analyst or hospital admin covered by a letter | Clinical app, Analysis                                | See names in drill-down while covered                               |
| Platform admin                                | Platform app → **Clearances**                         | Verify, reject, revoke any letter; flip the switch (two people, §4) |
| Auditor                                       | Platform app → **Clearances**                         | Read everything, view letters; change nothing                       |

- A hospital admin may upload a letter that covers themselves; the second person is always the
  Measured Health verifier (Plan 6 §5).
- Platform staff never see patient names. Verifying a letter shows the letter, not patients.

## 4. The named-access switch (sign-off gate)

Named drill-down has one switch on the **backend**. The app reads it; it never decides it.
(Design call: a switch in the frontend alone could be bypassed by calling the API directly.)

**Three positions** (design call):

| Position               | Letters                                                                                       | Names                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Off** (live default) | Hidden: the Named access page and the Clearances queue say "Named access isn't available yet" | Never; the API refuses `level=named` with **403** `named_access_off` |
| **Letters only**       | Upload and verify work, so hospitals can be ready                                             | Never                                                                |
| **On**                 | Upload and verify work                                                                        | Under a verified, current letter                                     |

- **Live mode starts Off.** The sample-data demo runs **On**, with sample letters (§12).
- **Turning it up** (Off → Letters only → On) is a **two-person action**, like hospital
  removal (platform admin design §7.6):
  1. A platform admin requests the change on the Clearances page. They give the sign-off
     reference for each of **clinical**, **privacy** and **legal** (who signed and when, plus a
     document reference), and their two-step code.
  2. A **second, different platform admin** approves with their own two-step code. The
     requester can't approve (**409** `same_person`).
  3. The backend refuses **On** while any of the three sign-off references is missing.
- **Turning it down** (to Letters only or Off) needs one platform admin with a reason and their
  two-step code, and takes effect at once. (Design call: the safe direction should be fast.)
  Turning it to Off ends every named view on screen, as revocation does (§8).
- Per hospital: the switch is global in this plan. See question 2.
- Every request, approval, cancellation and change is audited and shown on the Clearances page
  ("On since 3 Feb 2027 · requested by A, approved by B").

## 5. Hospital admin side (clinical app)

A new page, **Named access**, in the Hospital admin group after Usage (design call: a page of
its own, as letters have a lifecycle that doesn't fit Hospital settings). It uses `AdminFrame`
like the other admin pages.

### 5.1 The list

One row per letter, newest first: status, people covered, end date, uploaded by and when,
verified by (name only) and when.

**Statuses** (word and icon, never colour alone):

- **Checking the file**: the backend is scanning and preparing it;
- **Couldn't accept the file**: failed a check, with the reason in plain words (§7);
- **Waiting for Measured Health**: ready to verify;
- **Active until {date}**: verified and current; **Ends in {n} days** in the last 30 days;
- **Rejected**: with the platform admin's reason;
- **Ended {date}**: past its end date;
- **Revoked {date}**: with who and why.

A banner at the top sums up: "2 people have named access until 12 Mar 2027" or "Nobody has named
access". With the switch Off, the page shows only "Named access isn't available yet".

### 5.2 Upload a letter

A dialog with:

1. **The letter**: PDF, PNG or JPEG, up to 10 MB and 20 pages (§7). The app checks the type
   and size before sending, then shows only the file name and size. It never renders a preview.
2. **Signed by**: the name and job title of the hospital leader who signed it.
3. **Letter date**.
4. **People covered**: picked from this hospital's active staff who hold the hospital admin or
   Analyst role and have two-step on. Others appear greyed out with the reason ("Not an analyst
   or hospital admin", "Two-step isn't on"). At least one person, at most 20 (design call).
5. **End date**: as stated in the letter. The date picker stops at 12 months after today; a
   later date can't be chosen, and the server refuses one (**422** `end_date_too_late`).
6. **Confirm**: "This letter is signed by hospital leadership and names these people."
7. The admin's **current two-step code** (design call: uploading starts a chain that ends in
   patient names, so it needs step-up like other sensitive actions).

On send, the letter shows **Checking the file**. The page updates when the check finishes.

### 5.3 A letter's detail (side panel)

- Everything entered, the status history, and **View letter** (the same safe viewer as §6.2).
- **Revoke** (any hospital admin at the hospital, not only the uploader): a reason (**No longer
  needed**, **Person left or changed role**, **Uploaded in error**, **Security concern**,
  **Other** with a note) and their two-step code. It takes effect at once.
- **Remove a person** (design call): narrows the letter to fewer people, with a reason and a
  two-step code. It takes effect at once. **Adding** people is never allowed on an existing
  letter: that needs a new letter.
- **Renew**: opens Upload, pre-filled with the same people and signer. The new letter is
  verified on its own; the old one stays active until its own end date, so there is no gap if
  the new one is verified in time.

### 5.4 Where status shows elsewhere

- **Staff panel**: "Named access until 12 Mar 2027 · letter on file" or "No named access"
  (Plan 6 §5).
- **Analysis page**: the same line for the signed-in person, above the drill-down.
- Removing a person's Analyst or hospital admin role, deactivating them, or resetting their
  two-step ends their named access at once. The confirm dialog for each of these says so
  (design call).

## 6. Platform admin side (platform app)

The sidebar gains **Clearances**, after Analytics.

### 6.1 The queue

- Tabs: **To verify** (default), **Active**, **Ending soon** (within 30 days), **All**.
- A row: hospital, number of people covered, end date, uploaded by and when, waiting time. To
  verify is ordered oldest first.
- The switch's position and history sit at the top of the page (§4).
- Loading, empty ("No letters waiting"), "Couldn't load" with Try again, and offline states, as
  everywhere in the app.

### 6.2 Viewing the letter safely

- The backend turns each page of the letter into a **flat image** after the scan (§7). The app
  shows those images only, never the original file, so no PDF viewer, script or link inside the
  letter ever runs in the browser.
- Each page image is fetched when it is shown, held in memory only, and released when the viewer
  closes. Responses carry `Cache-Control: no-store` and are never written to browser storage or
  a service worker. The page address is never in the URL bar or in history.
- The server stamps every page with the viewer's name and the date and time (design call: it
  discourages screenshots and traces any that leak).
- No download or print button. The original is retrievable only through the audit export for a
  legal request (Plan 6 §5, Plan 9).
- Opening a letter is itself recorded (§9).

### 6.3 Verify or reject

Next to the letter, the panel shows what the hospital entered (signer, letter date, people, end
date) with a short checklist for the verifier:

- the letter is on hospital letterhead and signed by the stated person;
- it names the same people as entered;
- its end date matches, and is no more than 12 months away;
- it authorises viewing patient names for analysis.

Then:

- **Verify**: the verifier's two-step code. Names unlock for the covered people at once, if the
  switch is On.
- **Reject**: a reason (**Doesn't name these people**, **End date doesn't match**, **Not signed
  by leadership**, **Can't read it**, **Other** with a note, shown to the hospital) and a
  two-step code.

**Who may verify** (anti-goal 2):

- a platform admin only, never an auditor;
- not anyone with an account at the uploading hospital, now or in the past, and not anyone whose
  email is in the hospital's allowed email domains. The backend decides and returns
  `verifiable_by_you` with each letter; the app shows "You can't verify letters from a hospital
  you're linked to" instead of the buttons. A refused attempt gets **409** `same_side`.
  (Design call: the platform and clinical apps already keep accounts apart, but one person could
  hold both kinds of account.)

### 6.4 Revoke

Any platform admin, at any time, on any letter in **Waiting** or **Active**, with a reason and
their two-step code. Effect as in §8.

## 7. The document

- **Accepted:** PDF, PNG, JPEG. Up to **10 MB** and **20 pages** (design calls). The backend
  checks the real file type from its contents, not its name.
- **Refused, in plain words:** "This file type isn't accepted", "The file is larger than 10 MB",
  "The letter has more than 20 pages", "Password-protected files can't be accepted", "The file
  couldn't be read", "The file didn't pass the safety check".
- **The backend scans every file for malware** before anyone can open it. Until the scan passes,
  the letter is **Checking the file** and can't be viewed or verified. A failed scan keeps the
  file out of reach and records an event.
- **Stored** encrypted, by the backend only, with the original kept unchanged as the legal
  record. Page images are made from it for viewing.
- **In the browser:** the hospital admin's file goes straight from the file picker to the upload
  and is not kept. No thumbnail, preview or page image is stored anywhere on the device. File
  names are not logged by the app or sent to analytics.
- **Kept** for at least as long as the audit records that cite it (Plan 6 §9), and longer under a
  legal hold.

## 8. Expiry and ending access

**When access ends**

- **At the end date:** the end of that day in the hospital's time zone (design call).
- **At once** on: revocation (by either side), removing the last covered person, the person losing
  the Analyst or hospital admin role, the person being deactivated or having two-step reset, the
  hospital being deactivated, or the switch going below On.

**How it ends everywhere, including open sessions**

- **The server is the gate.** It checks the clearance on **every** named request, with nothing
  cached that could outlive a revocation. A named request after the end gets **403**
  `clearance_ended`.
- **On screens already open:**
  - every named list carries `named_until` (the earliest time the clearance could end on its
    own). The app removes the names at that moment without waiting for the server;
  - while names are on screen the app checks `GET /analysis/clearance/me` every **30 seconds**
    (design call). On any change it removes the names at once;
  - on any **403** `clearance_ended` or `named_access_off`, it removes them too.
- **Removing the names** means dropping them from memory and showing the de-identified list in
  their place, with "Named access has ended" and the reason in plain words.
- Named lists live only in memory, never in the URL, browser storage or a service worker. Signing
  out or the idle timeout clears them.

**Reminders**

- **30 days** before the end date (Plan 6 §5), and again at **7 days** and **1 day** (design call),
  in the app and by email. They go to every hospital admin at the hospital and each covered
  person. They name the end date and link to Named access, nothing else.
- The platform queue's **Ending soon** tab shows the same letters.
- At the end date the status becomes **Ended {date}**, and the hospital admins are told.

## 9. Named drill-down when cleared, and its audit

**What the person sees** (from Plan 6 §5)

- Drill-down always opens **de-identified**: pseudonymous ID, age band, sex, location type and
  the relevant findings.
- A covered person also sees **Show names**. Pressing it asks for a **purpose**: **Clinical
  follow-up**, **Quality improvement**, **Audit**, **Other** with a note (design call: purpose is
  what a later legal request will ask for).
- The list then adds **name** and **MRN**, under a banner: "Named view · letter until 12 Mar 2027
  · this view is recorded". The viewer's name and the time are shown faintly across the list.
- Changing a filter or group goes back to de-identified; showing names again is a new, recorded
  view (design call: each view is one audit entry with one set of filters).
- No export, print or copy button. Print styles hide names. Names never go into the URL, logs or
  analytics.
- When the person isn't covered, there is no Show names button, only "Named access needs a
  clearance letter. Ask your hospital admin." With the switch Off, nothing about names shows.

**What is recorded** (in the Plan 9 audit log, written by the backend)

| Event                                                                       | Recorded                                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Named view                                                                  | who, when, purpose, the group or filters, how many patients, which letter. **Flagged as a security event** in the hospital's Activity log |
| De-identified view                                                          | who, when, filters, how many patients (not flagged)                                                                                       |
| Letter uploaded, file refused, verified, rejected, narrowed, revoked, ended | who, when, which letter, reason                                                                                                           |
| Letter viewed                                                               | who, when, which letter, which pages                                                                                                      |
| Reminder sent                                                               | to whom, which letter                                                                                                                     |
| Switch requested, approved, cancelled, changed                              | who, when, position, sign-off references                                                                                                  |
| Verify refused (`same_side`)                                                | who, which letter. Flagged                                                                                                                |

- Hospital admins see their hospital's entries in Activity, with names flagged. Platform admins
  and auditors see all of them in the audit log, and can export them with the letters attached
  for a legal request (Plan 6 §5).
- The audit entry never contains patient names; it records the filters and the count, so the
  list can be rebuilt by the backend for a legal request.

## 10. Backend this design needs (assumed contract)

Adds to the backend requirements alongside Plan 6 §9. It follows the existing conventions: two-step
required, auditors refused writes, `Idempotency-Key` on writes, opaque ids matching
`[A-Za-z0-9_-]+`, errors as `{code}`, and step-up taking `mfa_code` or `backup_code` (**403**
`mfa_invalid`, **429** `mfa_locked`).

**Switch**

- `GET /analysis/named-access` (clinical) and `GET /platform/named-access` (platform) →
  `{position: off|letters_only|on, since, history}`.
- `POST /platform/named-access/requests {position, signoffs: {clinical, privacy, legal}, mfa_code}`;
  `POST …/requests/{id}/approve {mfa_code}` (**409** `same_person`, **409** `signoff_missing`);
  `POST …/requests/{id}/cancel`. Lowering is direct: `POST /platform/named-access/lower {position,
reason, mfa_code}`.

**Hospital side** (hospital admin only; **403** `named_access_off` while Off)

- `POST /hospital/clearances` (multipart: `file`, `signed_by`, `signer_title`, `letter_date`,
  `covered` (staff ids), `end_date`, `mfa_code`) → the letter, status `checking`. Refusals:
  **413** `file_too_large`, **415** `file_type`, **422** `end_date_too_late`, **422**
  `not_eligible` (with the staff ids).
- `GET /hospital/clearances` and `GET /hospital/clearances/{id}` → letters with `status`
  (`checking`, `refused`, `waiting`, `active`, `rejected`, `ended`, `revoked`), `refused_reason`,
  `covered`, `end_date`, `uploaded_by`, `verified_by`, `history`, `pages`, `version`.
- `POST /hospital/clearances/{id}/revoke {reason, note?, mfa_code}`;
  `POST /hospital/clearances/{id}/narrow {remove: [staff id], reason, mfa_code, version}`.

**Platform side**

- `GET /platform/clearances?status&hospital&cursor` → `{clearances, next_cursor}`, each with
  `verifiable_by_you` (decided by the server for the caller).
- `POST /platform/clearances/{id}/verify {mfa_code, version}` (**409** `same_side`, **409**
  `not_ready` while checking, **409** `conflict`); `…/reject {reason, note?, mfa_code, version}`;
  `…/revoke {reason, note?, mfa_code}`.

**The document** (hospital admins of that hospital, platform admins, auditors)

- `GET …/clearances/{id}/pages/{n}` → one watermarked page image, `Cache-Control: no-store`,
  `Content-Disposition: inline`, never the original. Each call is audited.
- The original only through the audit export (Plan 9).

**Named drill-down** (extends Plan 6 §9)

- `POST /analysis/patients/named` with an `Idempotency-Key` and the body
  `{drill, purpose, note?, filters}` → the list plus `named_until` and `clearance`
  (`{id, end_date}`). The purpose and note are never in a URL. `GET /analysis/patients` stays
  de-identified only. The server picks the letter; the app never sends one. It
  refuses with **403** `named_access_off`, `not_cleared` or `clearance_ended`, checked on every
  call with no cached decision.
- `GET /analysis/clearance/me` → `{named: boolean, until, clearance_id, version, reason}`, cheap enough to
  poll every 30 seconds.

**Server duties**

- End access at the end-of-day in the hospital's time zone, and at once on every event in §8.
- Scan every file before it can be viewed; check the real type; refuse password-protected PDFs;
  make flat page images; store the original encrypted.
- Decide `verifiable_by_you` and `same_side` from account links and email domains.
- Send the reminders (§8) and the "ended" notice.
- Never put patient names in audit entries, logs or reminders.

## 11. Delivery

1. **Plan 11a: hospital side.** Named access page, upload, list, detail, revoke, narrow, renew,
   staff panel and Analysis status lines, on sample data.
2. **Plan 11b: platform side.** Clearances queue, safe viewer, verify and reject with the
   same-side rule, revoke, and the switch with two-person approval, on sample data.
3. **Plan 11c: the gate in Analysis.** Show names with purpose, the named banner, ending access on
   open screens, and the audit entries. Live mode ships with the switch **Off**.

Each is its own PR. The contract (§10) goes to the backend with 11a.

## 12. Demo (sample data)

- The switch **On** in the demo, with its history showing a sample two-person approval.
- Letters in every state for the sample hospital: checking, refused (failed safety check), waiting,
  active (covering the sample hospital admin, as Plan 6 §8), ending in 12 days, rejected, ended,
  revoked.
- A placeholder letter as sample page images.
- Platform demo accounts: two platform admins, an auditor, and one platform admin linked to the
  sample hospital, to show the same-side refusal. Two-step code `123456`.

## 13. Testing (what must be proved)

- **Anti-goal 1:** names never show without a verified, current letter covering the person, nor
  with the switch below On; a response with names the app didn't expect fails closed.
- **Anti-goal 2:** a linked platform admin sees no Verify and the server refuses (**409**
  `same_side`); auditors can't verify (screen and proxy); the switch requester can't approve.
- **Anti-goal 3:** names leave the screen at `named_until`, within 30 seconds of a revocation made
  elsewhere, and at once on a 403; after a role removal, deactivation or the switch going down;
  nothing survives sign-out or the idle timeout.
- **Anti-goal 4:** no letter, page image, thumbnail or name in browser storage, the service
  worker, the URL or logs; page responses are `no-store`; no download or print.
- The 12-month cap in the picker and from the server; only eligible people can be covered;
  narrowing only removes.
- Every event in §9 is written, and named views are flagged.
- States: loading, empty, couldn't load, offline; phone layout at 390 px with 44 px targets.

## 14. Decisions

- Two-person control: hospital admin uploads, Measured Health platform admin verifies; 12-month
  cap; reminder at 30 days; revocable at any time by either side (product owner, Plan 6).
- Named drill-down stays off in live mode until clinical, privacy and legal sign-off (product
  owner, 22 Oct 2026).
- Design calls, open to change:
  - the three-position switch on the backend; raising it needs two platform admins and the three
    sign-off references; lowering needs one;
  - upload, narrow and revoke need the hospital admin's two-step code;
  - a separate Named access page; up to 20 people per letter; narrowing allowed, widening not;
  - PDF, PNG, JPEG; 10 MB; 20 pages; flat page images only, watermarked;
  - verifiers linked to the hospital by account or email domain are refused;
  - access ends at the end of the end date, hospital time; extra reminders at 7 and 1 days;
  - a 30-second check while names are on screen;
  - a purpose for every named view, and a new view for every filter change.

## 15. Questions for the product owner

1. **Before sign-off, may live hospitals upload letters and have them verified** (the "Letters
   only" position), so they are ready on day one? _Suggested default: no. Live stays Off until
   all three sign-offs are recorded, then moves to Letters only for one pilot hospital._
2. **Should the switch be per hospital rather than global?** _Suggested default: per hospital,
   behind the global switch, so named access can start with one pilot hospital. Each hospital is
   turned on by two platform admins._
3. **Is one Measured Health verifier enough, or should a second platform admin confirm?**
   _Suggested default: one. The hospital uploader is the first person, and the same-side rule
   keeps them apart._
4. **Must every named view give a purpose?** _Suggested default: yes, from a short list (Clinical
   follow-up, Quality improvement, Audit, Other with a note)._
5. **How long must letters be kept after they end, and may anyone download the original outside
   a legal export?** _Suggested default: at least as long as the audit records that cite them,
   longer under a legal hold; no download outside the legal export._
6. **Who gets the expiry reminders, and when?** _Suggested default: all the hospital's admins
   and each covered person, at 30, 7 and 1 days, in the app and by email._

## Decisions on the questions above

Product owner, 22 Oct 2026: every suggested default above is accepted as the decision.
