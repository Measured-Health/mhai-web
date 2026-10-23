# mhai-web

Clinician-facing frontend for **MHAI**, Measured Health's clinical
decision-support system. Built with Next.js (App Router), TypeScript and
Tailwind CSS. The backend lives in
[Measured-Health/mhai-multiagent](https://github.com/Measured-Health/mhai-multiagent).

> Status: the clinical flow (consultation form, analysing view, results,
> evidence panel, feedback) runs on mock data. It is not connected to the
> backend yet.

## Layout

The repository is npm workspaces. The apps are deployed separately; shared
code lives in packages.

```text
apps/clinical/          the clinical app (@mhai/clinical)
apps/platform/          the platform admin app (@mhai/platform)
packages/tokens/        design tokens (@mhai/tokens)
packages/ui/            shared components (@mhai/ui)
packages/api-client/    shared API and sign-in helpers (@mhai/api-client)
```

Apps never import from each other; see [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

Run everything from the repository root.

```bash
nvm use        # Node version from .nvmrc
npm ci
npm run dev    # http://localhost:3000
```

To use another port, set it in the environment: `PORT=3200 npm run dev`.
Root scripts do not pass extra arguments through.

| Script                            | Purpose                             |
| --------------------------------- | ----------------------------------- |
| `npm run lint`                    | ESLint                              |
| `npm run typecheck`               | TypeScript check                    |
| `npm run format` / `format:check` | Prettier                            |
| `npm run build` / `start`         | Production build and server         |
| `npm run check:bundle`            | Clinical build has no platform code |
| `npm run check:platform-marker`   | Platform build is the platform app  |
| `npm run dev:platform`            | Platform admin app, port 3001       |
| `npm test`                        | Unit tests (Vitest)                 |
| `npm run e2e`                     | End-to-end tests (Playwright)       |

Commands for one app, such as `npx playwright install chromium`, run from
its folder: `cd apps/clinical`.

### Run on mock data

```bash
cp apps/clinical/.env.example apps/clinical/.env.local   # sets NEXT_PUBLIC_USE_MOCK=true
npm run dev
```

The app reads its environment files from `apps/clinical/`. If you have a
`.env.local` in the repository root from before the move, move it into
`apps/clinical/`.

The question text picks the mock result. Words match whole, in any case:
"fever" or "dengue" gives Use with caution, "potassium" gives Needs
review, "fail" (for example "Please fail this request") gives Couldn't
complete, and anything else gives High confidence. "Heart failure" or
"review his medications" get the normal High confidence result. A result
arrives after about 9 seconds.

**Corrections and review.** The sample data is written for the clinician
sample account (Dr. Reyes). **Review corrections** in the sidebar holds
sample corrections from Dr. Okafor and Nurse Bello, some waiting over 4
hours, and one of your own, which you can withdraw but not approve.
Approve gives you 60 seconds to undo; Reject needs a reason, which the
person who suggested it sees. **My feedback & corrections** (account menu)
lists your corrections as waiting, approved or rejected, with the
reviewer's reason, and Profile & security shows your counts. A correction
you suggest on a result gets a decision about two minutes later: approved,
or rejected with a reason if its "Why?" contains the word "unsure". The
bell in the top bar keeps this session's decisions. Like the rest of the
demo, all of it is in memory only.

**Hospital admin.** Sign in with the hospital admin sample (Grace Nwosu) to
land on **Staff** for Havana Hospital: 13 synthetic people, including one
who hasn't set up two-step, a waiting invite, an expired one and a
deactivated account. Invite people (one or a pasted list), and open anyone
to change their roles, specialty or review rights, send a password reset,
reset two-step, deactivate, reactivate or remove them. Removing someone (or
cancelling an invite) needs your own two-step code (in the demo, `123456`).
You can't do that to yourself or to the last hospital admin.
The demo accepts `123456` and a real authenticator code again and again;
making each code single-use is asked of the backend. **Hospital
settings**, **Usage** and **Activity** (with **Review oversight**) are in
the same sidebar group, and CSV exports are made on your device. The
medical director sample (Dr. Obi) is a clinician and a hospital admin, so
they see both sides. Every hospital admin must use two-step: the new
hospital admin sample (Chike Okoro) accepts the terms, sets a password and
sets up two-step (code `123456`) before reaching Staff. None of the admin
screens shows question text, results or patient details, and like the rest
of the demo it is all in memory only.

**Patient alerts on Usage.** Usage also gives a short summary of the
hospital's patient alerts, in counts only: how many and how serious, how
quickly they were acknowledged (with "Critical handled within 15 min"), how
they ended and why, the top findings and locations, a column chart over time
(with a table view), and a **What changed** list against the period before.
Any group of fewer than 5 shows "Fewer than 5", in the CSV export too. In
the sample, This month has a busy day, a rising finding and ward, and slower
Critical handling; Last month has nothing unusual; Last 90 days has no
earlier period to compare with. The sample numbers are written for 16
October; on other dates the columns are a cut of the same sample. Deeper trends and a de-identified patient list are in Analysis, below.

**Notifications and patient alerts.** Sign in as the clinician sample (any
clinician sees the same sample alerts). The bell in the top bar counts new
patient alerts and decisions on your corrections together; its panel shows
the latest of both, and **See all** opens Notifications, with a **Patient
alerts** tab (New, Handled, Dismissed, severity and source) and a
**Corrections** tab. Eight sample alerts, six of them new, are there at
sign-in (they don't pop up, but the bell counts the new ones), and a new one
arrives every 2 minutes: Urgent,
then Critical, then Info, again and again. Acknowledge one, dismiss one with
a reason, or choose **Ask MHAI about it** to start a consultation filled in
from the alert without the patient's name or MRN. Turn pop-ups off in Profile
& security → Notifications: Critical alerts still pop up. The sample hospital
has two connected systems, "Main record" and "Results system", so each alert
says which one it came from. Every name and MRN is synthetic, and like the
rest of the demo it is all in memory only: the sample alerts and pop-up
settings start afresh at each sign-in.

**Analysis.** Sign in as the analyst sample (Dr. Kemi Adeyemi,
`analyst.adeyemi@havanahospital.org`, a clinician with the Analyst role), or
as the hospital admin or the medical director, and open **Analysis**. It
shows how conditions and findings are spread across the hospital, in five
views: Prevalence and trends, Who is affected, Co-occurring conditions,
Findings and alerts, and MHAI quality. Filter by period, condition, age band,
sex, ward or clinic, location type, specialty and (when there is more than
one) source. Every chart has a **Table** view, and **Download CSV** saves the
view on screen. **See patients** opens a de-identified list (a pseudonymous
ID, age band, sex, location type, findings and conditions; never a name or
record number) for any count of 5 or more; each opening is recorded in
**Activity**. The numbers come from a made-up sample cohort of about 600
patients. As everywhere, any group of fewer than 5 shows "Fewer than 5" (on
screen, in tables and in the CSV), and a figure that would give one away is
hidden too. A hospital admin gives the Analyst role to a clinician in Staff.
**Show names** appears above a list only for someone a verified clearance
letter covers (Grace Nwosu is; Dr. Obi's letter is still waiting, so he sees
"Named access needs a clearance letter. Ask your hospital admin."), and only
while the named access switch is On. It asks for a purpose (Clinical
follow-up, Quality improvement, Audit or Other, with a note for Other), then
adds Name and MRN under the banner "Named view · letter until {date} · this
view is recorded", with your name and the time marked across the list. The
view is recorded in **Activity** as "viewed {n} patients by name in
Analysis", flagged. Names end at the end of the letter's end date (the demo ends each
view sooner; Show names again to continue), and an
open screen rechecks every 30 seconds and drops names, with "Named access has
ended" and the reason, when access ends: the letter is revoked, you are
removed from it or lose your role, or the switch is turned off. They also end
when the filters or group change, or you sign out. Like the rest of the demo,
nothing is kept in browser storage.

**Named access.** Sign in as the hospital admin sample (Grace Nwosu) and
open **Named access** (clearance letters) in the Hospital admin group. A
clearance letter, signed by hospital leadership, is what lets an Analyst see
patient names; Measured Health verifies it first. Eight sample letters show
every status: Checking the file, Couldn't accept the file, Waiting for
Measured Health, Active until a date, Ends in 12 days, Rejected, Ended and
Revoked. **Upload a letter** takes a PDF, PNG or JPEG (up to 10 MB and 20
pages; only its name and size show, never a preview), who signed it, its
dates, the people it covers and your two-step code (in the demo, `123456`);
it shows Checking the file and then Waiting for Measured Health. Open a
letter to **View letter** page by page (no download or print), **Revoke** it
(with a code), **Remove a person** or **Renew** it. A person's Staff panel
shows their named access line. Verifying a waiting letter happens in the
platform admin app's demo, whose store is separate: a letter verified there
doesn't change this demo, and the other way round. Names in Analysis (Show
names, above) need a verified letter, and need the same clinical, privacy and
legal sign-off as the rest of named access; until it is given they run on
sample data only. Like the rest of the demo, nothing is kept in browser
storage.

### Platform admin app

**Platform admin app.** Measured Health's own staff use it to add and run
hospitals and to manage the platform team. It never shows patient data. To
run it on sample data:

```bash
cp apps/platform/.env.example apps/platform/.env.local   # sets NEXT_PUBLIC_USE_MOCK=true
npm run dev:platform   # http://localhost:3001
```

The sign-in page lists the sample accounts. Any password works except
`wrong`, and the two-step code is `123456` (the clinical demo's backup
codes work too):

- Ada Bakare, platform admin: `ada.bakare@measured-health.example`;
- Tunde Okafor, platform admin: `tunde.okafor@measured-health.example`;
- Bola Hassan, platform admin linked to Havana Hospital: `bola.hassan@measured-health.example`;
- Amara Eze, auditor: `amara.eze@measured-health.example`;
- Chidi Nwosu, a new platform admin: `new.admin@measured-health.example`.
  He sets a password, accepts the terms and sets up two-step (code
  `123456`) before reaching Hospitals. Two-step can't be skipped, and the
  demo repeats these steps at each sign-in.

Any other email is a hospital account and is turned away with "This account
can't use the platform admin app." The nine sample hospitals:

- **Havana Hospital**: active, the clinical demo's hospital (admins Grace
  Nwosu and Dr. Ngozi Obi);
