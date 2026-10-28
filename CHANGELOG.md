# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- The demo deploy now checks the preview instance's SSH host key
  (`DEPLOY_HOST_FINGERPRINT` in the `preview` environment) and refuses to
  run without it, so the GHCR token can only go to the real instance.

### Changed

- The clinical app now sends the same security headers as the platform
  admin app on every page: a strict Content Security Policy with a fresh
  nonce, no framing, `nosniff`, a referrer policy, a Permissions-Policy and,
  in production, HSTS. Every page now renders per request, and visited
  pages are no longer kept alive: on a phone, coming back to Review
  corrections opens the queue rather than the last detail.

- The platform admin app's **Analytics** page is now **Usage** (at `/usage`;
  `/analytics` redirects there). Nothing else about it changes.
- On a phone, a chart with more columns than fit its card is now a labelled,
  keyboard-reachable scroller that says it scrolls sideways.
- The fonts are now served from the repository (`packages/tokens/fonts`)
  instead of being fetched from Google during `next build`, so builds work
  offline and no longer break on Google's font URLs. They look the same.
- The repository is now npm workspaces: the app is in `apps/clinical` and
  the design tokens are in `packages/tokens`. There is no change to the
  app. If you keep a local `.env.local`, move it into `apps/clinical/`.
- Usage's Result confidence and By specialty bars use the new shared bar
  list. They look the same, but the bars now grow in once when the page
  opens (not with reduced motion).
- The decisions bell is now the notification bell, shared with patient
  alerts.
- The 403 page is now only for Measured Health platform admin and auditor
  accounts, and says "Use the platform admin app." with no link to it.
  `NEXT_PUBLIC_ADMIN_APP_URL` is gone. Hospital admins use the hospital
  admin side instead.
- The demo's sign-in page lists a hospital admin (Grace Nwosu), a medical
  director (Dr. Obi, clinician and hospital admin), a platform admin (the
  403 page), and a new hospital admin (Chike Okoro) who accepts the terms,
  sets a password and sets up two-step before reaching Staff. In the demo,
  removing staff takes the code `123456`.

### Added

- Analysis across hospitals in the platform admin app, on sample data: an
  Analysis page after Usage with five views (Prevalence and trends, Who is
  affected, Co-occurring conditions, Findings and alerts, MHAI quality) for
  all hospitals or one, filters, a fair comparison with similar hospitals,
  Chart and Table, and Download CSV that matches the screen. Counts of 1 to
  4 read "Fewer than 5", a hidden rate or share reads "Not shown", and a view that would give one away fails closed.
  Each visit and download is recorded first and shown in a new Analysis
  access tab on Activity, which platform admins and auditors both read and
  export. Auditors have no Analysis entry. It stays off in live mode until
  clinical, privacy and legal sign-off, `ANALYSIS_SIGNED_OFF=true` and the
  backend switch. The shared small-group guards moved to `@mhai/ui/guards`.
  End-to-end tests cover it on desktop and phone.
- EMR screens, on sample data: a Connections page in the platform admin app
  (list by hospital, a connection's page, Add a connection, test, switch on
  and off, write-only credentials, Activity and audit words), a Patient
  record connections section on each hospital's page, Alert settings for
  hospital admins (units covered, what to flag, who gets alerts), and
  evidence, a category and a "For you" or "Hospital queue" tag on patient
  alerts. A repo test now fails on any vendor or product name in the apps
  and packages.
- Named access in the hospital admin side, on sample data: a Named access
  page with the hospital's clearance letters in every status, uploading a
  PDF, PNG or JPEG letter (checked, then waiting for Measured Health),
  viewing it page by page with no download or print, revoking it, removing a
  person and renewing it, each with the admin's two-step code, and a named
  access line and warnings on the Staff panel. It stays off in live mode
  until clinical, privacy and legal sign-off, `NAMED_ACCESS_SIGNED_OFF=true`
  and the backend switch. End-to-end tests cover it on desktop and phone.
