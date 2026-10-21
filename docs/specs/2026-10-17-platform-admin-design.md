# Platform admin app: foundation, hospitals and team

- **Status:** Approved design (product owner, 17 Oct 2026). Plans 7a and 7b.
- **Builds on:** [ADR 0002](../adr/0002-separate-clinical-and-admin-apps.md) (a separate
  app), [ADR 0004](../adr/0004-keep-the-hospital-admin-in-the-clinical-app.md) (its address
  and what stays in the clinical app), [UI design v3](2026-10-13-ui-design-v3.md) (§6
  wording, §7 accessibility, §10 item 13 backend), and
  [ADR 0003](../adr/0003-many-emr-systems.md).
- **Scope:** the first sub-project of the platform admin app. Later sub-projects, in order:
  the cross-hospital audit log; operations (system health, failed jobs, legal holds,
  platform settings); EMR connections; Analysis clearance letters; cross-hospital Analysis.
  Each gets its own design.

## 1. Goal

Give Measured Health staff a safe place to run the service: add and manage hospitals, set
up a hospital's single sign-on, invite its first hospital admin, and manage who on the
Measured Health team has platform access. It is a separate app on its own origin, so
platform tools never ship to clinicians and never share a cookie with the clinical app.

## 2. Who uses it

| Role               | Can                                                                      |
| ------------------ | ------------------------------------------------------------------------ |
| **Platform admin** | Everything in this design: hospitals, SSO, first admin invites, the team |
| **Auditor**        | Read everything in this design; change nothing                           |

- Both roles sign in with email, password and **two-step verification, always**.
- The platform app doesn't manage a hospital's staff: once the first hospital admin has
  accepted the invite, the hospital manages its own staff in the clinical app (Plan 4).
- Clinicians and hospital admins can't use the platform app, and platform accounts can't
  use the clinical app (its 403 page says to use the platform admin app, with no link).

## 3. Repository: npm workspaces (Plan 7a)

ADR 0002's layout, done as its own change first:

```
apps/clinical     today's app, moved unchanged
apps/platform     the platform admin app (Plan 7b)
packages/tokens   design v3 tokens (CSS variables, Tailwind theme)
packages/ui       shared components (buttons, dialogs, tables, charts, account screens)
packages/api-client  shared contract types, errors, network and idempotency helpers
```

- **Neither app imports from the other.** A lint rule enforces it; shared code moves into
  `packages/` only when both apps need it.
- **Plan 7a changes no behaviour.** It is proved by the existing unit and end-to-end suites
  passing unchanged, and by a check that the clinical build contains no platform code.
- CI runs each app's checks. Deploys: the existing clinical targets (Docker image,
  Cloudflare demo) at their new paths, plus the platform app as its own Docker image and
  Cloudflare config.
- Plan 7a also updates ADR 0002 and `ARCHITECTURE.md`, which still say `admin.<domain>`.

## 4. Architecture and security

- **Origin:** `platforms.<domain>`. The address is not the protection: these are.
  - **Network:** reachable only through the Measured Health VPN or an IP allowlist. This is
    an infrastructure setting; the deploy notes document it.
  - **Session:** the platform app's own server-side proxy (BFF) and its own sealed session
    cookie, scoped to that host. Never shared with the clinical app.
  - **Content Security Policy:** strict, no third-party scripts.
  - **No links** to it from the clinical app.
- **The proxy forwards only exact method and path shapes** for `/platform/*` and the
  sign-in endpoints, and only for a session that holds `platform_admin` or `auditor` **and**
  has two-step turned on. Writes need `platform_admin`; an auditor's write is refused in the
  proxy, as well as hidden on screen. Refusals never reach the API.
- **Idle timeout: 15 minutes**, with no "trust this device".
- **Every write** sends an `Idempotency-Key` and is audited by the backend: who, when, what,
  and which hospital.
- **Step-up:** deactivate, reactivate, requesting or approving a hospital's removal, and
  removing a team member each need the person's current two-step code.
- **Privacy:** the app shows no clinical content and no patient data. Nothing from it is
  stored in the browser, put in the URL, logged or sent to analytics.

## 5. Sign-in

- Email and password, then the two-step code (authenticator app or a backup code), as in
  the clinical app.
- **First sign-in:** set a new password if required, accept the terms, then set up two-step
  with backup codes. There is no way to skip two-step.
- An account without a platform role (`admin` or `platform_admin`, or `auditor`) sees a
  "This account can't use the platform admin app" page and is signed out.

## 6. Look and layout

- Design v3 tokens and components, with clear signs this is a different place: a
  **"Platform"** label beside the logo and a distinct page header colour, so nobody
  confuses it with the clinical or hospital admin side.
- **Sidebar:** Hospitals · Team · Activity · Account.
  - **Activity** lists this app's own actions (who changed which hospital or team member).
    The full cross-hospital audit log is a later sub-project.
  - **Account:** profile, two-step, backup codes and devices, reused from the clinical app
    via `packages/ui`.
