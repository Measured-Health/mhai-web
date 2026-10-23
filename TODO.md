# TODO

The frontend was called finished for the team demo on 23 Oct 2026. Everything below is what's left. Remove an entry once it's done or decided.

## Next plans

- **Plan 12: Analysis across hospitals (platform admin app).** It's designed and planned, but not built. The spec and plan are on branch `agent/platform-designs`. 12b (the drill-down for one hospital) uses Plan 11's letters that name Measured Health people.
- **EMR integration beyond the screens.** Plan 13 built the screens on sample data only. Still to do:
  - real connections through the backend (ADR 0003: one connector per EMR type, a FHIR R4 canonical model);
  - "Open patient record" links;
  - patient-facing explanations, which a clinician reviews before anything is sent;
  - the rest of the EMR design follow-ups.
- **Reference documents for MHAI** (guidelines, protocols). Upload isn't in any plan yet; it needs scoping.

## Sign-offs and live switches

- Clinical, privacy and legal sign-off for:
  - Analysis (`ANALYSIS_SIGNED_OFF`);
  - Named access (`NAMED_ACCESS_SIGNED_OFF`, plus the backend switch raised by two platform admins);
  - Analysis across hospitals (two backend switches).

  The packs are in `MHAI-sign-off-packs.pdf`. Live stays off until they're signed.

- The real IP allowlist for the platform admin app. The demo allows everyone.

## Backend contracts still marked Assumed

The frontend uses these on sample data. Each must be built or confirmed in mhai-multiagent, which lists them in its own TODO.md:

- §10 Analysis and clearance letters (hospital side);
- §14.10 platform clearances and the switch, including the `today` fields and the revoke refusals;
- `POST /analysis/patients/named`, and `clearance/me` with `reason`;
- §14.11 record connections;
- §12 alert settings, routing and evidence;
- §14.8 analysis across hospitals.

## Known limits

- **Analysis status line (M4).** It uses the viewer's day, not the hospital's. The server's check is the source of truth.
- **Named view end time (M8).** The browser clock is compared with `named_until`. The server's 30-second check is the source of truth.
- **Removed hospitals.** Edit, switch and test still work on a removed hospital's record connections; only Add is refused.
- **Alert settings (Plan 13).** Saving has no two-step code, by design (D8). Revisit if sign-off asks for one.
- **Audit trail for connection events.** The audit-log wording for connection events is unit-tested only. The platform's sample audit data has no connection events.
- **Demo sample data.** The named view ends after at most one hour. This is a stand-in for the server's earliest-end rule, not a product rule.

## Parked review findings (Minors)

None of these block the demo. The full lists are in each plan's review notes.

- **Plan 11:**
  - the switch panel: no 409 `expired` panel test; Turn down silently cancels a pending raise; a code-step 422 says "Check the highlighted fields" with nothing highlighted; the sign-off date limit can go stale across midnight; polish;
  - named Analysis: a dedicated e2e for the 30 s end; the phone test's final checks are weak.
- **Plan 13:**
  - Alert settings: fieldsets; focus after removing a chip; a staff list that fails to load; offline inside dialogs;
  - connections: phone cards aren't rendered in unit tests (no `matchMedia` in jsdom); loose filter-count assertions; no test for where the hospital-page section is mounted;
  - smaller items from the per-task reviews.
- **Earlier plans (6 to 9):** the remaining Minors noted in their PRs.

## Housekeeping

- **Dependabot PRs #28 to #38:** review and merge.
- **CI:** split the clinical e2e suite into a third shard if runs creep back up. A run takes about 6.5 minutes now.
- **Plan 9 doc:** still uses the old audit kind names; update it to the current ones.
