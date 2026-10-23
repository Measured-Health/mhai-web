import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/api/contract";
import type {
  RetentionItem,
  SettingsRequest,
} from "@/lib/api/settings-contract";
import {
  notReadyLabel,
  requestIsKnown,
  requestLabel,
  retentionIsKnown,
  retentionTypeLabel,
} from "./labels";

const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };
const base = {
  id: "req_1",
  requested_by: TUNDE,
  requested_at: "2026-10-20T10:00:00Z",
  reason: "Policy",
  requested_by_you: false,
  expires_at: "2026-10-27T10:00:00Z",
  version: 2,
};

describe("settings labels", () => {
  it("words every retention type", () => {
    expect(
      (
        ["records", "documents", "pending_corrections", "audit_log"] as const
      ).map(retentionTypeLabel),
    ).toEqual([
      "Questions and answers",
      "Documents",
      "Waiting corrections",
      "Audit log",
    ]);
  });

  it("words every not-ready reason", () => {
    expect(notReadyLabel("missing_report")).toBe(
      "Not ready: the validation report is missing",
    );
    expect(notReadyLabel("missing_files")).toBe(
      "Not ready: the scoring files are missing",
    );
    expect(notReadyLabel("checksum_mismatch")).toBe(
      "Not ready: the scoring files don't match their validation report",
    );
  });

  it("words a request: {type} to {period}, or Triage on", () => {
    expect(
      requestLabel({
        ...base,
        kind: "retention_shorten",
        type: "records",
        from: 2190,
        to: 1095,
      }),
    ).toBe("Questions and answers to 3 years");
    expect(
      requestLabel({
        ...base,
        kind: "triage_on",
        from: false,
        to: true,
        clinical_signoff: "Dr A, ref 1",
      }),
    ).toBe("Triage on");
  });

  it("a value this app doesn't know is never shown raw", () => {
    expect(() => retentionTypeLabel("backups" as never)).toThrow();
    expect(() => notReadyLabel("other" as never)).toThrow();
    const strange = {
      ...base,
      kind: "retention_shorten",
      type: "backups",
      from: 2190,
      to: 1095,
    } as unknown as SettingsRequest;
    expect(() => requestLabel(strange)).toThrow();
    expect(requestIsKnown(strange)).toBe(false);
    expect(
      requestIsKnown({ ...base, kind: "pause" } as unknown as SettingsRequest),
    ).toBe(false);
    const item = { type: "backups" } as unknown as RetentionItem;
    expect(retentionIsKnown(item)).toBe(false);
    expect(retentionIsKnown({ type: "records" } as RetentionItem)).toBe(true);
  });
});
