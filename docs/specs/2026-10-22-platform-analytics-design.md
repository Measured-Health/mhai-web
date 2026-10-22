# Platform admin app: analytics across hospitals

- **Status:** Draft for the product owner's review (22 Oct 2026). Plans 7c and 7d.
- **Builds on:**
  - [Platform admin design](2026-10-17-platform-admin-design.md), the app;
  - [Usage alert analytics](2026-10-17-usage-alert-analytics-design.md), Plan 5b. These are the
    hospital Usage page's numbers, small-group rule, "What changed" and charts, now seen across all
    hospitals;
  - [UI design v3](2026-10-13-ui-design-v3.md) §6–§7.
- **Not in this design:** patient-level, cross-hospital Analysis. It is a later sub-project and
  needs the Analysis design (Plan 6), its privacy sign-off and the clearance letters first.

## 1. Why

Measured Health staff need one place to see, each morning, **what changed across all
hospitals**, and to act on it. They must know:

- whether a hospital's Critical patient alerts are being handled more slowly;
- whether use has dropped sharply;
- whether answers are needing more review.

Today each hospital admin sees only their own hospital's Usage page, and the platform team sees
nothing. The product owner's priority, in order, is:

1. **What changed** (most important);
2. use;
3. patient-alert safety;
4. answer quality;
5. one hospital compared with the rest.

## 2. Goals, non-goals and anti-goals

**Goals**

- An **Analytics** page in the platform app. It opens on "What changed" across all hospitals,
  ranked by seriousness.
- For each change:
  - **look closer**: the measure over time for that hospital;
  - **compare**: that hospital against the median of the others;
  - **contact**: the hospital admin's name and email;
  - **mark followed up**: with an optional note, seen by the whole platform team.
- Tabs for **Use**, **Alert safety**, **Answer quality** and **Hospitals**. Hospitals is a
  sortable table with one row per hospital; picking a row compares that hospital with the rest.
- **Download CSV** of what is on screen, under the same rules as the screen.
- **Getting told** (Plan 7d):
  - an in-app bell for everyone;
  - email for platform admins who opt in;
  - Critical-type changes are sent straight away, everything else in a weekly digest.

**Non-goals**

- Patient-level analysis, named patients or MRNs. Counts only.
- Contacting a hospital from inside the app; email and phone happen outside it.
- Chat-tool notifications (later, once a tool is chosen).
- Editing thresholds in the app; the backend owns them.

**Anti-goals.** These would make it a failure even if it technically works. The product owner
named them all, and the first five matter most.

1. **False alarms.** Normal ups and downs at small hospitals are flagged, and people stop trusting
   the page.
2. **A missed real problem.** Critical alerts pile up and the page says "Nothing unusual".
3. **Unfair comparisons.** A small or specialist hospital looks "worse" only because of its size
   or kind.
4. **A privacy leak.** Small numbers let someone work out a clinician or a patient.
5. **Too much to read.** Twenty undifferentiated changes a day.
6. **Stale or wrong numbers.** Old figures shown as current, or zeros where loading failed.
7. **Email noise.** An email for every wobble.
8. **Lost follow-ups.** Two admins chase the same hospital, or each thinks the other did.

## 3. Who uses it

| Role               | Can                                                                    |
| ------------------ | ---------------------------------------------------------------------- |
| **Platform admin** | Everything here, including marking a change followed up                |
| **Auditor**        | Read everything, see who followed up; can't mark or note (design call) |

The sidebar gains **Analytics**, between Hospitals and Team.

## 4. The page (layout B, chosen by the product owner)

**Header:** "Analytics", a period picker for the charts and tabs (**Last 7 days**, **Last 30 days**, **Last 90 days**;
default 30), and **Download CSV**. Each area shows "Updated {time}" from the server.

**Left: What changed**

- One row per change, ranked most serious first. The top 5 show, with **Show all ({n})**.
- A row names the hospital (or **All hospitals**) and the change in plain words, e.g.
  "Northgate General: Critical alerts acknowledged 2× slower (18 → 36 min)", with a sign:
  - ⚠ worse;
  - ↑ rising;
  - ↓ falling.

  Signs always come with words, never colour alone.

- A followed-up row shows "Followed up by {name} · {date}" and stays in the list until the
  period ends. It drops below rows not yet followed up.
- When nothing stands out: "Nothing unusual this period". When there isn't enough history:
  "Not enough data to compare yet".
- **The Critical rule (anti-goal 2):** Critical handling and unhandled Critical alerts are always
  checked. If any hospital has unhandled Critical alerts past its target, or Critical
  within-target below the target share, a row shows, even at low volume and even if nothing else
  changed. "Nothing unusual" can never hide one.

