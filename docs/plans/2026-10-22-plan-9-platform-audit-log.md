# Plan 9: The audit log across hospitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an **Audit log** page in the platform admin app, for auditors and platform admins. It shows every audited event across every hospital and the platform, with:

- filters, an exact id search, an event detail, and patient ids only on request;
- four tabs: **Events**, **Named access**, **Exports** and **Integrity**;
- server-built exports that are recorded, checksummed and downloadable once;
- an integrity check that shows Intact only with proof, goes stale after 26 hours, and raises a banner and a bell item when it fails.

It runs on sample data. Every read of the log is itself recorded, by the server.

**Architecture:**

- **Data.** The audit types and the `AuditClient` interface live in a new `lib/api/audit-contract.ts`. `PlatformClient` extends `AuditClient`. The live calls are in `lib/api/live-audit.ts`, and the sample log and its mock are in `lib/api/audit-fixtures.ts` and `lib/api/mock-audit.ts`. The shared files (`contract.ts`, `live.ts`, `mock.ts`, the proxy) each gain only a few additive lines, so this plan merges cleanly beside Plans 8 and 11.
- **Rules.** Pure code lives in `apps/platform/lib/audit/`:
  - the kinds table and its words;
  - the fail-closed reader;
  - the integrity rules (the proof, staleness and the banner);
  - date ranges;
  - the reference file builder, which the mock uses and the backend copies.
- **UI.** The components live in `apps/platform/components/audit/`. The page sits at `app/(app)/audit/page.tsx`, and its hooks in `lib/queries/audit.ts`. The bell (Plan 7d) gains an integrity item. The integrity banner is mounted on every audit tab and on the home page (`/hospitals`).

**Tech Stack:** Next.js 16.4, React 19.3, TanStack Query 5, Tailwind 4 with `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client`, Vitest 5 and Testing Library, Playwright 1.64. No new dependency.

**Spec:** `docs/specs/2026-10-22-platform-audit-log-design.md` (approved 22 Oct 2026; every suggested default in §17 accepted). Background:

- `docs/specs/2026-10-17-platform-admin-design.md`;
- `docs/specs/2026-10-22-clearance-letters-design.md` (Plan 11), for the letter statuses and the named-view entry;
- `docs/plans/2026-10-22-plan-7c-platform-analytics.md` and `…-plan-7d-platform-notifications.md`, which this plan builds on.

## Global Constraints

- **No patient data, ever** (spec §5):
  - no names, MRNs, dates of birth, addresses, question text, answers, findings or clinician free text, on screen or in a file;
  - patients appear only as pseudonymous ids, and only in the event detail behind **Show patient ids** (recorded) and in the named-access export;
  - the list never shows a pseudonym.
- **Fail closed.** Every line is built from fields, never from server text. An event that doesn't fit its shape shows **"This entry can't be displayed"** with its id and position, never its raw content. The server is told once per id, and a file writes the row as **"Not displayable"**.
- **Read-only.** No control changes, hides or annotates an entry. The one write about the log itself is the outcome note on a failed check, which is a new entry.
- **Roles.** Auditors and platform admins can do everything here, except the **outcome note**, which is for auditors only. The proxy lets auditors make exactly the audit writes listed in Task 1.
- **Nothing in the URL or in browser storage.** Filters, searches, ids, the open tab and the open event stay in React state. `/audit` never gains a query string, and the bell and banner reach a tab through an in-memory hand-off (`lib/audit/nav.ts`). Pseudonym queries use `gcTime: 0`.
- **Exports:**
  - built by the server;
  - a reason is required: **Legal request**, **Hospital request**, **Regulator request**, **Internal review**, **Security investigation**, or **Other** with a note (required, at most **200** characters);
  - an optional reference, at most **60** characters;
  - a two-step code, every time;
  - at most **50,000** rows. Over that, 422 `too_many_rows` gives "{n} entries match. Exports stop at 50,000 rows. Narrow the dates or filters.";
  - no file without an `export_id`;
  - the id and checksum show on screen, and in the Exports tab;
  - download once, within **15 minutes**. After that, 410 `gone` gives "This file was already downloaded or has expired. Make a new export.";
  - "capped" shows in the toast and in the file's header whenever the server caps.
- **Integrity:**
  - **Intact** shows only with proof: `state: "intact"`, `entries_checked > 0`, a start (`from_checkpoint` or `from_first: true`), and a `to_seq`, `to_at` and `finished_at`. Anything else shows **Couldn't check**;
  - the result is stale after **26 hours**: the header then reads "Not checked since {d MMM yyyy}" in warning style, never Intact;
  - the daily check runs at **06:00 UTC**;
  - one run at a time;
  - a Broken result stays in the history, and the banner stays until the server's `open_failure` is null;
  - states use words and an icon, never colour alone. Changes are announced with `aria-live="polite"`.
- **Copy (exact):**
  - "Audit log";
  - "Export CSV";
  - "Integrity: Intact · checked {time}";
  - "Nothing matches these filters";
  - "Couldn't load the audit log" with **Try again**;
  - "{n} events" or "More than 10,000 events";
  - "Load more";
  - "After an integrity failure";
  - "Show patient ids";
  - the banner: "The audit log failed its integrity check on {d MMM yyyy}. See Integrity.";
  - the footer: "Kept for at least 6 years. The oldest entry is from {d MMM yyyy}. No question text, answers or patient names are recorded here. Times on screen are local; files use UTC.";
  - the Named access note: "Names and MRNs are never recorded here. Patients appear only by the hospital's pseudonymous id; the hospital can match them to its own records."
- **Times:** local on screen (`formatWhen`); UTC in the detail and in files, as "22 Oct 2026 06:00 UTC". Dates use `dateLabel` (fixed English months).
- **States and phone:**
  - loading, empty, couldn't load and offline, as elsewhere. Offline disables Load more, search, export and Run check now, with `OFFLINE_NOTE`;
  - at 390 px the list becomes cards, and the detail becomes a full page with **Back**;
  - targets are 44 px.
- **Sidebar:** Hospitals · Analytics · Team · Activity · **Audit log** · Account (plus whatever Plans 8 and 11 add before Team). The icon is `ScrollText`.
- **No change** to the clinical app, or to the platform Activity page's behaviour.
- **Repo rules:**
  - no AI attribution;
  - never `git add -f` under `.superpowers/`;
  - heavy commands (`npm test`, e2e, build) run in Docker on the build server;
  - no vendor names;
  - ids are opaque `[A-Za-z0-9_-]+`.

## Rulings made while planning

- **Contract additions beyond spec §13**, for the controller to carry to the backend requirements as §14.9:
  - `GET /platform/audit/people?q` (q ≥ 2 characters) → `{people: AuditPerson[]}`, at most 20. This backs the person picker.
  - `GET /platform/audit/hospitals` → `{hospitals: {id, name, removed}[]}`: every hospital the log names. Removed hospitals may leave the hospitals list, but their trail stays.
  - `POST /platform/audit/undisplayable {ids}` (1–50) → 204, which records `audit_undisplayable_reported`. This is how "the server is told".
  - `GET /platform/audit/verify/status` → `{latest, running, open_failure, security_contact: {name, email}, oldest_kept_at}`. One small read serves the header, the footer and the home banner. The server decides `open_failure`, using spec §8.3's clearing rule.
  - Each event gains `facts`: typed, optional, structured values (specialty and confidence, view and filters, patient count, purpose, purge counts, the searched id and its kind, rows, checksum, check state). It replaces any free text.
  - A checkpoint is `{id, at, purged_count, before, kind: "retention" | "re_anchor", incident_ref, reason}`. A run gains `from_first`, `version`, `outcome: {note, by, at} | null`, and `first_broken_id: string | null`: the first broken entry's opaque id, set exactly when `first_broken_seq` is (else the run fails closed), so **Open entry** opens it by id with no extra list read.
  - `ExportOut` gains `file_name`, matching `^[A-Za-z0-9._-]{1,120}$`. An export record carries `filter_names: {hospital, person, clearance}` so the app can put the filters in words.
  - 422 `too_many_rows` carries `{rows}`, and the proxy forwards that one extra field.
  - **Downloads are owner-only.** `GET .../exports/{id}/file` answers anyone but the maker with 403 `forbidden`, and writes `export_download_refused` with reason `not_owner` (a used or expired file writes the same kind with reason `gone`, and answers 410). The app says "Only the person who made this export can download it." **Retry:** a download that fails before the server answers or with a 5xx may be tried again; any other answer spends it.
  - **One staleness rule** (header, tab, history, banner and bell): a proven run is stale when it finished more than 26 h ago ("Not checked since {date}"), or began more than 26 h after the end of the range it covered ("Last check covered entries up to {date}"). A stale run is never Intact.
  - **An exact-id search (`q`) is answered on `q` alone**; the app sends no other filter with it.
  - **Reads are recorded once per applied filter set** per person per page load (`audit_viewed`, or `audit_searched` for an id); a request with a `cursor` (Load more) records none. The Named access list records the same way.
  - `GET /platform/audit/verify/status` and `GET /platform/audit/verify/runs/{id}` are sent with `X-MHAI-Background: 1`, so the polls don't keep a session alive.
  - `Notification` gains `kind: "analytics_change" | "audit_integrity"` (missing is read as `analytics_change`). An integrity item is `{kind, id, run_id, first_broken_seq, first_broken_id, at, seen}`.
