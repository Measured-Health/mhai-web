# mhai-web

Clinician-facing frontend for **MHAI**, Measured Health's clinical
decision-support system. Built with Next.js (App Router), TypeScript and
Tailwind CSS. The backend lives in
[Measured-Health/mhai-multiagent](https://github.com/Measured-Health/mhai-multiagent).

> Status: the clinical flow (consultation form, analysing view, results,
> evidence panel, feedback) runs on mock data. It is not connected to the
> backend yet.

## Development

```bash
nvm use        # Node version from .nvmrc
npm ci
npm run dev    # http://localhost:3000
```

| Script                            | Purpose                       |
| --------------------------------- | ----------------------------- |
| `npm run lint`                    | ESLint                        |
| `npm run typecheck`               | TypeScript check              |
| `npm run format` / `format:check` | Prettier                      |
| `npm run build` / `start`         | Production build and server   |
| `npm test`                        | Unit tests (Vitest)           |
| `npm run e2e`                     | End-to-end tests (Playwright) |

### Run on mock data

```bash
cp .env.example .env.local   # sets NEXT_PUBLIC_USE_MOCK=true
npm run dev
```

The question text picks the mock result. Words match whole, in any case:
"fever" or "dengue" gives Use with caution, "potassium" gives Needs
review, "fail" (for example "Please fail this request") gives Couldn't
complete, and anything else gives High confidence. "Heart failure" or
"review his medications" get the normal High confidence result. A result
arrives after about 9 seconds.

**Corrections and review.** The sample data is written for the clinician
sample account (Dr. Reyes). **Review corrections** in the sidebar holds
sample corrections from Dr. Okafor and Nurse Bello, some waiting over 4
hours, and one of your own, which you can withdraw but not approve.
Approve gives you 60 seconds to undo; Reject needs a reason, which the
person who suggested it sees. **My feedback & corrections** (account menu)
lists your corrections as waiting, approved or rejected, with the
reviewer's reason, and Profile & security shows your counts. A correction
you suggest on a result gets a decision about two minutes later: approved,
or rejected with a reason if its "Why?" contains the word "unsure". The
bell in the top bar keeps this session's decisions. Like the rest of the
demo, all of it is in memory only.

**Hospital admin.** Sign in with the hospital admin sample (Grace Nwosu) to
land on **Staff** for Havana Hospital: 13 synthetic people, including one
who hasn't set up two-step, a waiting invite, an expired one and a
deactivated account. Invite people (one or a pasted list), and open anyone
to change their roles, specialty or review rights, send a password reset,
reset two-step, deactivate, reactivate or remove them. Removing someone (or
cancelling an invite) needs your own two-step code (in the demo, `123456`).
You can't do that to yourself or to the last hospital admin.
The demo accepts `123456` and a real authenticator code again and again;
making each code single-use is asked of the backend. **Hospital
settings**, **Usage** and **Activity** (with **Review oversight**) are in
the same sidebar group, and CSV exports are made on your device. The
medical director sample (Dr. Obi) is a clinician and a hospital admin, so
they see both sides. Every hospital admin must use two-step: the new
hospital admin sample (Chike Okoro) accepts the terms, sets a password and
sets up two-step (code `123456`) before reaching Staff. None of the admin
screens shows question text, results or patient details, and like the rest
of the demo it is all in memory only.

**Notifications and patient alerts.** Sign in as the clinician sample (any
clinician sees the same sample alerts). The bell in the top bar counts new
patient alerts and decisions on your corrections together; its panel shows
the latest of both, and **See all** opens Notifications, with a **Patient
alerts** tab (New, Handled, Dismissed, severity and source) and a
**Corrections** tab. Eight sample alerts are there at sign-in (they don't pop
up, but the bell counts them), and a new one arrives every 2 minutes: Urgent,
then Critical, then Info, again and again. Acknowledge one, dismiss one with
a reason, or choose **Ask MHAI about it** to start a consultation filled in
from the alert without the patient's name or MRN. Turn pop-ups off in Profile
& security → Notifications: Critical alerts still pop up. The sample hospital
has two connected systems, "Main record" and "Results system", so each alert
says which one it came from. Every name and MRN is synthetic, and like the
rest of the demo it is all in memory only.

### Share the demo

The demo runs on sample data (`NEXT_PUBLIC_USE_MOCK=true`). A ribbon on
every screen says so, and its **Give feedback** button opens a short form.
The server appends each message to a file for the team to review (see
[deploy/README.md](deploy/README.md)); it never goes to GitHub. Besides the
message and an optional name or role, it carries only the page path (ids
masked) and the screen size, never anything else typed or shown.

The demo starts at a sign-in page (sample accounts, memory only, so a
reload signs you out). Any email and password works. The page lists sample
accounts you can fill in with one tap: a clinician who signs straight in, a
clinician with two-step (code `123456`, or a real authenticator app using
the secret shown in the demo), a new account (first sign-in), a new
hospital admin (first sign-in, with two-step required), a hospital admin
(Staff, settings, usage and activity; no clinical screens), a medical
director (clinician and hospital admin: both sides), a platform admin (the
403 page) and a locked account. The password `wrong` counts down to a lock,
and "Continue with hospital account" signs in through the demo's hospital
sign-on.

- **On your machine:** `NEXT_PUBLIC_USE_MOCK=true npm run build && npx next start`
  (the flag is read at build time, so it must be set for the build).
  Feedback is saved to `.feedback/feedback.jsonl` in development.
- **For the team:** https://demo.measured-health.org (open, not listed
  by search engines). Every merge to `main` that passes CI deploys there; see
  [deploy/README.md](deploy/README.md).

