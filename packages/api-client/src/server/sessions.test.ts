// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readSessionList } from "./sessions";

const row = {
  id: "0b8c7a9e-6a43-4b8e-9a3c-1f2d3e4f5a6b",
  created_at: "2026-11-14T08:00:00Z",
  last_seen_at: "2026-11-14T09:30:00Z",
  ua_summary: "Chrome on Windows",
  ip_prefix: "203.0.113.0/24",
  current: true,
};

describe("readSessionList (core's GET /auth/sessions, SessionList)", () => {
  it("maps each session to a device, without the network prefix", () => {
    expect(readSessionList({ sessions: [row] })).toEqual([
      {
        id: row.id,
        label: "Chrome on Windows",
        place: null,
        lastActiveAt: Date.parse("2026-11-14T09:30:00Z"),
        current: true,
      },
    ]);
  });

  it("names a device it can't describe plainly", () => {
    expect(
      readSessionList({ sessions: [{ ...row, ua_summary: null }] })[0]!.label,
    ).toBe("Unknown device");
  });

  it("an empty list is no devices", () => {
    expect(readSessionList({ sessions: [] })).toEqual([]);
  });

  it.each([
    ["a bare array (the old assumed shape)", [row]],
    ["no sessions key", {}],
    ["a session without an id", { sessions: [{ ...row, id: 7 }] }],
    ["an unreadable time", { sessions: [{ ...row, last_seen_at: "soon" }] }],
    ["current not a boolean", { sessions: [{ ...row, current: "yes" }] }],
    [
      "an over-long label",
      { sessions: [{ ...row, ua_summary: "x".repeat(201) }] },
    ],
    ["null", null],
  ])("fails closed on %s", (_, raw) => {
    expect(() => readSessionList(raw)).toThrow(TypeError);
  });
});
