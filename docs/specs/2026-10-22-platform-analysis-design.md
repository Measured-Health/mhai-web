# Platform admin app: Analysis across hospitals

- **Status:** Approved design (product owner, 22 Oct 2026; all suggested defaults accepted). Plan 12.
- **Sign-off still pending:** clinical, privacy and legal sign-off for Analysis is not yet
  given (product owner, 22 Oct 2026). Plan 12 is built and shown on sample data only. In live
  mode the page stays switched off until sign-off, and patient-level views stay off until
  their own sign-off (§9).
- **Builds on:**
  - [Analysis](2026-10-17-analysis-design.md), Plan 6: the views, filters, small-group rule,
    clearance letters and audit, for one hospital in the clinical app. It already says platform
    admins see all hospitals, and one at a time;
  - [Analytics across hospitals](2026-10-22-platform-analytics-design.md), Plans 7c and 7d: the
    cross-hospital small-group rules, the fail-closed guards and the fairness rules, which this
    design reuses;
  - [Platform admin design](2026-10-17-platform-admin-design.md), Plans 7a and 7b: the app, its
    roles, proxy and privacy rules;
  - [ADR 0003](../adr/0003-many-emr-systems.md): one canonical model, no vendor names, patients
    matched within a hospital only;
  - Plan 11, clearance letters in the platform app (verify, reject, revoke). It has no design
    document yet; §6 states what Plan 12 needs from it.
- **Not in this design:** EMR connection set-up, the clearance letter screens themselves
  (Plan 11), and anything that writes to a hospital's records.

## 1. Why

Measured Health needs to see disease and population patterns across the hospitals it serves:
which conditions are rising, who they affect, which conditions travel together, what abnormal
findings look like, and how well MHAI's suggestions hold up for each condition. The hospital
Analysis page (Plan 6) answers this for one hospital. The platform team needs the same views
across all hospitals, and one hospital at a time, without becoming a back door to patient
records.

## 2. Goals, non-goals and anti-goals

**Goals**

- An **Analysis** page in the platform app with the five Plan 6 views: prevalence and trends,
  who is affected, co-occurring conditions, findings and alerts, and MHAI quality.
- Two scopes: **All hospitals** and **One hospital**.
- In One hospital scope, a comparison with the median of the other hospitals, **only where the
  comparison is fair** (§5).
- **Download CSV** of the aggregates on screen, under the same rules as the screen.
- A clear split between this page and the Plan 7c page, so there are not two pages both called
  "analytics" (§8).

**Non-goals**

- Patient-level views across hospitals. None, at any level (§6).
- Named patients in the platform app. None, even with a letter (§6, design call).
- Matching one person across hospitals. Patients are matched within a hospital only (ADR 0003),
  so a person seen at two hospitals counts once at each.
- Editing thresholds, code mappings or the hospitals included. The backend owns them.

**Anti-goals.** These would make it a failure even if it technically works.

1. **Re-identification by combining.** Someone works out a patient, or a hospital's small group,
   by putting together the all-hospitals figure and the per-hospital figures, two filters, two
   periods, or the screen and the CSV.
2. **Unfair comparisons.** A specialist or small hospital looks "worse", or "sicker", only
   because of its size, its kind, its patient mix or how much of its data is standardised.
3. **Patient-level data reaching Measured Health staff without a cleared letter.** Through a
   drill-down, an export, a tooltip, a URL, the browser, or a log.
4. **Stale or wrong numbers.** Old figures shown as current, or zeros where loading failed.
5. **Clinical content reaching people who shouldn't see it.** Auditors, hospitals not covered by
   their contract, or live use before sign-off.

## 3. Who uses it

| Role               | Can                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Platform admin** | The page in both scopes, the comparison and the CSV. Per-hospital de-identified drill-down only under a cleared letter (§6) |
| **Auditor**        | Not the page. The access trail for it: who looked at what, every drill-down and every export (§7)                           |

- Auditors don't see the analysis itself, as Plan 6 §2 already says (design call, kept). They
  check how it is used, not what it shows.
- All the platform app's rules hold: two-step always, the 15-minute idle timeout, the proxy's
  exact path list, auditors refused writes.

## 4. The page

### 4.1 Header

- "Analysis", with a **Sample data** sign while the page runs on sample data.
- **Scope:** All hospitals, or one hospital picked by name.
- **Period:** whole calendar months: **Last 3 months**, **Last 6 months**, **Last 12 months**
  (default 12), each ending with the last complete month. No custom day ranges across
  hospitals: overlapping ranges that differ by a day or two are the easiest way to single out a
  patient (anti-goal 1). (Design call.)
