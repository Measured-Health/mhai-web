# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **One renewable backup code (product owner, 24 Nov; needs core's
  `fix/mfa-one-renewable-backup-code`).** Each account now has one backup
  code instead of ten. Whenever it is used, core issues a new one and the
  person sees it once on a "Save your new backup code" screen (both apps,
  shared `SaveBackupCode` in `packages/ui`): the code large, a copy button
  beside it ("Copy backup code"; a tick and "Copied" for 2 s, or the code
  selected when there is no clipboard), and Continue that works only after
  a 3, 2, 1 countdown (read out; the same wait with reduced motion), with
  "Lost your phone? Move to a new authenticator app" below it. Continue
  forgets the code. At sign-in the BFF reads `new_backup_code` from core's
  reply (or, when the sign-in is refused after the code was spent, core's
  `X-MHAI-New-Backup-Code` header) strictly and passes it to the page in
  that one no-store reply only; the sign-in code page shows the screen
  before moving on or showing the refusal. After any action confirmed with
  the backup code, the API proxies pass core's `X-MHAI-New-Backup-Code`
  header on any reply, refusals included (core spends the code first on
  most step-ups), in the code's exact shape only; every other upstream
  header is still dropped, and the NATS reply list carries it. The app
  shows the screen on top, and a step-up action finishes, or shows its
  refusal, once it is closed. The code is held in memory only, never in
  the query cache, cookies, storage, a URL or a log. Two-step setup and
  Profile & security / Account show one code with the same screen; with
  none ready, the Security section warns and offers "Make a new backup
  code".

### Added

- **Move two-step to a new authenticator app, from the Account page, in both
  apps (product owner, 24 Nov).** "Move to a new app" asks for the current
  6-digit code or a backup code, shows the new app's QR code and key exactly
  as first-time setup does, then takes a code from the new app: "Your new app
  is set up. Your old app no longer works. Remembered devices have been signed
  out; your backup codes haven't changed." After 15 minutes it says "That took
  too long. Start again." New BFF routes `POST /api/auth/mfa/replace` and
  `/api/auth/mfa/replace/confirm` forward exact bodies (`{mfa_code}` or
  `{backup_code}`, then `{code}`) with an Idempotency-Key, refuse any other key,
  and check core's `otpauth_uri` strictly (otpauth, totp, issuer MHAI, base32
  secret, SHA1, 6 digits, 30 seconds) before rebuilding it for the page; the
  replies are `no-store`. The key is held in the dialog's state only (the
  mutations use `gcTime: 0` and are reset after every answer) and is dropped
  when the move ends, is cancelled or runs out of time. The clinical app also
  forgets this browser's remembered-device token after the move. The demo
  (mock) clients follow the same rules. Needs core's `POST /auth/mfa/replace`
  (mhai-multiagent) deployed first. First-time setup's QR block is now the
  shared `ScanApp` component in each app.

### Fixed

- **Audit log: entries core already sends showed "This entry can't be
  displayed" (platform app).** Core maps an agreed answer
  (`feedback.validated`), a withdrawn correction, a refused review, the
  learning step after an approval (`correction.applied` / `apply_failed`)
  and the integrity check's start and finish (`audit.verify_started` /
  `verify_finished`) to six kinds the app didn't know yet (`answer_agreed`,
  `review_withdrawn`, `review_refused`, `learning_recorded`,
  `audit_check_started`, `audit_check_finished`; core's `pending_in_web`),
  so every such entry failed closed. Found by the whole-journey live check.
  The app now reads and words them; core can drop them from its
  `pending_in_web` list.

