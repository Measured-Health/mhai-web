---
name: bug-hunt
description: Use when looking for bugs in mhai-web: when a unit or e2e test fails or flakes, when asked to find what's broken, after a merge from main, or before calling a task done. Covers how to reproduce and prove a bug with a failing test, and the bugs this repo has actually had.
---

# Finding and proving bugs in mhai-web

A bug isn't found until a test fails because of it. A fix isn't done until that test passes and stays in the suite.

## Method

1. **Reproduce first.** Write the smallest failing test: a Vitest unit or component test before a Playwright spec.
2. **Read the failure, not your guess.** Open the real error, the DOM, the reply. Keep patient names out of whatever you paste or save.
3. **Bisect.** Was it ever green? If so, `git bisect` to the change. Check whether main fails too: several "regressions" here were the date moving on, not the code.
4. **Fix the cause, not the symptom.** Then search for the same pattern in the other app and in `packages/` and fix the whole class.
5. **Keep the test.** Name it after the behaviour, not the bug.

## Bugs this repo has actually had

- **Date-dependent e2e counts.** A spec pinned a group size that sample data derives from today, and it broke when the day turned (`2419854`). Read the value from the page, or pin the clock (`page.clock` in Playwright, `vi.setSystemTime` in Vitest). Never hard-code a count that depends on now.
- **Flaky tests.** The session tamper test sometimes flipped only spare base64 bits, so the cookie still unsealed (`ffefeb0`). A flaky test is a bug in the test or the code: run it 20 times (`--repeat-each=20` in Playwright, a loop in Vitest), find what varies (time, order, shared state, ports, randomness) and fix that. No retries or sleeps to hide it.
- **Shared component changes breaking the other app.** A change in `packages/ui` (charts, dialog, sheet, guards) or `packages/api-client` is used by both apps. Run both apps' tests and e2e, not just the one you were working on.
- **Merges from main breaking shared lists.** Lists that grow on both sides (`SHAPES` in the route and in `proxy.test.ts`, `AUDITOR_WRITES`, `ADMIN_ONLY_READS`, `PART_PAIRS`, `VENDOR_NAMES`, `FORBIDDEN_TERMS`, length assertions like `toHaveLength(15)`) merge without a conflict and still go wrong. After a merge, rerun the full suite and read the merged list.
- **Keyboard order.** The phone chart scroller was a tab stop of its own beside its focusable columns (`1568c13`). Tab through every changed screen on desktop and phone.
- **Leaks found late.** Totals that didn't add up across scopes, a CSV cell that differed from the screen, a gate that turned back on with a refetch.

## Edge cases to try

- **Time:** day and month turns, an end date exactly now, `named_until` passing while the page is open, the 72-hour outbox limit, the 15-minute idle sign-out.
- **Sign-out and sign-in:** a second sign-in in the same tab, another user at the same PC, idle versus manual sign-out (the outbox differs).
- **Replies:** a missing or extra key, `null` where a number is expected, a 1–4 shown, an unknown status, a 409, a 403 with an ending code, a slow or failed upstream (503).
- **Roles:** auditor versus platform admin, clinician without `hospital_admin`, two-step off, owed first-sign-in steps.
- **Totals that must add up:** parts versus the whole, both scopes, the CSV versus the screen.
- **Layout:** the e2e `mobile` project, long names and labels, reduced motion.

## Done means

- [ ] A failing test showed the bug, and it passes now.
- [ ] The same pattern was searched for and fixed in both apps and the packages.
- [ ] `npm run lint`, `typecheck`, `format:check`, `test`, `build`, `node --test "scripts/**/*.test.mjs"` and both e2e suites are green.
