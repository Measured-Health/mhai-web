# Plan 14: cloud models (the per-hospital switch and the notices)

- **Date:** 2026-11-07
- **Backend design:** mhai-multiagent `docs/specs/2026-11-03-cloud-model-providers-design.md` (approved 3 Nov; ADR 0013 there), §5.3 and §17 item 10.
- **Contract:** core `openapi.yaml` 1.10.0: `GET` and `PUT /platform/hospitals/{id}/model-policy` (`ModelPolicy`), and `generated_by` on `GET /queries/{id}/result`. Both are built and merged in core, so nothing here is Assumed.
- **Gate that stands:** no real patient data goes to a cloud model until the masker upgrade, the legal check and the clinical evaluation are signed off (design §13.6). The screens say so; they don't enforce it (the deployment's `CORE_CLOUD_PROVIDERS` and the signed agreement do).

## What we build

1. **Platform app: "AI model" on the hospital page.** A section under Single sign-on showing who drafts the hospital's answers (MHAI's own model, or Anthropic, OpenAI or xAI in the cloud), the agreement reference, the monthly token limit, when it was last changed, and this month's usage (used, held for answers in progress, share of the limit, a warning at 80%). Platform admins change it with **Change**: provider (off or one of three), agreement reference (only with a provider), monthly limit; **Save** opens the step-up dialog. Auditors read it. A removed hospital can't be changed.
   - Client checks, as a convenience only (core decides): `agreement_ref` matches `^(DEMO-SYNTHETIC|(AGR|DPA)-[0-9]{4}-[0-9]{2,8})$` after trimming and upper-casing; the limit is a whole number from 1 to 1,000,000,000 (commas and spaces allowed in the box). Off sends `agreement_ref: null`.
   - Refusals: **409** `conflict` means the provider isn't enabled on this deployment: the dialog closes and the provider field says so (not the usual "Changed by someone else"). **404**: the hospital is gone. **422**: check the details. **429** `rate_limited`: wait a minute. Code refusals stay in the dialog as everywhere else.
2. **Clinical app: who drafted the answer.** From `generated_by`: "Drafted by MHAI's own model" (local), or "Drafted by Anthropic (cloud AI)" with the notice "Identifying patient details were masked where detected before the question was sent." A cloud route with a provider this app doesn't know still says it was a cloud model. No label when `generated_by` is absent or malformed (show only what the API returns).
3. **BFF and clients.** Two proxy shapes, the live client calls with a fail-closed reader for `ModelPolicy`, the sample-data mock (Havana on Anthropic with `DEMO-SYNTHETIC` and usage; everyone else off; only Anthropic enabled, so OpenAI and xAI give the 409), and an Activity line for each change. Clinical fixtures carry `generated_by` (the normal answer from the cloud, the "use with caution" one local, the review one without it).

## Security and threat model

- **Assets:** the hospital's policy (which decides whether masked clinical text leaves the network), the step-up code, the session, clinical safety (a clinician must be able to see that a cloud model wrote the draft).
- **Boundaries:** browser → platform BFF (`app/api/v1/[...path]/route.ts`) → core over HTTP or NATS. Browser → clinical BFF → core for the result.
- **Threats and controls:**
  - _Elevation (an auditor or a hospital admin switches cloud on):_ the PUT is not in `AUDITOR_WRITES`, so the proxy refuses an auditor with 403 before upstream; the UI hides Change for auditors; clinical sessions never reach platform routes (separate apps and cookies). Core is the authority (`StepUp`, `platform_admin`).
  - _Tampering (a path or body naming something else):_ exact shapes `GET` and `PUT platform/hospitals/{id}/model-policy` only; the body carries no user id; writes drop the query string and carry an Idempotency-Key.
  - _Spoofing:_ the step-up code goes in the body as `mfa_code` or `backup_code`, through `useStepUpCall` (mutation `gcTime: 0`, reset after every answer); identity comes only from the session cookie.
  - _Information disclosure:_ no API key or secret is ever in the browser (keys live on the pipeline host only, design §7; the contract has none). Nothing here goes to storage, the URL or the title; the policy holds no patient data. Upstream error text is never echoed (the proxy keeps the code).
  - _Malformed replies:_ the live client reads `ModelPolicy` through a reader that fails closed (502) on an unknown provider, a bad reference, a negative or non-integer count, or an extra key. The clinical label reads `generated_by` defensively and never claims "local" unless the reply says so.
  - _CSP:_ unchanged.
- **Abuse-case tests (written first):** an auditor's PUT is 403 before upstream (proxy test); an auditor sees no Change (unit); the mutation cache holds no code after a save (unit); a provider not enabled shows the 409 words on the provider field (unit and e2e); a reference with a provider null is never sent (unit); a reply with an unknown provider or an extra key is refused by the live reader (unit); no storage after the flow (e2e `expectNoStorage`); a cloud route with an unknown provider still says cloud (unit).
- **Residual risk:** the label reports what core recorded; it can't prove the masking. The masker catches a name only when it follows a title ("Dr", "Mrs"): a bare name ("Adaeze Okafor has chest pain") is missed unless it is one of the patient's own recorded identifiers, which the egress scan blocks (backend design §4.4, §13.6). A relative's or a free-text name isn't caught at all. So both notices say "masked where detected", never "removed". Clinical review must approve both wordings (`clinical-review`) before live use, and the gap stays until the masker upgrade passes its recall bar.

## Tasks (TDD: each starts with a failing test)

1. Contract types, the reader and the live client (`model-policy-contract.ts`, `live.ts`); tests in `live.test.ts`.
2. Proxy shapes (route and `proxy.test.ts`), including the auditor 403.
3. Mock (`mock-model-policy.ts`) and its tests: auditor read, admin write, step-up, 409, 422s, 404, Activity line, idempotency.
4. Query hooks and the `ModelPolicySection` on the hospital page; unit tests.
5. Clinical: `generated_by` in the contract and fixtures, `generatedBy` in the result view, the label and notice on the result card; unit tests.
6. E2E: platform (Ada switches Havana off and on, the 409 for OpenAI, an auditor reads only); clinical (the label and notice on a normal answer, the local label on a "fever" answer).
7. TODO.md and CHANGELOG; full checks on steven-reid.

## Open for a person

- The notice wording on the clinical result, and whether it also belongs on the printed and exported result (not done here).
- Whether the platform audit log should show `hospital.model_policy_changed` with its own words (the frontend audit kinds are still an assumed contract).