- **A saved invite whose email didn't go no longer says "Nothing was
  changed" (needs core 1.41.0, `fix/not-delivered-code`).** When core saved
  a hospital admin's change but couldn't deliver its email (seen live: an
  invite to an address with no mailbox), it answered 503 `no_delivery` and
  the clinical app said "MHAI can't send emails yet. Nothing was changed.
  Try again later." The person was in fact on the staff list, and trying
  again was refused. Core now answers 424 `not_delivered`, and the apps
  say what happened:
  - Invite: "The invite was saved, but the email didn't go through. Check
    the email address. You can resend the invite or remove it."
  - New invite: "The new invite was saved, but the email didn't go
    through. Check the email address. You can send a new invite or cancel
    it."
  - Password reset: "The password reset was done, but the email didn't go
    through. They're signed out everywhere. Check their email address,
    then send the reset again."
  - Two-step reset: "Two-step was reset, but the email didn't go through.
    They set up two-step again at their next sign-in. Check their email
    address."
  - Two-step reminder and reviewer reminder: "The reminder was saved, but
    the email didn't go through", with when another can be sent.
  - Assigning a reviewer: "The reviewer was assigned, but the email didn't
    go through. Check their email address in Staff, or let them know
    another way."
  - Platform app, Add hospital: "The hospital was added, but the invite
    email didn't go through. Check the first admin's email address. Open
    the hospital to resend the invite." The form goes to the refreshed
    hospital list rather than inviting a second, duplicate submit.

  The dialog closes (it is never sent again as if nothing happened), the
  staff list, oversight or hospital list refreshes, and `not_delivered` is
  never retried by the network layer. "MHAI can't send emails yet. Nothing
  was changed." stays for 503 `no_delivery` (no email set up). The demo
  treats `nomailbox@…` as an address with no mailbox; the platform mock
  takes `delivery: "fails"`.

- Platform app: a deactivated hospital's page loads. The hospital page reader
  only accepted `deactivation: null`; core 1.40.0 sends who deactivated it,
  when, the reason and an optional note.
- A pasted backup code with a space or line break around it is no
  longer cut short: the backup code box (sign-in and confirmations, both
  apps) had an 11-character limit that the browser applied before the
  code was tidied, leaving Verify unusable.
