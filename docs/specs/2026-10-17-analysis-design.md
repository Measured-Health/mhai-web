# Analysis: disease and population insight

- **Status:** Approved design (product owner, 17 Oct 2026). Plan 6, after Plan 5a
  (notifications and patient alerts).
- **Builds on:** [UI design v3](2026-10-13-ui-design-v3.md) (§5.6 hospital admin side,
  §6–8), [notifications and patient alerts](2026-10-17-notifications-design.md), and the
  later EMR/EHR integration.
- **Needs sign-off before live use:** clinical, privacy and legal. This design changes the
  rule that hospital admins see no clinical content (see §5).

## 1. Goal

Give hospitals, and Measured Health, a deeper understanding of their patients than the Usage
counts: which diseases they see, how that changes, who is affected, and how findings,
alerts and MHAI's suggestions relate.

## 2. Who can use it

| Who                                 | Where                                               | Scope                            |
| ----------------------------------- | --------------------------------------------------- | -------------------------------- |
| Hospital admin                      | Clinical app, "Hospital admin" group → **Analysis** | Their own hospital               |
| Clinician with the **Analyst** role | Clinical app, sidebar → **Analysis**                | Their own hospital               |
| Platform admin                      | Platform admin app (separate)                       | All hospitals, and one at a time |

- **Analyst** is a new role a hospital admin can grant to staff (like reviewer rights) in the
  staff panel. Granting or removing it is audited.
- Auditors (platform) can read the audit trail (§5), not the analysis.

## 3. Data

- **MHAI consultations:** the assessed condition (diagnosis label, ICD-10 when present),
  confidence, specialty, age band, sex, urgency, review outcome. Available now.
- **EMR/EHR records** (after the integration): recorded diagnoses, labs, vitals, medications.
- **Patient alerts** (Plan 5a): findings, severity, how they were handled and how fast.
- All analysis runs on the backend, on MHAI's canonical, normalised model (ADR 0003), so the
  same views work for every hospital and every connected EMR. The browser receives results
  only.