- **The outcome note is auditor-only**, as spec §13 says. The server refuses platform admins with 403, and the UI hides the control from them.
- **The file name** carries the export id and the UTC time: `audit-{events|named-access}-{export_id}-{YYYYMMDD-HHmm}Z.{csv|zip}`. Who made it, the filters and the reason go in the file's first lines (key and value rows, then a blank row, then the table). The app names the download from `file_name`, so the proxy needs no `Content-Disposition`.
- **Downloading** happens from the dialog's "ready" step (a click, so browsers allow it), and nowhere else. If the dialog is closed first, the file is gone, and the Exports tab shows "Not downloaded".
- **The default date range** is Last 30 days. A custom range is whole local days, sent as the local-midnight instants `[from, to + 1 day)`.
- **Recording reads** is the server's job. The app sends the filters as given, and Load more (a cursor) never adds a read entry. The mock records an `audit_viewed` entry only when a person's filter set differs from their last one.
- **The pseudonym searched** (`facts.searched_kind: "pseudonym"`) shows only behind Show patient ids in the detail. The list says "Searched the audit log by patient id".
- **Unknown codes fail closed.** An unknown `type`, `kind`, `reason`, role, outcome, letter status or `facts` key makes the entry "can't be displayed". **Plans 8 and 11 must add their audit kinds to `lib/audit/kinds.ts`.** `view` and `location_type` are codes matching `^[a-z][a-z_]{0,39}$`. They read through a words map, falling back to "a patient list" or "another setting".
- **The home banner** is mounted by `AppShell` on `/hospitals` (where `/` redirects), and by the audit view on every tab.
- **"Platform actions show in a hospital's Activity as 'Measured Health · platform admin'"** is a backend duty. The server substitutes that actor name for the hospital audience, so the clinical app needs no change.
- **The demo** mirrors none of the session's platform actions into the audit sample. Its log is the seeded sample plus the reads, exports and checks made in the session.
- **Demo ZIP.** The named-access package is built by a small stored (uncompressed) ZIP writer used only by the mock (`lib/api/demo-zip.ts`), so no new dependency is needed.
- **`StepUpDialog`** gains two optional props, `noteMax` and `reference`. **`@mhai/ui/csv`** gains `downloadBlob`, which `downloadCsv` then calls. Both are backward compatible.
- **Plan 9b cut line** (spec §14). If the PR grows too large, Tasks 7 and 9 (Integrity, and Named access) move to a second PR, with Task 4's bell item following Task 7.

## Review Focus

1. **A malformed or over-sharing entry.** Examples: a patient target with a `name`, a `note` on a kind that allows none, an unknown `facts` key, a 7-character "hash". Each shows "This entry can't be displayed · {id} · #{seq}", is reported once (not on every render or page), and never shows raw text. The rest of the page carries on. Tasks 2 and 5 test it.
2. **A check that says intact without proof.** A reply with `entries_checked: 0`, a missing `to_at`, `from_checkpoint: null` without `from_first`, or `state: "intact"` with `finished_at: null` shows Couldn't check, "The reply wasn't what was expected.", and Try again. Never Intact. Tasks 2 and 7 test it.
3. **A two-step code entered, then `too_many_rows`.** The dialog leaves the code step and says "62,310 entries match. Exports stop at 50,000 rows. Narrow the dates or filters." It makes no file and no ready step, and the code isn't kept. Task 8 tests it.
4. **The 26-hour edge, and a page left open.** A check exactly 26 h old still reads "checked …". One minute later it reads "Not checked since …", using the shared clock (`useNow`), without a reload. Tasks 2 and 7 test it.
5. **A date range reaching past the oldest entry kept, with nothing in range.** The page shows the gap line and "Nothing matches these filters" together. A custom range whose From is after its To, or whose To is in the future, is refused with "Choose a From date on or before the To date." or "The To date can't be in the future.". Tasks 2 and 5 test it.

---

## File structure

```text
apps/platform/lib/api/audit-contract.ts     types, AuditClient, TooManyRowsError (Task 1)
apps/platform/lib/api/live-audit.ts         liveAudit(ok, fetchImpl) (Task 1)
apps/platform/lib/api/contract.ts           PlatformClient extends AuditClient (Task 1)          SHARED
apps/platform/lib/api/live.ts               ...liveAudit(...) (Task 1)                           SHARED
apps/platform/app/api/v1/[...path]/route.ts SHAPES, AUDITOR_WRITES, problem(), file type (Task 1) SHARED
apps/platform/lib/audit/kinds.ts            types, kinds table, words maps (Task 2)              Plans 8/11 add kinds
apps/platform/lib/audit/read.ts             readAuditEvent, readRun, readStatus, readExport (Task 2)
apps/platform/lib/audit/integrity.ts        integrityOf, headerLine, runSentence, bannerOn (Task 2)
apps/platform/lib/audit/words.ts            eventLine, whoLine, outcomeWords, filtersInWords, countWords, gapLine (Task 2)
apps/platform/lib/audit/dates.ts            rangeOf, checkCustomRange (Task 2)
apps/platform/lib/audit/file.ts             auditFile (reference builder for the server; used by the mock) (Task 2)
apps/platform/lib/audit/nav.ts              openAuditAt, takeAuditTab (Task 2)
apps/platform/lib/api/audit-fixtures.ts     the sample log, people, letters, runs (Task 3)
apps/platform/lib/api/mock-audit.ts         createMockAudit(deps) (Task 3)
apps/platform/lib/api/demo-zip.ts           storedZip(files) (Task 3)
apps/platform/lib/api/mock.ts               `audit` option + spread (Tasks 3, 4)                  SHARED
apps/platform/lib/api/notifications-contract.ts, lib/analytics/read.ts, components/notifications/* (Task 4)  SHARED with 7d
apps/platform/lib/queries/audit.ts          hooks (Tasks 5–9)
apps/platform/lib/queries/keys.ts           `audit` root (Task 5)                                SHARED
apps/platform/components/audit/*.tsx        the page (Tasks 5–9)
apps/platform/app/(app)/audit/page.tsx      (Task 5)
apps/platform/components/shell/nav.ts       Audit log link (Task 5)                              SHARED
apps/platform/components/shell/app-shell.tsx  home banner (Task 7)                             SHARED
apps/platform/components/hospitals/step-up-dialog.tsx  noteMax, reference (Task 8)            SHARED
apps/platform/lib/errors.ts                 too_many_rows, gone wording (Task 8)                 SHARED
packages/ui/src/csv.ts                      downloadBlob (Task 8)
apps/platform/tests/e2e/audit.spec.ts, helpers.ts, security.spec.ts (Task 10)                    helpers/security SHARED
```

---

### Task 1: The audit contract, live client and proxy paths

**Files:**

- Create: `apps/platform/lib/api/audit-contract.ts`, `apps/platform/lib/api/live-audit.ts`.
- Modify:
  - `lib/api/contract.ts`: `export interface PlatformClient extends AuditClient`, plus its import;
  - `lib/api/live.ts`: spread `...liveAudit(ok, fetchImpl)` into the returned client;
  - `lib/api/live.test.ts`;
  - `app/api/v1/[...path]/route.ts` and `app/api/v1/proxy.test.ts`.

**Interfaces (`audit-contract.ts`):**

