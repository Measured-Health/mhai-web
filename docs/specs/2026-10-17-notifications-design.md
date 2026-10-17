# Notifications and patient alerts (clinical side)

- **Status:** Approved design (product owner, 17 Oct 2026). Plan 5a.
- **Builds on:** [UI design v3](2026-10-13-ui-design-v3.md) (§5.3 decision toasts and
  bell, §6 wording, §7 accessibility, §8 privacy) and Plans 1–4.
- **Scope:** the clinician side only, on sample data. Connecting a hospital's EMR/EHR
  (platform admin app) and choosing which units and alerts to cover and who receives them
  (hospital admin side) come in the later EMR/EHR integration plan.

## 1. Goal

MHAI will read each hospital's EMR/EHR (labs, vitals, medications), detect abnormal values
and patterns, and suggest likely causes. A clinician stays in the loop: alerts go to the
clinician and/or the hospital, never to the patient.

This design covers how clinicians receive and act on those alerts, in one notification
centre shared with the existing decisions on their corrections.

## 2. The notification centre

- **The bell** in the top bar replaces the Plan 3 corrections bell. Its badge is one count of
  unread items: patient alerts plus decisions on your corrections. Its accessible name says
  the count ("Notifications, 3 unread").
- **The Notifications page** (`/notifications`), reached from the bell (and its "See all"
  link), with two tabs:
  - **Patient alerts**, filtered by **New**, **Handled** and **Dismissed**, and by severity;
  - **Corrections**, the decisions on your corrections (Plan 3's history), with a link to
    My feedback & corrections.
- The bell's panel shows the latest few items of both kinds and "See all".
- Admin-only accounts see neither the bell nor the page. Platform accounts get the 403 page
  as today.

## 3. A patient alert

Each alert shows, in this order:

1. **Severity**, as a word and an icon, never colour alone: **Critical**, **Urgent** or
   **Info**.
2. **The finding**: what was abnormal, with the value, unit, reference range and the time it
   was recorded, for example "Potassium 2.9 mmol/L (low; normal 3.5–5.1) · 08:42".
3. **Likely causes**: up to three, suggested by MHAI, labelled "Suggested by MHAI" with a
   confidence word (the result labels from §6: High confidence, Use with caution, Needs
   review). Never presented as a diagnosis.
4. **The patient**: full name and MRN, and where they are:
   - admitted: "Ward 3 · Bed 12";
   - not admitted: "Outpatient · Cardiology clinic", or "Emergency department".
5. **Actions**:
   - **Acknowledge**: marks it handled; it moves to Handled and stays in the history.
   - **Ask MHAI about it**: starts a consultation pre-filled from the alert (age, sex, the
     abnormal values and the finding as the question). The patient's name and MRN are **not**
     copied into the consultation.
   - **Open in EMR**: opens the patient's record in the hospital EMR (a link from the API).
   - **Dismiss**: a required reason (Not clinically relevant · Already known · Wrong patient ·
     Other) and an optional note; the reason is recorded to tune alerts.

Acknowledge and Dismiss record who did it and when ("Acknowledged by Dr. Reyes · 09:12").
An alert handled by someone else meanwhile shows that, and its actions are disabled with the
reason.

## 4. Pop-ups

- A new alert or decision shows a pop-up with the severity, patient, finding and a "View"
  link to it.
- The first check after sign-in is a baseline: alerts that already exist don't pop up.
- **Settings** (Profile & security → Notifications): two switches, **Pop-ups for patient
  alerts** and **Pop-ups for decisions on my corrections**.
  - When a switch is off, those items don't pop up, but the bell count and the page still
    update.
  - **Critical alerts always pop up**, even when patient-alert pop-ups are off. The setting
    says so ("Critical alerts will still pop up.").
- The settings are saved on the server with the account, so they follow the clinician to any
  device. In the demo they are kept in memory.

## 5. Privacy and safety

- **Clinical and privacy sign-off required:** this is the first place MHAI shows patient
  names and MRNs. It needs the same sign-off as the offline outbox before live use.
- Alerts are kept in memory only (the query cache): never in browser storage, the URL, logs
  or analytics. They clear on sign-out.
- The bell panel and pop-ups show the name only to the signed-in clinician; nothing is
  printed or exported from the alerts page.
- "Ask MHAI about it" doesn't copy identifiers into the question.
- Wording follows §6: no backend terms; "Suggested by MHAI" and confidence words, never a
  bare diagnosis.

## 6. Accessibility

- Severity and status always carry a word and an icon.
- Pop-ups use a polite live region; Critical uses an assertive one. Pop-ups don't steal
  focus and can be reached from the bell.
- Everything works from the keyboard; 44 px targets on phones; the page has a phone layout
  (cards).
- Reduced motion is respected.

## 7. Demo (sample data)

Sample alerts across Critical, Urgent and Info, for admitted, outpatient and ED patients, at
the sample hospital. A new sample alert arrives every couple of minutes so pop-ups can be
seen. All names and MRNs are synthetic.

## 8. Many EMR systems

The frontend never depends on a particular EMR (ADR 0003): alerts arrive in MHAI's canonical
shape; each carries its `source` (display name) and an `emr_link`, so "Open in EMR" reads
"Open in {source}". Locations, codes and units come normalised with display labels; a
missing location shows "Location not recorded", an unmapped finding shows its source label
with "Not standardised". When a hospital has more than one connected system, the alerts page
can filter by source.

## 9. Backend this design needs (assumed contract)

Add to spec §10 of the UI design:

- `GET /alerts?status=new|handled|dismissed&severity=…&cursor=…` — the signed-in clinician's
  alerts, newest first, scoped to their hospital and routing (set by the hospital admin
  later).
- `GET /alerts/unread-count`.
- `POST /alerts/{id}/acknowledge` and `POST /alerts/{id}/dismiss {reason, note?}`, with an
  Idempotency-Key; 409 when already handled by someone else (returns who and when).
- `GET` / `PATCH /me/notification-settings {alert_popups, correction_popups}`.
- Alert fields: id, severity, finding (name, value, unit, flag, reference range, recorded
  at, code system, standardised or not), likely causes (label, confidence), patient (name,
  MRN, location: admitted ward/bed, outpatient clinic, emergency, or not recorded), age, sex,
  source (display name), EMR link, status, handled by/at, created at.
- Alerts are produced from the EMR feed with a clinician always in the loop; nothing is sent
  to patients.
