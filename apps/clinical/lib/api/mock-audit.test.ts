import { beforeEach, describe, expect, it } from "vitest";
import type { ActivityEventOut } from "./admin-contract";
import { auditEvents, recordAudit, resetAudit } from "./mock-audit";

const event: Omit<ActivityEventOut, "id"> = {
  at: "2026-10-22T08:00:00.000Z",
  type: "security",
  kind: "analysis_patients_viewed",
  actor: { display_name: "Dr Mensah" },
  target: null,
  specialty: null,
  confidence: null,
  device: null,
  count: null,
  flag: null,
};

beforeEach(resetAudit);

describe("sample audit trail", () => {
  it("starts empty and keeps what was recorded, with its own ids", () => {
    expect(auditEvents()).toEqual([]);
    recordAudit(event);
    recordAudit({ ...event, kind: "analysis_named_viewed" });
    const all = auditEvents();
    expect(all.map((e) => e.kind)).toEqual([
      "analysis_patients_viewed",
      "analysis_named_viewed",
    ]);
    expect(new Set(all.map((e) => e.id)).size).toBe(2);
    expect(all[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hands out copies, and resets", () => {
    recordAudit(event);
    auditEvents()[0].kind = "changed";
    expect(auditEvents()[0].kind).toBe("analysis_patients_viewed");
    resetAudit();
    expect(auditEvents()).toEqual([]);
  });
});
