# Plan 13: EMR screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the EMR integration screens, on sample data, built in one day for a team demo:

- **Platform (13a):** Measured Health adds, configures, tests, switches on and off, and watches each hospital's patient record connections;
- **Hospital admin (13b):** a read-only connection status, and the hospital's choice of units, what to flag and who gets alerts;
- **Clinician (13c):** Plan 5a's alerts gain evidence under each likely cause, a category, and routing (for you or the hospital queue).

**Architecture:**

- **One plan, two PRs:** `agent/plan-13a-emr-platform` (Tasks 1–3) and `agent/plan-13b-emr-hospital` (Tasks 4–6). Task 7 (end to end and docs) lands on 13b after 13a merges, or on its own small PR if 13b is merged first.
- **Same shapes as Plans 8, 9 and 11.** Each app gets its own contract file, fixtures, mock module, live client and proxy rows, so the shared files (`contract.ts`, `mock.ts`, `live.ts`, `route.ts`) change by a line or two:
  - platform: `lib/api/emr-contract.ts`, `emr-fixtures.ts`, `mock-emr.ts`, `emrLive` in `live.ts`; rules and words in `lib/emr/`; hooks in `lib/queries/emr.ts`; components in `components/emr/`;
  - clinical: `lib/api/emr-contract.ts`, `emr-fixtures.ts`, `mock-emr.ts`, `live-emr.ts`, `emr.ts` (client getter); hooks in `lib/emr-queries.ts`; components in `components/admin/alert-settings/`. Alert field additions go in the existing `alerts-contract.ts` and `mock-alerts.ts`.
- **Pages:** platform `/connections`, `/connections/new`, `/connections/[id]`; clinical `/admin/alerts`.

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64.

**Spec:** `docs/specs/2026-10-23-emr-screens-design.md` (decisions D1–D15; [PO] ones are binding, [Design] ones are defaults to confirm, so build them as written). Background:

- ADR 0003 (many EMR systems);
- `docs/specs/2026-10-17-notifications-design.md` (Plan 5a);
- `docs/specs/2026-10-17-platform-admin-design.md` §4 (step-up, roles);
- Plan 8 Task 1 (`MockCore`, `StepUpDialog` props), Plan 9 (`lib/audit/kinds.ts`), Plan 11 (the clinical contract/mock/live/proxy split).

**Starting point:** `main` at `f36ea5b` (Plan 11a merged).

## Global Constraints

- **No vendor or product names** in UI, code, types, fixtures, test data or commit messages. Connector types are named by standard or method only. Task 7 adds a repo test that fails on any.
- **The frontend talks only to MHAI's API.** No EMR address is ever fetched by the browser; the base address is a string the platform admin types and the API stores. Record links come only from `emr_link` (https only, `recordLink()`), never built.
- **Roles:**
  - platform: platform admins do everything; auditors read everything and change nothing. Controls are hidden and the proxy refuses auditor writes (`AUDITOR_WRITES` unchanged);
  - clinical: Alert settings is for hospital admins only (the existing hospital admin gate: role plus two-step on); clinicians see only their alerts.
- **Step-up (platform):** add, edit, switch on and switch off take the person's own two-step or backup code through `StepUpDialog` and `useStepUpCall` (`lib/queries/step-up-call.ts`). **Test connection** takes none. Wrong code: "That code didn't work. Try again."; locked: "Too many wrong codes. Try again in 15 minutes." (existing `platformError` words).
- **Credentials are write-only.** Inputs start empty; a saved one reads "Set · 20 Oct 2026" (`dateLabel(set_at)`), else "Not set". **Replace** reveals an empty input. The mutation that carries them uses `gcTime: 0` and resets on settle (as `useSaveSso`); nothing about them is logged or kept in state after sending.
- **Sync errors** are the closed `SyncErrorCode` list mapped to words in `lib/emr/labels.ts`. An unknown code reads "Something went wrong with this connection." Server text is never shown. Error rows carry time and count only.
- **Hospital side shows status only:** state, source labels and last update time. Never the type, address, fields, credentials or error codes.
- **Alerts never go to patients.** No screen offers to send anything to a patient; Task 6 adds a test that the alert card has no such control. Patient-facing drafts are out of scope (spec §2).
- **Plain words** in the clinical app (UI design v3 §6). New backend codes (`no_recipients`, `critical_urgent`, `sent_to`, `by_route`, `to_you`) go in `FORBIDDEN_TERMS`. The platform app may show the connector type's label from the API (e.g. "FHIR R4 server"); nothing else technical.
- **Browser rules:** nothing in storage; the URL carries only opaque ids (`[A-Za-z0-9_-]+`) and filter values (`?state=`, `?hospital=`); alerts stay in memory under Plan 5a's rules.
- **States:** every list and block has loading, empty, "Couldn't load {what}" with **Try again**, and offline (writes disabled, "You're offline. This needs a connection."). A stale version is 409 `conflict`: "Changed by someone else", then a reload.
- **Accessibility:** states are words plus an icon, never colour alone; the safe choice is focused in warning dialogs; keyboard reachable; tables become cards below `md`; 44 px targets on phones.
- **No change to existing behaviour** outside what the tasks name. Existing unit and e2e suites pass unchanged, except the README pins Task 7 updates.
- **Repo rules:** no AI attribution; heavy commands (`npm run build`, Playwright) run on the build server (steven-reid, Docker); never push to `main`.

## Rulings made while planning

- **Many connections per hospital** (D3). The platform lists them by hospital; there is no "the" connection. Havana has two, labelled "Main record" and "Results system", which are `MOCK_SOURCES` in the clinical mock, so the two demos agree.
- **Connector types are data** (D4). `GET platform/emr/connector-types` returns each type's label, one-line summary and fields. The form renders those fields; adding a type needs no code. Sample types:

  | id            | label                   | summary                                         | fields (key · label · kind)                                                     |
  | ------------- | ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
  | `fhir_r4`     | FHIR R4 server          | Reads records from a FHIR R4 server             | `client_id` · Client ID · text; `private_key` · Private key · secret            |
  | `hl7v2_feed`  | Results message feed    | Receives results messages as they are sent      | `sender_id` · Sending system ID · text; `shared_key` · Shared key · secret       |
  | `file_export` | Scheduled file export   | Collects an export file from a secure folder    | `folder` · Folder · text; `access_key` · Access key · secret                    |

  The base address and source label are fixed fields on every connection, not per type.