```ts
export const AUDIT_TYPES = ["sign_in","account","staff","hospital_settings","consultation","review",
  "alerts","analysis","named_access","platform","export","audit","retention","security"] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];
export type Outcome = "succeeded" | "refused" | "failed";
export type ActorKind = "staff" | "platform" | "system";
export type ActorRole = "clinician" | "reviewer" | "hospital_admin" | "platform_admin" | "auditor" | "system";
export type AuditActor = { id: string; name: string; role: ActorRole; kind: ActorKind };
export type AuditHospital = { id: string; name: string; removed: boolean };
export type AuditTarget =
  | { kind: "staff" | "hospital" | "setting" | "clearance" | "team_member" | "change" | "hold"; id: string; name?: string }
  | { kind: "export" | "run" | "event" | "session"; id: string }
  | { kind: "patient"; pseudonym: string };
export type SearchedKind = "event" | "request" | "export" | "clearance" | "pseudonym";
export type RunState = "running" | "intact" | "broken" | "error";
export type AuditFilters = {
  hospital?: string;            // a hospital id, or "platform"
  person?: string;              // a person id from the picker
  type?: AuditType[];
  outcome?: Outcome;
  flagged?: boolean;
  from?: string; to?: string;   // ISO instants, [from, to)
  q?: string;                   // an exact id or pseudonym
};
export type AuditFacts = {
  specialty?: string; confidence?: "high" | "medium" | "low";
  view?: string; location_type?: string; from?: string; to?: string; patient_count?: number;
  purpose?: "clinical_follow_up" | "quality_improvement" | "audit" | "other";
  purged_count?: number; before?: string; checkpoint_id?: string; incident_ref?: string;
  filters?: AuditFilters; searched?: string; searched_kind?: SearchedKind;
  rows?: number; capped?: boolean; checksum?: string;
  state?: RunState; first_broken_seq?: number;
};
export type AuditEvent = {
  id: string; seq: number; hash: string; at: string;
  actor: AuditActor; hospital: AuditHospital | null;
  type: AuditType; kind: string; target: AuditTarget | null; outcome: Outcome;
  ip: string | null; device: string | null; flag: "security" | "policy" | null;
  reason: string | null; note: string | null;
  refs: { clearance_id: string | null; export_id: string | null; request_id: string | null };
  facts: AuditFacts; after_break: boolean;
};
export type LetterStatus = "checking" | "refused" | "waiting" | "active" | "rejected" | "ended" | "revoked";
export type Letter = { id: string; status: LetterStatus; valid_from: string; valid_to: string; verified_by: Person | null };
export type AuditDetail = AuditEvent & { patients: { count: number } | null; letter: Letter | null };
export type Checkpoint = { id: string; at: string; purged_count: number; before: string;
  kind: "retention" | "re_anchor"; incident_ref: string | null; reason: string };
export type AuditList = { events: AuditEvent[]; next_cursor: string | null; total: number;
  total_capped: boolean; oldest_kept_at: string; last_checkpoint: Checkpoint | null };
export type AuditPerson = { id: string; name: string; email: string; role: ActorRole; kind: ActorKind;
  hospital: Person | null };
export type NamedAccessFilters = { hospital?: string; person?: string; clearance?: string; from?: string; to?: string };
export type NamedAccessList = { events: (AuditEvent & { letter: Letter })[]; next_cursor: string | null };
export type ExportKind = "events" | "named_access";
export type ExportReason = "legal_request" | "hospital_request" | "regulator_request"
  | "internal_review" | "security_investigation" | "other";
export type ExportIn = { kind: ExportKind; filters: AuditFilters | NamedAccessFilters;
  reason: ExportReason; note?: string; reference?: string } & StepUp;
export type ExportOut = { export_id: string; rows: number; capped: boolean; checksum: string;
  expires_at: string; file_name: string };
export type ExportRecord = { id: string; kind: ExportKind; by: Person; at: string; reason: ExportReason;
  note: string | null; reference: string | null; filters: AuditFilters | NamedAccessFilters;
  filter_names: { hospital: string | null; person: string | null; clearance: string | null };
  rows: number; capped: boolean; checksum: string; expires_at: string; downloaded_at: string | null };
export type VerifyRun = { id: string; started_at: string; finished_at: string | null; by: Person | null; // null: the daily schedule
  state: RunState; entries_checked: number | null; from_checkpoint: Checkpoint | null; from_first: boolean;
  to_seq: number | null; to_at: string | null; first_broken_seq: number | null; first_broken_at: string | null;
  error_code: "timed_out" | "unreachable" | "unexpected_reply" | null;
  outcome: { note: string; by: Person; at: string } | null; version: number };
export type IntegrityStatus = { latest: VerifyRun | null; running: VerifyRun | null; open_failure: VerifyRun | null;
  security_contact: { name: string; email: string }; oldest_kept_at: string };
export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_NOTE_MAX = 200;
export const EXPORT_REFERENCE_MAX = 60;
export const OUTCOME_NOTE_MAX = 1000;
export class TooManyRowsError extends ApiError { constructor(readonly rows: number) /* 422 too_many_rows */ }

export interface AuditClient {
  listAudit(f: AuditFilters, cursor?: string): Promise<AuditList>;
  getAuditEvent(id: string): Promise<AuditDetail>;
  getAuditPatients(id: string): Promise<{ pseudonyms: string[] }>;
  searchAuditPeople(q: string): Promise<{ people: AuditPerson[] }>;
  listAuditHospitals(): Promise<{ hospitals: AuditHospital[] }>;
  reportUndisplayable(ids: string[], opts: WriteOpts): Promise<void>;
  listNamedAccess(f: NamedAccessFilters, cursor?: string): Promise<NamedAccessList>;
  createExport(body: ExportIn, opts: WriteOpts): Promise<ExportOut>;   // 422 too_many_rows → TooManyRowsError
  downloadExport(id: string): Promise<Blob>;                           // 410 gone after once or expires_at
  listExports(cursor?: string): Promise<{ exports: ExportRecord[]; next_cursor: string | null }>;
  startCheck(opts: WriteOpts): Promise<{ run_id: string }>;            // the running one if any
  getIntegrityStatus(): Promise<IntegrityStatus>;
  listRuns(cursor?: string): Promise<{ runs: VerifyRun[]; next_cursor: string | null }>;
  getRun(id: string): Promise<VerifyRun>;
  addOutcome(runId: string, body: { note: string; version: number }, opts: WriteOpts): Promise<VerifyRun>;
}
```

`Person`, `StepUp` and `WriteOpts` are imported from `./contract` as types only. `contract.ts` imports `AuditClient` as a type only, so there is no cycle at runtime.

**Proxy shapes** (append to `SHAPES`):

| Method | Path                                      | Auditor may write |
| ------ | ----------------------------------------- | ----------------- |
| GET    | `platform/audit`                          |                   |
| GET    | `platform/audit/people`                   |                   |
| GET    | `platform/audit/hospitals`                |                   |
| GET    | `platform/audit/{id}`                     |                   |
| GET    | `platform/audit/{id}/patients`            |                   |
| POST   | `platform/audit/undisplayable`            | yes               |
| GET    | `platform/audit/named-access`             |                   |
| GET    | `platform/audit/exports`                  |                   |
| POST   | `platform/audit/exports`                  | yes               |
| GET    | `platform/audit/exports/{id}/file`        |                   |
| POST   | `platform/audit/verify`                   | yes               |
| GET    | `platform/audit/verify/status`            |                   |
| GET    | `platform/audit/verify/runs`              |                   |
| GET    | `platform/audit/verify/runs/{id}`         |                   |
| POST   | `platform/audit/verify/runs/{id}/outcome` | yes               |

- The words `people`, `hospitals`, `undisplayable`, `named-access`, `exports` and `verify` are reserved by the existing `RESERVED` rule, so none of them is ever read as an `{id}`.
- `problem()`: a 422 with `code: "too_many_rows"` and an integer `rows` forwards `{code, rows}`.
- The file shape is passed through only when the upstream `Content-Type` starts with `text/csv` or `application/zip`. Anything else gives 502 `{code: "bad_gateway"}`. It also gets `Cache-Control: no-store`.

**Live paths:** the same, under `/platform`.

- The query strings come from `query()`. `type` is joined with commas, and `flagged` is sent only when true, as `flagged=true`.
- `limit=50` is always sent on `listAudit`.
- `downloadExport` uses `fetchImpl("/api/v1/platform/audit/exports/{id}/file", {credentials: "same-origin", cache: "no-store"})`. A 401 calls `reportUnauthorized`; any other non-ok status reads `{code}` and throws `ApiError`; ok returns `res.blob()`.
- In `ok()`, a 422 `too_many_rows` throws `TooManyRowsError(data.rows)`.

- [ ] **Step 1: Write the failing tests**
  - `live.test.ts`:
    - "every audit method uses its path and method";
    - "listAudit sends type as a comma list, flagged only when true, and limit=50";
    - "writes carry an Idempotency-Key";
    - "too_many_rows becomes TooManyRowsError with rows";
    - "downloadExport returns the blob, and a 410 throws ApiError gone".
  - `proxy.test.ts`:
    - "the 15 audit shapes are accepted";
    - "an auditor may POST exports, verify, outcome and undisplayable";
    - "an auditor still can't PUT the analytics email";
    - "`platform/audit/named-access` is not read as an event id, and nor is `verify`";
    - "`platform/audit/a.b` is 404";
    - "a 422 too_many_rows forwards rows and nothing else";
    - "the file shape streams text/csv and application/zip with no-store";
    - "the file shape refuses text/html with 502".
- [ ] **Step 2: Run them to see them fail** (remote): `npm test -w @mhai/platform -- live proxy`. They fail on the missing methods and shapes.
- [ ] **Step 3: Implement** the contract, `liveAudit`, and the proxy rows and rules.
- [ ] **Step 4: Run** the platform tests, lint and typecheck (remote). They pass. The typecheck fails only on `createMockPlatform` lacking the audit methods, so add a temporary `...unimplementedAudit()` in `mock.ts` that throws `ApiError(503, "unavailable")` for each method. Task 3 replaces it.
- [ ] **Step 5: Commit:** "Add the audit log contract, live client and proxy paths".

---

### Task 2: The audit rules: kinds, the fail-closed reader, integrity, words, dates and the file

**Files:**

- Create, each with a test: `apps/platform/lib/audit/kinds.ts`, `read.ts`, `integrity.ts`, `words.ts`, `dates.ts`, `file.ts`, `nav.ts`.

**Interfaces:**

