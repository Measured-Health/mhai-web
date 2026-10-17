import { describe, expect, it } from "vitest";
import { handledFields } from "./alert-handled";

describe("handledFields (the 409 who and when)", () => {
  it("keeps only the status, the display name and the time", () => {
    expect(
      handledFields({
        code: "already_handled",
        status: "dismissed",
        handled_by: {
          display_name: "Nurse Bello",
          id: "u-9",
          email: "nurse.bello@hospital.example",
        },
        handled_at: "2026-10-17T08:59:00.000Z",
        patient: { full_name: "Someone Else" },
        detail: "upstream text",
      }),
    ).toEqual({
      status: "dismissed",
      handled_by: { display_name: "Nurse Bello" },
      handled_at: "2026-10-17T08:59:00.000Z",
    });
  });

  it.each([
    [null],
    [{}],
    [{ status: "weird", handled_by: { display_name: 42 }, handled_at: 7 }],
    [{ status: "new", handled_by: "Dr. X", handled_at: "not a date" }],
    [{ handled_by: { display_name: "   " }, handled_at: "" }],
    [{ handled_by: null, handled_at: null }],
  ])("reads %j as handled by someone unnamed", (body) => {
    expect(handledFields(body as Record<string, unknown> | null)).toEqual({
      status: "handled",
      handled_by: null,
      handled_at: null,
    });
  });

  it("keeps an acknowledged status and caps a very long name", () => {
    const out = handledFields({
      status: "handled",
      handled_by: { display_name: "A".repeat(500) },
      handled_at: "2026-10-17T09:00:00Z",
    });
    expect(out.status).toBe("handled");
    expect(out.handled_by?.display_name).toHaveLength(200);
    expect(out.handled_at).toBe("2026-10-17T09:00:00Z");
  });
});