- Clearances in the platform admin app, on sample data: a Clearances page
  with the queue of hospitals' clearance letters (To verify, Active, Ending
  soon, All), a safe page-by-page viewer with no download or print, and
  Verify, Reject and Revoke with the admin's two-step code. A platform admin
  linked to the hospital, or covered by the letter, is told why they can't
  verify it. The named-access switch (global and per hospital: Off, Letters
  only, On) is raised with three sign-offs and a different platform admin's
  approval, and lowered at once by one admin. Auditors read it all. A new
  sample platform admin, Bola Hassan, is linked to Havana Hospital. End-to-end
  tests cover it on desktop and phone.
- Names in Analysis, on sample data: **Show names** on a patient list for
  someone a verified clearance letter covers, with a purpose, a banner and a
  watermark, recorded in Activity, and ended at once (with the reason) when
  the letter ends, the switch goes off, the filters change or the person
  signs out. A person's Analysis page says whether they have named access.
  Same sign-off and switch as Named access. End-to-end tests cover it on
  desktop and phone.
- Legal holds in the platform admin app, on sample data: a Legal holds page
  with filters, a hold on a hospital's records (all of them or a date range)
  that blocks its removal, a Hold tag on the hospitals list, a Legal holds
  section on each hospital's page, and a View holds link in the removal
  panel. Lifting a hold needs two platform admins. Auditors read it all.
  End-to-end tests cover it on desktop and phone.
- Settings in the platform admin app, on sample data: how long records are
  kept (longer at once, shorter with a preview and a second platform admin),
  triage on and off with a clinical sign-off, clearing unapproved learning
  data, pausing the clean-up, and the changes waiting for approval. A warning
  with a link to Health shows on every page when the service has problems.
  Auditors read it all. End-to-end tests cover it on desktop and phone.
- Analysis, on sample data: for hospital admins and clinicians with the new
  Analyst role (given in Staff), five views of conditions, who is affected,
  co-occurring conditions, findings and alerts, and MHAI quality, with
  filters, a Table view and Download CSV for each, and a de-identified
  patient list behind every count of 5 or more (each opening is logged in
  Activity). Groups of fewer than 5 show "Fewer than 5". It needs clinical,
  privacy and legal sign-off before live use, and stays off in live mode
  until `ANALYSIS_SIGNED_OFF=true` is set. End-to-end tests cover it on
  desktop and phone.
- The platform admin app (`apps/platform`, `npm run dev:platform`) for
  Measured Health's platform admins and auditors, on sample data. Sign in
  with a password and two-step (no skip, no "trust this device"); a new
  platform admin sets a password, accepts the terms and sets up two-step
  first. **Hospitals:** list and search, add a hospital and invite its
  first admin, edit details, deactivate and reactivate with your own code,
  single sign-on set-up with write-only secrets, and removal that a second
  platform admin must approve, held back by legal holds and records
  retention. **Team:** invite, change role and remove with your code;
  nobody changes their own role or removes themselves. **Activity** lists
  every platform action, and **Account** has the password, backup codes
  and signed-in devices. Auditors see everything and change nothing. The
  app signs out after 15 minutes without activity, keeps nothing in
  browser storage, and needs `PLATFORM_SESSION_SECRET` in live mode. It is
  served at `platforms.<domain>` behind an IP allow list, from its own
  compose project. End-to-end tests cover it on desktop and phone.
- Analytics in the platform admin app, on sample data: what changed
  across every active hospital (the last 7 days against the 4 weeks
  before), the selected change charted against the other hospitals, who
  to contact, and follow-ups with a note that platform admins add and
  undo and auditors read. Tabs and a CSV cover use, alert safety, answer
  quality and hospitals for the chosen period, in counts only, with
  counts of 1 to 4 shown as "Fewer than 5". Havana Hospital and two small
  sample hospitals join the sample data. End-to-end tests cover it on
  desktop and phone.