- **`kinds.ts`** exports:
  - `TYPE_WORDS: Record<AuditType, string>`, which is Sign-in, Account, Staff and roles, Hospital settings, Consultation, Review, Alerts, Analysis, Named access, Platform, Export, Audit, Retention, Security;
  - `KINDS: Record<string, {type: AuditType; note: boolean; words(e: AuditEvent): string}>`;
  - `REASON_WORDS: Record<string, string>`, the closed list below;
  - `ROLE_WORDS`, `LETTER_STATUS_WORDS`, `VIEW_WORDS` and `LOCATION_WORDS`.

  The kinds:

  | Type              | Kind → words (`{t}` target name, `{h}` hospital, `{n}` count). `*` allows a note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
  | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | sign_in           | `signed_in` Signed in · `sign_in_refused` Sign-in refused · `sign_in_locked` Sign-in locked after too many tries · `signed_out` Signed out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
  | account           | `password_changed` Changed their password · `two_step_set_up` Set up two-step · `backup_codes_made` Made new backup codes · `device_signed_out` Signed out a device                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
  | staff             | `staff_invited` Invited {t} · `staff_role_changed` Changed {t}'s role · `staff_deactivated` Deactivated {t} · `staff_reactivated` Reactivated {t} · `own_role_change_refused` Tried to change their own role · `team_invited` Invited {t} to the platform team · `team_role_changed` Changed {t}'s platform role · `team_removed` Removed {t} from the platform team                                                                                                                                                                                                                                                                                              |
  | hospital_settings | `hospital_added` Added {h} · `hospital_updated` Updated {h}'s details · `hospital_deactivated`\* Deactivated {h} · `hospital_reactivated` Reactivated {h} · `removal_requested` Asked to remove {h} · `removal_approved` Approved removing {h} · `removal_cancelled` Cancelled removing {h} · `hospital_removed` Removed {h} · `sso_updated` Changed single sign-on for {h} · `sso_tested` Tested single sign-on for {h} · `setting_changed` Changed {t}                                                                                                                                                                                                          |
  | consultation      | `question_asked` Asked a question · {specialty} · {confidence} confidence · `answer_sent_for_review` Answer sent for review · {specialty}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | review            | `review_submitted` Submitted a review · `review_reassigned` Reassigned a review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
  | alerts            | `alert_acknowledged` Acknowledged an alert · `alert_escalated` Escalated an alert                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
  | analysis          | `analysis_viewed` Opened Analysis · `drilldown_deidentified` Opened a de-identified patient list · {n} patients                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
  | named_access      | `drilldown_named` Opened a named patient list · {n} patients · `letter_uploaded` Uploaded clearance letter {t} · `letter_refused` A clearance letter file was refused · `letter_verified` Verified clearance letter {t} · `letter_rejected` Rejected clearance letter {t} · `letter_narrowed` Narrowed clearance letter {t} · `letter_revoked` Revoked clearance letter {t} · `letter_ended` Clearance letter {t} ended · `letter_viewed` Viewed clearance letter {t} · `letter_reminder_sent` Sent a reminder about clearance letter {t} · `named_switch_changed` Changed the named access switch · `verify_refused` Tried to verify their own hospital's letter |
  | platform          | `change_followed_up`\* Marked “{t}” followed up · `change_follow_up_undone` Undid the follow-up on “{t}” · `analytics_email_changed` Changed their analytics email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
  | export            | `audit_exported`\* Exported the audit log · {rows} rows · `named_access_exported`\* Exported named access for a legal request · `export_downloaded` Downloaded export {export_id} · `export_download_refused` Tried to download export {export_id} again · `activity_exported` Exported a hospital's Activity                                                                                                                                                                                                                                                                                                                                                     |
  | audit             | `audit_viewed` Viewed the audit log · `audit_searched` Searched the audit log by {searched_kind words} · `audit_event_opened` Opened entry #{target seq or id} · `audit_patients_viewed` Showed patient ids for an entry · `audit_check_run` Ran the integrity check (a `system` actor: "Daily integrity check") · `audit_check_outcome`\* Recorded the outcome of a failed check · `audit_undisplayable_reported` Reported an entry that couldn't be displayed                                                                                                                                                                                                   |
  | retention         | `retention_run` Retention removed {purged_count} entries before {before} · `retention_checkpoint` Wrote a retention checkpoint · `re_anchor` Re-anchored the log after incident {incident_ref} · `hold_placed` Placed a legal hold on {h} · `hold_lifted` Lifted a legal hold on {h}                                                                                                                                                                                                                                                                                                                                                                              |
  | security          | `step_up_refused` Two-step code refused · `mfa_locked` Locked after too many wrong codes · `session_revoked` Session ended by an admin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

  The reasons are the closed list:
  - deactivation: `contract_ended`, `security_concern`, `hospital_request`, `other`;
  - export: `legal_request`, `regulator_request`, `internal_review`, `security_investigation`, plus the shared `hospital_request` and `other`;
  - purpose: `clinical_follow_up`, `quality_improvement`, `audit`;
  - refusal: `wrong_role`, `wrong_code`, `locked`, `not_covered`, `same_side`, `gone`.

  `searched_kind` words: "event id", "request id", "export id", "clearance id", "patient id".

- **`read.ts`:**
  - `readAuditEvent(raw: unknown): {ok: true; event: AuditEvent} | {ok: false; id: string | null; seq: number | null}`. It is strict: every key in its known set, nothing else, at every level. The rules:
    - ids match `ID`;
    - `seq` is a positive safe integer;
    - `hash` is `/^[0-9a-f]{64}$/`;
    - `at` is a valid ISO time;
    - `actor.role` and `actor.kind` come from their lists, and `name` is 1–120 characters;
    - `type` is in `AUDIT_TYPES`; `kind` is in `KINDS` and its `type` matches;
    - `outcome` is in its list;
    - `ip` is IPv4 or IPv6, or null;
    - `device` is at most 80 characters of `/^[\w .,()/;:+-]*$/`, or null;
    - `flag` is in its list;
    - `reason` is in `REASON_WORDS`, or null;
    - `note` is null unless `KINDS[kind].note`, then 1–500 characters;
    - `target`: a `name` only on the named kinds, at most 120 characters; a patient target has only `kind` and `pseudonym` (`ID`);
    - `facts`: only the known keys, each of its type; codes match `^[a-z][a-z_]{0,39}$`; `searched` matches `ID`;
    - `after_break` is a boolean.
  - `readAuditList(raw): {events: AuditRow[]; …rest}`, where `AuditRow = ReturnType<typeof readAuditEvent>`. If the envelope (`next_cursor`, `total`, `total_capped`, `oldest_kept_at`, `last_checkpoint`) is the wrong shape, it throws `ApiError(0, "bad_reply")`, and the page shows "Couldn't load the audit log".
  - `readDetail`, `readNamedAccess`, `readExportRecord`, `readRun` and `readStatus` work the same way. A run that fails its shape becomes `{…, state: "error", error_code: "unexpected_reply"}`, keeping `id` and `started_at` when those read. It is never dropped and never Intact.
  - `integrityNotificationOk(n: unknown): boolean`, used by Task 4.
- **`integrity.ts`:**
  - `type Shown = "intact" | "broken" | "couldnt_check" | "checking"`;
  - `integrityOf(run: VerifyRun): Shown`, which is `"intact"` only under the proof rule in Global Constraints;
  - `STALE_MS = 26 * 3_600_000`;
  - `headerLine(s: IntegrityStatus, now: number): {tone: "ok" | "warn" | "bad"; words: string}`. In order of precedence:
    - `open_failure` gives bad, "Integrity: Broken · failed {d MMM yyyy}";
    - `running` gives ok, "Integrity: Checking…";
    - no `latest` gives warn, "Integrity: Not checked yet";
    - `latest` not provably intact gives warn, "Integrity: Couldn't check · {when}";
    - an age over `STALE_MS` gives warn, "Integrity: Not checked since {d MMM yyyy}";
    - otherwise ok, "Integrity: Intact · checked {HH:mm today | d MMM, HH:mm}";
  - `runSentence(run: VerifyRun): string`, with spec §8.1's exact copy;
  - `coverageLine(run): string | null`, e.g. "Entries before 3 Jan 2021 were removed by retention (412,006 entries, checkpoint of 4 Jan 2027).";
  - `errorWords(code)`: `timed_out` gives "It timed out.", `unreachable` gives "The log couldn't be reached.", and `unexpected_reply` or null gives "The reply wasn't what was expected.";
  - `bannerOn(s: IntegrityStatus | undefined): {on: boolean; date: string | null}`. It is on when `open_failure` is set or `latest` is broken.
- **`words.ts`:**
  - `eventLine(e: AuditEvent): string`;
  - `whoLine(a: AuditActor): string`, e.g. "Ada Bakare · Platform admin · Measured Health", "Dr N. Eze · Clinician · Hospital staff" or "System";
  - `hospitalWords(h: AuditHospital | null): string`, giving the name, "{name} (removed)" or "Platform";
  - `outcomeWords(o, reason?)`, e.g. "Refused · wrong code";
  - `countWords(total, capped)`, giving "1 event", "1,284 events" or "More than 10,000 events";
  - `filtersInWords(f: AuditFilters | NamedAccessFilters, names): string`, e.g. "All hospitals · 23 Sep–22 Oct 2026 · Sign-in, Security · Refused · Flagged only";
  - `gapLine(from: string | undefined, oldestKeptAt: string, cp: Checkpoint | null): string | null`. It returns "Entries before {d MMM yyyy} were removed by retention on {cp.at d MMM yyyy} (checkpoint recorded)." when `from` (or no `from`) reaches before `oldestKeptAt`, falling back to "Entries before {date} are no longer kept." when there is no checkpoint;
  - `utc(iso)`, e.g. "22 Oct 2026 06:00 UTC".
- **`dates.ts`:**
  - `type Preset = "today" | "7d" | "30d" | "12m" | "custom"`; `DEFAULT_PRESET = "30d"`;
  - `rangeOf(p: Exclude<Preset, "custom">, now: number): {from: string; to: string}`, with local midnights and `to` as the next local midnight;
  - `checkCustomRange(fromDay: string, toDay: string, now: number): {from, to} | {error: string}`, using the two error lines from Review Focus 5.