- **Northgate General Hospital**: active, with single sign-on on and tested;
- **Riverside Children's Hospital**: active; try editing, deactivating and
  reactivating it;
- **Lakeside Community Clinic**: active, a small clinic whose counts are 1
  to 4;
- **Hilltop Cottage Hospital**: active, new, with no active hospital admin;
- **Eastbrook Medical Centre**: set-up incomplete, its first admin's invite
  still pending (Resend);
- **Westfield Clinic**: deactivated, with its records retention period over,
  so it can be removed;
- **Harbour View Hospital**: removal pending, blocked by a legal hold, so
  nobody can approve it;
- **Southpoint Hospital**: removal pending, asked for by Tunde, so Ada can
  approve it.

Deactivating, reactivating, removing a hospital and removing a team member
each need your own two-step code. **Removing a hospital takes two platform
admins.** Sign in as Ada, open Westfield Clinic and choose Request removal
(with a reason and `123456`): the page says it is waiting for a different
platform admin. Sign out, sign in as Tunde in the same tab, open Westfield
Clinic and approve it: it shows Removal scheduled and, about a minute later,
Removed. The sample data lives in the tab's memory, so a reload starts it
afresh and signs you out.

**Analytics.** **Analytics** in the sidebar shows how the service is used
across every active hospital, in counts only: no patient names, questions
or answers. **What changed** always compares the last 7 days with the 4
weeks before, whatever period is picked, and lists the biggest changes
first (serious Critical ones before the rest, then **Show all**). On open,
Northgate General Hospital's slower Critical alert acknowledgement is
selected: its chart sits against the other hospitals, with the hospital's
size and its admins to contact. Platform admins can **Mark followed up**
with an optional note (500 characters; only the author edits it) and undo
it. Riverside Children's Hospital's drop in questions has already been
followed up by Tunde, with a note; auditors see that and change nothing.
Lakeside Community Clinic has counts of 1 to 4, which show as "Fewer than
5" (on screen and in **Download CSV**), and Hilltop Cottage Hospital is new,
with zeros, "Not enough data to compare yet" and "No active hospital
admin". The period picker (last 7, 30 or 90 days) changes the charts, the
tabs and the CSV. On a phone, tap a change to see it, then **Back**.