- **No delete.** A connection is switched off, never removed (spec non-goal).
- **On needs a passing test** of the saved settings (D5), exactly as single sign-on's `lockedOff`: an edit clears `last_test`, so an edited connection must be tested again before it can be switched on. A connection that is on stays on after an edit (the backend re-tests on its next sync).
- **Add is a page, not a dialog** (`/connections/new?hospital={id}`), so the hospital section (Task 3) only links to it and Tasks 2 and 3 share no component.
- **Health** comes from the server as `health: "never" | "ok" | "errors"`; the UI state is `connectionState(c)`:
  - `!enabled && !last_test?.ok` → **Not tested**;
  - `!enabled` → **Switched off**;
  - `health === "errors"` → **Needs attention**;
  - otherwise → **Connected** (with "No updates yet" when `last_sync` is null).
- **Alert settings save per section** with one `PATCH hospital/alert-settings` carrying exactly one of `units`, `rules` or `recipients`, plus `version`. One Activity event per section (one name per event). No two-step code (D8).
- **Levels** (D9): `FlagLevel = "off" | "critical" | "critical_urgent" | "all"`, words "Off", "Critical only", "Critical and urgent", "All (including info)".
- **Routing** (D11): `AlertOut.routing = { to_you: boolean; queue: boolean }`. A missing `routing` reads `{ to_you: true, queue: false }` (today's behaviour). `planPopups` pops an alert when it is Critical, or when `routing.to_you` and alert pop-ups are on.
- **Evidence** (D13): `LikelyCauseOut.evidence?: EvidenceOut[]`, at most 3 shown; missing means none and nothing is drawn.
- **Audit kinds** (Plan 9's `lib/audit/kinds.ts`) and Activity actions share names:
  - platform: `emr_connection_added`, `emr_connection_changed`, `emr_connection_switched_on`, `emr_connection_switched_off`, `emr_connection_tested`, type `hospital_settings`, target kind `connection` (new, named by the source label);
  - hospital: `alert_units_changed`, `alert_rules_changed`, `alert_recipients_changed`, type `alerts`, no target, no note. They are also added to the clinical `ActivityKind` and its words.
- **Platform sidebar:** "Connections" (icon `Cable`) goes right after Hospitals.
- **Backend contract.** The controller files the spec's §8 with this plan's contract sections as mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` **§14.11** (Task 1's platform contract) and **§12** (Task 4's hospital and alert contract), each with its PR.

## Review Focus

1. **Credentials never come back.** After saving, the form, the query cache (`getConnection`), the mutation cache and the DOM hold no secret; the page shows only "Set · {date}". Tasks 1 and 2 test it.
2. **Switching on an untested or just-edited connection** is refused on screen (Switch on disabled with "Test the saved settings first.") and by the mock (409 `not_tested`). Tasks 1 and 2.
3. **An auditor** sees every connection and none of the controls, and a forced write is 403 at the proxy before anything goes upstream. Tasks 1 and 2.
4. **Saving "Who gets alerts" with no queue and nobody named** is stopped on screen and refused by the mock (422 `no_recipients`). Tasks 4 and 5.
5. **A queue-only Urgent alert** arrives with pop-ups on: it counts on the bell, lists under Hospital queue, and does **not** pop up; a queue-only Critical one does. Tasks 4 and 6.
6. **No vendor name and no patient-facing control** anywhere. Tasks 6 and 7.

---

## File structure

```text
apps/platform/lib/api/emr-contract.ts, emr-fixtures.ts, mock-emr.ts (+ test)      new
apps/platform/lib/api/contract.ts        extends EmrClient; ActivityAction (+5)
apps/platform/lib/api/mock.ts            one spread: ...emrMock(core)
apps/platform/lib/api/live.ts (+ test)   one spread: ...emrLive(ok)
apps/platform/app/api/v1/[...path]/route.ts (+ proxy.test.ts)   7 SHAPES rows
apps/platform/lib/api/audit-contract.ts  AuditTarget kind "connection"
apps/platform/lib/audit/kinds.ts (+ test) 8 kinds
apps/platform/lib/activity-labels.ts (+ test)  5 actions
apps/platform/lib/errors.ts (+ test)     not_tested
apps/platform/lib/emr/labels.ts, state.ts (+ tests)                                new
apps/platform/lib/queries/emr.ts                                                    new
apps/platform/components/emr/*                                                      new
apps/platform/app/(app)/connections/{page,new/page,[id]/page}.tsx                  new
apps/platform/components/shell/nav.ts, components/hospitals/hospital-view.tsx     one line each
apps/clinical/lib/api/emr-contract.ts, emr-fixtures.ts, mock-emr.ts, live-emr.ts, emr.ts (+ tests)  new
apps/clinical/lib/api/alerts-contract.ts, mock-alerts.ts, live-alerts.ts (+ tests)
apps/clinical/lib/api/admin-contract.ts  ActivityKind (+3); UsageAlertsOut.by_route
apps/clinical/lib/api/mock-admin.ts      by_route sample counts
apps/clinical/app/api/v1/[...path]/route.ts (+ proxy.test.ts)  hospital/alert-settings; alerts ?sent_to
apps/clinical/lib/admin/activity.ts, lib/labels.ts (+ tests)
apps/clinical/lib/emr-queries.ts                                                    new
apps/clinical/components/admin/alert-settings/*, app/(clinical)/admin/alerts/page.tsx   new
apps/clinical/components/shell/admin-nav.tsx, components/admin/usage-alerts.tsx
apps/clinical/components/notifications/{alert-card,alerts-view,chips}.tsx, lib/notifications/{alert-view,popups}.ts
apps/*/tests/e2e/emr.spec.ts, helpers.ts; scripts/no-vendor-names.test.mjs
README.md, ARCHITECTURE.md, CHANGELOG.md, CONTRIBUTING.md, apps/clinical/tests/readme.test.ts
```

**Files shared between tasks** (sequenced by the Parallel work section):

| File                                                               | Tasks          | Kind of clash                               |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------- |
| `apps/platform/lib/api/contract.ts`, `mock.ts`, `live.ts`, `route.ts` | 1 only        | none inside Plan 13                         |
| `apps/platform/components/shell/nav.ts`, `hospital-view.tsx`      | 3 only         | none inside Plan 13                         |
| `apps/clinical/lib/api/alerts-contract.ts`, `mock-alerts.ts`      | 4 (types, data), 6 reads only | Task 6 starts after Task 4       |
| `apps/clinical/lib/labels.ts` (`FORBIDDEN_TERMS`)                 | 4 only         | none                                        |
| `apps/*/tests/e2e/helpers.ts`, README, ARCHITECTURE, CHANGELOG    | 7 only         | none inside Plan 13                         |

**Files shared with other in-flight plans:** `nav.ts` and `SHAPES` (Plan 12), `contract.ts` `ActivityAction`, `lib/audit/kinds.ts`, `admin-contract.ts` `ActivityKind`, `admin-nav.tsx`, README/CHANGELOG/ARCHITECTURE. All appended lines; whichever merges second rebases.

---

## Plan 13a: Platform (PR `agent/plan-13a-emr-platform`)

### Task 1: The connections contract, sample data, mock, live client, proxy and audit kinds

**Files:**

- Create: `apps/platform/lib/api/emr-contract.ts`, `emr-fixtures.ts`, `mock-emr.ts`, `mock-emr.test.ts`; `lib/emr/labels.ts`, `labels.test.ts`, `state.ts`, `state.test.ts`.
- Modify: `lib/api/contract.ts` (`extends EmrClient`; five `ActivityAction`s); `lib/api/mock.ts` (`...emrMock(core)`); `lib/api/live.ts` and `live.test.ts` (`emrLive`); `app/api/v1/[...path]/route.ts` and `proxy.test.ts`; `lib/api/audit-contract.ts` (`"connection"` target kind); `lib/audit/kinds.ts` and `kinds.test.ts`; `lib/activity-labels.ts` and its test; `lib/errors.ts` and its test.

**Interfaces (`emr-contract.ts`):**

```ts
import type { Person, StepUp, WriteOpts } from "./contract";

export type ConnectorField = {
  key: string; // [a-z_]+
  label: string;
  kind: "text" | "secret";
  required: boolean;
  max: number;
};
export type ConnectorType = {
  id: string;
  label: string;
  summary: string;
  fields: ConnectorField[];
};
export type SyncErrorCode =
  | "unreachable"
  | "sign_in_refused"
  | "timed_out"
  | "unreadable_data"
  | "unmapped_codes"
  | "too_many_requests";
export type SyncError = { at: string; code: SyncErrorCode; count: number };
export type ConnectionHealth = "never" | "ok" | "errors";
export type EmrConnectionSummary = {
  id: string;
  hospital: Person;
  type: string;
  type_label: string;
  source_label: string;
  enabled: boolean;
  health: ConnectionHealth;
  last_test: { at: string; ok: boolean; code: SyncErrorCode | null } | null;
  last_sync: { at: string; ok: boolean; records: number } | null;
  /** Errors in the last 24 hours, summed. */
  errors_24h: number;
};
export type EmrConnection = EmrConnectionSummary & {
  base_url: string;
  /** The type's text fields only. Secrets are never here. */
  settings: Record<string, string>;
  /** One per secret field; `set_at` null when not set. */
  credentials: { key: string; set_at: string | null }[];
  /** Newest first, at most 5, last 24 hours. */
  errors: SyncError[];
  updated_by: Person | null;
  updated_at: string | null;
  version: number;
};
export type ConnectionState =
  "not_tested" | "connected" | "needs_attention" | "off";
export type ConnectionsQuery = {
  hospital?: string;
  state?: "all" | "needs_attention" | "off" | "not_connected";
};
export type ConnectionsOut = {
  connections: EmrConnectionSummary[];
  /** Hospitals (not removed) with no connection at all. */
  not_connected: Person[];
};
export type ConnectionIn = {
  type: string;
  source_label: string; // 1–40
  base_url: string; // https only, ≤ 500
  settings: Record<string, string>;
  credentials: Record<string, string>; // secret fields, each 1–4000
} & StepUp;
export type ConnectionPatch = {
  source_label?: string;
  base_url?: string;
  settings?: Record<string, string>;
  /** Only the ones being replaced. */
  credentials?: Record<string, string>;
  version: number;
} & StepUp;
export interface EmrClient {
  listConnectorTypes(): Promise<{ types: ConnectorType[] }>;
  listConnections(q: ConnectionsQuery): Promise<ConnectionsOut>;
  getConnection(id: string): Promise<EmrConnection>;
  addConnection(
    hospitalId: string,
    body: ConnectionIn,
    opts: WriteOpts,
  ): Promise<EmrConnection>;
  updateConnection(
    id: string,
    body: ConnectionPatch,
    opts: WriteOpts,
  ): Promise<EmrConnection>;
  /** 409 `not_tested` when switching on without a passing test. */
  setConnectionEnabled(
    id: string,
    body: { enabled: boolean; version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<EmrConnection>;
  testConnection(id: string, opts: WriteOpts): Promise<EmrConnection>;
}
export const SOURCE_LABEL_MAX = 40;
export const BASE_URL_MAX = 500;
```

**`lib/emr/state.ts`:** `connectionState(c: EmrConnectionSummary): ConnectionState` (Rulings); `canSwitchOn(c: EmrConnection): boolean` (`last_test?.ok === true`); `validateConnection(form, type): Partial<Record<string, string>>` (source label 1–40; base address `https:` and ≤ 500, "Use an address that starts with https://."; required fields "Enter {label}."; secrets required on add only).

**`lib/emr/labels.ts`** (the only place these words live):

| Code                | Words                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| `not_tested`        | Not tested                                                               |
| `connected`         | Connected                                                                |
| `needs_attention`   | Needs attention                                                          |
| `off`               | Switched off                                                             |
| `unreachable`       | Couldn't reach the record system                                         |
| `sign_in_refused`   | The record system refused the sign-in. Check the credentials.            |
| `timed_out`         | The record system took too long to answer                                |
| `unreadable_data`   | Some records couldn't be read                                            |
| `unmapped_codes`    | Some results use codes MHAI doesn't know yet                             |
| `too_many_requests` | The record system asked MHAI to slow down                                |
| unknown             | Something went wrong with this connection.                               |

`STATE_ICON` maps each state to a lucide icon (`CheckCircle2`, `CircleAlert`, `CirclePause`, `CircleDashed`). `syncLine(c, now)`: "Last update {time} · {n} records" or "No updates yet".

**Proxy shapes and live paths:**

| Method | Path                                        |
| ------ | ------------------------------------------- |
| GET    | `platform/emr/connector-types`              |
| GET    | `platform/emr/connections`                  |
| POST   | `platform/hospitals/{id}/emr/connections`   |
| GET    | `platform/emr/connections/{id}`             |
| PATCH  | `platform/emr/connections/{id}`             |
| PUT    | `platform/emr/connections/{id}/enabled`     |
| POST   | `platform/emr/connections/{id}/test`        |

**Activity and audit words:**

| Action / kind                 | Activity (after the name)                            | Audit log                                                         |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `emr_connection_added`        | added the record connection “{t}”                    | Added the record connection “{t}” for {hospital}                  |
| `emr_connection_changed`      | changed the record connection “{t}”                  | Changed the record connection “{t}” for {hospital}                |
| `emr_connection_switched_on`  | switched on the record connection “{t}”              | Switched on the record connection “{t}” for {hospital}            |
| `emr_connection_switched_off` | switched off the record connection “{t}”             | Switched off the record connection “{t}” for {hospital}           |
| `emr_connection_tested`       | tested the record connection “{t}”                   | Tested the record connection “{t}” for {hospital}                 |
| `alert_units_changed`         | (hospital side; not a platform action)               | Changed which units alerts cover                                  |
| `alert_rules_changed`         | (hospital side)                                      | Changed what alerts flag                                          |
| `alert_recipients_changed`    | (hospital side)                                      | Changed who gets alerts                                           |

Without a target, "the record connection" replaces “{t}”. `emr_connection_changed` has `detail` "Credentials replaced" when a secret was sent; never the secret.

**`errors.ts`:** `not_tested` → "Test the saved settings first." (`stale: true`); `no_type` → "Choose a connection type.".

**Mock rules (`mock-emr.ts`, built on `MockCore`):**

- Every write except test uses `core.write` (admins only; same key replays) and `core.checkCode`. Test uses `core.write` without a code.
- **Add:** hospital must exist and not be Removed (409 `hospital_removed`); unknown type 422 `no_type`; validation as `validateConnection` (422 `invalid`); saved `enabled: false`, `health: "never"`, `last_test: null`, credentials stored in a private `Map` keyed by connection id and **never** copied into any reply.
- **Update:** against `version` (409 `conflict`); any change except `source_label` clears `last_test`; replaced credentials update `set_at`.
- **Enable:** `enabled: true` with `last_test?.ok !== true` is 409 `not_tested`.
- **Test:** the result is fixed per connection by fixture (`testResult`); a new connection passes unless its base address contains `fail`, which gives `sign_in_refused` (so the demo can show both).
- **List:** filters `hospital` and `state` (`needs_attention`, `off` (Switched off and Not tested), `not_connected` (empty `connections`, only `not_connected`)); sorted by hospital name, then source label.
- **Activity** for every write and test: `target` the source label, `hospital` the hospital.

**Fixtures** (`emr-fixtures.ts`; times relative to `now`):

| id          | Hospital      | Type          | Source label     | State                                                                                  |
| ----------- | ------------- | ------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `emr_hv1`   | Havana        | `fhir_r4`     | Main record      | Connected; last sync 2 min ago, 1,284 records; tested ok 30 days ago                    |
| `emr_hv2`   | Havana        | `hl7v2_feed`  | Results system   | Connected; last sync 1 min ago, 312 records                                            |
| `emr_ng1`   | Northgate     | `fhir_r4`     | Patient record   | Needs attention; `sign_in_refused` ×3 today (latest 25 min ago), last good sync 6 h ago |
| `emr_rc1`   | Riverside     | `file_export` | Nightly export   | Switched off by Ada 5 days ago; tested ok                                              |
| `emr_wf1`   | Westfield     | `fhir_r4`     | Main record      | Not tested; added by Tunde 1 hour ago; private key not set                             |

Base addresses use `https://records.{hospital}.example/...`. Eastbrook, Harbour View, Southpoint and Hilltop have none.

- [ ] **Step 1: Write the failing tests**
  - `mock-emr.test.ts`:
    - "lists every connection, with hospitals that have none as not connected";
    - "the state filter: needs attention is Northgate, off is Riverside and Westfield";
    - "no reply ever contains a credential" (JSON of every reply after add, update, test and enable has none of the typed secrets; Review Focus 1);
    - "credentials read as set_at only";
    - "add saves switched off and untested";
    - "switching on without a passing test is not_tested" (Review Focus 2);
    - "an edit to the address clears the last test; a label-only edit keeps it";
    - "a stale version is conflict";
    - "an auditor can't add, edit, switch or test" (Review Focus 3);
    - "every write but test refuses a wrong code with mfa_invalid";
    - "an address containing fail tests as sign_in_refused";
    - "a removed hospital is hospital_removed";
    - "each write is in Activity with the source label and never a secret".
  - `state.test.ts`: the four states; `canSwitchOn`; validation words.
  - `labels.test.ts`: every `SyncErrorCode` has words; an unknown code reads the fallback.
  - `live.test.ts`: the seven methods use the paths and methods above, with an Idempotency-Key on writes and `hospital`, `state` in the list query.
  - `proxy.test.ts`: the seven shapes pass; auditor writes to the four write shapes are refused before upstream; `platform/emr/connections/x/test/extra` and `platform/emr/connections/x.y` are 404.
  - `kinds.test.ts`: the `ACTIONS` record gains the five; "the record connection kinds name the connection and the hospital"; "the alert settings kinds are Alerts kinds with no target".
  - `activity-labels.test.ts`: the five, with and without a target.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform unit tests, lint and typecheck (remote).
- [ ] **Step 4: Commit:** "Add the record connections contract, sample data and live client".

---

### Task 2: A connection's page, Add a connection, edit, test and on/off

**Files:**

- Create: `apps/platform/lib/queries/emr.ts`; `components/emr/connection-view.tsx`, `connection-form.tsx`, `connector-fields.tsx`, `credential-row.tsx`, `state-chip.tsx`, `sync-errors.tsx`, `add-connection-view.tsx`, and tests `connection-view.test.tsx`, `connection-form.test.tsx`, `add-connection-view.test.tsx`; `app/(app)/connections/[id]/page.tsx`, `app/(app)/connections/new/page.tsx`.

**Interfaces:**

- **Hooks (`lib/queries/emr.ts`):** `useConnectorTypes()` (staleTime 10 min), `useConnections(q)`, `useConnection(id)`, `useAddConnection(hospitalId)`, `useUpdateConnection(id)`, `useSetEnabled(id)`, `useTestConnection(id)`. The add and update mutations use `useKeyedMutation(..., { gcTime: 0 })` and reset on settle; on success they `setQueryData` the connection and invalidate `["emr"]` and the hospital's activity feed. Keys: `["emr","types"]`, `["emr","list",q]`, `["emr",id]`.
- **`ConnectorFields({ type, values, secrets, savedCredentials, errors, onChange, mode: "add" | "edit" })`:** renders the type's fields; a secret field in edit mode with `set_at` shows `CredentialRow` ("Set · {date}" plus **Replace**); otherwise an empty `type="password"` input with `autoComplete="off"`.
- **`StateChip({ state })`:** word plus icon from `lib/emr/labels.ts`.

**The connection page (`/connections/{id}`):**

- Top bar: the source label, sub the hospital's name (links to `/hospitals/{id}`).
- **Status** card: `StateChip`, `syncLine`, "Last test: Worked · {time}" / "Didn't work: {words}" / "Not tested yet."; buttons (admins only):
  - **Test connection** (no code; toast "Test passed." or "Test failed: {words}");
  - **Switch on** (disabled with "Test the saved settings first." unless `canSwitchOn`), or **Switch off**. Each opens `StepUpDialog`: title "Switch on {label}?" / "Switch off {label}?", intro "MHAI will start reading new records from this connection." / "MHAI will stop reading records from this connection. Alerts from it stop until it is switched on again.", confirm "Switch on" / "Switch off", tone primary / danger.
- **Settings** card: type label and summary, base address, the text fields, credentials as `CredentialRow`. **Edit** (admins) swaps the card for `ConnectionForm` in edit mode; **Save changes** opens `StepUpDialog` (title "Save changes to {label}?", intro "You'll need to test the connection again before it can be switched on." when anything but the label changed). **Cancel** returns to the read view. An `UnsavedGuard` covers leaving with edits.
- **Problems in the last 24 hours** card: `SyncErrors` rows "{words} · {time}" plus "×{count}" when more than one; empty "No problems in the last 24 hours."
- **Recent actions:** reuse `RecentActions` from `components/hospitals/recent-actions.tsx` with the hospital id (it already lists the hospital's activity).
- Auditors: everything read-only, no buttons.

**Add a connection (`/connections/new?hospital={id}`):** admins only (auditors get "Your account can only view this." and a link back). Without a valid `hospital` it shows a hospital picker (the hospitals list, not removed). Form: **Connection type** (radio cards: label and summary), **Name the hospital sees** (hint "Shown to the hospital's staff, for example Main record. Don't use a product name."), **Base address**, the type's fields, then **Continue** → `StepUpDialog` (title "Add {label} for {hospital}?", intro "It will be saved switched off. Test it, then switch it on.", confirm "Add connection"). On success: navigate to `/connections/{id}` and toast "Connection added. Test it next.".

- [ ] **Step 1: Write the failing tests**
  - `connection-view.test.tsx`:
    - "Havana's Main record reads Connected with its last update";
    - "Northgate shows Needs attention and the sign-in refused words ×3";
    - "credentials read Set with a date and never a value" (Review Focus 1);
    - "Switch on is disabled with Test the saved settings first. on Westfield" (Review Focus 2);
    - "Switch off asks for a code and then reads Switched off";
    - "Test connection needs no code and toasts the result";
    - "an auditor sees no buttons" (Review Focus 3);
    - "a 409 conflict says Changed by someone else and reloads";
    - "offline disables every write with the offline words".
  - `connection-form.test.tsx`:
    - "renders the type's fields from the API";
    - "an http address is refused with Use an address that starts with https://.";
    - "Replace reveals an empty secret input; leaving it empty sends no credentials";
    - "after saving, no secret remains in the form or the query cache" (Review Focus 1).
  - `add-connection-view.test.tsx`: "adds Westfield's second connection switched off and opens its page"; "a wrong code keeps the form and says That code didn't work. Try again."; "an auditor is told Your account can only view this.".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add a record connection's page, adding, editing, testing and switching".

---

### Task 3: The Connections list, the sidebar entry and the hospital page section

**Files:**

- Create: `apps/platform/components/emr/connections-view.tsx`, `connections-table.tsx`, `connections-cards.tsx`, `hospital-connections-section.tsx`, tests `connections-view.test.tsx`, `hospital-connections-section.test.tsx`; `app/(app)/connections/page.tsx`.
- Modify: `components/shell/nav.ts` ("Connections" after Hospitals, icon `Cable`); `components/hospitals/hospital-view.tsx` (render `<HospitalConnectionsSection hospital={h} />` after `SsoSection`).

Task 3 uses `StateChip` and the hooks from Task 2. To run in parallel with Task 2, it may start from Task 1 and add `useConnections` itself only if Task 2 has not landed; the controller keeps one copy at merge (Task 2's).

**Connections (`/connections`):**

- Top bar "Connections", sub "Patient record systems MHAI reads, by hospital".
- Filter pills from `?state=`: **All** · **Needs attention** · **Switched off** · **Not connected**, each with its count.
- Table (cards below `md`): Hospital · Name the hospital sees · Type · State (`StateChip`) · Last update · Problems (24 h). A row links to `/connections/{id}`. Hospitals without a connection show one row: "{hospital}" · "—" · "—" · "Not connected" (`CircleDashed`) and, for admins, **Add a connection** (link to `/connections/new?hospital={id}`).
- Empty filter: "Nothing needs attention." / "No connections are switched off." / "Every hospital has a connection.".

**Hospital page section ("Patient record connections"):** each connection as a row (label, type, `StateChip`, last update) linking to its page; none: "Not connected. MHAI can't raise patient alerts for this hospital yet."; admins see **Add a connection** (link). Removed hospitals show the rows read-only and no Add.

- [ ] **Step 1: Write the failing tests**
  - `connections-view.test.tsx`: "lists Havana's two connections as Connected"; "Needs attention shows only Northgate"; "Not connected lists Eastbrook with Add a connection for admins only"; "the filter is in the URL query and nothing is stored".
  - `hospital-connections-section.test.tsx`: "Havana's page lists Main record and Results system"; "Eastbrook reads Not connected"; "an auditor sees no Add".
  - The app shell test's nav order gains Connections after Hospitals.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the platform tests and lint (remote).
- [ ] **Step 4: Commit:** "Add the Connections list and each hospital's connections".

---

## Plan 13b: Hospital and clinician (PR `agent/plan-13b-emr-hospital`)

### Task 4: The alert settings contract, alert fields, sample data, mock, live client and proxy

**Files:**

- Create: `apps/clinical/lib/api/emr-contract.ts`, `emr-fixtures.ts`, `mock-emr.ts`, `mock-emr.test.ts`, `live-emr.ts`, `live-emr.test.ts`, `emr.ts`.
- Modify: `lib/api/alerts-contract.ts`; `lib/api/mock-alerts.ts` and its test; `lib/api/live-alerts.ts` and its test (`sent_to`); `lib/api/admin-contract.ts` (three `ActivityKind`s; `UsageAlertsOut.by_route`); `lib/api/mock-admin.ts` (`by_route` sample, the three kinds in sample Activity); `lib/admin/activity.ts` and its test (words); `lib/labels.ts` (`FORBIDDEN_TERMS`); `app/api/v1/[...path]/route.ts` and `proxy.test.ts`; sign-out resets `resetEmrClient()` where `resetAlertsClient()` is called.

**Interfaces (`emr-contract.ts`):**

```ts
export type RecordsStatus =
  "connected" | "problems" | "off" | "not_connected";
export interface RecordsSourceOut {
  /** The hospital's own label, e.g. "Main record". */
  label: string;
  status: Exclude<RecordsStatus, "not_connected">;
  last_update_at: string | null;
}
export interface RecordsConnectionOut {
  status: RecordsStatus; // the worst of the sources; not_connected when none
  sources: RecordsSourceOut[];
}
export type UnitKind = "ward" | "clinic" | "emergency" | "other";
export interface UnitOut {
  id: string;
  label: string; // e.g. "Ward 3", "Cardiology clinic"
  kind: UnitKind;
  source_label: string | null;
  covered: boolean;
}
export type FlagLevel = "off" | "critical" | "critical_urgent" | "all";
export interface CategoryOut {
  id: string;
  label: string; // e.g. "Blood chemistry"
  example: string | null; // e.g. "Potassium, sodium, calcium"
  level: FlagLevel;
}
export interface RecipientsOut {
  queue: boolean;
  clinicians: { id: string; display_name: string; specialty: string | null }[];
}
export interface AlertSettingsOut {
  connection: RecordsConnectionOut;
  units: UnitOut[];
  categories: CategoryOut[];
  recipients: RecipientsOut;
  updated_by: { display_name: string } | null;
  updated_at: string | null;
  version: number;
}
export type AlertSettingsPatchIn = { version: number } & (
  | { units: { covered: string[] } }
  | { rules: { levels: Record<string, FlagLevel> } }
  | { recipients: { queue: boolean; clinician_ids: string[] } }
);
export interface EmrClient {
  getAlertSettings(): Promise<AlertSettingsOut>;
  /** 422 `no_recipients`; 409 `conflict` on a stale version. */
  updateAlertSettings(
    p: AlertSettingsPatchIn,
    opts?: WriteOpts,
  ): Promise<AlertSettingsOut>;
}
export const FLAG_LEVELS: readonly FlagLevel[] =
  ["off", "critical", "critical_urgent", "all"];
```

**Alert additions (`alerts-contract.ts`):**

```ts
export interface EvidenceOut {
  /** e.g. "Furosemide 40 mg daily", "Magnesium". */
  label: string;
  /** e.g. "0.6 mmol/L (low)", "started 19 Oct". */
  value: string | null;
  recorded_at: string | null;
}
// LikelyCauseOut gains:  evidence?: EvidenceOut[];  (at most 3)
// AlertOut gains:        category?: { id: string; label: string } | null;
//                        routing?: { to_you: boolean; queue: boolean };
// AlertQuery gains:      sent_to?: "you" | "queue";
// AlertPageOut gains:    queue?: boolean;  // the hospital uses the queue
```

**Proxy:** `hospitalShape` allows `GET hospital/alert-settings` and `PATCH hospital/alert-settings` (n === 2), under the existing hospital admin and two-step check. The alerts list query keeps its existing allow rules; `sent_to` is one of `you|queue` (anything else 400 `invalid`).

**Mock rules (`mock-emr.ts`):**

- One in-memory settings object per mock (reset on sign-out with the client).
- Each PATCH must carry exactly one of `units`, `rules`, `recipients` (else 422 `invalid`); a stale `version` is 409 `conflict`; unknown unit, category or clinician ids are 422 `invalid`; a level outside `FLAG_LEVELS` is 422 `invalid`; recipients with `queue: false` and no clinicians are 422 `no_recipients`.
- Clinician ids must be active clinicians in the mock staff list (`mock-admin`'s 14 people).
- Each successful PATCH adds an Activity event `alert_units_changed`, `alert_rules_changed` or `alert_recipients_changed` (type `admin`, actor the admin) to `mock-admin`'s log through its existing `recordActivity` seam (add one if missing; one exported function).
- Option `connection?: RecordsStatus` (tests and the e2e) sets the status; the default is `connected`.

**Fixtures (`emr-fixtures.ts`), Havana:**

- Connection: Main record (connected, 2 min ago) and Results system (connected, 1 min ago), the platform sample's labels.
- Units (all covered unless marked): Ward 3, Ward 5, Ward 7 (not covered), Intensive care, Emergency department, Cardiology clinic, Kidney clinic (not covered), Diabetes clinic; all from Main record except none.
- Categories, levels: Blood chemistry ("Potassium, sodium, calcium") `all`; Blood count ("Haemoglobin, platelets, white cells") `critical_urgent`; Kidney function ("Creatinine, urea") `critical_urgent`; Blood gases and lactate `all`; Heart markers ("Troponin") `all`; Blood sugar `critical_urgent`; Vital signs ("Blood pressure, heart rate, oxygen") `critical`; Infection markers and cultures `critical_urgent`.
- Recipients: queue on; named Dr. Reyes (the demo clinician) and Dr. Mensah.

**Sample alerts (`mock-alerts.ts`):** every seed gains `category` (from the list above), `routing` and `evidence` per cause. At least: `al-101` (Potassium) `to_you: true, queue: true`, causes with evidence ("Furosemide 40 mg daily" · "started 19 Oct"; "Magnesium" · "0.6 mmol/L (low)" · yesterday); `al-102` (Lactate) queue only, Critical; one Urgent queue-only seed; one Info seed for you with no evidence. Arrivals alternate for-you and queue-only. `listAlerts` filters `sent_to` (`you`: `routing.to_you`; `queue`: `routing.queue && !routing.to_you`) and returns `queue: true`.

**Words (`lib/admin/activity.ts`):** `alert_units_changed` "Changed which units alerts cover"; `alert_rules_changed` "Changed what alerts flag"; `alert_recipients_changed` "Changed who gets alerts". **Usage (`by_route`):** `{ queue: MeasureOut; named: MeasureOut }`, guarded like the other measures.

- [ ] **Step 1: Write the failing tests**
  - `mock-emr.test.ts`: "Havana is connected through Main record and Results system"; "covering units saves and logs alert_units_changed"; "a level outside the list is invalid"; "no queue and nobody named is no_recipients" (Review Focus 4); "a stale version is conflict"; "a PATCH with two sections is invalid"; "only active clinicians can be named"; "names no vendor and no technical detail" (no address, type or error code in any reply).
  - `mock-alerts.test.ts`: "sent_to you lists only alerts routed to you"; "sent_to queue lists only queue-only alerts"; "every seed has a category, routing and at most three pieces of evidence per cause"; existing tests unchanged.
  - `live-emr.test.ts`: GET and PATCH `hospital/alert-settings`, with an Idempotency-Key on PATCH.
  - `live-alerts.test.ts`: `sent_to` goes in the query.
  - `proxy.test.ts`: the two shapes pass for a hospital admin with two-step; a clinician is refused; `hospital/alert-settings/x` and `PUT hospital/alert-settings` are 404; `alerts?sent_to=other` is 400.
  - `activity.test.ts`: the three words.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical unit tests, lint and typecheck (remote).
- [ ] **Step 4: Commit:** "Add the alert settings contract and alert evidence and routing".

---

### Task 5: Alert settings for hospital admins, and Who received them in Usage

**Files:**

- Create: `apps/clinical/lib/emr-queries.ts`; `components/admin/alert-settings/alert-settings-view.tsx`, `records-status.tsx`, `units-section.tsx`, `rules-section.tsx`, `recipients-section.tsx`, and tests `alert-settings-view.test.tsx`, `recipients-section.test.tsx`; `app/(clinical)/admin/alerts/page.tsx`.
- Modify: `components/shell/admin-nav.tsx` (an `ADMIN_LINKS` entry after Hospital settings: `{ href: "/admin/alerts", label: "Alert settings", sub: "Units, what to flag, who hears", Icon: BellRing }`) and its sidebar test; `components/admin/usage-alerts.tsx` and `usage-alerts.test.tsx`.

**Interfaces:** `useAlertSettings()`; `useUpdateAlertSettings()` (keyed mutation; on success `setQueryData`; on 409 the section shows the conflict banner with **Reload**). Each section keeps its own draft in React state, has **Save** and **Discard**, and is covered by `UnsavedGuard`.

**The page (`/admin/alerts`, `AdminFrame title="Alert settings"`):**

- Intro: "Choose which units MHAI watches, what it flags and who hears about it. Alerts go to clinicians only, never to patients."
- **Patient records** (`RecordsStatus`, read-only):
  - Connected: "Connected" (`CheckCircle2`), then per source "{label} · last update {time}";
  - Problems: "Connected, with problems" (`CircleAlert`) and "Some updates may be late. Measured Health has been told.";
  - Off: "Switched off" (`CirclePause`) and "Measured Health has paused this connection. No new alerts arrive until it's back.";
  - Not connected: "Not connected" (`Link2Off`) and "Alerts start once Measured Health connects your records. You can set them up now.";
  - footer: "Measured Health manages this connection. Contact them to change it."
- **Units covered:** checkboxes grouped by kind (Wards, Clinics, Emergency, Other), with the source label beside each when there is more than one source; **Select all** / **Clear all**; summary "{n} of {m} units covered". Unchecking a covered unit and saving opens a confirm (safe choice **Keep covered** focused): "Patients in {unit} won't get alerts, including Critical ones." (several: "Patients in {n} units won't get alerts, including Critical ones.").
- **What to flag:** one row per category: label, example in small text, and a select **Off · Critical only · Critical and urgent · All (including info)**. Setting **Off** and saving opens a confirm (safe choice **Keep it on**): "MHAI won't flag any {category} results, including Critical ones." Help line: "Critical is the most serious. Info is for awareness only."
- **Who gets alerts:**
  - switch **Hospital queue**, sub "A shared list every clinician at the hospital can see and act on.";
  - **Named clinicians**: chips with remove buttons ("Remove {name}") and **Add clinician** (a combobox over active staff with the Clinician role from `useStaff()`, by name and specialty);
  - sub "Named clinicians get alerts as For you, with pop-ups.";
  - Save is disabled with "Choose the hospital queue, at least one clinician, or both." when neither is chosen; a 422 `no_recipients` shows the same words.
- Footer: "Last changed by {name} · {time}" when known.
- Toast on save: "Alert settings saved."

**Usage → Alerts:** a card "Who received them" with two measures, **Hospital queue** and **Named clinicians**, using the existing measure renderer (so "Fewer than 5" applies).

- [ ] **Step 1: Write the failing tests**
  - `alert-settings-view.test.tsx`: "shows Connected with Main record and Results system"; "Not connected says Alerts start once Measured Health connects your records."; "covering Ward 7 saves and toasts Alert settings saved."; "unchecking Ward 3 asks first and Keep covered is focused"; "setting Vital signs to Off asks first"; "a stale version shows Changed by someone else with Reload"; "never shows an address, a connection type or an error code"; "offline disables Save".
  - `recipients-section.test.tsx`: "Save is disabled with no queue and nobody named" (Review Focus 4); "adds Dr. Adeyemi from Staff"; "only active clinicians are offered".
  - sidebar test: Alert settings sits after Hospital settings, admins only.
  - `usage-alerts.test.tsx`: "Who received them shows the queue and named counts, with Fewer than 5".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint (remote).
- [ ] **Step 4: Commit:** "Add Alert settings for hospital admins".

---

### Task 6: Evidence, category and routing on clinicians' alerts

**Files:**

- Modify: `apps/clinical/lib/notifications/alert-view.ts` and its test (`evidenceOf`, `routingOf`, `EVIDENCE_MAX`, `ROUTE_LABEL`); `lib/notifications/popups.ts` and its test; `components/notifications/alert-card.tsx` and its test; `alerts-view.tsx` and its test; `chips.tsx` (`RouteChip`); `notification-bell.tsx` only if its panel rows need the route chip (they show it).

**Interfaces:**

```ts
export const EVIDENCE_MAX = 3;
/** Label, value and time; blank labels dropped; at most three. */
export function evidenceOf(c: LikelyCauseOut, now: number): string[];
/** Missing routing reads as sent to you (today's behaviour). */
export function routingOf(a: Pick<AlertOut, "routing">): {
  to_you: boolean;
  queue: boolean;
};
export const ROUTE_LABEL = { you: "For you", queue: "Hospital queue" };
```

`CauseView` gains `evidence: string[]`; `likelyCauses(a, now)` fills it. An evidence line reads "{label} · {value} · {time}", leaving out what is missing.

**`planPopups`:** eligible when Critical, or when `routingOf(a).to_you && s.alert_popups`. Everything else is unchanged (baseline, ordering, summary).

**Alert card:**

- Under the severity line, the category label in small text when present.
- A `RouteChip`: "For you" (`UserRound`) when `to_you`, otherwise "Hospital queue" (`Users`).
- Under each likely cause, its evidence as a short list headed "Evidence" (`aria-label="Evidence for {cause}"`); none, nothing drawn.
- No other change to actions. There is no "send to patient" control, and the test asserts it.

**Alerts page:** when `page.queue` is true, a **Sent to** pill group **All** · **For you** · **Hospital queue** (React state, not the URL), sending `sent_to`. The intro line becomes "Abnormal results MHAI spotted, with the evidence and likely causes to check. Clinicians decide what happens next."

- [ ] **Step 1: Write the failing tests**
  - `alert-view.test.ts`: "evidence reads label · value · time and stops at three"; "missing routing reads For you".
  - `popups.test.ts`: "a queue-only Urgent alert doesn't pop up with pop-ups on" and "a queue-only Critical one does" (Review Focus 5); "a for-you Urgent alert pops up only with pop-ups on".
  - `alert-card.test.tsx`: "shows Blood chemistry and the evidence under Diuretic treatment"; "shows For you or Hospital queue with an icon"; "no evidence draws no Evidence list"; "has no control that sends anything to a patient" (no button or link whose name matches /patient(?! record)/i other than Open patient record; Review Focus 6).
  - `alerts-view.test.tsx`: "Sent to: Hospital queue lists only queue alerts"; "the Sent to filter is hidden when the hospital doesn't use the queue"; "nothing about the filter reaches the URL or storage".
  - `notification-bell.test.tsx`: "queue-only alerts count on the bell".
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the clinical tests and lint (remote).
- [ ] **Step 4: Commit:** "Show evidence, category and who an alert was sent to".

---

### Task 7: End to end, the vendor guard and docs

**Files:**

- Create: `apps/platform/tests/e2e/emr.spec.ts`; `apps/clinical/tests/e2e/emr.spec.ts`; `scripts/no-vendor-names.test.mjs`.
- Modify: `apps/platform/tests/e2e/helpers.ts` (`openNav` gains "Connections"); `apps/clinical/lib/api/mock-analysis.test.ts` (import the vendor list from the new script's exported list, so there is one list); `README.md` (a "### EMR connections and alert settings" section: the demo path, sample data only, live use needs the Plan 5a sign-off); `ARCHITECTURE.md` (§2 the two new abilities; §4.7 Alert settings row; §4.8 routing and evidence; §5 Connections row); `CHANGELOG.md` (Unreleased); `CONTRIBUTING.md` (Alerts are EMR-agnostic bullet: "credentials are write-only and never reach the browser after they are typed"); `apps/clinical/tests/readme.test.ts` pins; `docs/adr/0003-many-emr-systems.md` Consequences: one line pointing at Plan 13.

**`no-vendor-names.test.mjs`:** walks `apps/*/{app,components,lib,tests}` and `packages/*/src`, skips `node_modules` and itself, and fails on any name in its exported `VENDOR_NAMES` (move the list from `mock-analysis.test.ts`; case-insensitive whole words).

**Platform e2e (`emr.spec.ts`), desktop and phone:**

- "Connections shows Havana connected, Northgate needing attention, Riverside switched off and Eastbrook not connected";
- "add a connection to Eastbrook with a code, test it, switch it on" (enter `123456` as the demo code, as other platform e2e do);
- "the credential reads Set after saving and its value is nowhere in the page" (Review Focus 1);
- "an auditor sees the connection and no controls" (Review Focus 3);
- "Activity lists the connection changes; the audit log words them";
- `expectNoStorage`-style check: nothing in storage, the URL has only ids and `?state=`.

**Clinical e2e (`emr.spec.ts`):**

- "a hospital admin covers Ward 7, sets Vital signs to Critical and urgent, and saves; Activity lists all three";
- "Who gets alerts can't be saved empty" (Review Focus 4);
- "a clinician sees evidence under a likely cause, the For you tag, and filters to the hospital queue";
- "a queue-only Urgent arrival counts on the bell without a pop-up" (uses the mock clock as the existing notifications e2e does; Review Focus 5);
- `expectNoForbiddenWords` and `expectNoStorage` on every new page.

- [ ] **Step 1: Write the e2e, the guard and the doc pins.**
- [ ] **Step 2: Run** `node --test scripts/`, both apps' unit suites, lint, typecheck, format check, build and both Playwright suites (remote).
- [ ] **Step 3: Commit:** "Test the EMR screens end to end and document them".

---

## Parallel work

- **Wave 1 (two at once):** Task 1 (platform) and Task 4 (clinical). Different apps, no shared files.
- **Wave 2 (three at once):** Tasks 2, 5 and 6.
  - Task 2 needs Task 1; Tasks 5 and 6 need Task 4.
  - Task 5 owns `components/admin/*` and `admin-nav.tsx`; Task 6 owns `components/notifications/*` and `lib/notifications/*`. No overlap.
- **Wave 3:** Task 3 (needs Task 1; uses Task 2's `StateChip` and hooks, so start it when Task 2 lands, or alongside Task 2 with the rule in Task 3's note). It is the smallest task.
- **Then Task 7**, alone, once 13a and 13b are both in.
- **Merge order:** 13a (Tasks 1–3) → 13b (Tasks 4–6) → Task 7. The controller files §14.11 with 13a and §12 with 13b.

## Self-review notes

- **Spec coverage:**

  | Spec section                                | Task(s)                     |
  | ------------------------------------------- | --------------------------- |
  | §2 goals; non-goal: no patient messages     | 1–6; 6 (test), 7 (e2e)      |
  | §3 constraints (no vendors, API only, URL)  | Global Constraints; 7 guard |
  | D1, D2, D4, D5, D6 platform connection      | 1, 2                        |
  | D3 many connections; Connections list       | 1, 3                        |
  | D7 status only for hospitals                | 4, 5                        |
  | D8–D10 units, what to flag, who gets alerts | 4, 5                        |
  | D11, D12 routing and pop-ups                | 4, 6                        |
  | D13 evidence and category                   | 4, 6                        |
  | D14 record link                             | unchanged (Plan 5a)         |
  | D15 Usage and Activity                      | 1 (audit), 4, 5             |
  | §6 states and sample hospitals              | 1, 2, 3, 5                  |
  | §7 privacy                                  | 1, 2 (credentials), 6, 7    |
  | §8 backend contract                         | 1, 4; controller files      |

- **Names used across tasks:**
  - platform: `EmrClient`, `ConnectorType`, `ConnectorField`, `EmrConnection`, `EmrConnectionSummary`, `ConnectionsOut`, `SyncErrorCode`, `connectionState`, `canSwitchOn`, `validateConnection`, `syncLine`, `StateChip`, `ConnectorFields`, `CredentialRow`, `useConnections`, `useConnection`, `useSetEnabled`, `useTestConnection`;
  - clinical: `EmrClient` (clinical), `AlertSettingsOut`, `AlertSettingsPatchIn`, `FlagLevel`, `FLAG_LEVELS`, `RecordsStatus`, `EvidenceOut`, `evidenceOf`, `routingOf`, `ROUTE_LABEL`, `EVIDENCE_MAX`, `useAlertSettings`, `useUpdateAlertSettings`, `resetEmrClient`;
  - shared names (both apps, same meaning): `alert_units_changed`, `alert_rules_changed`, `alert_recipients_changed`.
- **Placeholders:** none. Every string the UI shows is given above or comes from the API as a display label (unit, category, source and type labels).
- **Risks for today:** Task 2 is the largest; if time runs short, drop the edit form's `UnsavedGuard` and the Recent actions card first. Task 3's hospital section can ship without the Connections page if needed (nav entry then waits).