**Right: the selected change** (the first row is selected on open)

- A chart of that measure for that hospital over the period, with the median of the other
  hospitals as a second line. Rates and medians only, never raw totals across hospitals of
  different sizes (anti-goal 3).
- The hospital's size for context, e.g. "214 staff · 1,180 questions this period".
- **Hospital admin:** the hospital's current active hospital admins (name and email, with "Copy
  email"), not just the first one invited. With none active: "No active hospital admin", plus the
  first-admin invite status (Pending or Expired) and a link to the hospital page. (Design call.)
- **Mark followed up** (platform admins), with an optional note of up to 500 characters. It is
  shown to everyone with name and time. A note can be edited by its author, and the follow-up can
  be undone by any platform admin (both logged in Activity).
- **Open hospital**, linking to the hospital's page in the platform app.
- On phones the list and detail stack: tapping a row opens the detail, with a Back link.

**Tabs below**

- **Use:**
  - questions and active clinicians per hospital (bar list, rate per active clinician);
  - a trend column chart across all hospitals.
- **Alert safety:**
  - per hospital: alert volumes by severity;
  - median time to acknowledge, overall and for Critical;
  - share of Critical within each hospital's target;
  - unhandled count.
- **Answer quality:**
  - per hospital: the share of answers needing review;
  - the confidence mix;
  - the agreement rate on reviews;
  - median review time.
- **Hospitals:**
  - one row per active hospital, with its size and the headline numbers from the three tabs,
    sortable;
  - picking a row shows that hospital against the median of the rest in the right-hand panel: a
    measure picker (questions per active clinician, Critical median to acknowledge, Critical
    within target, needs-review share), defaulting to the first one that has a change for this
    hospital, else questions per active clinician. Its data comes from the hospital series
    endpoint (§7), so it works for hospitals with no change. (Design call.)

Every list and chart has loading, empty, and "Couldn't load {area}" with Try again. Each area
(What changed, Use, Alert safety, Answer quality, Hospitals) has its own "Updated {time}" and can
fail on its own; a failed area never shows zeros and never takes the others down (anti-goal 6). Offline disables Mark followed up and Download CSV, with the
reason.

## 5. Rules carried over from the hospital Usage page

- **Counts only:** no patient names, MRNs, question text or answers.
- **Small groups:** any count under **5** shows as **"Fewer than 5"**, with no bar. Across
  hospitals this covers every count: questions, active clinicians, confidence counts and review
  counts too, not only alerts (stricter than the hospital Usage page, on purpose: anti-goal 4). A
  rate whose numerator or denominator is hidden is hidden, and a set that adds up (severities,
  the confidence mix) follows the Plan 5b rule that hides the whole set when one member would give
  away a hidden one. (Design call.) It is
  suppressed by the server, guarded again by the app, and the CSV does the same. A share, median
  or change computed over a hidden group is hidden too (the Plan 5b fail-closed rules: if the
  server sends a value it should have hidden, the area shows "Couldn't load", not the value).
- **The server decides what changed:** thresholds, minimum event counts (anti-goal 1), ranking
  and seriousness. The app only shows and orders what it gets, with one guard of its own for
  anti-goal 2: each hospital's alert block carries `critical_overdue` (unhandled Critical alerts
  past target, guarded). If any hospital has `critical_overdue` above 0 (or hidden as fewer than 5) and the changes list has no serious change for that hospital, the What changed area shows
  "Couldn't load what changed" instead of a list that could read as "Nothing unusual" (fail
  closed, like the small-group guard). (Design call.)
- **What changed compares a fixed window** (product owner): always the last 7 days against
  the 4 weeks before, whatever period is picked. The 7/30/90-day picker changes only the charts,
  the tabs and the CSV.
- **What a change is:** a change belongs to a hospital and a measure, and keeps the same `id`
  for as long as the condition lasts, across days and across the period picker. The follow-up
  stays with that id; when the condition clears, the change leaves the list (its follow-up stays
  in Activity). The bell and the emails use the same changes.
- **Fairness:** each hospital is judged first against its own previous period. Comparisons with
  others use rates and the median, never totals.
- **Time:** periods are whole days in UTC; the screen shows local times for "Updated".

## 6. Getting told (Plan 7d)

- **Frontend scope:** the bell, its list and the email preference on Account. Sending emails,
  the straight-away and digest rules, the per-day limit and the email wording are the backend's,
  stated in the contract (§7) and tested there.