**Notifications.** The bell at the top of every page counts the analytics
changes from **What changed** that you haven't seen. Opening it shows the 20
newest (the change, the hospital and when) and marks them seen; choosing one opens **Analytics**
on that change, and **Mark all seen** clears the count. Seen is per person:
Ada seeing a change doesn't clear Tunde's bell. Platform admins and auditors
both have the bell. On **Account**, platform admins choose **Analytics
email**: **Off** (the default), **Critical only** or **Critical and weekly
digest**. Auditors get no email, so they don't see the setting. Emails name
the hospital and the change and never include patient details. (The backend
sends them; the demo only saves the setting and sends no email.)

**Legal holds.** A legal hold keeps one hospital's records, all of them or
those between two dates, past their retention period and through any removal
until the hold is lifted, so the removal can't be approved while one is in
force. **Legal holds** in the sidebar lists them (Open by default; filter by
status, hospital or reference), and each hospital's page has a **Legal
holds** section and a **Hold** tag on the list. Platform admins place a hold
with their two-step code. The samples: Harbour View has an active hold
(HC/2026/0412) that blocks its removal; Northgate's review date was
yesterday (**Review due**); Riverside's hold has a request to lift it from
Tunde, waiting for a different platform admin to approve; Lakeside's was
lifted 3 days ago and its records are released in 4 (**Undo lift** until
then, and it still blocks a removal); Havana's was lifted long ago. Lifting a hold needs two platform
admins, each with their own code, and a lift request lapses after 7 days.
Auditors see every hold, note and history, and change nothing.