- **Download CSV**, and "Updated {time}" for each area, from the server.
- **Hospitals included:** "12 of 14 hospitals included", with a link that lists which are not
  and why in plain words ("Not covered by its agreement", "Not enough data yet"). (Design call:
  only hospitals whose agreement with Measured Health allows cross-hospital analysis are
  counted at all; the backend holds that setting.)

### 4.2 Filters

The Plan 6 filters, narrowed so that combining them can't single anyone out (anti-goal 1):

| Filter                                    | All hospitals                        | One hospital                   |
| ----------------------------------------- | ------------------------------------ | ------------------------------ |
| Condition (name or ICD-10)                | Yes, at the 3-character ICD-10 level | Yes                            |
| Age band                                  | Yes, in 20-year bands                | Yes, Plan 6 bands              |
| Sex                                       | Yes                                  | Yes                            |
| Setting (admitted, outpatient, emergency) | Yes                                  | Yes                            |
| Specialty                                 | Yes                                  | Yes                            |
| Ward or clinic                            | No (each hospital names its own)     | Yes                            |
| Source (the hospital's name for a system) | No                                   | Yes, when it has more than one |

- **At most three filters at once** across hospitals, and at most four for one hospital
  (design call). The page says so in plain words when the limit is reached.
- Filters are kept on screen only, never in the URL or the browser's storage (as Plan 6 §6).

### 4.3 The views

The five Plan 6 views, with these changes for the platform:

- **Prevalence and trends:** cases per 1,000 patients seen, by month, by condition. The
  all-hospitals line is the rate over all included hospitals; in One hospital scope the
  hospital's line sits beside the median of comparable hospitals (§5). Counts show beside rates,
  never alone across hospitals.
- **Who is affected:** age band, sex, setting and specialty, as shares within the selected
  group. Across hospitals, a table with one row per hospital (rate and size) under the chart.
- **Co-occurring conditions:** pairs of conditions recorded for the same patient within the
  same hospital, then added up across hospitals. Pairs are only ever found within a hospital
  (ADR 0003). The top 20 pairs show; any pair under the small-group rule shows as "Fewer than 5"
  and drops below the shown pairs.
- **Findings and alerts:** abnormal-finding patterns by condition and test, and alert volumes by
  severity. How quickly hospitals handle alerts is on the Usage page (§8), with a link "See
  alert handling on Usage", so the two pages never disagree. (Design call.)
- **MHAI quality:** confidence mix by condition, how often reviewers agreed, corrections and
  their outcomes. No clinician names; the number of reviewers behind a figure follows the
  small-group rule too.

**Data that couldn't be standardised.** Records whose codes couldn't be standardised are counted
under "Not standardised" for each hospital and are never merged across hospitals by their local
names (design call). Each hospital row shows its share of "Not standardised" records, and a
hospital above 10% is marked "Partly standardised" and left out of comparisons (§5).

Every view has a chart with the numbers as text, a table view, loading, empty, and "Couldn't
load {view}" with Try again. Each view can fail on its own; a failed view never shows zeros
(anti-goal 4). Offline disables Download CSV and drill-down, with the reason.

## 5. Small groups and fairness across hospitals

### 5.1 The small-group rule

- Every count of **patients** from 1 to 4 shows as **"Fewer than 5"**, with no bar, on screen
  and in the CSV. It covers every count: cases, patients seen, co-occurring pairs, findings,
  alerts, reviews and reviewers. 0 shows as 0.
- A rate, share, median or change whose numerator, denominator or complement (total minus
  numerator) is 1 to 4 is hidden too (Plan 7c §5).
- A set that adds up (age bands, sexes, severities, the confidence mix) follows the Plan 5b and
  7c rule: if one member is hidden and the rest would give it away, the whole set is hidden.
- The server hides; the app checks again and fails the view closed ("Couldn't load") if it
  receives a value it should have hidden (Plan 7c's guards).

### 5.2 Combined counts that could give a hospital away

The all-hospitals figure and the per-hospital rows add up, so the server must make sure no
hidden figure can be worked out by subtraction (design call: the server does this, the app
checks what it can):

- **Second hiding.** When a hospital's figure is hidden, the hidden total (the all-hospitals
  figure minus every shown hospital) must be 0 or at least 5. If it would be 1 to 4, the server
  hides the next smallest hospital's figure as well, and repeats until it is safe. The app checks
  the sum: shown rows plus hidden rows must not leave a gap of 1 to 4, or the view fails closed.
- **Too few hospitals.** An all-hospitals figure that comes from fewer than **3** included
  hospitals with any cases is hidden as "Too few hospitals to show", because it is really one
  or two hospitals' figures. (Design call.)
- **The same cell in both scopes.** One hospital scope and the all-hospitals per-hospital row
  for that hospital always show the same value (the same server answer, same suppression), so
  switching scope gives nothing extra away.
- **Periods and filters.** Fixed months (§4.1), coarse bands across hospitals and the filter
  limit (§4.2) keep two near-identical queries from differing by one patient. The server also
  hides a filtered group whose whole size, before any breakdown, is under 5.
- **The CSV** comes from exactly the data on screen and follows every rule above; it can never
  hold more than the screen.

### 5.3 Fair comparisons

A comparison with the "median of others" shows only when it is fair (design call, building on
Plan 7c's fairness rules):

- **Rates, not totals:** per 1,000 patients seen, or shares. Never raw counts side by side.
- **Like with like:** the median is taken over hospitals of the same kind (general, specialist,
  teaching, as the backend records it) and with the same data coverage (MHAI consultations only,
  or consultations plus connected records). Mixing a hospital with connected records and one
  without would compare different things.
- **Enough of them:** at least **5** other comparable hospitals, each above the small-group
  rule for that measure. Fewer, and the panel says "Not enough similar hospitals to compare",
  never a median of two or three (which would point to one hospital).
- **Left out:** hospitals marked "Partly standardised" (§4.3) and hospitals with under 3 months
  of data.
- **Context always shown:** the hospital's size (patients seen this period), kind and coverage
  next to every comparison.
- **First against itself:** the hospital's own previous period comes first; the median is the
  second line.
- **Words, not verdicts:** "Higher than similar hospitals", never "worse" or "sicker". A
  difference within the expected range of normal ups and downs is shown as "About the same".
  The server decides that range.

## 6. Patient-level drill-down: what platform admins get

This is the most important call in this design, stated plainly:

1. **Across hospitals: none.** In All hospitals scope no number opens a list of patients, at any
   level, ever. Only aggregates. (Design call, the suggested default.)
2. **One hospital: de-identified only, and only under that hospital's cleared letter.** A
   platform admin can open the de-identified list (Plan 6 §5, level 1) behind a number for one
   hospital only when that hospital has a verified, unexpired clearance letter (Plan 11) that
   **names that Measured Health person** and says it covers Measured Health staff.
3. **Named lists: never in the platform app.** No name, MRN, date of birth or address, even
   with a letter. Named access stays a hospital-side power for the hospital's own people.
   (Design call.)

What this means in practice:

- The letter is the hospital's decision, not Measured Health's. A hospital admin uploads it and
  names the people it covers; Plan 11 lets the letter name Measured Health platform admins as
  well as the hospital's own staff.
- **Two-person control still holds:** a platform admin named in a letter can't verify that
  letter. A different platform admin must (as removal does). The backend refuses the named person
  with **409** `same_person`.
- **Pseudonyms differ by viewer side:** the IDs a platform admin sees are not the ones the
  hospital's own analysts see, so a list can't be matched against one shared by the hospital.
  They are stable within one hospital for one platform admin for the letter's life. (Design call.)
- **No export, no print, no copy button** for a de-identified list, and nothing kept in the
  browser. Leaving the page clears it.
- **Audit:** every opening is recorded (who, when, which hospital, which view and filters, how
  many patients, which letter) and flagged as a security event in that hospital's activity log,
  so the hospital sees Measured Health's access too. Platform admins and auditors see it in the
  platform audit.
- Without a cleared letter the number is not a link, and the page says "Patient lists need a
  clearance letter from this hospital" on hover and focus, with no further detail.
- In live mode this stays switched off until patient-level sign-off (§9), whatever letters exist.

## 7. Auditors and the access trail

- Auditors can't open the Analysis page (§3). The sidebar doesn't show it to them, and the proxy
  refuses its paths for an auditor.
- They read **Analysis access**, in Activity: every platform admin's visit to the page (scope,
  hospital, view, filters, period; not flagged), every CSV download (with the same details), and
  every drill-down (flagged), with the letter it was under.
- Auditors and platform admins can export the access trail for a legal request, with the letters
  attached (Plan 6 §5). That export holds who did what, never the analysis figures or patients.

## 8. Two pages, two names

Plan 7c's page is about **how hospitals use MHAI** (questions, alert handling, answer quality,
what changed). This page is about **patients and diseases**. Two pages called "Analytics" and
"Analysis" would be confused daily.