- **Platform app: Add hospital works with core's new route (pairs with
  core #280, openapi 1.38.0).** The form now:
  - picks the country from a searchable list of names and sends its
    2-letter ISO code (Nigeria first), so "Nigeria" typed as text is no
    longer refused. The hospital's page and its Edit form show and pick
    the name too, and a hospital with no country says "Not set";
  - asks for the person's two-step or backup code before anything is sent
    (product owner, 24 Nov), through the same step-up dialog as the other
    sensitive actions. A wrong code, a lock or two-step being off stays in
    the dialog;
  - maps core's refusals: 422 `validation_failed` as "Check the details",
    409 `duplicate` on the short code, 409 `email_in_use` on the first
    admin's email ("Someone already has an account with this email."),
    503 `no_delivery` as "Email isn't set up, so the invitation couldn't be
    sent. Nothing was added.", and a 404 as "Couldn't add the hospital. Try
    again." rather than "This was removed or no longer exists".
    The reply and the hospital's page are read strictly with core's new
    fields (country code, domains, first admin's invite), and the proxy
    checks the add body's exact shape before it goes upstream. The sample
    API matches core: a 3-day invite, a staff count of 1 (the invited first
    admin), the new codes, and a `delivery: "none"` option for tests.

### Fixed

- Platform app: a deactivated hospital's page loads. The hospital page reader
  only accepted `deactivation: null`; core 1.40.0 sends who deactivated it,
  when, the reason and an optional note.
- **Platform app: a browser tab icon.** platforms. had no favicon (404); it
  now uses the same Measured Health icon as the clinical app
  (`app/favicon.ico` and `app/icon.svg`).
- **Deploys now replace the running web apps.** The compose files keep
  `pull_policy: missing` (a plain restart needs no GHCR login), and
  `docker compose pull` honours it, so it skipped every moving tag
  (`:live`, `:latest`) already on the host ("Image is already present
  locally"): since 22 Nov each deploy reported success while ai. and
  platforms. kept the 22 Nov build. Every pull in the deploy workflow is now
  `pull --policy always`.
- **Making new backup codes works again.** Core's
  `POST /auth/mfa/recovery-codes` is a step-up, but the BFF routes sent no
  body, so core refused every request. "Make a new backup code" now goes
  through the step-up dialog (the two-step code or the current backup
  code), and the BFF forwards exactly one of `mfa_code` / `backup_code`,
  checked strictly, with the call's Idempotency-Key; refusals keep only
  their code, and the new code comes back no-store.
- **Backup codes in core's shape.** Core issues `xxxxx-xxxxx` codes (ten
  letters and digits); the code boxes took `XXXX-XXXX`, so a real backup
  code could not be typed in full. The boxes, the readers and the demo
  codes now follow core's shape.
- **Platform app: a hospital's AI model section loads again.** Core 1.35.0
  added `own_model` to the model policy reply, and the app's strict reader
  refused the unknown key, so the section said it couldn't load. The reader
  now takes `own_model` (a reply without it, from an older core, reads as
  off), refuses `own_model` with a cloud provider, and the section shows
  "MHAI's own model (GPU server)" when it is on. The form never sends it,
  so a change keeps it while there is no provider, as core does.

### Changed

- **Live site: the public demo is dropped (product owner, 22 Nov).** With the
  repository variable `SITE_MODE=live`, "Deploy demo" builds the `live`
  images on every green main run, requires the backend to be a live site
  (`/srv/mhai-backend/live-site`), removes the demo `web` and sample-data
  `platform` containers, and serves ai. and platforms. from `web-live` and
  `platform-live` through their proxies (8093, 8094; new site file
  `deploy/nginx/mhai-live.conf`). Every failure fails the deploy; nothing falls
  back to the demo or sample data. A host marked live refuses the demo.

### Security

- **The live proxies take the client address from the host's nginx only.**
  `live-proxy.conf.template` now believes `X-Real-IP` from the proxy's default
  gateway (the Docker bridge address host connections arrive from; worked out
  at start, `LIVE_TRUSTED_PROXY`, the proxy refuses to start without it), one
  hop, and ignores it from anyone else. Behind the host's nginx every visitor
  would otherwise have shared one address and one set of per-IP sign-in
  counters. The deploy checks both sides on every live run and stops a proxy
  that fails; `scripts/it/live-proxy-test.sh` (CI) and
  `scripts/deploy-config.test.mjs` check them too.

### Fixed

- Platform app: a deactivated hospital's page loads. The hospital page reader
  only accepted `deactivation: null`; core 1.40.0 sends who deactivated it,
  when, the reason and an optional note.
- **Deploy: image digests from one build no longer leak into another's merge.**
  The digest artifacts are named `digests-<scope>--<arch>`, so the `web`
  merge no longer picks up `web-live`'s digests ("expected 2 digests, found 4").

### Changed

- **Multi-arch images: the demo can run on an x86_64 server.** "Deploy
  demo" builds every image (web `latest`, `live-demo`, `live`, and the
  platform app's `latest` and `live`) for linux/amd64 and linux/arm64, each
  on a native runner, through the new reusable
  `.github/workflows/build-image.yml`, and pushes one multi-arch tag under
  the same names. The arm64 demo host pulls what it pulled before; an x86_64
  host pulls its own. Setting up or moving to a new server, platform app
  included: mhai-multiagent's `deploy/NEW-SERVER.md`.
- **The public demo is now at ai.measured-health.org.** The old
  `demo.` name is no longer served; docs and the live-demo test default
  point at `ai.`.

### Added

- **Hospital admin: invites, resets, removal, reminders and reviewer
  assignment** (core 1.33.0, needs the matching mhai-multiagent PR). Until
  that core is deployed these answer 501 and say "Not available yet".
  - Staff: **Invite staff** takes one address or a pasted list (up to
    200), the Clinician and Hospital admin roles and a specialty, then the
    admin's two-step code. What core skipped is listed in words, including
    an address in use outside the hospital ("Can't be invited here"), without
    saying where. Invited
    people show as Invited (or "Invite expired") with their own filter, and
    the sidebar counts pending invites.
  - A person's Account section: send a password reset, reset two-step,
    send a new invite, cancel an invite and remove someone for good, each
    with the admin's two-step code; a two-step reminder (no code, once a
    day). Your own account and the last hospital admin are guarded on
    screen too.
  - Review oversight: remind a correction's reviewers (the assigned one, or
    everyone who can review it), and assign a reviewer or clear the
    assignment, using the eligible-reviewers list.
  - **The demo's link, shown once.** On the demo deployment core sends no
    email and hands the invite or reset link back. It is shown once in a
    dialog with a copy button (a relative link becomes a full address) and
    is gone when the dialog closes: the client splits it from the staff row,
    the call is kept with `gcTime: 0` and reset after the answer, and it is
    never stored, logged or put in a URL.
  - Plain words for `no_delivery` ("MHAI can't send emails yet. Nothing was
    changed.") and `invalid_token`, and per-action words for the daily
    invite limit, the reminder limits and who can review. A `no_delivery`
    is never retried.
  - Core adds no status or issue for invites: an invited person is
    `active` with `invited_at` set, and the invite has expired when
    `invite_expires_at` is past or null (revoked). The app derives Invited
    and Invite expired from that, and never counts an invited person as an
    active member or admin. The staff readers take the invite dates; the
    link and the invite reply are read strictly (only an http(s) or
    same-app link).
  - /reset-password reads for both a reset and an invite ("Choose your
    password").
- **The live demo's sign-in helper says the demo resets every few hours**
  (questions, corrections, passwords and two-step go back to how they
  started, and everyone is signed out), to match the backend's scheduled
  reset (mhai-multiagent deploy/README.md, "Public demo: the scheduled
  reset").

- **The public demo runs live** (deploy/README.md, "Public demo in live
  mode"): demo.measured-health.org signs in and asks through its BFF, over
  NATS, to the backend demo's core and its sample AI (synthetic data,
  seeded demo accounts), instead of canned answers.
  - A build flag, `NEXT_PUBLIC_DEMO=true` (Dockerfile `DEMO`), marks the
    public demo: the ribbon ("Demo · sample data, not for clinical use")
    and the printed demo line show for it as for the mock demo.
  - The sign-in helper lists the seeded demo accounts and fills the email
    and the published demo password (a wrong one for the locked account);
    the code page shows the current demo two-step code, made in the browser
    from the published demo secret, with the 30-second reuse note. Neither
    exists in a build without the demo flags.
  - The deploy builds a `live-demo` image on every green main run and runs
    the public `web` service with `deploy/compose.demo-live.yml` when the
    backend has seeded the demo; otherwise, or if the live app isn't
    healthy, it runs the sample-data demo as before. `DEMO_MODE=mock`
    (a repository variable) is the one-line fallback.

- **References with the answer** (core 1.30.0, `cited_sources`,
  mhai-multiagent reference library PR 3): the evidence panel lists each
  cited reference source (an FDA drug label or a MedlinePlus health topic)
  with its title, a link to the source page (https only, opened in a new
  tab), who published it and its credit notice. Read defensively: an entry
  without a title or source is left out, and any other link shape shows no
  link. Nothing changes until core sends the field.

- **Find a patient by MRN on the question form** (core 1.29.0,
  `POST /patients/lookup`, mhai-multiagent #172):
  - "Find patient by MRN" sits where About patient goes. The clinician
    types the whole MRN and presses Find (no search as you type: every
    lookup counts). A hit fills About patient with the name and MRN;
    Remove brings the box back.
  - Plain answers for no active patient with that MRN (404), two patients
    sharing it (409), too many lookups (429, with the 5 a minute and 50 a
    day limits explained), and a calm retry when the service is busy.
  - The BFF forwards only a trimmed `{mrn}` of up to 64 letters, digits,
    spaces, dots, slashes, hyphens or underscores, in the body (an MRN in
    the address is 422), for a clinician on two-step; the reply is read
    strictly and must name the MRN asked about, else 502. Core's text is
    never passed on.
  - The MRN and the patient are held in memory only and forgotten when the
    form is cleared or the clinician signs out. The demo follows core's
    rules, limits included.

### Fixed

- Platform app: a deactivated hospital's page loads. The hospital page reader
  only accepted `deactivation: null`; core 1.40.0 sends who deactivated it,
  when, the reason and an optional note.
- **An alert for a patient who is no longer active** (core 1.27.0 sends
  `patient.id` null for an excluded or merged patient) no longer fails the
  whole alerts list: it reads as an alert with no patient to link.

- **A question about a patient** (core 1.22.0, `POST /queries`
  `patient_id`, EMR PR 13, mhai-multiagent #161):
  - Ask MHAI about it on an alert links the question to the patient when
    the alert carries MHAI's patient id: About patient on the form shows
    the name and MRN the card showed, and Remove takes it off. Only the
    id is sent.
  - Core's 404 reads "This patient isn't available for questions", with
    Ask without the patient.
  - The BFF checks the whole question strictly before core (the patient
    only as a lower-case uuid, else 422). A linked question is never
    saved on the device offline.
  - Live, both link: core 1.27.0's alerts carry the patient id, and Find
    patient by MRN uses core 1.29.0.

- **Granting and removing the Analyst role from Staff** (core 1.24.0,
  `PATCH /hospital/staff/{id}` with step-up, mhai-multiagent #163):
  - The Analyst box says what the role gives and what it needs (the
    Clinician role, an active account and two-step verification), and is
    off, with the reason, for someone deactivated or without two-step,
    for yourself, and while Analysis isn't switched on for the hospital.
  - The confirmation says what the change does (Analysis for this
    hospital, or that access ends at once), and takes your two-step code.
  - Each of core's refusals in plain words for this person:
    `analysis_off`, `analyst_cap`, `not_eligible`, `self_change` and
    `forbidden`.
  - A live check (`tests/e2e-full/07-analyst-role.spec.ts`).

### Changed

- **Hospital admin screens follow core's hospital admin routes** (core
  OpenAPI 1.24.0, mhai-multiagent #163):
  - Every staff write needs the admin's own two-step code (step-up):
    saving roles or specialty, deactivating and reactivating. A settings
    edit that loosens sign-in (two-step for clinicians off, "trust this
    device" on, a longer idle timeout) asks for the code too; other edits
    save at once.
  - An admin can't give themselves a role, Clinician included: the boxes
    are off on their own row, with the reason. Removing their own
    Clinician or Analyst role still works; their own hospital admin role
    stays locked.
  - Plain words for core's refusals: `self_change`, `last_admin` (an
    active admin with two-step), `analysis_off`, `analyst_cap`,
    `not_eligible` and `not_implemented`.
  - What core doesn't do yet says "Not available yet", calmly, with what
    to do instead: inviting staff (Measured Health creates accounts),
    removing a person (deactivate instead), password and two-step resets,
    the two-step reminder, and reminding or assigning reviewers. The
    invite dialog and the assign dialog are gone.
  - Nobody is ever "invited"; reviewing follows the Clinician role and is
    shown, not edited; "Reviewers must share the specialty" is shown as
    not available yet.
  - Usage's patient alerts are core's block: totals by severity, by what
    happened to them, by who received them and by kind of result, under
    the small-group rule. The comparisons, chart and top lists core
    doesn't build are gone, from the screen and the CSV.
  - Activity shows core's events: no device, count or flag, and no self
    role change.
  - Staff, settings, usage and activity replies are read with strict
    schemas: anything else is a failed read (502), never shown in part.
  - A live check of these pages (`tests/e2e-full/06-hospital-admin.spec.ts`).
- **Platform admin screens on core's contract** (openapi 1.25.0 and 1.26.0,
  mhai-multiagent #164 and #165). The hospitals list and page, the team,
  activity, legal holds and the analytics e-mail are read with strict zod
  schemas: a reply that doesn't match is a failed read (502), never shown
  in part.
  - Team: changing a member's role takes your own two-step code (a
    demotion does as much damage as a removal), says their sessions end
    and they sign in again, and words `own_role`, `last_admin` and
    `conflict`. Every member is active: core keeps no invites, so Invite
    team member answers a calm Not available yet.
  - Legal holds keep every record: the form has no dates, no note and no
    "asked for by" (core keeps no free text and no names; they read back
    null). A hold's reference and a lift's authority are document
    references (`LH-2026-0042`, `CT-2026-0091`), checked in the form and
    the BFF. A lift lands at once on approval: no grace period, no Undo
    lift, no records-due count. A hold the provisioning command line placed
    says "Placed by the system", with no reason. Changing a hold's review
    date is Not available yet.
  - Activity lists only actions a person took; an action this app has no
    words for yet is shown as it is.
  - Auditors can't mark notifications seen: the BFF refuses it (core makes
    it a write), and the bell doesn't offer it to them.
  - What core answers 501 `not_implemented` (team invites, notifications,
    platform settings, named access, hold edits, lift undo) shows a calm
    "Not available yet", is never retried and stops the bell's poll.
  - New refusals in plain words: `own_role`, `last_admin`, `same_person`,
    `expired`, `invalid_range`, `hospital_removed`, `not_implemented`.
  - The demo follows the same rules.

### Added

- **Patient matches and exclusions for hospital admins** (core openapi
  1.21.0, `/hospital/patient-matches`, `/hospital/patient-exclusions`).
  - Patient matches lists the possible duplicate patients side by side
    (name, MRN, age, sex, record systems, record count) with why they were
    paired, in plain words. Nothing merges by itself: "Same patient: merge"
    asks which patient to keep and says the other's records, findings and
    alerts move to them; "Not the same patient" keeps them apart. Both take
    the admin's two-step code.
  - Patient exclusions excludes a patient by MRN with a reason and the
    two-step code, and explains first what happens: MHAI stops using their
    records, their open alerts are withdrawn at once, and the record data
    MHAI holds for them is deleted, unless a legal hold is open on the
    hospital, when it is kept until the hold is lifted and then deleted
    within 24 hours. The result follows core's `purge_held`.
  - Replies read strictly (502 on anything else); the match list is held in
    memory only (`gcTime: 0`, no refetch on focus or reconnect, since core
    audits every read); the BFF forwards exactly these shapes.
- **Patient alerts switch on a hospital's page (platform admin app)**
  (core openapi 1.20.0, `/platform/hospitals/{id}/emr-rule-set`). Shows
  whether the hospital is on a trial run (findings stored for review, no
  alert sent) or sends alerts with a named rule set (version and SHA-256).
  Switching it on warns that it sends patient alerts to the hospital's
  clinicians, needs an explicit "I understand" and the two-step code;
  switching off says alerts stop. Auditors read it. The BFF checks the body
  strictly; the reply is read strictly.

- **Analysis drill-down on core's live route** (core openapi 1.19.0,
  mhai-multiagent #149): See patients opens `GET /analysis/patients`
  exactly where core sends a drill key (the affected view's age band, sex
  and location type rows, co-occurring pairs and findings, under condition,
  age band, sex or setting filters). Everywhere else a shown count of 5 or
  more has See patients off, with "not available for this breakdown";
  hidden counts show nothing.
  - The list shows pids and the row's own fields (age band, or "Age not
    recorded", sex, location type, conditions and findings; never a
    source), and says the view is audited.
  - Plain words for each refusal: 429 "You've opened many patient lists;
    try again later", 422 `too_small` "This list is no longer available",
    404 as on the views; only a plain failure offers Try again.
  - A view that carries a drill key where core never sets one, or one that
    isn't 43 characters of base64url, fails closed; so does a list whose
    count isn't the cell it was opened from.
  - The BFF checks the list's query strictly before anything goes upstream
    (core's codes: `level_not_supported`, `too_small` for a bad key or a
    ward, specialty or source filter, `invalid_range`,
    `validation_failed`, `too_many_filters`), and reads the reply with a
    strict zod schema (502 `bad_gateway` otherwise).
  - The demo enforces core's rules: keys bound to the period, filters, view
    and row; lists only on shown counts of 5 or more; 10 lists a minute,
    50 a day and 300 different patients a quarter per person (429); pids
    random per period; no source on a row.
- **Auditor reveal in the platform app** (`GET /platform/audit/{id}/patients`):
  on a drill-down entry, an auditor's Reveal patients asks for confirmation,
  saying the reveal is itself recorded, then shows the pids in component
  state only. A platform admin sees the count and "Only an auditor can
  reveal these patients"; the BFF refuses them too, takes only core's
  decimal entry id with no query, and reads the reply strictly (at most 200
  pseudonyms). Core still sends drill-down entries bare: their detail's
  `patients: {count}` is enough to offer the reveal.
- The audit log maps `analysis_patients_viewed` ("Opened a de-identified
  patient list"), and `audit_patients_viewed` now reads "Revealed the
  patients of an entry".

### Changed

- **Analysis reads core's live routes** (core openapi 1.17.0,
  mhai-multiagent #141): `GET /analysis/filters` and `GET /analysis/{view}`,
  through the BFF, which checks each query strictly before it goes
  upstream. The sample data stays in the demo and e2e.
  - One finished calendar period at a time (R41a): a week (days 1–7, 8–14,
    15–21 or 22 to the month's end), a month or a quarter, chosen from the
    ones core lists. No custom ranges, and no totals across periods: the
    earlier periods core sends are shown one per row.
  - At most two filters, and never a ward or clinic with a location type;
    a condition, ward, specialty or source the period doesn't list is
    dropped.
  - Every reply is read strictly (zod, these keys and no others), then the
    small-group checks as before; a reply for another period fails.
  - Plain words for each refusal: switched off ("Analysis is not switched on
    for this hospital"), still being prepared (Try again), too many new
    views, and a period or filters that can't be used.
  - The sample cohort is 2,400 patients, so one month has realistic numbers.

- **Sign-in, two-step enrolment, password change and refresh follow core's
  contract** (openapi 1.4.0), in both apps:
  - a new account whose two-step isn't set up (`mfa_enrolled: false`) gets
    core's enrolment-only session and sets it up in the welcome flow; an
    empty code is never sent for an enrolled account;
  - the welcome flow is now password, two-step (and backup codes), then
    the terms (product owner, 3 Nov), because core takes the terms only
    from a session that passed two-step; after two-step the BFF refreshes
    to the full session;
  - the first password step asks for the temporary password again (core's
    `current_password`), and says when it's wrong;
  - the BFF keeps core's refresh token sealed in the httpOnly session
    cookie and refreshes with it (`POST /auth/refresh {refresh_token}`),
    rotating it every time; a result is shared only within core's
    10-second reuse grace.

### Added

- **Google Gemini as a cloud model provider** (core openapi 1.16.0,
  mhai-multiagent #137). The platform app's AI model section reads
  `provider_code`, names "Google Gemini" and offers it in the provider
  picker; a policy whose `cloud_provider` is null but whose `provider_code`
  is set is never shown as off (an unknown code is shown as it is). The
  clinical result says "Drafted by Google Gemini (cloud AI)" from
  `generated_by.provider_code`. The policy reader and the BFF's model-policy
  write are strict schemas. The demo puts Lakeside Community Clinic on
  Gemini and enables it alongside Anthropic.
- **Platform analytics on core's calendar periods** (Plan 7c, core openapi
  1.15.0; ruling R41a). Usage picks Last week, Last month or Last quarter
  and shows the period's dates; weeks are month-aligned and named by their
  date range; trends and charts are successive periods, never a total
  across them. What changed is read from `what_changed` (the latest week
  against the month before it, per day), with follow-ups. Areas say "First
  figures after …" before the first period, Alert safety says it isn't
  switched on, and the CSV names each row's period. The proxy checks the
  analytics query strings and follow-up bodies strictly, and adds
  `GET /platform/guardrails/periods`.

- **Cloud models: the per-hospital switch and the notices** (Plan 14, core
  openapi 1.10.0). The platform app's hospital page has an **AI model**
  section: who drafts the hospital's answers (MHAI's own model, or
  Anthropic, OpenAI or xAI in the cloud), the agreement reference, the
  monthly token limit and this month's use. Platform admins change it with
  their two-step code; auditors read it; a provider the deployment hasn't
  enabled is refused (409) on the provider field. The BFF forwards exactly
  `GET` and `PUT platform/hospitals/{id}/model-policy`, and the live client
  reads replies through a fail-closed reader. The clinical result says who
  drafted the answer (`generated_by`), and a cloud draft notes that
  identifying patient details were masked where detected. Sample data only.
- **The BFF can reach core over NATS** (ADR 0005), behind
  `BACKEND_TRANSPORT=http|nats` (default `http`). One `fetch`-shaped
  transport per app, one NATS connection per server process as the app's
  own NKey user, server only; the BFF unit suites run on both transports
  (`npm run test:nats`), and integration and live e2e suites run against the
  backend's smoke stack (`scripts/it/`). `GET /api/health` in both apps.
- **Live preview containers** `web-live` and `platform-live` (compose
  profile `live`), each behind a loopback nginx proxy that sets `X-Real-IP`,
  built with `USE_MOCK=false` on a manual deploy run; the public demo stays
  on sample data.

### Changed

- **The clinical app follows core's contract v1.2.0.** Results carry
  `trust_band` (typed, not shown until clinical sign-off) and
  `cited_chunk_ids`. When an answer cites sources whose details aren't
  stored yet, the evidence panel says "Sources for this answer can't be
  shown yet." and "Claim details can't be shown yet." instead of "No sources
  were used". A question status the app doesn't know, and a status call
  that ends in 405, 413 or (after its retries) 503, now show the failed view
  at once instead of "Analysing" until the stall timer.

### Security

- `check:no-nats` fails the build check if a client chunk holds NATS code,
  and ESLint keeps `@nats-io/*` and the server transport out of client code.
- The NKey seed is a mounted file read once, never in an image, the
  environment or a log; the transport logs no token, body, path or query.

### Fixed

- Platform app: a deactivated hospital's page loads. The hospital page reader
  only accepted `deactivation: null`; core 1.40.0 sends who deactivated it,
  when, the reason and an optional note.
- **Record connections work against core's live routes** (core openapi
  1.20.0). Found by the full live check:
  - Add a connection named the hospital from `GET /platform/hospitals/{id}`,
    which core doesn't serve yet, so the page never loaded. It now takes
    the hospital from the connections list alone (`not_connected` and the
    connections' hospitals), as does its picker.
  - A key file (the FHIR private key, PEM) lost its line breaks in a
    password box. Long secrets are now a masked box of several lines.
  - A record system on the hospital's own network can be declared: "It is
    on the hospital's private network", with its ranges (up to 8 private
    IPv4 ranges of at most 256 addresses), sent as core's
    `private_network` and `private_cidrs`.
  - Every reply is read strictly (zod; 502 when it doesn't match), with
    core's additive fields (`paused`, `credentials_missing`,
    `poll_seconds`, `private_network`, `private_cidrs`).
- **Patient alerts read core's live replies** (core openapi 1.20.0, EMR PRs
  8a and 8b). The alerts client was written against the planned contract
  and returned replies unchecked; it now reads every reply strictly (zod:
  each field core sends, nothing else; a mismatch is 502 `bad_gateway`,
  never a partial card). A missing bed or clinic reads as none.
  - A patient with no MRN shows "Not recorded" (core sends `mrn: null`).
  - An alert MHAI withdrew says so, never a person: "Withdrawn · The
    result was withdrawn in the record" (or changed in the record, or the
    patient taken out of record alerts).
  - A preliminary, late or changed result is noted on the card.
  - When a connected system is behind (`sources_status`), the inbox says
    alerts may be missing, so an empty list isn't read as "no alerts".
- **Devices and system health read core's live replies** (core openapi
  1.20.0). Found by the full live check:
  - Your devices (both apps' account page) always said "Couldn't load
    your devices": core's `GET /auth/sessions` sends `{sessions: [...]}`
    with `ua_summary`, not a bare list with `device` and `location`. Both
    BFFs now read it strictly (`@mhai/api-client/server/sessions`) and
    never pass on the network prefix.
  - System health's "Parts of the system" always failed: core sends the
    four parts it has (app, workers, evidence, guidelines) and no
    clean-up block until those services exist. The reader takes that, and
    still fails closed on an unknown, missing or repeated part.
- The clinical app reads core's user as built: `hospital` is `{id, name}`
  and there is no `username` (the outbox is bound to the user id).

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
  sample platform admin, Bola Hassan, is linked to Pilot Hospital. End-to-end
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
  counts of 1 to 4 shown as "Fewer than 5". Pilot Hospital and two small
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

- Platform app: a deactivated hospital's page loads. The hospital page reader
  only accepted `deactivation: null`; core 1.40.0 sends who deactivated it,
  when, the reason and an optional note.
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