**System health and failed jobs.** **System** in the sidebar has two tabs.
**Health** says in one line whether the service is Working normally, Slower
than usual, Having problems or Couldn't check, then lists the parts (with
since when), the questions waiting, the failed jobs, how long answers take
and recent errors by kind, all in counts and times with no patient, question
or answer content. It refreshes every 30 seconds while the tab is visible
and online, and **Refresh now** reads it at once; a reading more than 2
minutes old shows Couldn't check with the last good time, never old
figures. In the demo, a **Sample data** switch (Normal, Slower, Problems)
changes the reading. **Failed jobs** lists the jobs that failed, with filters
for what, which hospital, why and status. Platform admins choose up to 50
and **Retry** them (a warning appears when some are questions asked more
than a day ago) or **Cancel jobs** with a reason, an optional note and their
own two-step code; a cancelled job reads "Cancelled by" the person. Try
Northgate General Hospital's old question, or cancel the guideline search.
On a phone the jobs are cards. Auditors see both tabs and no buttons.

**Settings.** **Settings** in the sidebar shows how long records are kept,
whether triage is on, and the learning data no one has approved yet. Each
**Change** to a retention period (Questions and answers, Documents, Waiting
corrections, the Audit log) asks for a reason and the person's two-step code,
and offers nothing below the least the server allows. A longer period applies
at once; a shorter one first shows about how many records the next clean-up
would delete, then waits for a different platform admin to approve it (the
approver sees the count read again). **Triage** can be switched off at once;
switching it on needs the validation to be ready, a clinical sign-off and a
different platform admin's approval. **Clear unapproved learning data**
removes the feedback waiting to teach the system (approved corrections and
guidelines are not touched), asks for a reason and a code, and says
"Cleared 37 items" when it finishes; a failed reset points to Failed jobs.
**Changes waiting for approval** lists the requests, which lapse after 7
days; either admin can cancel one, and the person who asked can never approve
it. A platform admin can also **Pause clean-up**, which Health then shows.
Auditors see all of it and change nothing. When the service is having
problems, a warning with **View health** shows on every page except Health
itself. The retention periods are
placeholders until Measured Health's compliance lead confirms them.

