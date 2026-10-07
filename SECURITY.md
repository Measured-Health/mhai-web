# Security policy

mhai-web is the clinician-facing frontend for MHAI, a clinical decision-support
system that processes patient records.
Please report vulnerabilities privately; don't open a public issue.

## Reporting

Use **GitHub private vulnerability reporting**: the repository's
_Security_ tab, then _Report a vulnerability_. Include:

- what's affected (file, endpoint, configuration) and the impact;
- steps to reproduce, using synthetic data only;
- any suggested fix.

**Never include real patient data, credentials or tokens in a report.** If
you found exposed PHI or secrets, say where they are; don't copy them.

We aim to acknowledge reports within 3 working days and to agree a fix
timeline after triage.

## Scope

In scope:

- PHI cached or persisted in the browser (storage, service workers);
- PHI sent to logs, analytics or error tracking;
- role-based UI bypasses that show patient data to the wrong role;
- unverified or escalated results shown as verified;
- XSS;
- secret exposure;
- supply-chain issues in this repository.

Backend security rules: SKILLS.md in Measured-Health/mhai-multiagent.

## Supported versions

Only the latest release and `main` receive security fixes.