- Desktop first; phones get a card layout so it still works in an emergency.
- Every list and page has loading, empty and "Couldn't load" (with Try again) states.
  Offline: actions are disabled with the reason.
- Wording follows UI design §6: plain words, no backend terms.

## 7. Hospitals

### 7.1 List

A table: name, status (**Active**, **Set-up incomplete**, **Deactivated**, **Removal
pending**), staff count, SSO (On/Off), created, last activity. Search by name or short
code; filter by status. "Add hospital" (platform admins only).

### 7.2 Add a hospital

- Name, short code, country, time zone, allowed email domains.
- Then invite the **first hospital admin** (name and email). Until someone accepts, the
  hospital shows **Set-up incomplete**.

### 7.3 A hospital's page

- Details (editable by platform admins; a change made meanwhile by someone else shows
  "Changed by someone else" and reloads, never overwrites).
- Status, with **Deactivate** or **Reactivate**.
- **Single sign-on** (§8).
- **First hospital admin:** invite status (Pending, Accepted, Expired), **Resend**. Invites
  expire after 7 days.
- **Recent actions** on this hospital.
- **Danger zone:** **Request removal** (§7.6).

### 7.4 Deactivate

- Any platform admin. A dialog asks for a reason (**Contract ended**, **Security concern**,
  **At the hospital's request**, **Other** with a note) and the current two-step code.
- Effect: all the hospital's staff are signed out at once and can't sign in; pending
  invites stop working; **no data is deleted**.
- The page shows "Deactivated by <name> · <date> · <reason>".

### 7.5 Reactivate

- Any platform admin, with a reason and the current two-step code.
- Staff can sign in again; old sessions are not revived.

### 7.6 Remove (two people, retention-aware)

1. **Request:** only while the hospital is deactivated. A platform admin requests removal
   with a reason and their two-step code.
2. **Checks (backend):** active legal holds, records still inside their retention period,
   and a required data export (if the contract needs one). Any blocking check is shown in
   plain words ("1 legal hold is active", "Records must be kept until 3 Mar 2031") and the
   request can't go further until it's cleared. Legal holds are managed in a later
   sub-project.
3. **Approve:** a **second, different platform admin** approves with their own two-step
   code. The requester can't approve their own request.
4. **Removal** is permanent and done by the backend. The page shows **Removal scheduled**
   until the backend confirms **Removed**; after that only the audit trail remains.

Either platform admin can cancel a pending request. Requested, blocked, approved, cancelled
and completed are all audited.

## 8. Single sign-on for a hospital

- The hospital's identity provider details: sign-in address, the identifiers the provider
  gives, allowed email domains, and an On/Off switch.
- **Test sign-in** checks the set-up before it's switched on.
- **Secrets are write-only:** after saving, the screen shows "Saved · ends ··3f2a", never
  the value. Nothing secret reaches the browser after it's sent.
- Switching SSO off returns the hospital's staff to email and password; the app warns
  before confirming.

## 9. Team

- A list of platform admins and auditors: name, email, role, status (Active, Invite
  pending), two-step on, last sign-in.
- **Invite** (name, email, role), **change role**, **Remove** (needs the remover's two-step
  code).
- **Nobody can remove the last platform admin** or change their own role.
- An invitee sets a password and two-step on first sign-in (§5).
- Every change is audited.

## 10. Accessibility

As UI design §7: keyboard reachable, visible focus, status words with icons (never colour
alone), 44 px targets on phones, labelled dialogs, tables with proper headers, reduced
motion respected.

## 11. Demo (sample data)

Like the clinical app, the demo runs on sample data in memory. Demo accounts: a platform
admin, a second platform admin (to approve a removal) and an auditor. Sample hospitals in
every state: Active (with and without SSO), Set-up incomplete, Deactivated, Removal pending
(one blocked by a legal hold). Two-step code `123456`, as in the clinical demo.

## 12. Testing

- **Plan 7a:** the unchanged clinical unit and end-to-end suites, plus a build check that
  the clinical bundle contains no platform code and a lint check that blocks imports
  between apps.
- **Plan 7b:** unit and component tests, and end-to-end tests on desktop and phone for:
  sign-in with two-step; auditors read-only (screen and proxy); deactivate and reactivate;
  removal with a second admin, including blocked checks and the same-person refusal; team
  rules (last admin, own role); the proxy refusing paths outside its allowed list; no
  browser storage.

## 13. Backend this design needs (assumed contract)

Add to UI design §10 as item 22, and to the backend requirements (mhai-multiagent PR #40).

- **Auth:** the existing auth endpoints, with a separate audience for the platform app:
  every call the platform app makes (sign-in and API) sends the header
  `X-MHAI-Audience: platform`. The login `user` carries `roles` and `mfa_enabled`; the role
  `admin` (today's name) or `platform_admin` means platform admin, `auditor` means auditor,
  and any other account can't use the platform app (**403** `not_platform`).
- **Ids:** every id (hospitals, team members, invites, events) is opaque and matches
  `[A-Za-z0-9_-]+`; a team member's id is never an email or username.
- **Hospitals:**
  - `GET /platform/hospitals?status&q&cursor` → `{hospitals, next_cursor}`;
  - `POST /platform/hospitals {name, short_code, country, time_zone, email_domains}`;
  - `GET` / `PATCH /platform/hospitals/{id}` (with `version`; **409** `conflict` when
    changed meanwhile);
  - `POST /platform/hospitals/{id}/deactivate {reason, note?, mfa_code}`;
  - `POST /platform/hospitals/{id}/reactivate {reason, mfa_code}`.
- **Removal:**
  - `POST /platform/hospitals/{id}/removal {reason, mfa_code}` → the request with its
    checks (`legal_holds`, `retention_until`, `export_required`) and any blocking reasons,
    plus `requested_by_you` (boolean, decided by the server for the signed-in person, like a
    team member's `is_you`), which the app uses to show Approve or "Waiting for a different
    platform admin";
  - `POST /platform/hospitals/{id}/removal/approve {mfa_code}` (**409** `same_person` for
    the requester, **409** `blocked` while a check blocks);
  - `POST /platform/hospitals/{id}/removal/cancel`.
- **SSO:** `GET` / `PUT /platform/hospitals/{id}/sso` (secrets write-only; responses show
  only the last characters), `POST /platform/hospitals/{id}/sso/test`. A `PUT` resets
  `last_test` whenever the sign-in address, issuer, client id, allowed domains or secret
  change, so a changed set-up must be tested again before it can be switched on.
- **First hospital admin:** `POST /platform/hospitals/{id}/invites {name, email}`,
  `POST /platform/hospitals/{id}/invites/{invite_id}/resend`.
- **Team:** `GET /platform/team`, `POST /platform/team/invites {name, email, role}`,
  `PATCH /platform/team/{id} {role, version}`, `DELETE /platform/team/{id}` (with
  `mfa_code`; **409** `last_admin`, **409** `own_role`). `PATCH` and `DELETE` on
  `/platform/team/invites` are reserved: `invites` is never a member id.
- **Activity:** `GET /platform/activity?hospital&cursor` → structured events, newest first.
- **On every endpoint:** two-step required (**403** `mfa_required`); auditors are refused
  writes (**403** `forbidden`); every write honours `Idempotency-Key` and is audited. A
  step-up action takes `mfa_code` or `backup_code`; a wrong code gives **403**
  `mfa_invalid`, and too many wrong codes **429** `mfa_locked` (for 15 minutes).

## 14. Delivery

1. **Plan 7a: the workspace move.** No behaviour change; its own PR.
2. **Plan 7b: the platform app.** Foundation, hospitals and team on sample data; its own PR.
   The backend contract (§13) goes into PR #40 with it.

## 15. Decisions made with this design

- First release = foundation + hospitals + team (product owner).
- Sign-in: email, password and two-step, as in the clinical app (product owner).
- Removing a hospital needs a second platform admin; deactivate and reactivate need the
  admin's own two-step code (product owner).
- A Team page in the app manages platform admins and auditors (product owner).
- npm workspaces, with the move done first as its own PR (product owner).
- 15-minute idle timeout and no "trust this device" for platform accounts (design default:
  wider blast radius than a hospital admin).
- Activity in this release covers only the platform app's own actions; the cross-hospital
  audit log is a later sub-project.

## 16. Changes during Plan 7b

- §13 follows the backend's existing codes: a wrong step-up code is **403** `mfa_invalid`
  and too many wrong codes **429** `mfa_locked` (replacing **422** `invalid_code`).
- §13: the login roles `admin` or `platform_admin` both mean platform admin.
- §13: every call sends `X-MHAI-Audience: platform`.
- §13: every id is opaque and matches `[A-Za-z0-9_-]+`; the app's proxy refuses any other.
- §13: a removal request carries `requested_by_you`, decided by the server, since names can
  repeat and the session's id isn't the team id.
- §13: `PUT …/sso` resets `last_test` whenever the address, issuer, client id, domains or
  secret change.
- §13: `PATCH /platform/team/{id}` carries `version` (**409** `conflict` when changed
  meanwhile).
- §13: every step-up action takes `mfa_code` or `backup_code`.
- §13: at sign-in, an account with no platform role gets **403** `not_platform`.
- §13: `PATCH` and `DELETE` on `/platform/team/invites` are reserved paths.
- Backend follow-up: test a draft single sign-on set-up before saving it, so a live set-up
  can change without switching sign-on off for the hospital. Until then, saving edits to a
  live set-up asks first and switches it off.
- Follow-up: a live-mode end-to-end run covering the auditor gate (the mock-mode suite
  can't reach it; the proxy's unit tests cover it).
- Frontend only: `POST /api/auth/session` is the app's own keep-alive, so the screen's
  idle clock and the server's agree (§4). It doesn't reach the backend.
- Team: nobody removes themselves or changes their own role in the app; another platform
  admin can (the backend's **409** `own_role` still applies).
- The clinical app's 403 page says "Use the platform admin app." with no link, and
  `NEXT_PUBLIC_ADMIN_APP_URL` is gone (§2).
- Nothing else in this design changed.