**Audit log.** **Audit log** in the sidebar is the record of what people and
the system did across Measured Health, newest first: filters (hospital,
person, action type, dates, outcome, flagged only), an exact-id search (a
patient's pseudonym too) and each entry in full. It shows no patient names,
questions or answers; a patient appears only as a pseudonymous id, behind
**Show patient ids**. Reading the log is recorded: each new set of filters,
a search, an opened entry and shown patient ids make an entry of their own.
**Named access** groups the named patient lists by clearance letter,
**Exports** lists the files made, and **Integrity** runs and explains the
log's tamper check (**Run check now**). **Export CSV** and **Export for a
legal request** need a reason and the two-step code `123456`; the file shows
an export id and a checksum, downloads once, and its first line says Demo.
The sample has a Northgate General clearance letter with three named patient
lists (search `P-6DC445` to find one), two earlier exports and an Intact
check. Auditors and platform admins both read; the demo does not mirror the
session's other platform actions into the log.

**Clearances.** **Clearances** in the sidebar (after Analytics) is where
Measured Health checks the clearance letters hospitals upload, and where the
named-access switch lives. The queue opens on **To verify** (oldest first),
with Active, Ending soon and All; pick a letter to see what the hospital
entered, who it covers and its history, then **View letter** to read it page
by page (page images only: no download, no print, nothing kept). **Verify**,
**Reject** (with a reason) and **Revoke** each take your two-step code
(`123456`). Try Northgate General's waiting letter as Ada Bakare, who can
verify it. Bola Hassan
(`bola.hassan@measured-health.example`) is a platform admin linked to Havana
Hospital by a past account, so Havana's letters read "You can't verify
letters from a hospital you're linked to"; Tunde Okafor is covered by
Havana's waiting letter, so it reads "You can't verify a letter that covers
you". Auditors read the page and see no buttons. **Named access** at the top
shows the global switch and each hospital's (Off, Letters only or On; the
lower of the two is in effect). The demo runs On, with Northgate General
Off. **Turn up** asks for a position with the clinical, privacy and legal
sign-offs (name, date and reference) and a code, then waits for a different
platform admin: sign in as Tunde in the same tab to approve. **Turn down**
needs one admin, a reason and a code, and takes effect at once. This demo's
letters are separate from the clinical demo's: verifying one here doesn't
change that demo. Nothing is kept in browser storage.

**The auditor** (Amara Eze) sees every hospital, the team and the activity,
with no buttons to change anything; the server refuses an auditor's changes
too. On Team, nobody can change their own role or remove themselves: another
platform admin can. The app signs out after 15 minutes without activity,
with a warning at 13, and keeps nothing in browser storage.

In live mode, set `MHAI_API_URL` as for the clinical app.
**`PLATFORM_SESSION_SECRET` is required in live mode**: at least 32
characters (`openssl rand -base64 48`), different from the clinical app's
`SESSION_SECRET`. The live app is served at `platforms.<domain>`, reachable
only from the addresses on an IP allow list. It runs as its own compose
project (`deploy/compose.platform.yml`), deployed only once its secret is
set, so the clinical demo never depends on it; see
[deploy/README.md](deploy/README.md).

### Share the demo

The demo runs on sample data (`NEXT_PUBLIC_USE_MOCK=true`). A ribbon on
every screen says so, and its **Give feedback** button opens a short form.
The server appends each message to a file for the team to review (see
[deploy/README.md](deploy/README.md)); it never goes to GitHub. Besides the
message and an optional name or role, it carries only the page path (ids
masked) and the screen size, never anything else typed or shown.

The demo starts at a sign-in page (sample accounts, memory only, so a
reload signs you out). Any email and password works. The page lists sample
accounts you can fill in with one tap: a clinician who signs straight in, a
clinician with two-step (code `123456`, or a real authenticator app using
the secret shown in the demo), a new account (first sign-in), a new
hospital admin (first sign-in, with two-step required), a hospital admin
(Staff, settings, usage and activity; no clinical screens), a medical
director (clinician and hospital admin: both sides), a platform admin (the
403 page) and a locked account. The password `wrong` counts down to a lock,
and "Continue with hospital account" signs in through the demo's hospital
sign-on.

- **On your machine:** `NEXT_PUBLIC_USE_MOCK=true npm run build && npm start`
  (the flag is read at build time, so it must be set for the build).
  Feedback is saved to `apps/clinical/.feedback/feedback.jsonl` in development.
- **For the team:** https://demo.measured-health.org (open, not listed
  by search engines). Every merge to `main` that passes CI deploys there; see
  [deploy/README.md](deploy/README.md).

### Live mode

With `NEXT_PUBLIC_USE_MOCK` unset, the app talks to the MHAI API through
its own server routes (`/api/auth/*`, `/api/v1/*`). The API token is
sealed in an `httpOnly` cookie and never reaches browser JavaScript. Set:

- `MHAI_API_URL`: the API base, without `/api/v1`;
- `SESSION_SECRET`: at least 32 characters (`openssl rand -base64 48`).

Platform admin and auditor accounts get a 403 page that says to use the
platform admin app, with no link to it. Hospital admins use the hospital
admin side of this app.

Live mode switches every feature on, including hospital sign-on, password
reset, devices, "trust this device", terms and backup codes. It uses an
assumed backend contract (the plan header and spec section 10 item 14),
so calls to endpoints the API doesn't have yet will fail until it
catches up. Use mock mode until then.

### Weak networks

