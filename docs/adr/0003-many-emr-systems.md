# 0003. Integrate many EMR/EHR systems through one canonical model

- **Status:** Proposed
- **Date:** 2026-10-17
- **Deciders:** product owner, frontend lead (backend lead to confirm)

## Context

MHAI will read patient data from many hospitals' EMR/EHR systems: our own Havana EMR first,
then others. They differ in almost every way:

- **standards:** FHIR R4 (and some R5), older HL7 v2 messages (ADT, ORU), vendor REST APIs,
  database or file exports;
- **delivery:** push (webhooks, FHIR subscriptions, HL7 v2 over MLLP) or pull (polling,
  bulk export);
- **codes:** LOINC or local lab codes, SNOMED CT, ICD-10 or local diagnosis lists, different
  units;
- **identity:** each has its own patient IDs, MRN formats and location models (wards, beds,
  clinics, emergency);
- **auth:** OAuth 2 / SMART on FHIR backend services, API keys, VPN or mutual TLS.

Three features depend on this data: patient alerts (notifications design), Analysis
(analysis design) and, later, "Ask MHAI about it" from a record. None of them should change
when a new hospital or a new EMR vendor is added.

## Decision

### Backend (mhai-multiagent): connectors, one canonical model

1. **One connector per EMR type, behind one interface.** A connector knows one system's
   transport, auth and format, and does only three things: fetch or receive events, map them
   to the canonical model, and give an "open this patient in the EMR" link. New vendor = new
   connector; nothing downstream changes.
2. **A canonical clinical model based on FHIR R4** (Patient, Encounter/location,
   Observation, Condition, MedicationStatement, DiagnosticReport), stored in MHAI's own
   tables. Every record keeps its **provenance**: source system, connector version, source
   ID, received-at.
3. **Normalisation in one place:** codes mapped to LOINC (labs, vitals), SNOMED CT and ICD-10
   (conditions), RxNorm or ATC (medications); units converted to UCUM; reference ranges kept
   per source. Unmapped codes are kept with their local code and flagged for a mapping table
   (managed per hospital) — never guessed.
4. **Patient identity per hospital:** a master patient index maps each source's IDs to one
   MHAI patient within that hospital (never across hospitals). The MRN shown to clinicians
   is the hospital's own.
5. **Per-hospital connections** (platform admin app): which connector, endpoint, credentials
   (in a secrets store, never in the database or the browser), sync mode, which units are
   covered, a connection test and health (last event, lag, error rate). Hospital admins see
   status read-only.
6. **One event pipeline:** connectors → a queue → normalise → store → the rules that raise
   alerts and the jobs that build analysis aggregates. Idempotent by source ID, so replays
   and duplicates are safe; failures go to a dead-letter queue visible to platform admins.
7. **Alerts and analysis run only on the canonical model**, never on vendor data, so one
   rule or one chart works for every hospital.
8. **Write-back is out of scope** (read only). If added later, it goes through the same
   connector interface with its own approval.

### Frontend (mhai-web): EMR-agnostic

1. The frontend talks **only to MHAI's API**, never to an EMR, and receives the canonical
   shape (alerts, findings, patient, location, analysis aggregates). No vendor names, codes
   or formats in components.
2. **Source is data, not code:** an alert or finding carries `source` (a display name such as
   "Havana EMR") and an `emr_link` the backend provides. The UI shows "Open in {source}" and
   follows the link; it never builds EMR URLs.
3. **Locations, codes and units come already normalised** (with a display label); the UI
   never maps codes. A finding shows the source's reference range as given.
4. **Unknown or partial data degrades gracefully:** a missing location shows "Location not
   recorded"; an unmapped finding shows its source label with "Not standardised" — never
   hidden, never guessed.
5. **Many systems per hospital** are possible (e.g. a lab system and a separate EMR); lists
   and analysis filters include **Source** when more than one is connected.
6. **Admin screens are driven by the API:** connection status (hospital admin, read-only) and
   connection setup (platform admin app) render the fields each connector declares, so a new
   connector needs no new screens.

## Consequences

- Adding an EMR is a backend connector plus mappings, with no frontend change.
- The canonical model and code mappings are real work, and they are where clinical safety
  lives: mapping tables need clinical review, and unmapped codes must be visible.
- Provenance on every record supports audit and legal requests (analysis design §5).
- Plans 5a and 6 build the frontend against the canonical contract on sample data now; the
  backend connectors and pipeline come in the EMR/EHR integration plan.
- Credentials and patient data never reach the browser; the existing privacy rules hold.
