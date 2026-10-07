## What and why

<!-- What changed and the reason. Link issues: "Closes #123". -->

## How it was tested

<!-- Commands and results. For UI changes, screenshots using mock or
synthetic data only. -->

## What wasn't verified

<!-- Anything you couldn't check, and why. Write "Nothing" if so. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` pass
- [ ] Tests added or updated for new logic
- [ ] No PHI in console logs, browser storage, analytics or error tracking; mock or synthetic data only in code, tests and screenshots
- [ ] Clinician-facing wording follows the plain-language rules (no "NLI", "trust score", PASS/REGENERATE/ESCALATE, KB ids)
- [ ] Changes how results, confidence or citations are shown? Labelled `clinical-review`
- [ ] API types come from the backend OpenAPI schema, not written by hand
- [ ] CHANGELOG.md updated under _Unreleased_ for user-visible changes
