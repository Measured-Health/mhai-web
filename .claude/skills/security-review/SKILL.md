---
name: security-review
description: Use when reviewing a change, PR or branch in mhai-web for vulnerabilities, before merge or when asked to check something is secure. Gives the method and the checklist of frontend vulnerability classes this repo has actually had.
---

# Security review for mhai-web

Review as an attacker would, not as the author. Every finding needs a concrete way to exploit it, a file:line and a fix. A suspicion with no exploit path is at most Minor.

## Method

1. **Scope.** List what the diff touches: proxy shapes, roles, queries and their `gcTime`, readers, CSVs, storage, URLs, auth screens, shared components in `packages/ui`. Read the spec's **Security and threat model** section and CONTRIBUTING's "Patient data in the browser".
2. **Trust boundaries.** For each input (a reply field, a header, a query param, a body), ask who controls it and where it is checked. Follow each output to the screen, the CSV, the URL, the cache and the logs.
3. **Try each class below.** Write what you tried and what stopped it. "Looks fine" is not a result.
4. **Prove it.** Where you can, write a throwaway test (a crafted reply into the reader, a request into `handle()`, a render after sign-out), then remove it. Mark findings CONFIRMED (shown) or PLAUSIBLE (reasoned).
5. **Rate severity.**
   - **Critical:** patient data leaked (URL, storage, artefact, export), a token in the browser, an auth or role bypass in the BFF.
   - **Important:** a real exploit path with conditions, a fail-open reader or gate, a small-group leak.
   - **Minor:** hardening.

## Classes this repo has actually had

- **Patient data at rest in the browser:** a name or MRN in the URL, title, console or storage; a patient list without `gcTime: 0`; data left in the query cache after sign-out; a refetch that records a second named view.
- **Names in test artefacts:** a spec that renders names with trace, screenshot, video or `error-context.md` still on.
- **Over-broad proxy shapes:** a prefix match, an `{id}` that swallows a reserved word (`team/invites`, `audit/verify`), a method not in the list, a route `SHAPES` row missing from the test list or the reverse.
- **Forwarded or echoed headers and text:** a client header passed upstream, upstream error text shown, a file reply with an unchecked type.
- **Lingering secrets:** a step-up code, backup code or SSO secret left in component state or the mutation cache after the call.
- **Fail-open readers:** a view that shows the rest when one value should have been hidden; a shown 1–4; a hidden value with its number; an extra key.
- **Subtraction leaks:** whole minus parts of 1–4, a rate's complement, exactly one hidden member, the same figure differing across scopes, a remainder like cases − new or consultations − rated.
- **CSV holds more than the screen:** a column, id or unhidden value the view doesn't show; words that differ from the screen ("Not shown", "Fewer than 5").
- **Gates that switch back on:** `analysis_off` or `named_access_off` undone by a refetch or a later reply.
- **Account enumeration:** different wording for an unknown and a locked account.
- **Incomplete sign-out:** a hand-off, history or cache that survives.
- **Auditor writes:** a write control shown to an auditor, or a shape missing from the auditor checks.
- **Unsafe writes:** no Idempotency-Key, no version, a 409 that retries over someone else's change.
- **Vendor names:** in code, fixtures, identifiers or copy; "lab" wording in the UI.

## Also check

- **The browser never holds the token,** and the client never sends a user id.
- **Every refusal happens before upstream** and returns only the problem code.
- **Sign-off switches** keep features dark with 404 and can only turn them off.
- **Accessibility regressions:** focus lost on close, an extra tab stop, a phone layout that hides a control.
- **Tests** are real abuse-case tests that would fail without the fix.

## Report

Write findings with: severity, CONFIRMED or PLAUSIBLE, file:line, the exploit in one or two sentences, and the fix. Reply with a verdict line, then one line per Critical or Important finding.