- Notifications in the platform admin app, on sample data: a bell that
  counts the analytics changes you haven't seen (seen is per person), and
  for platform admins an **Analytics email** setting on Account: Off,
  Critical only, or Critical and weekly digest. Auditors have the bell and
  get no email. End-to-end tests cover it on desktop and phone.
- System in the platform admin app, on sample data: a Health tab (Working
  normally, Slower than usual, Having problems or Couldn't check; the
  parts, questions waiting, failed jobs, answer times and recent errors, in
  counts only, refreshed every 30 seconds) with a demo switch between
  Normal, Slower and Problems, and a Failed jobs tab where platform admins
  retry (with a warning for old questions) or cancel jobs with a reason and
  their two-step code, and auditors read. End-to-end tests cover it on
  desktop and phone.
- The audit log in the platform admin app, on sample data. **Audit log**
  in the sidebar lists every entry newest first, with filters (hospital,
  person, action type, dates, outcome, flagged only), an exact-id search
  (also for a patient's pseudonym, which ignores the other filters) and the
  entry in full, with **Show patient ids** behind a recorded click. **Named
  access** groups the named patient lists by hospital and clearance letter.
  **Exports** lists the files made; **Export CSV** and the legal-request
  export need a reason and your two-step code, give an export id and a
  checksum, and can be downloaded once, within 15 minutes, by the person who
  made them. **Integrity** shows the daily and on-demand check, says
  Intact only with proof, shows a stale check as not checked, and guides an
  auditor through a failure. A failed check puts a banner on the home page
  and an item in the bell. Reading the log is itself recorded. No patient
  names or clinical text ever show. End-to-end tests cover it on desktop
  and phone.
- Shared packages `@mhai/ui` (components) and `@mhai/api-client` (API,
  session and two-step helpers), used by both apps.

- Patient alerts on Usage for hospital admins, when alerts are switched on:
  volumes by severity, still unhandled, median time to acknowledge (overall
  and for Critical), the share of Critical alerts handled within the
  hospital's target, outcomes and dismissal reasons, the top findings and
  locations, and a column chart over time with a table view. A **What
  changed** summary lists slower Critical handling, unusually busy days or
  weeks and rising findings or locations, or says "Nothing unusual this
  period" or "Not enough data to compare". The volume tiles, the response
  times, the Critical share and the two outcomes show their change against
  the previous period; dismissal reasons, top findings and top locations
  don't. A change that rounds to zero reads "no change". Groups of fewer
  than 5 show "Fewer than 5", on screen and in the CSV export, which now
  includes the alert numbers. If the alert numbers can't load, or don't
  add up safely, Usage says so with Try again instead of showing zeros.
  The column chart scrolls sideways on phones so every column is a 44 px
  target.
- One notification centre for clinicians: the bell in the top bar counts
  new patient alerts and decisions on your corrections together
  ("Notifications, 3 unread"), and its panel shows the latest of both with
  "See all". New alerts and decisions pop up with a View button. Alerts
  that were already there when you signed in don't pop up; Critical alerts
  are read out at once and stay until you hide them; a burst shows at most
  three pop-ups and a summary, and every one is read out. Pop-ups never
  take the focus and go when you sign out. When the bell can't check for
  new alerts it says so, with a warning mark, and never shows "no new
  alerts" while they're loading or failed. The panel and pop-ups are left
  out when printing.
- Notifications page, Patient alerts tab (on sample data): each alert shows
  its severity in words and an icon, the abnormal result with its unit,
  normal range and time, up to three likely causes suggested by MHAI with a
  confidence word, the patient's name, MRN and where they are, and the
  hospital's own label for the system it came from when there are several.
  Acknowledge it, dismiss it with a reason, or open the patient's record in
  the hospital's system. An alert someone else handled first says who and
  when. Filters for New, Handled, Dismissed, severity and source; cards on
  phones; nothing is printed or exported.
- "Ask MHAI about it" on a patient alert starts a consultation filled in
  with the patient's age and sex, a priority from the alert's severity and
  the abnormal result as the question. The patient's name, record number
  and location are never copied.
- Profile & security → Notifications: switch off pop-ups for patient alerts
  or for decisions on your corrections. The bell and the Notifications page
  still update, and Critical alerts always pop up. The settings are saved
  with your account (in the demo, for this session).
- Review oversight for hospital admins: corrections waiting with their
  specialty, how long they've waited and how many people can review them;
  specialties short of reviewers are flagged; remind the reviewers or
  assign one. No clinical content is shown, and only clinicians can
  approve or reject.

- The hospital's activity log: sign-ins, consultations (specialty and
  confidence only), feedback, review decisions, account changes and flagged
  security events, with filters and a CSV export made on the device.