- **In-app bell** in the platform app's top bar, with a count of new changes not yet seen by this
  person. Opening the list marks them seen for this person only, which is not the same as
  "followed up".
- **Email**, for platform admins who opt in on their Account page (**Analytics email**: Off /
  Critical only / Critical and weekly digest):
  - **straight away** for Critical-type changes (Critical acknowledgement slowing, Critical
    within-target dropping, or unhandled Critical alerts piling up);
  - **weekly digest** (Monday 08:00, Lagos time) for everything else;
  - each email names the hospital and the change in plain words, with a link to the page. It
    never carries patient details, and no count under 5;
  - at most one straight-away email per hospital per measure per day (anti-goal 7).
- Auditors get the bell; email is for platform admins only (design call).

## 7. Backend this design needs (assumed contract)

Add to the backend requirements (mhai-multiagent `docs/specs/2026-10-17-frontend-requirements.md`
§14, as §14.7). It follows the §14 conventions: the `X-MHAI-Audience: platform` header, two-step
required, auditors refused writes, `Idempotency-Key` on writes, opaque ids, and errors as `{code}`.

A guarded value is `{value, suppressed}` as in Plan 5b: a hidden one is `{value: null,
suppressed: true}`, and `{value: null, suppressed: false}` means nothing to show.

- `GET /platform/analytics?period=7d|30d|90d` → `{period, from, to, changes, use, alerts,
quality, hospitals}`, where each area is either its data with its own `updated_at`, or
  `{unavailable: true}`:
  - `changes`: `{updated_at, window: {from, to}, items}`, ranked, computed on the fixed window
    (last 7 days vs the 4 weeks before, whatever `period` is; `window` says which days), each
    item with:
    - `id`, `hospital` (`{id, name}` or null for all hospitals), `area` (`use`, `alerts`,
      `quality`), `measure`, `direction` (`worse`, `better`, `rising`, `falling`);
    - `serious` (boolean, Critical-type), `previous`, `current` (guarded values), `summary`
      (plain words);
    - `follow_up`: `{by, at, note, by_you, version}` or null. `by_you` is set by the server for
      the caller (the app offers Edit note only when it is true); `version` moves on with each
      note edit;
    - `version`: moves on with every follow-up write, and is sent back on the next one;
  - `use`, `alerts`, `quality`: `{updated_at, rows, median, trend}`. `rows` has one per active
    hospital, `median` is the all-hospitals median under the same rules, and `trend` is
    `[{start, value}]` across all hospitals with `value` guarded. Each value is guarded. Alert
    rows also carry `critical_target_minutes` (a plain number) and `critical_overdue`. Quality
    rows carry `reviews` (the answers a reviewer looked at, which `agreement_rate` is over);
  - `hospitals`: one row each, with `size` (staff, active clinicians, questions).
- `GET /platform/analytics/changes/{id}/series?period` → `{measure, hospital, points: [{start,
value, median}]}`: that measure over the period for the hospital. `value` is guarded. `median`
  is the median of the other active hospitals for that point, a plain number, or null when there
  is none (a change across all hospitals, or no other hospital has data). The app checks that
  `measure` is the one it asked for, and fails the chart closed on anything else.
- `GET /platform/analytics/hospitals/{id}/series?measure&period` → the same, for any hospital and
  one of the four comparison measures (§4 Hospitals tab).
- `PUT /platform/analytics/changes/{id}/follow-up {note?, version}` marks a change followed up, or
  edits the note, and `DELETE …/follow-up {version}` undoes it. Both are for platform admins
  (audited) and return the change. A `version` that isn't the change's current one returns 409
  `conflict`, and so does undoing a change nobody followed up. Only the author edits the note:
  anyone else gets 403 (they undo first).
- `GET /platform/hospitals/{id}` gains `admins: [{name, email}]`, the active hospital admins
  (the existing `first_admin` stays for the invite status).

**Server duties.** The app checks what it can and fails an area closed rather than show a leak,
but some rules only the server can keep:

- **Summary wording when a side is hidden.** When a change's `previous` or `current` is hidden,
  its `summary` says "fewer than 5", has no "%", and has no digits other than the shown side's
  number. The app checks this crudely: any other digit fails What changed closed, so a hospital or
  measure name with a digit in it fails too. Word such summaries without it.
- **Every count of 1–4 is hidden by the server.** The app fails an area that sends one unhidden.
- **Shares and rates.** The server hides a share or rate whose numerator, or whose complement
  (total minus numerator), is 1–4. That includes subsets: total minus unhandled, Critical minus
  Critical overdue, answers minus reviews. The app's own backstop (total × share) is weaker
  because shares come rounded to 2 places, and it can't check series shares at all, as a series
  has no denominators.
