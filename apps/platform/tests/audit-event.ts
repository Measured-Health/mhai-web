// A well-formed audit entry for tests, built from `overrides`.
import type {
  AuditEvent,
  Checkpoint,
  VerifyRun,
} from "@/lib/api/audit-contract";

export const HASH = "a".repeat(64);

export function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "ev_1",
    seq: 42,
    hash: HASH,
    at: "2026-10-22T09:15:00Z",
    actor: {
      id: "u_ada",
      name: "Ada Bakare",
      role: "platform_admin",
      kind: "platform",
    },
    hospital: {
      id: "h_northgate",
      name: "Northgate General Hospital",
      removed: false,
    },
    type: "hospital_settings",
    kind: "hospital_deactivated",
    target: {
      kind: "hospital",
      id: "h_northgate",
      name: "Northgate General Hospital",
    },
    outcome: "succeeded",
    ip: "203.0.113.7",
    device: "Firefox 140 on macOS",
    flag: null,
    reason: "contract_ended",
    note: null,
    refs: { clearance_id: null, export_id: null, request_id: "req_9" },
    facts: {},
    after_break: false,
    ...overrides,
  };
}

export const checkpoint = (
  overrides: Partial<Checkpoint> = {},
): Checkpoint => ({
  id: "cp_2027_01",
  at: "2027-01-04T12:00:00Z",
  purged_count: 412_006,
  before: "2021-01-03T12:00:00Z",
  kind: "retention",
  incident_ref: null,
  reason: "retention",
  ...overrides,
});

/** An intact run with every piece of proof; its range was fixed at the start. */
export const intactRun = (overrides: Partial<VerifyRun> = {}): VerifyRun => ({
  id: "run_1",
  started_at: "2026-10-22T06:00:00Z",
  finished_at: "2026-10-22T06:01:00Z",
  by: null,
  state: "intact",
  entries_checked: 1_204_331,
  from_checkpoint: checkpoint(),
  from_first: false,
  to_seq: 9_881_204,
  to_at: "2026-10-22T06:00:00Z",
  first_broken_seq: null,
  first_broken_at: null,
  error_code: null,
  outcome: null,
  version: 1,
  ...overrides,
});