- **Source** (the hospital's own label for each system, never a vendor name) is a filter when
  a hospital has more than one connected system; records with
  codes that couldn't be standardised are counted under "Not standardised" rather than
  dropped or guessed.

## 4. The Analysis page

- **Filters:** date range, disease or condition (search by name or ICD-10), age band, sex,
  ward or clinic, admitted/outpatient/emergency, specialty, data source.
- **Views:**
  - **Prevalence and trends:** cases over time, new versus existing, by condition.
  - **Who is affected:** breakdowns by age band, sex, location and specialty.
  - **Co-occurring conditions:** which conditions appear together.
  - **Findings and alerts:** abnormal-result patterns, alert volumes by severity, time to
    acknowledge, dismissal reasons.
  - **MHAI quality:** confidence mix by condition, how often clinicians agreed, corrections
    and their outcomes.
- **Small groups are hidden:** any number from fewer than **5 patients** shows as "Fewer
  than 5" in charts, tables and exports, so nobody can be re-identified from an aggregate.
- **Export:** CSV of the aggregates shown (same small-group rule; built on the device; never
  includes names).
- Charts always have the numbers as text (accessibility §7) and a table view.

## 5. Drill-down to patients

Opening the patients behind a number has two levels.

1. **De-identified (default):** a list of patients shown by a pseudonymous ID (stable within
   the hospital, not the MRN), age band, sex, location type and the relevant findings. No
   name, MRN, date of birth or address.
2. **Named (with clearance):** name and MRN as well.

**Clearance for named drill-down**

- **Evidence:** an authorisation letter from hospital leadership, **uploaded into MHAI** as a
  document (PDF or image). It is kept as the legal record for the hospital and Measured
  Health.
- **Two-person control:** a **hospital admin uploads** it and names the people it covers
  (hospital admins or analysts at that hospital); a **Measured Health platform admin
  verifies** it in the platform admin app before names unlock.
- **Duration:** the end date stated in the letter, entered on upload, **capped at 12
  months**. The hospital admin is reminded 30 days before it ends. A clearance can be revoked
  at any time by the hospital admin or a platform admin; revocation takes effect at once.
- **Status** shows on the person's staff panel and on the Analysis page ("Named access until
  12 Mar 2027 · letter on file").
- Named access also requires two-step verification (as all admin access does).

**Audit (every named drill-down)**

- Recorded: who, when, which group or filter, how many patients, and under which clearance
  letter. Flagged as a security event in the hospital's activity log.
- The audit trail and the letters can be exported for a legal request (platform admin and
  auditor), with the letter attached.
- De-identified drill-downs are logged too (not flagged).

## 6. Privacy rules

- **Changed rule:** hospital admins and analysts see aggregates and de-identified data;
  names and MRNs only under a verified, unexpired clearance, and every such view is audited.
- Nothing from the Analysis page is stored in the browser, put in the URL, logged or sent to
  analytics. Exports are aggregates only.
- Named lists can't be exported or printed from MHAI.
- The small-group threshold (5) and the 12-month cap are hospital-wide constants, changeable
  only by Measured Health.

## 7. Accessibility and wording

- Plain language (§6): condition names as clinicians know them, no backend terms.
- Every chart has a text and table alternative; status words with icons; keyboard reachable;
  44 px targets; phone layout (cards and simple charts).

## 8. Demo

Sample analysis for the sample hospital, built from synthetic consultations and alerts. A
sample clearance letter (a placeholder PDF), verified, covering the sample hospital admin, so
named drill-down can be shown; plus one pending and one expired clearance.

## 9. Backend this design needs (assumed contract)

Plan 6 builds the sample-data half. The types are in
`apps/clinical/lib/api/analysis-contract.ts` and the demo behaviour in
`apps/clinical/lib/api/mock-analysis.ts`; where this section and the code
differ, the code is right. Add to spec §10 of the UI design:

- `GET /analysis/filters` — the choices for the filters: conditions (a null `name` is
  "Not standardised"), locations (with their location type), specialties, and the hospital's
  sources (own `label` only).
- `GET /analysis/{view}?from&to&condition&age_band&sex&location&setting&specialty&source`,
  with `view` one of `prevalence`, `affected`, `co-occurring`, `findings`, `quality`.
  Aggregates with the small-group rule already applied server-side (never sent raw). A
  count of 1 to 4 is `{ value: null, suppressed: true }`; 0 is shown. An unknown view is 404
  `not_found`. A range that is not real days, runs backwards or is over 24 months is 422
  `invalid_range`. The hospital comes from the session, never from the request.
- The server's rule goes beyond hiding each count:
  - **Sets that add up are hidden as sets.** A breakdown and its total, new plus existing,
    severities, the confidence mix, correction outcomes, dismissed against total alerts and
    rated against consultations: if exactly one member is hidden, or the hidden members add up
    to 1 to 4 between them, the next-smallest shown member is hidden too, until nothing hidden
    can be worked out. The same applies to each point of a series (cases, with new and
    existing as members): a hidden point is `suppressed`, never drawn as 0.
  - **A hidden total hides what it contains.** A median, share or rate over a hidden count is
    hidden. A share of a shown count is hidden if its numerator or its complement is 1 to 4.
    Shares and rates are sent at full precision, so a client can check that none gives away a
    small number; the client fails the whole view if one does.
  - **Rows never reveal rank.** Shown rows come in order of value, then the hidden rows in a
    fixed order that does not depend on their size (by name; "Not standardised" and
    unknowns last). When the patient count is hidden, every number in the view is hidden,
    zeros included, and no row has a `drill`.
  - A `drill` key is set only on a shown count of 5 or more; it is opaque (`[A-Za-z0-9_-]+`).
- `GET /analysis/patients?drill&level=deidentified&…filters` — the de-identified patients
  behind one drillable count: at most 200 rows (`count` is the full number), each with only a
  pseudonymous ID, age band, sex, location type, conditions and findings (never a name, MRN,
  date of birth or address). 422 `too_small` for a `drill` that is not a shown count of 5 or
  more under those filters; 422 `level_not_supported` for any level but `deidentified`. Every
  successful call is audited, and appears in the hospital's activity as
  `analysis_patients_viewed` (type security, unflagged, with the number of rows opened).
- The same calls are refused with 404 `not_found` until the hospital's analysis feature is on,
  and with 403 `mfa_required` without two-step. `features.analysis` on the signed-in user says
  whether the page may show.
- Role: `analyst`, grantable by hospital admins, only with `clinician`. Granting and
  removing are audited as `analyst_granted` and `analyst_removed`.

Later plans (not built yet; the `level` field is left open for them):

- `level=named`, only with a verified, unexpired clearance for the caller; every call audited.
- Clearances: `POST /hospital/clearances` (multipart: the letter, covered people, end date),
  `GET /hospital/clearances`, `POST /hospital/clearances/{id}/revoke`; platform admin:
  verify / reject.
- Audit: `GET /audit/named-access?…` and export with letters (platform admin, auditor).
- Retention of letters and audit records under the existing retention rules; letters kept for
  at least as long as the audit records that cite them.