- **`file.ts`:** `auditFile({kind, exportId, by, at, reason, note, reference, filtersWords, rows: unknown[], demo: boolean, capped}): string`. Built with `toCsv`:
  - the first rows are `Demo,Sample data – not a real export` (demo only), then `Export id`, `Made by`, `Made at (UTC)`, `Reason`, `Reference`, `Filters`, `Rows`, `Capped`, then a blank row;
  - the table's columns are Position, Fingerprint, Time (UTC), Who, Role, Kind, Hospital, Action type, Action, Target, Outcome, IP address, Device, Flags, Reason, Note, Clearance, Export, Request, After an integrity failure;
  - named-access files add View, Patients and Patient ids (`;`-joined) after Action;
  - a row that fails `readAuditEvent` writes its id, its seq and "Not displayable" in Action, with the other cells empty.
- **`nav.ts`:** `type AuditTab = "events" | "named" | "exports" | "integrity"`; `openAuditAt(tab: AuditTab, named?: NamedAccessFilters): void`; `takeAuditTab(): {tab: AuditTab; named?: NamedAccessFilters} | null`. A module variable, read once.

- [ ] **Step 1: Write the failing tests**
  - kinds:
    - "every kind maps to one of the 14 types";
    - "Deactivated Northgate General Hospital";
    - "Opened a named patient list · 12 patients";
    - "Asked a question · Cardiology · Medium confidence";
    - "a system check run reads Daily integrity check".
  - read (Review Focus 1):
    - "a well-formed event reads";
    - "a patient target with a name is undisplayable";
    - "a note on signed_in is undisplayable";
    - "an unknown key in facts is undisplayable";
    - "a 7-character hash is undisplayable";
    - "an unknown kind or reason is undisplayable";
    - "an undisplayable row keeps its id and seq, and never its text";
    - "a bad envelope throws bad_reply";
    - "a run of the wrong shape reads as error with unexpected_reply".
  - integrity (Review Focus 2, 4):
    - "intact needs entries_checked > 0, a start, to_seq, to_at and finished_at";
    - "each missing piece gives couldnt_check";
    - "from_first counts as a start";
    - "header: exactly 26 h old reads checked, 26 h 1 min reads Not checked since 21 Oct 2026";
    - "open_failure outranks a later Intact";
    - "running reads Checking…";
    - "runSentence gives spec §8.1's Intact and Broken sentences word for word, using 1,204,331 / 4 Jan 2027 / 9,881,204 / 22 Oct 2026 06:00 UTC and 9,880,117 / 21 Oct 2026 23:14 UTC";
    - "a re-anchor reads 'checked from the re-anchor of {date} after incident INC-0042'";
    - "errorWords for the three codes";
    - "bannerOn for an open_failure and for a broken latest".
  - words:
    - "countWords 1, 1284, capped";
    - "whoLine for staff, platform and system";
    - "a removed hospital reads '(removed)'";
    - "gapLine before the oldest entry, with and without a checkpoint, and null inside the range" (Review Focus 5);
    - "filtersInWords lists every set filter".
  - dates:
    - "presets give local-midnight bounds";
    - "custom From after To is refused";
    - "custom To in the future is refused";
    - "custom one day gives [d, d+1)".
  - file:
    - "the header rows carry export id, who, when (UTC), reason, reference, filters and Demo";
    - "an undisplayable row writes Not displayable";
    - "no cell carries a name for a patient target";
    - "named-access files list pseudonyms";
    - "formula-like cells are escaped" (via `csvCell`).
  - nav: "a tab handed off is taken once".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Use `@mhai/ui/csv` (`toCsv`), and `dateLabel` and `formatWhen` from the app.
- [ ] **Step 4: Run** the platform tests and lint. They pass.
- [ ] **Step 5: Commit:** "Add the audit rules: fail-closed reading, integrity, words and the file".

---

### Task 3: The sample log and the mock

**Files:**

- Create: `apps/platform/lib/api/audit-fixtures.ts`, `mock-audit.ts`, `demo-zip.ts`, and `mock-audit.test.ts`.
- Modify: `lib/api/mock.ts`. It replaces Task 1's `unimplementedAudit()` with `...createMockAudit({now, you, wait, codes: checkCode, opts: audit})` and adds the option below.

**Interfaces:**

- `createMockPlatform({… audit?: AuditMockOptions})`, where:

  ```ts
  type AuditMockOptions = {
    integrity?: "intact" | "broken" | "error" | "unproven" | "stale";
    bad?: boolean; // two malformed sample events
    matchCount?: number; // overrides total, total_capped and the export row count
    unavailable?: boolean; // every audit read → 503
  };
  ```

  The default is `{integrity: "intact"}`.

- `createMockAudit(deps): AuditClient & { notifications(): IntegrityNotification[] }`. The second member is for Task 4.
- `storedZip(files: {name: string; data: Uint8Array}[]): Uint8Array`: stored entries with CRC-32, a local header, a central directory and an end record.

**The sample log** (`seedAudit(now)`, newest first, about 240 events over 13 months, `seq` from 9,880,000):

- every demo hospital, plus "Old Mill Clinic" (`h_oldmill`, `removed: true`);
- sign-ins: some refused (`wrong_code`), and one `sign_in_locked` with the Security flag;
- staff changes, and one `own_role_change_refused` (Security);
- consultations with specialty and confidence only;
- Westfield's deactivation (`contract_ended`), and Old Mill's removal;
- de-identified drill-downs, and three named drill-downs at Northgate under letter `cl_northgate_2026` (active, verified by Tunde Okafor), each with `patient_count` and 3–12 pseudonyms like `p_ng_7f3a2c`;
- two past exports, Tunde's analytics follow-up, retention runs, and checkpoint `cp_2026_10` (`before` = now − 6 years, `purged_count` 412,006);
- `oldest_kept_at` = the checkpoint's `before`.

Fingerprints are deterministic 64-hex values from a small synchronous FNV-based expander over seq and id. They are sample data, not security; only export checksums use real SHA-256.

**Mock rules:**

- **Reads** need a signed-in team member (either role):
  - `listAudit` applies every filter (`q` matches an event id, a `refs` id or a pseudonym exactly) in pages of 50;
  - it adds `audit_viewed` (or `audit_searched` with `facts.searched` and `searched_kind`) **only when** the person's filter set differs from their last one. A cursor never adds one;
  - `getAuditEvent` adds `audit_event_opened`; `getAuditPatients` adds `audit_patients_viewed`;
  - `searchAuditPeople` needs q of at least 2 characters (422 `invalid` otherwise) and matches folded name or email.
- **Audit writes** (`reportUndisplayable`, `createExport`, `startCheck`, `addOutcome`) are allowed for both roles, except `addOutcome`, where a platform admin gets 403 `forbidden`. They use the same Idempotency-Key replay as `write()`.
- **`createExport`:**
  - `requireStepUp` first;
  - the reason must be in the list; `other` needs a note of 1–200 characters; a reference is at most 60 characters. Otherwise 422 `invalid`;
  - named access needs `filters.hospital`, and a clearance or dates;
  - over 50,000 rows gives 422 `too_many_rows` with `rows`, as a `TooManyRowsError`;
  - it writes `audit_exported` or `named_access_exported` **before** building the file;
  - the file is `auditFile(..., demo: true)` (a ZIP of the CSV plus `letter-{id}.txt` placeholders for named access);
  - `checksum` is the hex SHA-256 from `crypto.subtle`;
  - `expires_at` is now + 15 min.
- **`downloadExport`:** the first call before `expires_at` returns the Blob and writes `export_downloaded`. Any later call gives 410 `gone` and writes `export_download_refused` (Refused).
- **Integrity:**
  - **`intact`:** the latest run is the last 06:00 UTC at or before `now()`, by the schedule (`by: null`), from `cp_2026_10` to the newest seq.
  - **`stale`:** the same run, but 30 h old.
  - **`broken`:** the latest run is broken at `first_broken_seq` = newest − 40. Events from there on have `after_break: true`, `open_failure` is that run, and `notifications()` returns one integrity item.
  - **`error`:** `startCheck` runs finish as `error`, `timed_out`.
  - **`unproven`:** runs finish `intact` with `entries_checked: 0`.
  - **`startCheck`:** returns the running run's id if there is one. Otherwise it starts one, which shows `running` (with `entries_checked` growing) until 1.5 s of the mock clock have passed, then finishes in the mode's state and writes `audit_check_run`.
  - **`addOutcome`:** broken runs only (409 `conflict` otherwise), with a version check and a note of 1–1000 characters. It writes `audit_check_outcome`.
- **`bad`** adds a patient target with a `name`, and a `note` on `signed_in`.
- **`unavailable`** makes every audit read throw `ApiError(503, "unavailable")`.