The app is built for slow and unreliable links. It slows its polling,
pauses while offline, retries safely (writes carry an `Idempotency-Key`),
holds a finished question until the connection returns, switches to data
saver on 2G, and has a slow-3G end-to-end test. The backend's side is in
[spec section 10](docs/specs/2026-10-13-ui-design-v3.md), items 15 to 19.

### Offline

Questions written while offline, and feedback that can't be sent
(offline or on a weak connection), are kept encrypted on the device and
sent when the connection returns. This is the one exception to the
"nothing in browser storage" rule; see [CONTRIBUTING.md](CONTRIBUTING.md)
for the exception and its limits. The product owner gave clinical and
privacy sign-off on 16 October 2026; any change to it needs a new one.

### Patient alerts

Patient alerts are the first place MHAI shows patients' names and MRNs: in
the alert list, the bell and the pop-ups. They are kept in memory only
(never in browser storage, the URL, the page title or logs), clear on
sign-out, and are never printed or exported; "Ask MHAI about it" copies no
identifiers into the question. These points need clinical and privacy
sign-off before live use, and it has not been given:

- names and MRNs shown in alerts, the bell and pop-ups;
- alerts kept in memory only, so they are gone after a reload or sign-out;
- Critical alerts always pop up, even when pop-ups are off;
- alerts already present at sign-in, or created while the first check fails,
  don't pop up but are counted on the bell.

Until it is given, alerts run on sample data only; see
[CONTRIBUTING.md](CONTRIBUTING.md).

### EMR connections and alert settings

Sample data only. Platform admin app: sign in as a platform admin and open
**Connections** (right after Hospitals). Havana is connected, Northgate needs
attention (its sign-in is refused: replace the key on its page, test, and it
reads Connected), Riverside is switched off and Eastbrook is not connected.
**Add a connection** takes a type, a name, an address, the type's fields and
the admin's own two-step code (in the demo, `123456`). It is saved switched
off; **Test connection**, then **Switch on**. Credentials are write-only:
they read "Set · {date}" afterwards and never come back to the browser. An
auditor sees everything and none of the controls.

Hospital admin side: sign in as the hospital admin and open **Alert
settings** to choose the units covered, what to flag and who gets alerts
(the hospital queue and named clinicians). Clinicians then see a "For you" or
"Hospital queue" tag on each alert, and the evidence under each likely cause.
Alerts never go to patients.

Live use needs the Plan 5a clinical and privacy sign-off first, and the
backend contract for record connections and alert settings; see
[CONTRIBUTING.md](CONTRIBUTING.md).

### Analysis

Analysis shows hospital-wide counts of conditions, findings, alerts and
corrections, and a de-identified patient list behind each count of 5 or more.
It needs clinical, privacy and legal sign-off before live use, and it has not
been given. It stays off in live mode until `ANALYSIS_SIGNED_OFF=true` is set
on the server and the backend switches it on for the hospital; with either
missing there is no page, no sidebar entry, no Analyst box and no API route
(the proxy answers 404). Until then it runs on sample data only. See
[CONTRIBUTING.md](CONTRIBUTING.md).

Named drill-down, which shows patient names to a person covered by a
verified clearance letter, needs **clinical, privacy and legal sign-off**
before live use, and it has not been given. In live mode it stays off until
`NAMED_ACCESS_SIGNED_OFF=true` is set on the server **and** the backend
switch is raised by two platform admins (Off, Letters only, On). With either
missing the Named access page, its sidebar entry and its API routes do not
exist (the proxy answers 404), and names are never shown. Names in Analysis
(Show names) are part of the same sign-off, and the proxy answers 404 to the
named patient list until it is given, and never serves names on a GET. Until then it runs on sample data
only.

### Tests

```bash
npm test        # unit tests, every workspace
npm run e2e     # end-to-end, desktop and mobile
```

The e2e suites build each app in mock mode and serve it: the clinical app
on port 3100, the platform admin app on 3101. The first time, install the
browser with `cd apps/clinical && npx playwright install chromium`. The
clinical suite checks the four result states, form errors, and that no
patient data is left in browser storage or cookies. The platform suite
checks sign-in with two-step, the hospital and team actions, two-admin
removal, that auditors can't change anything, the security headers, the
phone layout, the idle sign-out, and that nothing is left in browser
storage.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) (including the agent workflow) and
[SECURITY.md](SECURITY.md). Decisions are recorded in `docs/adr/`.
