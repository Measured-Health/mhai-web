# EMR screens: connecting a hospital's records and setting up its alerts

- **Status:** Draft for the product owner (23 Oct 2026). Plan 13.
- **Builds on:** [ADR 0003](../adr/0003-many-emr-systems.md) (one connector per EMR type, a
  FHIR R4 canonical model with provenance, an EMR-agnostic frontend);
  [notifications design](2026-10-17-notifications-design.md) (Plan 5a: the alerts page, bell,
  pop-ups and their switch); [usage alert analytics](2026-10-17-usage-alert-analytics-design.md)
  (Plan 5b); [platform admin design](2026-10-17-platform-admin-design.md) §4 (step-up, roles)
  and its single sign-on section, which this mirrors.
- **Marking:** **[PO]** is a product-owner decision (binding). **[Design]** is this spec's
  call, to confirm.

## 1. Intent

The team wants to show EMR integration end to end, today, on sample data: Measured Health
connects a hospital's record system; the hospital chooses what MHAI watches and who hears
about it; clinicians get alerts with the evidence behind them. Havana Hospital is the first
connected hospital.

## 2. Goals and non-goals

**Goals:** the platform screens to add, configure, test, switch on and off, and watch a
hospital's record connections; the hospital admin page to see the connection and choose
units, what to flag and who gets alerts; the changes Plan 5a's alerts need for this (evidence,
routing, category). All on sample data, with the backend contract written down.

**Non-goals (today):**

- **Patient-facing messages.** MHAI drafting a message that a clinician approves before it
  goes to a patient is **out of scope** [PO: "probably not"; Design: confirmed out]. No screen
  has a "send to patient" control, and a test proves it.
- Removing a connection (switch it off instead), per-unit routing, code-mapping tables,
  write-back to the record (ADR 0003 §8), live use (sign-off as for Plan 5a).

## 3. Constraints

- The frontend talks **only to MHAI's API**. Patient data and credentials stay on the backend.
- **No vendor or product names** anywhere: UI, code, types, fixtures, tests' sample data.
  Connector types are named by standard or method only.
- Browser rules hold: nothing in storage; the URL carries only opaque ids and filter values;
  alerts stay in memory as today.
- Plain words in the clinical app (CONTRIBUTING). The platform app is for Measured Health
  staff, so the connector type's own name (e.g. "FHIR R4 server") is allowed there, and only
  there.
- Sample data, synthetic patients only. Builds today: about seven tasks, at most three at once.

## 4. Decisions

| #   | Decision                                                                                                                                                                                                                                                     | By                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| D1  | Measured Health connects each hospital, in the platform admin app: type, base address, write-only credentials ("Set · 20 Oct 2026"), Test connection, on/off, the source label, last sync and errors                                                         | PO                    |
| D2  | Every change (add, edit, switch on, switch off) asks for the person's two-step code (`StepUpDialog`, `useStepUpCall`). Auditors read only. Every change is in Activity and the audit log, one name per event                                                 | PO                    |
| D3  | A hospital may have **several connections**, each with its own source label (ADR 0003 §5). Havana has two: "Main record" and "Results system", the labels Plan 5a's sample alerts already use                                                                | Design                |
| D4  | Connector types and their fields come from the API (ADR 0003 frontend §6); a new type needs no new screen. Sample types: FHIR R4 server, results message feed, scheduled file export                                                                         | Design                |
| D5  | **Test connection** needs no code (it changes nothing) but is recorded. A connection can be switched on only after a passing test of its saved settings, like single sign-on                                                                                 | Design                |
| D6  | Sync errors are a closed list of codes shown in words; an unknown code reads "Something went wrong with this connection." Server text is never shown                                                                                                         | Design                |
| D7  | Hospital admins see status only: Connected, Connected with problems, Switched off, Not connected; per source, the last update time. No addresses, types or errors                                                                                            | PO                    |
| D8  | Hospital admins choose units covered, what to flag and who gets alerts, on one page, **Alert settings**. Each part saves on its own with a version. No two-step code, like Hospital settings                                                                 | PO / Design (no code) |
| D9  | What to flag: per category, one of **Off · Critical only · Critical and urgent · All**, reusing Plan 5a's three severities. Categories come from the API with their labels                                                                                   | PO / Design (shape)   |
| D10 | Who gets alerts: the **hospital queue**, **named clinicians**, or both; at least one (the server refuses none). Turning a category or unit off warns first                                                                                                   | PO / Design (guard)   |
| D11 | The hospital queue is listed for every clinician at the hospital. **Queue-only alerts pop up only when Critical**; Urgent and Info from the queue are counted on the bell and listed, not popped up. Alerts sent to you by name follow today's pop-up switch | Design                |
| D12 | The pop-up switch stays where Plan 5a put it (Profile & security → Notifications). Muting stops pop-ups only; alerts still arrive, count and stay listed; Critical still pops up (Plan 5a, awaiting sign-off)                                                | PO / existing         |
| D13 | Each likely cause carries up to three pieces of evidence (a value or fact with its time), shown under it. The alert also carries its category                                                                                                                | PO / Design (shape)   |
| D14 | "Open patient record" keeps using the backend's `emr_link` (https only), never built here                                                                                                                                                                    | PO / existing         |
| D15 | Usage gains one counts-only block, "Who received them" (hospital queue, named clinicians). Activity gains the three alert-settings events; neither shows patient details                                                                                     | PO / Design (block)   |