### Live mode

With `NEXT_PUBLIC_USE_MOCK` unset, the app talks to the MHAI API through
its own server routes (`/api/auth/*`, `/api/v1/*`). The API token is
sealed in an `httpOnly` cookie and never reaches browser JavaScript. Set:

- `MHAI_API_URL`: the API base, without `/api/v1`;
- `SESSION_SECRET`: at least 32 characters (`openssl rand -base64 48`);
- `NEXT_PUBLIC_ADMIN_APP_URL` (optional): where the 403 page's "Go to the
  platform admin app" points. Only platform admin and auditor accounts get
  that page; hospital admins use the hospital admin side of this app.

Live mode switches every feature on, including hospital sign-on, password
reset, devices, "trust this device", terms and backup codes. It uses an
assumed backend contract (the plan header and spec section 10 item 14),
so calls to endpoints the API doesn't have yet will fail until it
catches up. Use mock mode until then.

### Weak networks

The app is built for slow and unreliable links. It slows its polling,
pauses while offline, retries safely (writes carry an `Idempotency-Key`),
holds a finished question until the connection returns, switches to data
saver on 2G, and has a slow-3G end-to-end test. The backend's side is in
[spec section 10](docs/specs/2026-10-13-ui-design-v3.md), items 15 to 19.

### Offline

Questions written while offline, and feedback that can't be sent
(offline or on a weak connection), are kept encrypted on the device and
sent when the connection returns. This is the one exception to the
"nothing in browser storage" rule; see [CONTRIBUTING.md](CONTRIBUTING.md)
for the exception and its limits. The product owner gave clinical and
privacy sign-off on 16 October 2026; any change to it needs a new one.

### Patient alerts

Patient alerts are the first place MHAI shows patients' names and MRNs: in
the alert list, the bell and the pop-ups. They are kept in memory only
(never in browser storage, the URL, the page title or logs), clear on
sign-out, and are never printed or exported; "Ask MHAI about it" copies no
identifiers into the question. These points need clinical and privacy
sign-off before live use, and it has not been given:

- names and MRNs shown in alerts, the bell and pop-ups;
- alerts kept in memory only, so they are gone after a reload or sign-out;
- Critical alerts always pop up, even when pop-ups are off;
- alerts already present at sign-in, or created while the first check fails,
  don't pop up but are counted on the bell.

Until it is given, alerts run on sample data only; see
[CONTRIBUTING.md](CONTRIBUTING.md).

### Tests

```bash
npm test        # unit tests
npm run e2e     # end-to-end, desktop and mobile
```

The e2e suite builds the app in mock mode and serves it on port 3100. The
first time, install the browser with `npx playwright install chromium`.
It checks the four result states, form errors, and that no patient data is
left in browser storage or cookies.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) (including the agent workflow) and
[SECURITY.md](SECURITY.md). Decisions are recorded in `docs/adr/`.
