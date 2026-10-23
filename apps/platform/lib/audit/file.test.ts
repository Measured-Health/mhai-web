import { describe, expect, it } from "vitest";
import { auditEvent } from "@/tests/audit-event";
import { EVENT_COLUMNS, auditFile } from "./file";

const BOM = "﻿";
const base = {
  kind: "events" as const,
  exportId: "exp_7",
  by: { id: "u_ada", name: "Ada Bakare" },
  at: "2026-10-22T09:05:00Z",
  reason: "legal_request" as const,
  note: null,
  reference: "CASE-12",
  filtersWords: "All hospitals · 23 Sep–22 Oct 2026",
  demo: false,
  capped: false,
};
/** The file's lines, after the byte-order mark. */
const lines = (csv: string) => {
  expect(csv.startsWith(BOM)).toBe(true);
  return csv.slice(1).split("\r\n");
};

describe("auditFile", () => {
  it("the header rows carry export id, who, when (UTC), reason, reference, filters and Demo", () => {
    const l = lines(auditFile({ ...base, rows: [auditEvent()], demo: true }));
    expect(l.slice(0, 10)).toEqual([
      "Demo,Sample data – not a real export",
      "Export id,exp_7",
      "Made by,Ada Bakare",
      "Made at (UTC),22 Oct 2026 09:05 UTC",
      "Reason,Legal request",
      "Reference,CASE-12",
      "Filters,All hospitals · 23 Sep–22 Oct 2026",
      "Rows,1",
      "Capped,No",
      "",
    ]);
    expect(l[10]).toBe(EVENT_COLUMNS.join(","));
    expect(l[10]).toBe(
      "Position,Fingerprint,Time (UTC),Who,Role,Kind,Hospital,Action type,Action,Target,Outcome,IP address,Device,Flags,Reason,Note,Clearance,Export,Request,After an integrity failure",
    );
    expect(l[11].split(",")).toEqual([
      "42",
      "a".repeat(64),
      "22 Oct 2026 09:15 UTC",
      "Ada Bakare",
      "Platform admin",
      "Measured Health",
      "Northgate General Hospital",
      "Hospital settings",
      "Deactivated Northgate General Hospital",
      "Northgate General Hospital",
      "Succeeded",
      "203.0.113.7",
      "Firefox 140 on macOS",
      "",
      "Contract ended",
      "",
      "",
      "",
      "req_9",
      "",
    ]);
    // A real export has no Demo line; a capped one says so; Other carries its note.
    const real = lines(
      auditFile({
        ...base,
        reason: "other",
        note: "Board review",
        reference: null,
        capped: true,
        rows: [],
      }),
    );
    expect(real[0]).toBe("Export id,exp_7");
    expect(real).toContain("Reason,Other · Board review");
    expect(real).toContain("Reference,");
    expect(real).toContain("Capped,Yes");
  });

  it("an undisplayable row writes Not displayable", () => {
    const l = lines(
      auditFile({
        ...base,
        rows: [
          {
            ...auditEvent({ id: "ev_9", seq: 77 }),
            note: "Jane Doe",
            kind: "signed_in",
            type: "sign_in",
          },
        ],
      }),
    );
    const row = l[10].split(",");
    expect(row[0]).toBe("77");
    expect(row[8]).toBe("Not displayable · ev_9");
    expect(row.filter((c) => c !== "")).toEqual([
      "77",
      "Not displayable · ev_9",
    ]);
    expect(l.join("\n")).not.toContain("Jane");
  });

  it("no cell carries a name for a patient target", () => {
    const named = auditEvent({
      type: "named_access",
      kind: "drilldown_named",
      reason: null,
      target: { kind: "patient" },
      facts: { patient_count: 3 },
    });
    const csv = auditFile({
      ...base,
      rows: [
        named,
        {
          ...named,
          id: "ev_2",
          target: { kind: "patient", name: "Jane Doe" } as never,
        },
      ],
    });
    expect(csv).not.toContain("Jane Doe");
    // Nor a name on a target the kind doesn't name.
    const staff = auditFile({
      ...base,
      rows: [
        {
          ...named,
          target: { kind: "staff", id: "s_1", name: "Jane Doe MRN 1234" },
        },
      ],
    });
    expect(staff).not.toContain("Jane Doe");
    // Events files never carry the pseudonym either.
    expect(csv).not.toContain("p_ng_7f3a2c");
    expect(lines(csv)[10].split(",")[9]).toBe("A patient");
  });

  it("named-access files list pseudonyms", () => {
    const e = auditEvent({
      type: "named_access",
      kind: "drilldown_named",
      reason: "clinical_follow_up",
      target: null,
      facts: { patient_count: 3, view: "unknown_view" },
      refs: {
        clearance_id: "cl_northgate_2026",
        export_id: null,
        request_id: null,
      },
    });
    const l = lines(
      auditFile({
        ...base,
        kind: "named_access",
        rows: [
          { ...e, pseudonyms: ["p_ng_7f3a2c", "p_ng_19be04", "p_ng_aa0001"] },
          { ...e, id: "ev_bad", seq: 5, pseudonyms: ["Jane Doe"] },
        ],
      }),
    );
    const head = l[9].split(",");
    expect(head.slice(8, 12)).toEqual([
      "Action",
      "View",
      "Patients",
      "Patient ids",
    ]);
    const row = l[10].split(",");
    expect(row[9]).toBe("a patient list");
    expect(row[10]).toBe("3");
    expect(row[11]).toBe("p_ng_7f3a2c;p_ng_19be04;p_ng_aa0001");
    expect(row[head.indexOf("Clearance")]).toBe("cl_northgate_2026");
    expect(l[11]).not.toContain("Jane");
    expect(l[11].split(",")[8]).toBe("Not displayable · ev_bad");
  });

  it("formula-like cells are escaped", () => {
    const csv = auditFile({
      ...base,
      filtersWords: "=1+1",
      rows: [
        auditEvent({
          actor: {
            id: "u_x",
            name: '=HYPERLINK("x")',
            role: "auditor",
            kind: "platform",
          },
          target: { kind: "hospital", id: "h_1", name: "@SUM(A1)" },
        }),
      ],
    });
    expect(csv).toContain("Filters,'=1+1");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).not.toMatch(/,=|,@/);
  });
});
