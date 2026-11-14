# TODO

The frontend was called finished for the team demo on 23 Oct 2026. Everything below is what's left. Remove an entry once it's done or decided.

## What's left (5 Nov 2026)

In short: the screens are built, and most of what's left is wiring them to backend work that's still coming. The live previews over NATS are on the demo host (web and platform), and sign-in works against the real core service there. Still to do:

- **Screens core doesn't serve yet (found by the full live check, `docs/live-e2e.md`, 14 Nov).** Live, against core 1.20.0, these couldn't load: platform Hospitals and a hospital's page, notifications, legal holds, settings, team, activity, named access and the analytics e-mail setting, and the hospital admin's staff, settings, activity, usage and review oversight. Since the admin-contract PR, the platform app follows core 1.26.0 (mhai-multiagent #164, #165): hospitals, team, activity, legal holds and the e-mail setting work; notifications, settings, named access, team invites, hold edits and lift undo answer 501 and show Not available yet; hospital writes, SSO writes and first-admin invites aren't served by core at all. The hospital admin's staff, settings, activity, usage and review oversight follow core 1.24.0 (mhai-multiagent #163) once it merges. Patient matches and exclusions, the EMR rule set and the analyst role have screens now. Run `scripts/it/live-full.sh all` on the build server after each backend or frontend change in these areas.
- **Hospital admin features core answers 501 for** (shown as "Not available yet"): invites and resending them, removing a person, password and two-step resets, the two-step reminder, reviewer reminders and assignment, reviewing by specialty, single sign-on and allowed email domains. Bring each screen back when core builds it (the invite and assign dialogs are in git history, before the hospital admin contract PR). The BFF still forwards their shapes.
- **Wire the screens on sample data to the real backend** as each contract lands (see "Backend contracts still marked Assumed"): Analysis, clearances and named access, EMR record connections and alert settings, and platform Analysis across hospitals.
- **Platform admin 7c: the analytics screens.** On core's merged contract (openapi 1.15.0, calendar periods, R41a) since 11 Nov (`docs/plans/2026-11-11-plan-7c-frontend-calendar-periods.md`). Still open: Alert safety and the Critical guard come back when patient alerts exist (F4, F10); `Hospital.admins` stays sample-only until core serves `GET /platform/hospitals/{id}` (F9); no screen reads `GET /platform/guardrails/periods` yet (F20); the staff count stays guarded until the privacy lead decides Q4.
- **Cloud models: what's left after Plan 14.** The AI model section (platform) and who drafted the answer (clinical) are built against core 1.10.0. Still to do: clinical review must approve both notices' wording ("masked where detected"), because the masker catches a name only after a title, so a bare name, a relative's name or a free-text name can get through (the egress scan blocks only the patient's own recorded identifiers); and whether the printed and exported result says who drafted it; the platform audit log's words for `hospital.model_policy_changed` once the audit contract names its facts. No real patient data goes to a cloud model until the masker, legal and clinical sign-offs (backend design §13.6).
- **Plan 12b, the EMR work, BFF over NATS and contract v1.2.0** are under "Next plans" below.
- **Sign-offs** (Analysis, named access, Analysis across hospitals) and the real IP allowlist for the platform admin app.
- **Dependabot backlog.** 10 open PRs (npm and GitHub Actions); each needs CI and a merge.

## Next plans

- **Plan 12b: the drill-down for one hospital (platform admin app).** Plan 12a (Analysis across hospitals) is built on sample data. 12b adds the de-identified patient list for one hospital; it uses Plan 11's letters that name Measured Health people. The spec and plan are on branch `agent/platform-designs`.
- **EMR integration beyond the screens.** Plan 13 built the screens on sample data only. Still to do:
  - real connections through the backend (ADR 0003: one connector per EMR type, a FHIR R4 canonical model);
  - "Open patient record" links;
  - patient-facing explanations, which a clinician reviews before anything is sent;
  - the rest of the EMR design follow-ups.
- **BFF over NATS: what's left** (ADR 0005; the transport is built, default `http`):
  - production: NATS TLS with client certificates for the BFFs;
  - once every live BFF is on `nats` and core turns `CORE_HTTP_API` off, delete the HTTP transport, `MHAI_API_URL` and `BFF_SERVICE_KEY_FILE`;
  - letter uploads and file replies over NATS need the documents service (bodies over 64 KB are 413 on `nats`);
  - hospital sign-on on `nats` (it redirects the browser to core, which has no browser-facing address there).
- **Contract v1.2.0 in the clinical app** (plan Task 7, its own PR): `trust_band`, `cited_chunk_ids`, the new codes; show `trust_band` only after clinical sign-off.
- **Reference documents for MHAI** (guidelines, protocols). Upload isn't in any plan yet; it needs scoping.

## Before a second BFF instance

- **A shared refresh store.** Each app's BFF keeps a rotated refresh token's successor in memory for a minute (`@mhai/api-client/server/refresh`), so requests still carrying the old cookie use the new pair instead of reaching core with a rotated-out token (core would revoke the session). That needs one BFF instance per app, as the demo runs. Before running two, move it to a shared store: NATS KV keyed by sha256 of the refresh token, value the sealed successor, TTL about a minute.

## Sign-offs and live switches