Proposal (design call):

- Rename Plan 7c's **Analytics** to **Usage**. That matches the hospital Usage page it builds on
  (Plan 5b), so the same word means the same thing on both sides.
- Call this page **Analysis**, matching the hospital Analysis page (Plan 6).
- **Sidebar:** Hospitals · Usage · Analysis · Team · Activity · Account. Analysis is hidden for
  auditors, and shown with a "Sample data" sign while it runs on sample data.
- **Links between them, never copies:** Analysis links to Usage for alert handling speed; Usage
  doesn't show diseases or conditions. A hospital's page links to both, opened on that hospital.
- The Plan 7d bell and emails stay with Usage. Analysis sends no notifications in this design.

## 9. Switches and sign-off

- Two server switches, both off in live mode until sign-off:
  - **Analysis aggregates** (the page itself);
  - **Patient-level views** (the drill-down in §6).
- The page asks the server for both. Off means the sidebar entry is hidden in live mode and the
  proxy refuses the paths; the app doesn't decide on its own.
- Sample data always has both on, clearly marked as sample.
- Turning either on is a Measured Health decision recorded in Activity, not a setting in the
  app.

## 10. Privacy rules

- Nothing from the Analysis page is stored in the browser, put in the URL, logged or sent to
  analytics (as Plan 6 §6 and the platform app §4).
