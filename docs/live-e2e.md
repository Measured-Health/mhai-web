# The full live check

Both apps built for live mode (`NEXT_PUBLIC_USE_MOCK` unset, no sample
data), each talking to core over NATS behind the live preview's loopback
proxy, against the whole backend: Postgres, NATS, core with EMR switched
on, the emr service and its egress proxy, a synthetic FHIR source, the stub
pipeline worker, and Patient Analysis's keys and demo cohort. A real
browser (Playwright) goes through the main paths of both apps.

Build server only (steven-reid): never a laptop, never CI's shared runners
(they can't reach mhai-multiagent or build the stack in time), never the
demo host. Synthetic data only: every person, patient and result is made
up, and no real key is used anywhere.

## Run it

```bash
# On the build server, from a checkout of this repository, with a checkout
# of mhai-multiagent shipped next to it (git archive; the build server has
# no GitHub access) and its commit in .mhai-ref:
MHAI_BACKEND_DIR=$HOME/claude-work/mhai-live-be scripts/it/live-full.sh all
```

`all` brings the stack up, runs the smoke subset (every path spec below;
the page tour too with `LIVE_TOUR=1`) and takes everything down again,
volumes included; it exits non-zero when any path fails. It takes about 40
minutes, most of it waiting for the synthetic source's polls. For a session of
work, `up`, then `test` as often as needed, then `down`. `test` takes
Playwright arguments (for example `--grep alerts`); `LIVE_APPS=clinical`
narrows it to one app. Nightly: the same `all` from cron on the build
server, after shipping the backend's main.

Every name the script makes starts with `LIVE_PREFIX` (default `live-`):
the compose project, containers, networks, volumes and the images it builds.
Ports are private and on 127.0.0.1 (`LIVE_PG_PORT`, `LIVE_NATS_PORT`,
`LIVE_CORE_PORT`), the subnets private (`LIVE_SUBNET`, default `10.247`).
Secrets are generated into `LIVE_STATE` (mode 700) and never printed. The
results, with a screenshot of every path, go to `LIVE_OUT` on the build
server and stay there.

## What it seeds

- the demo hospital (`core hospitals create --demo`), activated, with
  Analysis's synthetic cohort (`core analysis seed-demo`);
- a clinician, an analyst (granted with `core users roles` once two-step is
  on: there is no screen for it yet), a hospital admin, a platform admin
  and a platform auditor, each with only a temporary password: the setup
  specs do every first sign-in in the app (password, two-step, backup
  codes, terms);
- the synthetic rule set (`0-synthetic`) loaded by the emr service and
  activated for the hospital (there is no screen for that either);
- the synthetic FHIR server (`emr synth-fhir`). Everything it holds reaches
  a connection in the first sync's backfill, which is stored historical and
  never alerts (by design), so with `--late-critical` (mhai-multiagent #159)
  it serves a new critical potassium for two patients a while after that
  first sync (`LIVE_LATE_CRITICAL`, default 2m).

The platform spec adds the record connection to the synthetic server in the
app (a private network, the synthetic key file), tests it and switches it
on; the emr service reads it, the late result fires the synthetic rule set,
core raises the alerts to the queue, and the clinical spec finds them in
the inbox, acknowledges one and dismisses the other. The emr image is
checked first (`services/emr/scripts/image-check.sh`, mhai-multiagent
#158).

## The paths

| Spec                                | Path                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clinical `01-ask`                   | sign in with two-step, ask, the answer with its drafted-by label, agree (feedback), My feedback; a linked patient core doesn't know (404) and a malformed one (422) |
| clinical `02-alerts`                | the bell's unread count, the inbox, acknowledge, dismiss with a reason; Ask MHAI about it (not linked until core sends the patient id)                              |
| clinical `03-notification-settings` | switch alert pop-ups off, read back after a reload, on again                                                                                                        |
| clinical `04-alert-settings`        | the hospital admin's alert settings: records status, units, a level saved and read back                                                                             |
| clinical `05-analysis`              | the views, a filter, the not-ready state, the de-identified drill-down                                                                                              |
| platform `01-emr`                   | add the record connection (private network, key file), test it, switch it on                                                                                        |
| platform `02-hospital`              | Hospitals, the hospital's page and its AI model policy                                                                                                              |
| platform `03-ops`                   | System health and jobs, Usage (analytics)                                                                                                                           |
| platform `04-audit`                 | the audit log and one entry                                                                                                                                         |
| platform `05-admin`                 | team, activity and legal holds on core 1.26.0; invites, notifications and settings Not available yet                                                                |
| platform `06-rule-set`              | the hospital page's Patient alerts section: the warning, the active rule set written back                                                                           |
| platform `90-reveal`                | the auditor reveal of the analyst's drill-down                                                                                                                      |
| clinical `06-hospital-admin`        | staff and a person's panel, a settings edit with step-up, usage, activity, oversight                                                                                |
| clinical `07-analyst-role`          | the hospital admin removes and gives back the synthetic analyst's role, with step-up                                                                                |
| clinical `08-patients`              | patient matches and exclusions: the explanations, an unknown MRN refused with step-up                                                                               |
| clinical `09-patient-lookup`        | Find patient by MRN: an alert's patient found, a miss (404), the 6th lookup in a minute (429), bad MRNs 422 in the BFF                                              |
| both `00-tour`                      | every page: it renders and no call to the BFF fails                                                                                                                 |

A call that fails is printed as `API <path>: <status> <method> <url>`: the
evidence of a mismatch. A call to a route core doesn't serve yet (404), or
registers but doesn't do yet (501 `not_implemented`), made by a part of the
page that isn't under test, is printed as `GAP` and doesn't fail the path
(`tests/e2e-full/live.ts`, `KNOWN_GAPS`).

## Not integrated yet

Core (openapi 1.20.0) has no route yet for these, so their screens can't
work live:

- platform (core 1.26.0, mhai-multiagent #164 and #165): the hospitals
  list and page, team, activity, legal holds and the analytics e-mail
  setting are served. Notifications (the bell), platform settings, named
  access, team invites, hold edits and lift undo answer 501
  `not_implemented`: the app shows a calm Not available yet. Hospital
  writes (add, edit, deactivate, reactivate, removal), SSO writes and
  first-admin invites aren't served at all. The sidebar's Analysis status
  is served too (1.25.0), but the platform BFF answers 404 for it while
  Analysis isn't signed off, as `live-full.sh` runs the app, so it is
  printed as `GAP`;
- hospital admin: staff, hospital settings, activity, usage and review
  oversight need core 1.24.0 (mhai-multiagent #163); the screens follow it
  (`06-hospital-admin`). Invites, removing a person, resets, reminders
  and reviewer assignment answer 501 and say "Not available yet".

Patient matches and exclusions (`/hospital/patient-matches`,
`/hospital/patient-exclusions`) and the EMR rule set
(`/platform/hospitals/{id}/emr-rule-set`) have screens now: Hospital admin →
Patient matches and Patient exclusions, and the hospital page's Patient
alerts section. The live specs `08-patients` (clinical) and
`06-rule-set` (platform) read them; the seed still activates the rule set
directly in the database.
