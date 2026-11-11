# Plan 7c (frontend): analytics on the merged backend

- **Date:** 2026-11-11
- **Backend:** mhai-multiagent `services/core/openapi.yaml` 1.15.0 (`GET /platform/analytics`, the two series routes, the follow-up `PUT`/`DELETE`, `GET /platform/guardrails/periods`) and `docs/specs/2026-11-07-plan-7c-platform-analytics-design.md` §13 (F1–F21) and §18. All merged, so nothing here is Assumed.
- **Rulings:** R41a (finished calendar periods only), R41a-2 (a week is a month-aligned block: days 1–7, 8–14, 15–21, 22 to the month's end; weeks nest in months, months in quarters), no total across periods.
- **Builds on:** `docs/plans/2026-10-22-plan-7c-platform-analytics.md` (the screens on sample data) and `docs/specs/2026-10-22-platform-analytics-design.md`.
- **Product owner, 11 Nov:** the simplest correct version.

## What changes

1. **Periods (F1, F3, F5, F15).** `Period` is `week | month | quarter`, picked as **Last week**, **Last month** (default), **Last quarter**. The page shows the period's dates ("1–31 Oct 2026") and says figures change only when a period ends. One calendar module (`lib/analytics/periods.ts`) gives a period's end and labels: weeks read as date ranges ("22–31 Oct"), never "week of". Trend and series columns are successive periods, labelled the same way.
2. **What changed (F2, F6, F16, F17, F21).** Read from `what_changed`; `changes` must be `{unavailable: true}`. The copy says it compares the latest week with the month before it, per day, and shows that window. Both sides are always shown values (a hidden side fails the area closed). The order is the server's, with followed-up rows below. A comparison chart with fewer than two periods says "Not enough data to compare yet".
3. **Areas.** `{not_yet: true, first_from}` shows "First figures after {period}" (never zeros, never Couldn't load), on screen and in the CSV (F19). `{unavailable: true}` is Couldn't load, per area (F13). `alerts: null` is "not switched on": the Alert safety tab says so, and the Critical guard has nothing to check (F4). `staff` is guarded (Q4 open).
4. **Hospitals and series (F10, F14).** The compare select offers questions per clinician and the needs-review share only. A change across all hospitals has `hospital: null` and no median line.
5. **Follow-ups (F7).** 422 `validation_failed` reads "Check the note"; 429 waits; 409 reloads; 403 says someone else followed it up. An emptied note is sent as `null`.
6. **Help text (F11).** Answer quality defines high/medium/low (pass/regenerate/escalate), needs review, and agreement rate.
7. **Guardrail statistics (F20).** `GET /platform/guardrails/periods?period=…`: proxy shape, client call and a strict reader. No screen reads guardrails today, so the old rolling route stays uncalled (F18).
8. **CSV (F15).** The first line and a Period column name each figure's period by its dates ("Month 1–31 Oct 2026"); What changed rows name both compared periods. Nothing sums periods.
9. **BFF.** The proxy checks the analytics query strings (`period`, `measure`) and the follow-up bodies against strict schemas before going upstream (422 `validation_failed`), and adds the guardrail periods shape.
10. **Reader.** Strict: an unknown key, a period start that isn't one of its kind, `to` not that period's end, a change on a hidden value, or a shown 1–4 fails the area closed.
11. **Mock and sample data.** Built from finished calendar periods (12 weeks, 12 months, 8 quarters), with backend-style changes (questions, needs-review share, agreement rate; no hospital name in the summary), `alerts: null`, and a `not_yet` mode.

## Security and threat model

- **Assets:** small counts about hospitals; follow-up notes (staff free text); the session.
- **Threats and controls:**
  - _Information disclosure (a hidden 1–4 shown, or worked out):_ the reader fails an area closed on any shown 1–4, a derived value over a hidden one, an unknown key, or a change on a hidden side; the app never adds periods together (no totals across periods on screen or in the CSV).
  - _Tampering (odd query strings or bodies reaching core):_ the proxy only forwards `period` and `measure` from their enums, and follow-up bodies of exactly `{version}` or `{note, version}`; anything else is 422 before upstream.
  - _Elevation:_ follow-up writes stay out of `AUDITOR_WRITES` (403 before upstream). Identity comes only from the session cookie.
  - _Notes:_ never written to the CSV, storage or the URL. No secret in the client; CSP unchanged.
- **Abuse-case tests (first):** a shown 3 or an extra key fails the area; `period=30d` and an unknown measure are 422 at the proxy with no upstream call; an extra body key is 422; an auditor's follow-up is 403; the CSV has no note and no cross-period total; `expectNoStorage` after the e2e flows.
- **Residual:** as the backend's §11.6 (bound-based narrowing; staff count under Q4).

## Tasks (TDD)

1. Calendar module and tests.
2. Contract, reader (strict) and tests; guardrail periods reader.
3. Fixtures and mock on calendar periods; mock tests.
4. Proxy schemas and shape; proxy tests. Live client call; live tests.
5. Screens: picker, What changed, not yet, alerts off, Hospitals, compare chart, follow-up words, help text; unit tests.
6. CSV and tests.
7. E2E (`usage.spec.ts`), TODO.md, CHANGELOG; full CI-equivalent on steven-reid.