- Clinical, privacy and legal sign-off for:
  - Analysis (`ANALYSIS_SIGNED_OFF`);
  - Named access (`NAMED_ACCESS_SIGNED_OFF`, plus the backend switch raised by two platform admins);
  - Analysis across hospitals (two backend switches).

  The packs are in `MHAI-sign-off-packs.pdf`. Live stays off until they're signed.

- The real IP allowlist for the platform admin app. The demo allows everyone.

## Backend contracts still marked Assumed

The frontend uses these on sample data. Each must be built or confirmed in mhai-multiagent, which lists them in its own TODO.md:

- §10 Analysis: the aggregate views, filters and the de-identified drill-down are wired to core 1.19.0 (`GET /analysis/filters`, `GET /analysis/{view}`, `GET /analysis/patients`, mhai-multiagent #141 and #149), with the auditor reveal (`GET /platform/audit/{id}/patients`); only the named list below is still assumed;
- clearance letters (hospital side);
- §14.10 platform clearances and the switch, including the `today` fields and the revoke refusals;
- `POST /analysis/patients/named`, and `clearance/me` with `reason`;
- §14.11 record connections;
- §12 alert settings, routing and evidence;
- §14.12 platform Analysis across hospitals (the contract for Plan 12a, with the server requirements under "Known limits" below).

## Known limits

- **The drill-down's audit entries arrive bare (core 1.19.0).** Core sends `analysis.patients_viewed` and `audit.patients_viewed` as the bare entry until their facts and targets are agreed (its TODO, "Analysis: before scale"), so the log reads them as "can't be displayed". The detail still carries `patients: {count}`, and the auditor reveal is offered on it. The app already maps `analysis_patients_viewed` ("Opened a de-identified patient list") and `audit_patients_viewed` ("Revealed the patients of an entry"); agree the facts with core, then drop the bare-entry path. The flagged `analysis.list_limit_reached` and `analysis.patient_cap_reached` have no kind here yet.
- **The reveal is auditors only, here.** Core also lets platform admins reveal; the BFF and the screen refuse them (separation of duties). Confirm with the product owner, or open it to admins in the BFF's `REVEAL` check.
- **No lists on prevalence, ward or clinic, or specialty rows, nor under a ward, specialty or source filter** (core 1.19.0, departure 19): See patients is off there with "not available for this breakdown". Lifting that needs core's design (pids per list, or the dimension on the row) and H1.

- **Platform Analysis can still be differenced (Plan 12a).** The page hides cells and fails closed on remainders, but the server must close what a browser cannot. All three need a privacy decision (rounding, noise or query limits) before live use, and go in the sign-off pack:
  - **Filter against breakdown.** A filtered count can be subtracted from a breakdown of the same group (the sample has 18 such cases, e.g. Harbour View, 3 months, sex Other = 3).
  - **Multi-sum inference.** Several shown sums that each hide nothing can together give a hidden cell away.
  - **Containment across dimensions.** A row wholly inside a row of another breakdown, with nothing in the reply to say so (a children's ward inside 0–17, a specialty seen by one sex, "no setting" inside "no ward"), gives away the rest by subtraction. These are containments the reply doesn't declare, so the server must detect and close them (the reader closes the declared whole and part pairs and their transitive closure only).
- **Usage keeps its own local guards (`usage-guards.ts`).** Plan 12 moved the strict small-group guards to `@mhai/ui/guards`; Usage stayed on looser local helpers so its behaviour didn't change. Move it over once a decision is made on its wording.
- **CSV file prefix.** Usage downloads are still named `analytics-…`; rename to `usage-…` with the next Usage change.
- **Analysis status line (M4).** It uses the viewer's day, not the hospital's. The server's check is the source of truth.
- **Named view end time (M8).** The browser clock is compared with `named_until`. The server's 30-second check is the source of truth.
- **Removed hospitals.** Edit, switch and test still work on a removed hospital's record connections; only Add is refused.
- **Alert settings (Plan 13).** Saving has no two-step code, by design (D8). Revisit if sign-off asks for one.
- **Audit trail for connection events.** The audit-log wording for connection events is unit-tested only. The platform's sample audit data has no connection events.
- **Demo sample data.** The named view ends after at most one hour. This is a stand-in for the server's earliest-end rule, not a product rule.

## Parked review findings (Minors)

None of these block the demo. The full lists are in each plan's review notes.

- **Plan 11:**
  - the switch panel: no 409 `expired` panel test; Turn down silently cancels a pending raise; a code-step 422 says "Check the highlighted fields" with nothing highlighted; the sign-off date limit can go stale across midnight; polish;
  - named Analysis: a dedicated e2e for the 30 s end; the phone test's final checks are weak.
- **Plan 13:**
  - Alert settings: fieldsets; focus after removing a chip; a staff list that fails to load; offline inside dialogs;
  - connections: phone cards aren't rendered in unit tests (no `matchMedia` in jsdom); loose filter-count assertions; no test for where the hospital-page section is mounted;
  - smaller items from the per-task reviews.
- **Earlier plans (6 to 9):** the remaining Minors noted in their PRs.

## Housekeeping

- **Dependabot PRs #28 to #38:** review and merge.
- **CI:** split the clinical e2e suite into a third shard if runs creep back up. A run takes about 6.5 minutes now.
- **Plan 9 doc:** still uses the old audit kind names; update it to the current ones.