- Usage for hospital admins, in counts only: consultations, active
  clinicians, agreement rate, median review time, the confidence mix and
  the specialty breakdown, with a CSV export made on the device.
- Hospital settings: review turnaround, whether reviewers must share the
  specialty, two-step for clinicians, the idle timeout and "trust this
  device"; hospital sign-on and allowed email domains are shown read-only.
- Hospital admins can manage each person from the staff member panel:
  change roles, specialty and who can review corrections; send a password
  reset; reset two-step verification; remind them to set it up; send a new
  invite; deactivate and reactivate; or remove the account (or cancel an
  invite). Removing someone needs your own two-step code (or a backup
  code). Destructive actions ask first, with "Keep" as the default, and
  nobody can lock themselves or the hospital out.
- Hospital admins: a "Hospital admin" group in the sidebar (Staff,
  Hospital settings, Activity, Usage). A medical director who is also a
  clinician sees both sides; a hospital admin who isn't a clinician signs
  straight in to Staff and never sees clinical screens.
- Every hospital admin, including a medical director, must turn on
  two-step verification: without it, the first sign-in setup step comes
  before any page.
- Profile & security shows your feedback: results you agreed with, and
  your corrections waiting, approved and rejected, with a link to My
  feedback & corrections.
- "Review corrections" in the sidebar (and the tablet rail and phone menu),
  with how many corrections are waiting for you.
- Review corrections: the queue (anything waiting over 4 hours flagged),
  what the system said beside the suggested correction with the changes
  marked, who suggested it and why, the evidence on file and the
  consultation. Approve with a 60-second undo, then the next one loads;
  reject with a required reason the suggester sees, skip, and the A and R
  shortcuts. Your own corrections can only be withdrawn. Works on phones,
  with the reject form as a bottom sheet.
- My feedback & corrections (account menu): your corrections as waiting,
  approved or rejected with the reviewer's reason; withdraw a waiting one,
  or change a rejected one and send it again.
- Decisions on your corrections reach you while you work: a toast when a
  reviewer approves or rejects one (with their reason), and a bell in the
  top bar that keeps this session's decisions, in memory only.
- Feedback on a weak connection (it fails to send while the device is
  online) is saved encrypted on the device and sent automatically later,
  instead of showing an error. It keeps its idempotency key, so a send that
  did reach the server isn't counted twice. Rejected feedback still shows
  the error.
- Two-step codes verify on their own once the sixth digit is typed or
  pasted, at sign-in and during setup; no need to press the button.
- The right panel on the new consultation page ("How it works", a good
  question, examples to try) and while analysing (your question, as sent),
  as in design v3.
- Sign-in and accounts (Plan 2, design v3), mock first: sign-in with
  sample accounts, hospital sign-on, generic errors and a lockout
  countdown; two-step codes (authenticator apps including Google
  Authenticator, paste, backup codes, trust this device); first sign-in
  (terms, new password, QR setup, backup codes); forgot and reset password;
  the account menu; Profile & security (password, two-step, backup codes,
  devices, sign out everywhere); and the 403 page for non-clinician
  accounts.
- Server-side session (BFF): the API token lives in a sealed httpOnly
  cookie; clinical calls go through a same-origin `/api/v1` proxy with
  same-origin checks, scrubbed errors and single-flight refresh; an
  expired session signs out once with an explanation.