## 5. Screens

**Platform admin app**

1. **Connections** (`/connections`, sidebar after Hospitals): every hospital with its
   connections' state, last update and errors in 24 h; filters All · Needs attention ·
   Switched off · Not connected. A hospital with none reads "Not connected" with **Add a
   connection** (admins).
2. **Hospital page:** a "Patient record connections" section after Single sign-on, listing
   that hospital's connections, each linking to its page, plus **Add a connection**.
3. **Add a connection** (`/connections/new?hospital={id}`): type, source label, base address,
   the type's own fields, credentials; **Continue** opens the step-up dialog. It is saved
   switched off.
4. **A connection** (`/connections/{id}`): status, source label, type, base address, fields,
   credentials as "Set · {date}" or "Not set", last test, last update, the latest errors;
   **Edit** (form, then code), **Test connection**, **Switch on / Switch off** (code), and its
   recent actions.

**Clinical app, hospital admin side**

5. **Alert settings** (`/admin/alerts`, Hospital admin group after Hospital settings):
   _Patient records_ (status card), _Units covered_ (checkbox list by source, Select all),
   _What to flag_ (a choice per category), _Who gets alerts_ (Hospital queue switch, named
   clinicians from Staff).
6. **Usage → Alerts:** the "Who received them" block.

**Clinical app, clinician side** (changes to Plan 5a only)

7. **Alert card:** the category word; under each likely cause, its evidence; a "For you" or
   "Hospital queue" tag. **Alerts page:** a "Sent to" filter (All · For you · Hospital queue)
   when the hospital uses the queue. Bell and pop-ups follow D11.

## 6. States

- **Connection:** Not tested (new, off) · Connected (on, last sync ok) · Needs attention (on,
  errors) · Switched off. Words and an icon, never colour alone.
- **Sample hospitals:** Havana: two connections, both Connected. Northgate: Needs attention
  (sign-in refused, 3 times today). Riverside: Switched off. Westfield: a new connection, Not
  tested. Eastbrook and the rest: Not connected.
- **Every list and block:** loading, empty, "Couldn't load {what}" with **Try again**, and
  offline (writes disabled: "You're offline. This needs a connection."). A stale `version` is
  "Changed by someone else" and a reload.
- **Hospital side:** when not connected, the other three sections still show and save, with
  "Alerts start once Measured Health connects your records."

## 7. Privacy

- Credentials are write-only: sent once, never returned, dropped from state and the mutation
  cache (`gcTime: 0`) once sent, never logged.
- The platform app shows no patient data: errors and counts only, never a record.
- Alerts keep Plan 5a's rules: names and MRNs in memory only; evidence is clinical values
  and dates, never identifiers. Routing and settings never put patient data in the URL.
- Every change carries the actor from the session; the client sends no user id. Chosen
  clinicians are sent as opaque staff ids, as Staff already does.

## 8. Left to the backend

Filed by the controller in mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md`:

- **§14.11 (platform):** connector types with declared fields; connections per hospital
  (create, read, patch with version, enable with version, test); credentials to the secrets
  store only, returned as `set_at`; sync health (last test, last sync, errors by closed code
  over 24 h); step-up on writes; auditor 403; the five Activity and audit events.
- **§12 (EMR integration, hospital side):** `GET/PATCH hospital/alert-settings` (status
  without technical detail, units from the connected sources, categories with labels and
  levels, recipients; 422 `no_recipients`; 409 `conflict`); the alert fields `category`,
  `routing` and `likely_causes[].evidence`; `sent_to` on the list and `queue` on the page;
  queue visibility and the bell count; `by_route` in Usage; the three Activity kinds; the
  rules that raise alerts run on the canonical model only (ADR 0003).
- Connectors, mapping, the master patient index and the event pipeline (ADR 0003) are
  backend work in the EMR/EHR integration plan; nothing here depends on how they're built.