- The CSV holds aggregates only, built in the app from the data on screen.
- Hospital names show (the platform team knows its hospitals); clinician names never show.
- The small-group threshold (5), the too-few-hospitals threshold (3), the comparable-hospitals
  minimum (5) and the filter limits are Measured Health constants held by the backend, not
  settings in the app.

## 11. Backend this design needs (assumed contract)

Add to the backend requirements (mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md`
§14, as §14.8). It follows the §14 conventions: the `X-MHAI-Audience: platform` header, two-step
required, auditors refused, opaque ids, errors as `{code}`. A guarded value is `{value,
suppressed}` as in Plan 5b and 7c.

- `GET /platform/analysis/status` → `{aggregates_enabled, patient_views_enabled, sample,
hospitals: {included, total, excluded: [{id, name, reason}]}}`.
- `GET /platform/analysis/{view}?scope=all|hospital&hospital&period=3m|6m|12m&filters…`, where
  `view` is `prevalence`, `affected`, `co-occurring`, `findings` or `quality` →
  `{view, scope, period: {from, to}, updated_at, data, hospitals, comparison}`, or
  `{unavailable: true}`:
  - `data`: the view's series and tables, every count and rate guarded, small groups and second
    hiding already applied (§5.1, §5.2);
  - `hospitals` (All hospitals scope): one row per included hospital with `size`, `kind`,
    `coverage`, `not_standardised_share` and the view's headline values, guarded;
  - `comparison` (One hospital scope): `{available, reason, peers, median}`, with `reason` one of
    `too_few_peers`, `partly_standardised`, `too_little_history`, `small_group`; `peers` is the
    number of comparable hospitals, never their names.
  - Refusals: **403** `analysis_off` while the switch is off; **422** `too_many_filters`;
    **403** `forbidden` for auditors.
- `GET /platform/analysis/conditions?q` → condition names and ICD-10 codes for the filter.
- `GET /platform/analysis/hospitals/{id}/patients?view&filters…&period` → the de-identified list
  (pseudonymous id, age band, sex, setting, relevant findings) only when the patient-views switch
  is on and a verified, unexpired letter at that hospital names the caller. **403**
  `no_clearance` otherwise; there is no `level=named` on this path. Every call audited and
  flagged.
- `GET /platform/audit/analysis-access?hospital&kind&cursor` and its export with letters
  (platform admin and auditor).
- Plan 11 (clearance letters) must support: a letter naming Measured Health people, and refusing
  verification by a person the letter names (**409** `same_person`).

**Server duties.** The app checks what it can and fails a view closed rather than show a leak;
these only the server can keep:

- Hide every patient count of 1–4, and any rate, share, median or change over one (§5.1).
- Second hiding so no subtraction gives a hidden figure of 1–4 (§5.2).
- Hide all-hospitals figures from fewer than 3 hospitals, and filtered groups under 5.
- Compute the median only over comparable hospitals, at least 5, and say why when it can't.
- Use the same suppressed value for a hospital in both scopes.
- Never send a patient-level record on any path except the de-identified list above, and never
  a name, MRN, date of birth or address on any platform path.
- Pseudonyms for platform viewers differ from the hospital's own (§6).
- Count only hospitals whose agreement allows it; exclude the rest from every figure.

## 12. Demo (sample data)

- The sample hospitals from the platform demo, with synthetic consultations, findings and
  alerts, of different kinds and sizes: enough general hospitals for a fair comparison, one
  specialist hospital with too few peers, one "Partly standardised" hospital, and one not
  included by its agreement.
- Sample cases that exercise each rule: a hidden hospital that forces second hiding, a rare
  co-occurring pair, a figure from too few hospitals.
- A sample cleared letter at one hospital that names the demo platform admin, so the
  de-identified drill-down can be shown; one hospital with no letter.

## 13. Delivery

1. **Plan 12a: the page.** Scopes, filters, the five views, comparison, CSV, the access trail
   for auditors, and the Analytics → Usage rename, on sample data. Its own PR.
2. **Plan 12b: per-hospital drill-down.** After Plan 11 supports letters naming Measured Health
   people. Its own PR.

## 14. Testing (what must be proved)

- **Small groups:** every patient count of 1–4 hidden on screen and in the CSV; shares, medians
  and sets over a hidden group hidden; a leaked value fails the view closed.
- **Combining:** shown hospital rows plus hidden rows never leave a gap of 1–4 against the
  all-hospitals figure; a figure from fewer than 3 hospitals is hidden; the same hospital shows
  the same value in both scopes.
- **Filters and periods:** whole months only; the filter limit is enforced and explained.
- **Fairness:** comparisons use rates; the median needs 5 comparable hospitals; partly
  standardised and new hospitals are left out; size, kind and coverage always show.
- **Drill-down:** no patient list in All hospitals scope; one hospital's list only with a
  letter naming the caller and the switch on; never a name or MRN; no export, print or storage;
  every opening audited and flagged.
- **Roles:** auditors don't see the page and the proxy refuses them; they see the access trail.
- **Switches:** with either switch off the page or drill-down is hidden and its paths refused.
- **States:** loading, empty, couldn't load (never zeros), offline, "Updated".
- **Phone:** works at 390 px with 44 px targets; charts have text and table alternatives.
- **No browser storage, nothing in the URL.**

## 15. Decisions

- The five Plan 6 views, across all hospitals and one at a time (Plan 6).
- Design calls, open to change:
  - no patient-level view across hospitals; de-identified only, per hospital, under a letter
    that names the person; never named in the platform app;
  - auditors see the access trail, not the analysis;
  - Plan 7c's Analytics renamed Usage; this page is Analysis;
  - whole-month periods, coarse bands and a filter limit across hospitals;
  - second hiding, and the 3-hospital minimum for combined figures;
  - comparisons only like with like, with at least 5 comparable hospitals;
  - only hospitals whose agreement allows it are counted;
  - "Not standardised" never merged across hospitals; over 10% means left out of comparisons;
  - platform pseudonyms differ from the hospital's own;
  - alert handling speed stays on Usage.

## 16. Questions for the product owner

1. **Patient-level drill-down for platform admins.** Is any allowed? Suggested default: none
   across hospitals; for one hospital, de-identified only, under that hospital's cleared letter
   naming the Measured Health person; named lists never in the platform app.
2. **Which hospitals are counted.** Must a hospital's agreement allow cross-hospital analysis
   before its data is counted? Suggested default: yes; hospitals not covered are left out of
   every figure, and the page says how many are included.
3. **Naming.** Rename Plan 7c's Analytics page to Usage, and call this page Analysis?
   Suggested default: yes, with the sidebar Hospitals · Usage · Analysis · Team · Activity ·
   Account.
4. **Going live in steps.** Can the aggregates go live once privacy and legal sign off, before
   the patient-level views are signed off? Suggested default: no; both stay off in live mode
   until full sign-off, then aggregates first and drill-down second.
5. **Auditors.** Should auditors see the analysis itself? Suggested default: no, only the access
   trail (who looked, downloaded or opened a list), as Plan 6 says.
6. **Comparison rules.** Compare only like with like, with at least 5 comparable hospitals and a
   3-hospital minimum for combined figures? Suggested default: yes; fewer shows "Not enough
   similar hospitals to compare".

## Decisions on the questions above

Product owner, 22 Oct 2026: every suggested default above is accepted as the decision.