- Live API clients with every feature switched on, against an assumed
  backend contract (spec section 10 item 14).
- Weak-network support: adaptive polling, safe retries with idempotency
  keys, sending a question once back online, a data-saver mode and a
  slow-3G end-to-end test.
- Encrypted offline outbox: questions and feedback made offline are saved
  encrypted on the device and sent when the connection returns (clinical
  and privacy sign-off from the product owner, 16 October 2026).
- The official BHAI logo in the partner credit (sign-in, Help); the
  partnership is credited to BHAI by name only, including the print footer.
- Demo feedback form: the ribbon's **Give feedback** opens a short form, and
  the server saves each message to a file on the instance for the team to
  review. Testers need no account. Replaces the GitHub issue link, which
  failed for anyone outside the organisation.
- Automatic deploys of the sample-data demo to
  `demo.measured-health.org` (Docker image, GHCR, nginx site on the
  preview instance).
- Clinical flow on mock data (Plan 1, design v3): consultation form,
  analysing view, the four result states, evidence panel and mobile sheet,
  feedback and corrections, export and print, first visit, failure,
  offline, idle timeout and unsaved-draft states, search (Ctrl/Cmd+K),
  keyboard shortcuts, help, and motion with reduced-motion support.
- End-to-end tests (Playwright, desktop and Pixel 7) and a CI step that runs
  them in mock mode.
- Design v3 (`design/v3/`): brand-forward clinical UI for desktop, tablet
  and mobile; account, review-queue, state and export screens; brand
  assets in `design/brand/`; spec in `docs/specs/`.
- `ARCHITECTURE.md`: the clinical app, the planned admin app, and their
  flows, with diagrams.
- ADR 0002: separate the clinical and admin apps (proposed).

- Next.js app scaffold (TypeScript, App Router, Tailwind, ESLint).
- Development standards:
  - CI (lint, format, type-check, build, secret scan);
  - Prettier, Node version pin, Dependabot, CODEOWNERS;
  - PR and issue templates, `SECURITY.md`, `CONTRIBUTING.md`, ADRs and an
    agent guide.

### Security

- A named view now hides its names on the same screen update that brings
  any ending: a refusal that ends access (the letter ended, not cleared,
  named access switched off), a clearance check that fails, says names are
  over, names another letter or a new version of it, or gives an end time
  already past. Once hidden, a later check never shows them again in that
  view. Before, the names could stay on screen for a moment until the panel
  caught up.
- Removing a staff member (or cancelling an invite) needs the hospital
  admin's own two-step code or a backup code; a wrong code removes no one.
- Every hospital admin must use two-step verification. An admin without it
  is sent to the setup step before any page, and the app's server refuses
  hospital admin requests from a session without two-step.
- The app's server forwards hospital admin requests only for hospital
  admins, and clinical requests only for clinicians, each only after first
  sign-in.

### Fixed

- The demo's two-step setup now appears in authenticator apps as
  "MHAI Demo" with the account's email (it showed "MHAI:new.bello").
- Sign-in screens on desktop: only the form column scrolls, so the brand
  panel and the form no longer drift out of line while scrolling.
- The sign-in screens match design v3 again: the light brand panel with
  its grid, heartbeat line and trust cards (it stays in view as the form
  scrolls), the outlined hospital sign-on button and lighter field labels;
  the first sign-in progress bar, single terms box and QR code beside the
  steps; the password strength meter; and the Profile & security layout
  (section menu, Close, profile fields in boxes).
- Dialogs (keyboard shortcuts, change password, backup codes) open in the
  middle of the screen, not the top-left corner.
- The signed-out notice now says why: inactivity, signing out yourself, or
  an ended session. It no longer says "inactivity" after a manual sign-out.
- Missing pages say what was missing: an unknown address reads "This page
  doesn't exist", and an unknown or ended consultation keeps its own message.
  The printout uses the same not-found page instead of a bare line.
- Opening a consultation or printout link directly now returns a real 404
  status, not 200.
