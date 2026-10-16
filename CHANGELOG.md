# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Profile & security shows your feedback: results you agreed with, and
  your corrections waiting, approved and rejected, with a link to My
  feedback & corrections.
- "Review corrections" in the sidebar (and the tablet rail and phone menu),
  with how many corrections are waiting for you.
- Review corrections: the queue (anything waiting over 4 hours flagged),
  what the system said beside the suggested correction with the changes
  marked, who suggested it and why, the evidence on file and the
  consultation. Approve with a 60-second undo, then the next one loads;
  reject with a required reason the suggester sees, skip, and the A and R
  shortcuts. Your own corrections can only be withdrawn. Works on phones,
  with the reject form as a bottom sheet.
- My feedback & corrections (account menu): your corrections as waiting,
  approved or rejected with the reviewer's reason; withdraw a waiting one,
  or change a rejected one and send it again.
- Decisions on your corrections reach you while you work: a toast when a
  reviewer approves or rejects one (with their reason), and a bell in the
  top bar that keeps this session's decisions, in memory only.
- Feedback on a weak connection (it fails to send while the device is
  online) is saved encrypted on the device and sent automatically later,
  instead of showing an error. It keeps its idempotency key, so a send that
  did reach the server isn't counted twice. Rejected feedback still shows
  the error.
- Two-step codes verify on their own once the sixth digit is typed or
  pasted, at sign-in and during setup; no need to press the button.
- The right panel on the new consultation page ("How it works", a good
  question, examples to try) and while analysing (your question, as sent),
  as in design v3.
- Sign-in and accounts (Plan 2, design v3), mock first: sign-in with
  sample accounts, hospital sign-on, generic errors and a lockout
  countdown; two-step codes (authenticator apps including Google
  Authenticator, paste, backup codes, trust this device); first sign-in
  (terms, new password, QR setup, backup codes); forgot and reset password;
  the account menu; Profile & security (password, two-step, backup codes,
  devices, sign out everywhere); and the 403 page for non-clinician
  accounts.
- Server-side session (BFF): the API token lives in a sealed httpOnly
  cookie; clinical calls go through a same-origin `/api/v1` proxy with
  same-origin checks, scrubbed errors and single-flight refresh; an
  expired session signs out once with an explanation.
- Live API clients with every feature switched on, against an assumed
  backend contract (spec section 10 item 14).
- Weak-network support: adaptive polling, safe retries with idempotency
  keys, sending a question once back online, a data-saver mode and a
  slow-3G end-to-end test.
- Encrypted offline outbox: questions and feedback made offline are saved
  encrypted on the device and sent when the connection returns (clinical
  and privacy sign-off from the product owner, 16 October 2026).
- The official BHAI logo in the partner credit (sign-in, Help); the
  partnership is credited to BHAI by name only, including the print footer.
- Demo feedback form: the ribbon's **Give feedback** opens a short form, and
  the server saves each message to a file on the instance for the team to
  review. Testers need no account. Replaces the GitHub issue link, which
  failed for anyone outside the organisation.
- Automatic deploys of the sample-data demo to
  `demo.measured-health.org` (Docker image, GHCR, nginx site on the
  preview instance).
- Clinical flow on mock data (Plan 1, design v3): consultation form,
  analysing view, the four result states, evidence panel and mobile sheet,
  feedback and corrections, export and print, first visit, failure,
  offline, idle timeout and unsaved-draft states, search (Ctrl/Cmd+K),
  keyboard shortcuts, help, and motion with reduced-motion support.
- End-to-end tests (Playwright, desktop and Pixel 7) and a CI step that runs
  them in mock mode.
- Design v3 (`design/v3/`): brand-forward clinical UI for desktop, tablet
  and mobile; account, review-queue, state and export screens; brand
  assets in `design/brand/`; spec in `docs/specs/`.
- `ARCHITECTURE.md`: the clinical app, the planned admin app, and their
  flows, with diagrams.
- ADR 0002: separate the clinical and admin apps (proposed).

- Next.js app scaffold (TypeScript, App Router, Tailwind, ESLint).
- Development standards:
  - CI (lint, format, type-check, build, secret scan);
  - Prettier, Node version pin, Dependabot, CODEOWNERS;
  - PR and issue templates, `SECURITY.md`, `CONTRIBUTING.md`, ADRs and an
    agent guide.

### Fixed

- The demo's two-step setup now appears in authenticator apps as
  "MHAI Demo" with the account's email (it showed "MHAI:new.bello").
- Sign-in screens on desktop: only the form column scrolls, so the brand
  panel and the form no longer drift out of line while scrolling.
- The sign-in screens match design v3 again: the light brand panel with
  its grid, heartbeat line and trust cards (it stays in view as the form
  scrolls), the outlined hospital sign-on button and lighter field labels;
  the first sign-in progress bar, single terms box and QR code beside the
  steps; the password strength meter; and the Profile & security layout
  (section menu, Close, profile fields in boxes).
- Dialogs (keyboard shortcuts, change password, backup codes) open in the
  middle of the screen, not the top-left corner.
- The signed-out notice now says why: inactivity, signing out yourself, or
  an ended session. It no longer says "inactivity" after a manual sign-out.
- Missing pages say what was missing: an unknown address reads "This page
  doesn't exist", and an unknown or ended consultation keeps its own message.
  The printout uses the same not-found page instead of a bare line.
- Opening a consultation or printout link directly now returns a real 404
  status, not 200.