- [ ] **Step 1: Write the failing tests** (`mock-audit.test.ts`, with a fake clock and `delayMs: 0`):
  - "events come newest first in pages of 50, with total and oldest_kept_at";
  - "each filter narrows: hospital, platform, person, types, outcome, flagged, dates";
  - "q finds an event by request id and by pseudonym";
  - "a new filter set adds one audit_viewed; Load more and the same set add none";
  - "a pseudonym search adds audit_searched with searched_kind pseudonym";
  - "opening an event and showing patient ids each add an entry";
  - "people search needs 2 characters";
  - "an export needs a reason, a note for Other (≤ 200) and a code";
  - "an export over 50,000 rows is TooManyRowsError (matchCount 62,310)";
  - "the export entry is written before the reply";
  - "the file starts with Demo and the export id, and its checksum matches";
  - "a second download is 410 gone and adds a refused entry";
  - "a download after 15 minutes is 410";
  - "the named-access export is a ZIP holding the CSV and the letters";
  - "startCheck returns the running run while one runs, then finishes intact with a full range";
  - "broken mode marks events after the break and sets open_failure";
  - "unproven mode finishes with entries_checked 0";
  - "only an auditor adds an outcome, and only to a broken run";
  - "the bad option adds two events that readAuditEvent refuses";
  - "an auditor's audit writes are allowed; their hospital writes are still 403".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** the fixtures, the mock and the ZIP writer. (If Task 2 isn't merged yet, do the export step last, once it is.)
- [ ] **Step 4: Run** the platform tests (remote). Every existing mock test passes unchanged.
- [ ] **Step 5: Commit:** "Add the sample audit log and its mock".

---

### Task 4: The bell's integrity item

**Files:**

- Modify:
  - `lib/api/notifications-contract.ts`: the `kind` union;
  - `lib/analytics/read.ts` (`notificationOk` dispatches on `kind`; `audit_integrity` goes to `integrityNotificationOk`);
  - `lib/queries/notifications.ts` (`read`);
  - `components/notifications/notifications-list.tsx` and `bell.tsx`;
  - `lib/api/mock.ts` (`listNotifications` puts `mockAudit.notifications()` first; `markSeen` covers their ids);
  - `bell.test.tsx` and `mock-notifications.test.ts`.

**Interfaces:**

- `type Notification = ChangeNotification | IntegrityNotification`, where:
  - `ChangeNotification` is today's shape with `kind?: "analytics_change"`;
  - `IntegrityNotification = {kind: "audit_integrity"; id; run_id; first_broken_seq: number; at; seen}`.
- **The list item:** "⚠ The audit log failed its integrity check", then "Platform · {atLabel} · Security", then "· New" when fresh.
- **Opening it** calls `openAuditAt("integrity")`, then `router.push("/audit")`, with no query string.
- `changeLine` is only called for change items.

- [ ] **Step 1: Write the failing tests**
  - "a broken mock shows the integrity item first, with its words";
  - "opening it goes to /audit with the Integrity tab handed off, and no query string";
  - "a malformed integrity item fails the whole list closed";
  - "an item without kind still reads as an analytics change";
  - "Mark all seen clears the integrity item too";
  - "an auditor sees it".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the platform tests and lint. Every Plan 7d bell test passes unchanged.
- [ ] **Step 5: Commit:** "Tell the bell about a failed integrity check".

---

### Task 5: The Audit log page and the Events tab

**Files:**

- Create:
  - `apps/platform/app/(app)/audit/page.tsx`;
  - `components/audit/audit-view.tsx`, `audit-tabs.tsx`, `events-tab.tsx`, `event-filters.tsx`, `person-picker.tsx`, `events-list.tsx`, `audit-footer.tsx`;
  - `lib/queries/audit.ts`;
  - tests.
- Modify:
  - `components/shell/nav.ts`: **Audit log**, `/audit`, `ScrollText`, after Activity;
  - `lib/queries/keys.ts`: `audit: ["audit"]`;
  - `app-shell.test.tsx`: the sidebar order.

**Interfaces:**

- **Hooks:**
  - `useAuditEvents(f: AuditFilters)`: an infinite query keyed `[audit, "events", f]`. `select` maps pages through `readAuditList`, and `refetchOnMount: "always"`;
  - `useAuditPeople(q: string)`: enabled at 2 or more characters, debounced 250 ms;
  - `useAuditHospitals()`;
  - `useIntegrityStatus()`: refetches every 60 s while visible and online, and every 2 s while `running`. Tasks 7 and 8 use it too;
  - `useReportUndisplayable(rows: AuditRow[])`: reports the ids of failed rows once per id per tab (a module `Set`), in batches of at most 50, ignoring errors.
- **`AuditView`:**
  - the header: "Audit log", the integrity line (`headerLine`, a button that opens Integrity), and a slot for Export CSV (Task 8);
  - `AuditTabs` holds `tab` state, starting from `takeAuditTab()` or `"events"`. It renders Events in this task; Tasks 7–9 each add their tab to the `TABS` array;
  - the banner slot (Task 7);
  - `AuditFooter`, which takes `oldest_kept_at` from `useIntegrityStatus`.
- **`EventFilters`** (state lives in `AuditView`, so it survives tab switches):
  - **Hospital:** All hospitals, Platform only, then each hospital, with "(removed)" where removed;
  - **Person:** `PersonPicker`, a combobox (`role="combobox"`, `aria-expanded`, a listbox of "{name} · {role} · {hospital or Measured Health} · {email}") that keeps the chosen `id`, with a **Clear** button;
  - **Action type:** a multi-select of checkboxes in a popover, labelled "Action type ({n})";
  - **Dates:** a preset select plus two `type="date"` inputs for Custom, checked by `checkCustomRange`;
  - **Outcome:** All, Succeeded, Refused, Failed;
  - **Flagged only:** a checkbox;
  - **Search:** "Search by exact id", which applies on Enter or the **Search** button and clears with **Clear**.
- **`EventsList`:**
  - the count line (`countWords`), then `gapLine` if any;
  - desktop: a `<table>` with `<th scope="col">` for Time, Who, Hospital, Action, Outcome and Flags;
  - below `md`: cards in a `<ul>`;
  - each row is a button that opens the detail (Task 6 wires `onOpen`);
  - outcome and flags show an icon with words; "After an integrity failure" shows as a warning chip;
  - an undisplayable row reads "This entry can't be displayed · {id} · #{seq}";
  - then Load more, the partial-failure strip (as on Activity), and the states.
- **Changing any filter** replaces the list with the new set. An in-flight Load more of the old set is dropped by the query key.

- [ ] **Step 1: Write the failing tests**
  - "the sidebar shows Audit log after Activity, and both roles see it";
  - "opens on Events, newest first, with '{n} events' and the Intact header line";
  - "the footer reads the exact copy, with the oldest date";
  - "Platform only shows platform events; a removed hospital is listed as '(removed)'";
  - "the person picker searches and filters by the chosen id; two people with the same name stay apart";
  - "Action type with Audit selected shows this session's own audit_viewed entry";
  - "Refused and Flagged only find the locked sign-in";
  - "searching a pseudonym finds the named drill-downs";
  - "a custom range From after To shows the error and doesn't fetch";
  - "a range before the oldest entry shows the gap line and Nothing matches these filters" (Review Focus 5);
  - "Load more appends 50";
  - "with matchCount 20,000 the count reads More than 10,000 events";
  - "the bad option shows two 'can't be displayed' rows with id and position, reports them once, and shows the rest" (Review Focus 1);
  - "Couldn't load the audit log with Try again when unavailable";
  - "offline disables Load more and Search with the reason";
  - "at phone width rows are cards";
  - "the URL stays /audit after filtering and searching, and storage stays empty".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the platform tests, lint and typecheck.
- [ ] **Step 5: Commit:** "Add the Audit log page and its Events tab".

---

### Task 6: The event detail and patient ids on request

**Files:**

- Create: `components/audit/event-detail.tsx`, `patient-ids.tsx`, `copy-button.tsx`, and tests.
- Modify: `events-tab.tsx` (`onOpen`, and the phone page swap), `lib/queries/audit.ts`.

**Interfaces:**

- **Hooks:**
  - `useAuditEvent(id: string | null)`, through `readDetail`;
  - `useAuditPatients(id, enabled)`, with `gcTime: 0` and `staleTime: 0`.
- **`EventDetail({id, onClose, onOpenNamed})`:**
  - on `md` and up, `SidePanel` titled "Entry #{seq}";
  - below `md`, a full page in place of the list, with **Back**, which returns focus to the row;
  - a `<dl>` of the fields:
    - When (local, then `utc()`), Who (`whoLine`), Hospital, Action (`eventLine`), Target;
    - Outcome, with the refusal reason;
    - From where ("{ip} · {device}", or "Not recorded");
    - Flags, Reason (and Note), and Links (clearance id, export id, request id, each with **Copy**);
    - Entry: "#{seq}" and the fingerprint in mono, with **Copy**;
  - "After an integrity failure" as a warning banner when `after_break`;
  - for consultations, only specialty and confidence;
  - for drill-downs and pseudonym searches:
    - "Patients: {count}", then **Show patient ids**, which loads `useAuditPatients` and lists the pseudonyms in mono, with "Shown to you and recorded.";
    - **Hide patient ids** forgets them (the query is removed);
  - for named access: the letter's id, status (`LETTER_STATUS_WORDS`), "Valid {from} to {to}" and "Verified by {name}", plus **Open in Named access**, which calls `onOpenNamed({hospital, clearance})`;
  - an undisplayable detail shows only "This entry can't be displayed · {id} · #{seq}".
- **`CopyButton({value, label})`:** copies with `navigator.clipboard.writeText` and says "Copied".

- [ ] **Step 1: Write the failing tests**
  - "opening a row shows every field, the position and the fingerprint";
  - "When shows local time and UTC";
  - "a consultation shows specialty and confidence only";
  - "pseudonyms are not shown until Show patient ids, which adds an audit_patients_viewed entry";
  - "Hide patient ids removes them from the screen and the cache";
  - "a named drill-down shows the letter and Open in Named access";
  - "an after_break event shows the warning";
  - "Copy copies the fingerprint";
  - "phone: the detail is a full page with Back, and focus returns to the row";
  - "an undisplayable detail shows no raw field".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the platform tests and lint.
- [ ] **Step 5: Commit:** "Add the audit event detail and patient ids on request".

---

### Task 7: Integrity: the tab, the header line, the banner and the steps

**Files:**

- Create: `components/audit/integrity-tab.tsx`, `run-history.tsx`, `outcome-note.tsx`, `integrity-banner.tsx`, and tests.
- Modify:
  - `audit-tabs.tsx` (add Integrity) and `audit-view.tsx` (mount `IntegrityBanner` above the tabs);
  - `components/shell/app-shell.tsx`: mount `IntegrityBanner` when `usePathname() === "/hospitals"`;
  - `lib/queries/audit.ts`.

**Interfaces:**

- **Hooks:**
  - `useVerifyRuns()`: infinite, through `readRun`;
  - `useRun(id)`: polls every 2 s while `running`;
  - `useStartCheck()`: keyed; on success it invalidates the status and the runs;
  - `useAddOutcome()`: keyed, sending `version`. A 409 gives "Changed by someone else" and a reload.
- **`IntegrityTab`:**
  - **The state block** (`aria-live="polite"`): the icon and title (**Intact**, **Broken**, **Couldn't check**, **Checking…**), `runSentence`, `coverageLine`, and "Checked {when} · by {name | the daily schedule}";
  - Couldn't check has **Try again**, which starts a check;
  - **Run check now** for both roles. While one runs, it shows the running one; it is disabled offline;
  - **When Broken**, the six steps of spec §8.3 as an ordered list:
    - step 2 shows the first broken entry "#{seq}" with **Copy** and **Open entry** (which opens the Task 6 detail);
    - step 4 names `security_contact` with a mail link;
    - step 5 has **Export the entries around the break**, which opens the Task 8 dialog prefilled with the reason Security investigation and the dates `first_broken_at` − 1 day to now;
    - step 6 is `OutcomeNote`, for auditors only, with a note of 1–1000 characters and a counter. Once saved it shows "Outcome recorded by {name} · {date}" with the note;
  - **History:** past runs with when, who or "Daily schedule", the state words and icon, and the range. A Broken run keeps its row after a later Intact.
- **`IntegrityBanner`:** shows `role="alert"` "The audit log failed its integrity check on {date}. See Integrity." while `bannerOn` is on. On `/hospitals`, "See Integrity" is a link to `/audit` that calls `openAuditAt("integrity")` first; inside the audit view, it switches the tab. If the status fails to load, it renders nothing.

- [ ] **Step 1: Write the failing tests**
  - "intact mode: Intact with the full sentence and coverage; the header reads Intact · checked 06:00 today";
  - "stale mode: the header reads Not checked since …, in warning style" (Review Focus 4);
  - "a page left open goes stale at 26 h 1 min without a reload (fake clock)";
  - "unproven mode: Run check now ends in Couldn't check, never Intact" (Review Focus 2);
  - "error mode: Couldn't check with 'It timed out.' and Try again";
  - "Run check now shows Checking… with progress, then the result, announced";
  - "a second Run check now while running shows the same run";
  - "broken mode: the banner shows on every tab and on Hospitals, with the steps and the first entry";
  - "Open entry opens #{seq}";
  - "only the auditor sees the outcome note; saving it adds the line and keeps the Broken run in history";
  - "a later Intact doesn't remove the Broken row, and the banner stays while open_failure is set";
  - "offline disables Run check now with the reason".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the platform tests and lint. The `app-shell` tests pass with the banner absent in intact mode.
- [ ] **Step 5: Commit:** "Add the integrity check, its history, the banner and the auditor's steps".

---

### Task 8: Export: the dialog, the file and the Exports tab

**Files:**

- Create: `components/audit/export-dialog.tsx`, `export-ready.tsx`, `exports-tab.tsx`, and tests.
- Modify:
  - `components/hospitals/step-up-dialog.tsx` (and its test): optional `noteMax?: number` (default 500) and `reference?: {label: string; max: number}`. The reference field is optional, and `StepUpInput` gains `reference?: string`;
  - `lib/errors.ts`: `too_many_rows` gives "Too many entries to export."; `gone` gives "This file was already downloaded or has expired. Make a new export.";
  - `packages/ui/src/csv.ts` and its test: `downloadBlob(filename: string, blob: Blob): void`, which `downloadCsv` now calls;
  - `audit-view.tsx` (the Export CSV button), `audit-tabs.tsx` (add Exports), `lib/queries/audit.ts`.

**Interfaces:**

- **Hooks:**
  - `useCreateExport()`: keyed, with `gcTime: 0`, so the code is never kept;
  - `useDownloadExport()`;
  - `useExports()`: infinite, through `readExportRecord`.
- **`ExportDialog({kind, filters, names, count, prefillReason?, open, onClose})`:**
  - a `StepUpDialog` titled "Export the audit log" (or "Export named access for a legal request");
  - the intro: the filters in words, "{countWords} will be exported.", and "The file is recorded with an export id and a checksum, and can be downloaded once within 15 minutes.";
  - the reasons from the six in Global Constraints, with `noteFor="other"`, `noteMax={200}`, `reference={{label: "Reference (optional)", max: 60}}`, and `confirmLabel="Make export"`;
  - **on `TooManyRowsError`:** it closes the code step and shows "{rows} entries match. Exports stop at 50,000 rows. Narrow the dates or filters." with **Close** (Review Focus 3);
  - **on success:** `ExportReady`.
- **`ExportReady({out})`:**
  - "Export {export_id} is ready";
  - "{rows} rows", with "Capped by the server" when capped;
  - "Checksum (SHA-256)" in mono with **Copy**;
  - "Download by {HH:mm}";
  - **Download file**, which calls `downloadExport`, then `downloadBlob(safeName(out.file_name, out.export_id), blob)`. It is disabled after one click;
  - a 410 shows the `gone` words;
  - the toast: "Export {export_id} ready · {rows} rows" (with "· capped" when capped).
- **`safeName(name, id)`** returns `name` when it matches `^[A-Za-z0-9._-]{1,120}$`, else `audit-{id}.csv`.
- **The Export CSV button** in the header exports Events with the current filters and the count line. It is disabled offline, and when the current filters are invalid.
- **`ExportsTab`:**
  - columns: When, Who, What (Events or Named access), Reason (+ reference), Filters (`filtersInWords` with `filter_names`), Rows (+ "capped"), Checksum (the first 12 characters, with **Copy** of the full value), and Downloaded ("{when}", "Not downloaded" or "Expired");
  - cards on phones; read-only.

- [ ] **Step 1: Write the failing tests**
  - "Export CSV needs a reason and a code";
  - "Other needs a note, and the note stops at 200";
  - "the reference stops at 60";
  - "a wrong code says so and clears it";
  - "matchCount 62,310 shows the narrowing message, with no file and no ready step";
  - "success shows the export id, the checksum and the rows; the toast says ready";
  - "Download file saves `audit-events-{id}-…Z.csv`, and the file's first line says Demo";
  - "a second download is refused with the gone words";
  - "the Exports tab lists the new export with its id, checksum, reason and filters in words";
  - "a capped export shows Capped in the toast and the tab";
  - "offline disables Export CSV with the reason";
  - "an auditor can export";
  - `step-up-dialog.test.tsx`: "noteMax and reference are passed through; the existing dialogs are unchanged";
  - `csv.test.ts`: "downloadCsv still downloads; downloadBlob names the file".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the platform and `@mhai/ui` tests, and lint. The clinical tests are unchanged.
- [ ] **Step 5: Commit:** "Add audit exports: reason, two-step, checksum, once-only download and the Exports tab".

---

### Task 9: The Named access tab and the legal-request export

**Files:**

- Create: `components/audit/named-access-tab.tsx` and its test.
- Modify:
  - `audit-tabs.tsx` (add Named access, taking the `named` filters handed over by `openAuditAt` or `onOpenNamed`);
  - `event-detail.tsx` (wire `onOpenNamed`);
  - `lib/queries/audit.ts` (`useNamedAccess(f)`, through `readNamedAccess`).

**Interfaces:**

- **`NamedAccessTab({initial?: NamedAccessFilters})`:**
  - the filters: hospital, person (the `PersonPicker`), letter (an id field, exact), and dates (the same presets);
  - the note, with the exact copy;
  - the rows grouped by hospital, then by letter. Each group heading reads "{letter id} · {status words} · Valid {from} to {to} · Verified by {name}". Each row shows who, when, the view (`VIEW_WORDS`), "{n} patients" and the purpose;
  - no pseudonyms in the list;
  - **Export for a legal request**: enabled when one hospital is chosen and either a letter or a date range is set. Otherwise it is disabled, with "Choose one hospital, and a letter or dates.". It opens `ExportDialog` with `kind="named_access"`, and the file is a `.zip`;
  - the states, Load more, and the phone cards, as in Events.

- [ ] **Step 1: Write the failing tests**
  - "rows are grouped by hospital and letter, with the letter's status and dates";
  - "no pseudonym appears on the tab";
  - "the letter filter narrows to cl_northgate_2026";
  - "Open in Named access from an event lands here, filtered to its hospital and letter, with no URL change";
  - "Export for a legal request needs one hospital and a letter or dates";
  - "it makes a .zip export that shows in the Exports tab";
  - "the note reads the exact copy";
  - "phone: cards".
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the platform tests and lint.
- [ ] **Step 5: Commit:** "Add the Named access tab and the legal-request export".

---

### Task 10: End to end and docs

**Files:**

- Create: `apps/platform/tests/e2e/audit.spec.ts`.
- Modify:
  - `tests/e2e/helpers.ts`: add `"Audit log"` to `openNav`'s names;
  - `tests/e2e/security.spec.ts`: add `/audit` to the CSP paths;
  - `README.md` (the platform demo section), `apps/clinical/tests/readme.test.ts` (one pin), `ARCHITECTURE.md` §5 (the sidebar), and `CHANGELOG.md`;
  - spec §13, only if the contract changed while building.

- [ ] **Step 1: e2e** on desktop and mobile, with `expectNoStorage` after each test:
  - "Amara (auditor) opens Audit log: newest first, the count, Integrity: Intact · checked …, and the footer";
  - "Refused + Flagged only shows the locked sign-in; the URL stays /audit";
  - "searching a Northgate pseudonym finds the named drill-downs; opening one, Show patient ids lists them; the Audit filter then shows the read entries";
  - "Ada exports with Legal request and code 123456: the export id and checksum show, the download is a CSV whose first line says Demo, the Exports tab lists it, and a second Download file is refused";
  - "Run check now ends Intact with the range";
  - "Named access: grouped by letter; export for a legal request downloads a .zip";
  - "phone: cards, then the detail as a page with Back".

  Broken, Couldn't check and stale are proved in the component tests only (spec §12: there is no on-screen switch).

- [ ] **Step 2: Docs.**
  - The README platform section gains "**Audit log.**": what it shows, that reads are recorded, the sample, and the code `123456` for exports.
  - Pin it with `"documents the platform audit log demo"` matching `/\*\*Audit log\.\*\*/`.
  - CHANGELOG, under Unreleased › Added.
  - The ARCHITECTURE sidebar line.
- [ ] **Step 3: Verify** (remote): `npm test`, `npm run e2e` (both apps; the clinical counts are unchanged), lint, `format:check`, typecheck, build, `check:bundle` and `check:platform-marker`.
- [ ] **Step 4: Commit:** "Test the audit log end to end; document the demo".

The controller then adds the contract (spec §13 plus the additions in Rulings) to mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md` as §14.9, and the `Notification.kind` change to §14.7, through its own PR.

---

## Parallel work

- **Group A:** Task 1 alone. It defines the contract every other task uses.
- **Group B (after Task 1):** Tasks 2 and 3 can run at once. Task 3's export step needs Task 2's `auditFile` and `readAuditEvent`, so it is done last, once Task 2 is merged.
- **Group C (after Tasks 2 and 3):** Tasks 4 and 5 can run at once.
- **Group D (after Task 5):** Tasks 6, 7 and 8 can run at once. Each adds one entry to `audit-tabs.tsx`'s `TABS` and one slot in `audit-view.tsx`, which are trivial merge conflicts. Task 7's "Open entry" and "Export the entries around the break" call the Task 6 and Task 8 components. Wire them in whichever task merges second.
- **Group E:** Task 9, after Tasks 6 and 8.
- **Group F:** Task 10, last.
- **Plan 9b cut:** Tasks 7 and 9 (with Task 4 following Task 7) can move to a second PR, without changing any other task.

## Files shared with Plans 8 and 11 (for the controller to sequence)

Every edit here is additive (new rows, a spread, an optional prop). Merge order between plans doesn't matter, but each later branch must rebase.

- `apps/platform/components/shell/nav.ts`: one row after Activity. Plans 8 and 11 add rows after Analytics.
- `apps/platform/app/api/v1/[...path]/route.ts` and `proxy.test.ts`:
  - 15 `SHAPES` rows and 4 `AUDITOR_WRITES` rows;
  - a `problem()` branch for `too_many_rows`;
  - the file-type pass-through for one shape.

  Plan 11's letter page images also need a binary pass-through (`Content-Disposition: inline`), so agree one helper for "binary shapes" with Plan 11.

- `apps/platform/lib/api/contract.ts`: `extends AuditClient`. Plans 8 and 11 add methods and types (Plan 11's letter statuses should equal `LetterStatus` here; re-export one from the other).
- `apps/platform/lib/api/mock.ts`: one option, one spread, and the notification merge (Task 4). Plans 8 and 11 add options and methods.
- `apps/platform/lib/api/live.ts` and `live.test.ts`: one spread.
- `apps/platform/lib/queries/keys.ts`: one root.
- `apps/platform/lib/errors.ts`: two codes.
- `apps/platform/components/hospitals/step-up-dialog.tsx`: two optional props. Plans 8 and 11 use the dialog heavily.
- `apps/platform/lib/api/notifications-contract.ts`, `lib/analytics/read.ts` (`notificationOk`), and `components/notifications/*`: the `kind` union. If Plan 8 adds bell items (health alerts), it extends the same union.
- `apps/platform/components/shell/app-shell.tsx`: the home banner.
- `apps/platform/lib/audit/kinds.ts`: **Plans 8 and 11 must add their audit kinds here** (legal holds, settings, health and jobs; letters and the switch are already listed), or their entries show as "can't be displayed".
- `tests/e2e/helpers.ts` (`openNav` names) and `tests/e2e/security.spec.ts` (CSP paths).
- `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md` and `apps/clinical/tests/readme.test.ts`.

## Self-review notes

- **Spec coverage:**

  | Spec section                                | Task(s)                                     |
  | ------------------------------------------- | ------------------------------------------- |
  | §2 goals                                    | 5, 6, 7, 8, 9                               |
  | §3 roles, reads recorded, sidebar           | 1 (proxy), 3 (mock records), 5 (nav)        |
  | §4 event fields, action types               | 1, 2 (kinds, reader, words), 6              |
  | §5 no patient data, fail closed             | 2, 5, 6, 3 (file)                           |
  | §6.1 Events, filters, search, gaps, states  | 5, 6                                        |
  | §6.2 Named access                           | 9                                           |
  | §6.3 Exports tab                            | 8                                           |
  | §6.4 / §8 Integrity, banner, bell, steps    | 2, 3, 4, 7                                  |
  | §6 footer                                   | 5                                           |
  | §7 export rules, size, legal-request export | 2 (file), 3, 8, 9                           |
  | §9 retention shown                          | 2 (gapLine, coverageLine), 3, 5, 7          |
  | §10 hospital Activity                       | backend duty (Rulings); no app change       |
  | §11 accessibility                           | 5–9 (tables, live regions, labelled panels) |
  | §12 demo                                    | 3, 10                                       |
  | §13 contract                                | 1, then the controller's PR for §14.9       |
  | §14 delivery, 9b cut                        | this plan, Parallel work                    |
  | §15 tests                                   | 2–10                                        |

- **Names used across tasks:**
  - types: `AuditEvent`, `AuditDetail`, `AuditFilters`, `NamedAccessFilters`, `AuditList`, `AuditPerson`, `AuditHospital`, `Letter`, `Checkpoint`, `VerifyRun`, `IntegrityStatus`, `ExportIn`, `ExportOut`, `ExportRecord`, `TooManyRowsError`, `AuditClient`, `AuditRow`, `AuditTab`;
  - rules: `readAuditEvent`, `readAuditList`, `readDetail`, `readNamedAccess`, `readExportRecord`, `readRun`, `readStatus`, `integrityNotificationOk`, `integrityOf`, `headerLine`, `runSentence`, `coverageLine`, `errorWords`, `bannerOn`, `STALE_MS`, `eventLine`, `whoLine`, `hospitalWords`, `outcomeWords`, `countWords`, `filtersInWords`, `gapLine`, `utc`, `rangeOf`, `checkCustomRange`, `auditFile`, `openAuditAt`, `takeAuditTab`, `storedZip`, `safeName`, `downloadBlob`;
  - hooks: `useAuditEvents`, `useAuditPeople`, `useAuditHospitals`, `useIntegrityStatus`, `useReportUndisplayable`, `useAuditEvent`, `useAuditPatients`, `useVerifyRuns`, `useRun`, `useStartCheck`, `useAddOutcome`, `useCreateExport`, `useDownloadExport`, `useExports`, `useNamedAccess`;
  - components: `AuditView`, `AuditTabs`, `EventFilters`, `PersonPicker`, `EventsList`, `EventDetail`, `CopyButton`, `IntegrityTab`, `IntegrityBanner`, `OutcomeNote`, `ExportDialog`, `ExportReady`, `ExportsTab`, `NamedAccessTab`, `AuditFooter`.

## Across plans (controller, 22 Oct 2026)

- **Platform sidebar order** once every plan has merged: Hospitals · Usage · Analysis · Clearances · Legal holds · System · Settings · Team · Activity · Audit log · Account. Whichever plan merges second fixes `nav.ts` to match.
- **Backend requirements numbering:** Plan 6 updates §10 (Analysis), Plan 8 is §14.8, Plan 9 is §14.9, Plan 11 is §14.10 (plus its hospital side in §10), and Plan 12 is §14.10.
- **Audit kinds:** Plans 8 and 11 add their event kinds to Plan 9's `lib/audit/kinds.ts` if Plan 9 has merged first; otherwise Plan 9 adds theirs.
- **Binary pass-through:** Plans 9 and 11 share one helper in `route.ts`. Whichever lands second reuses it.