- **Series medians.** A median of a count measure between 0 and 5 (1–4, or 4.5) is sent hidden,
  as null. The app also hides any count median between 0 and 5 that does arrive: it draws no
  mark, leaves it out of the chart's scale, and writes "Fewer than 5".
- The CSV is built in the app from the same data (as in Plan 5b): every area for the chosen
  period plus the changes list, whatever tab is open, under the same small-group rules; an
  unavailable area writes "Couldn't load". No export endpoint.
- **Plan 7d:**
  - `GET /platform/notifications`, `POST /platform/notifications/seen`;
  - `GET` / `PUT /platform/me/analytics-email {mode}`;
  - the backend sends the emails: straight away for `serious` changes, at most one per hospital
    per measure per day; the weekly digest on Monday 08:00 Lagos time; plain words and a link, no
    patient details, no count under 5.

## 8. Delivery

1. **Plan 7c: the Analytics page.** What changed with the detail panel, compare, contact, follow-up
   notes, the four tabs and the CSV, on sample data (every hospital from the platform demo, with
   changes that exercise each rule). It includes the e2e on desktop and phone, and its own PR.
2. **Plan 7d: getting told.** The bell, the email preference and the digest rules on sample data.
   It is its own PR.

## 9. Testing (what must be proved)

- **Small groups:** every value under 5 is hidden on screen and in the CSV; a share or median over
  a hidden group is hidden; a leaked value fails closed.
- **The Critical rule:** a hospital with unhandled Critical alerts past target always shows a
  change, including when the list would otherwise be empty.
- **Ranking:** serious first, then by size of change; top 5 plus Show all; followed-up rows below.
- **Fairness:** comparison charts and the Hospitals table use rates and medians; each shows size.
- **Follow-ups:**
  - shown to all with name and time;
  - only platform admins can mark, note or undo;
  - auditors see but can't change;
  - the proxy refuses auditor writes.
- **States:** loading, empty, couldn't load (never zeros), offline, "Updated".
- **Phone:** the list and detail stack works at 390 px with 44 px targets.
- **Getting told (7d):** the bell count and seen state per person; the three email modes saved
  and shown on Account; auditors see the bell and no email setting. The sending rules are the
  backend's.
- **The Critical guard:** a hospital with `critical_overdue` above 0 and no serious change makes
  What changed show "Couldn't load", never "Nothing unusual".
- **Change ids:** a follow-up made in one period shows in the others.

## 10. Decisions

- Combine all five views; What changed matters most (product owner).
- Layout B: What changed on the left, the selected change on the right, tabs below (product owner).
- All six follow-on actions: look closer, compare, contact, mark followed up, get told, export
  (product owner).
- An in-app bell for everyone, plus email for platform admins who opt in. Critical-type changes
  are sent straight away, everything else weekly (product owner).
- All eight anti-goals, false alarms, missed problems, unfair comparisons, privacy and too much to
  read most (product owner).
- What changed always compares the last 7 days with the 4 weeks before; the period picker
  changes only the charts, tabs and CSV (product owner).
- Build in two parts, the page (7c) and then getting told (7d) (proposed; product owner to
  confirm with this document).
- Design calls, open to change:
  - auditors can't mark follow-ups and get no email;
  - periods of 7, 30 and 90 days;
  - top 5 changes;
  - the 500-character note;
  - one straight-away email per hospital per measure per day;
  - the digest at Monday 08:00 Lagos time.

## 11. Changes during Plan 7c

Made while building, and folded into §7 above:

- `FollowUp` gains `by_you` (set by the server per caller) and `version`; `Change` gains
  `version`.
- `PUT …/follow-up` takes `{note?, version}` and `DELETE …/follow-up` takes `{version}`; a stale
  version returns 409 `conflict`, and only the author edits the note (403 otherwise).
- `changes` carries `window: {from, to}`.
- Alert rows carry `critical_target_minutes`; quality rows carry `reviews`, so `agreement_rate`
  can be checked.
- Trend points are `{start, value}` with a guarded `value`.
- The series shape is `{measure, hospital, points: [{start, value, median}]}`, with `median` the
  median of the other hospitals, null when there is none; the app reads it for the measure it
  asked for and fails the chart closed otherwise.
- `GET /platform/hospitals/{id}` lists `admins`.
- The server duties above: the summary wording when a side is hidden, hiding every count 1–4,
  hiding shares and rates whose numerator or complement is 1–4, and sending a count median of
  1–4 hidden.
