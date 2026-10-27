---
name: secure-design
description: Use when writing or reviewing a design spec, ADR or plan in mhai-web (the clinical app, the platform admin app or a shared package), before any code. Every spec in docs/specs/ must carry a "Security and threat model" section; this skill says what goes in it for a browser-facing app and how to check it.
---

# Security is part of the design

We build securely, and security is part of the design. A spec in `docs/specs/` isn't ready for approval until it has a **Security and threat model** section that a reviewer can check. A plan in `docs/plans/` carries that section's abuse-case tests into its tasks. An ADR that moves a trust boundary (a new app, origin, cookie, proxy or storage) says so in its Consequences.

Most of the frontend findings in Plans 11 and 12 were design gaps: a value the reader should have failed on, a name in a test artefact, a CSV holding more than the screen, a gate that switched back on. A threat model would have named each of them before the code.

## The section every spec must have

### 1. Assets

What this design shows or touches in the browser: patient names and MRNs, de-identified rows, counts under the small-group rule, clearance letters, step-up codes, SSO and connection secrets, the session, the audit trail, and clinical safety (an escalated or degraded result always shows the review banner).

### 2. Actors and trust boundaries

- **Actors:** clinicians, hospital admins, Analysis users with or without named access, platform admins, auditors, someone at a shared ward PC after sign-out, a malicious page in another tab, a person reading a screenshot, CI logs or a Playwright report.
- **Boundaries:** browser → BFF route (`app/api/v1/[...path]/route.ts`) → MHAI API. Also browser storage, the URL and history, the query cache, the console, downloaded files, and test artefacts. Say what is checked at each crossing and which app (clinical or platform) owns it. Neither app imports from the other (ADR 0002).

### 3. Threats

Walk STRIDE over each boundary. At minimum cover:

- **Spoofing:** a token in the browser, a missing two-step, the wrong audience (a clinical session on a platform route), a forged trusted header.
- **Tampering:** a body or query naming another user or hospital, a path the proxy shouldn't forward, a write replayed without its Idempotency-Key, a stale `version`.
- **Repudiation:** which views are recorded (a named list is a POST that records a view, and a refetch would record a second one), and what the access trail shows.
- **Information disclosure:** patient data in a URL, storage, the title, a log, the cache after sign-out, a print or export, a test artefact; a value the server should have hidden; a subtraction leak (whole and part, a complement, across scopes); a CSV with more than the screen; upstream error text echoed to the page.
- **Denial of service:** a huge upload or body, a poll that never stops, a lockout used against someone else.
- **Elevation of privilege:** an auditor making a write, a switched-off gate that turns back on with a refetch, a hospital-admin screen reached without two-step, a shape the proxy allows by prefix.

### 4. Controls (decided, not "to be added")

- **Session:** httpOnly cookie, token only on the server, refresh in the BFF, idle sign-out, what sign-out clears.
- **Proxy shapes:** the exact `METHOD path` rows added to `SHAPES` (platform) or the shape functions (clinical), the roles for each, and which are behind a sign-off switch (`ANALYSIS_SIGNED_OFF`, `NAMED_ACCESS_SIGNED_OFF`).
- **Step-up:** which actions need the code, and how the code is cleared from state and the mutation cache.
- **Data in the browser:** what is held, only in memory, with which `gcTime`, and when it is dropped. Any storage beyond the encrypted outbox needs `clinical-review` and a new sign-off.
- **Readers:** which reply fields are read, how each view fails closed, the small-group words ("Fewer than 5", "Not shown"), the whole/part pairs that must be closed, and the CSV/screen parity rule.
- **Writes:** Idempotency-Key, `version`, and what 409 shows.
- **Wording:** plain clinical language, no EMR vendor names, no "lab" wording, no backend terms.
- **Accessibility:** focus on open and close, keyboard order, phone layout.

### 5. Abuse-case tests

The tests that prove each control, written as behaviour. For example: "an auditor's POST to verify is 403 and never reaches upstream", "a shown count of 3 fails the whole view", "after sign-out the query cache holds no patient row", "the CSV cell equals the screen's text for every view and scope", "a failed named e2e leaves no trace, screenshot, video or error-context". The plan copies them into its tasks' first steps.

### 6. Residual risk and sign-off

- **Residual risk:** what's left open and why it's accepted (for example, the outbox is readable by code running on this origin in the same profile; the 72-hour limit bounds it).
- **Sign-off:** what needs clinical, privacy or legal approval, which switch keeps it dark until then, and what goes in `TODO.md`.

## Reviewing a design

- **Is the section there and complete?** Reject a spec without it, or with "TBD" controls.
- **Check each threat against a control:** is it closed, or only named?
- **Check each control has a test** in the plan.
- **Check the backend contract matches.** The browser is the last line of defence, not the only one: every server rule (small groups, hospital scope, roles) must also be in the mhai-multiagent contract.
- **Feed lessons back.** A new class found in review goes into the `security-review` skill's list.

## Then

- **While building:** follow the `secure-build` skill.
- **Before the PR:** run the `security-review` skill on your own diff.
