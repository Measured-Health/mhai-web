import { describe, expect, it } from "vitest";
import type {
  SwitchChange,
  SwitchRequest,
  SwitchState,
} from "@/lib/api/clearances-contract";
import {
  lowerOptions,
  positionLine,
  raiseOptions,
  requestLine,
  signoffProblem,
} from "./switch";

const ada = { id: "tm_ada", name: "Ada Bakare" };
const tunde = { id: "tm_tunde", name: "Tunde Okafor" };
const ok = { by: "Dr A, Clinical lead", at: "2026-10-01", ref: "DOC-1" };
const signoffs = { clinical: ok, privacy: ok, legal: ok };

const change = (over: Partial<SwitchChange>): SwitchChange => ({
  at: "2027-02-03T09:00:00Z",
  from: "off",
  to: "on",
  requested_by: ada,
  approved_by: tunde,
  lowered_by: null,
  reason: null,
  signoffs,
  ...over,
});
const state = (over: Partial<SwitchState>): SwitchState => ({
  position: "on",
  since: "2027-02-03T09:00:00Z",
  history: [change({})],
  request: null,
  version: 1,
  ...over,
});

describe("positionLine", () => {
  it("names who asked and who approved a raise", () => {
    expect(positionLine(state({}))).toBe(
      "On since 3 Feb 2027 · requested by Ada Bakare, approved by Tunde Okafor",
    );
    expect(
      positionLine(
        state({
          position: "letters_only",
          history: [change({ to: "letters_only" })],
        }),
      ),
    ).toBe(
      "Letters only since 3 Feb 2027 · requested by Ada Bakare, approved by Tunde Okafor",
    );
  });
  it("gives the reason for a lowering", () => {
    expect(
      positionLine(
        state({
          position: "off",
          history: [
            change({
              from: "on",
              to: "off",
              requested_by: null,
              approved_by: null,
              lowered_by: tunde,
              reason: "Pausing for a review",
              signoffs: null,
            }),
            change({}),
          ],
        }),
      ),
    ).toBe(
      "Off since 3 Feb 2027 · turned down by Tunde Okafor: Pausing for a review",
    );
  });
  it("says Off with no history", () => {
    expect(
      positionLine(state({ position: "off", since: null, history: [] })),
    ).toBe("Off");
  });
});

describe("instants", () => {
  it("show the viewer's own day, near midnight either side", () => {
    for (const [h, m] of [
      [23, 30],
      [0, 30],
    ]) {
      const at = new Date(2027, 1, 3, h, m).toISOString();
      expect(positionLine(state({ since: at }))).toContain(
        "On since 3 Feb 2027",
      );
    }
  });
});

describe("options", () => {
  it("stops a hospital's raise at the global position", () => {
    expect(raiseOptions("off", "letters_only")).toEqual(["letters_only"]);
    expect(raiseOptions("off", "on")).toEqual(["letters_only", "on"]);
    expect(raiseOptions("letters_only", "letters_only")).toEqual([]);
    expect(raiseOptions("on", "on")).toEqual([]);
    expect(raiseOptions("off", "off")).toEqual([]);
  });
  it("lowers to anything below", () => {
    expect(lowerOptions("on")).toEqual(["off", "letters_only"]);
    expect(lowerOptions("letters_only")).toEqual(["off"]);
    expect(lowerOptions("off")).toEqual([]);
  });
});

describe("requestLine", () => {
  const r = (over: Partial<SwitchRequest>): SwitchRequest => ({
    id: "rq1",
    kind: "named_access",
    requested_by: ada,
    requested_at: "2027-02-02T10:00:00Z",
    reason: "",
    requested_by_you: false,
    expires_at: "2027-02-09T10:00:00Z",
    hospital: null,
    position: "on",
    signoffs,
    ...over,
  });
  it("says who asked", () => {
    expect(requestLine(r({}))).toBe(
      "Ada Bakare asked to turn it On · 2 Feb 2027",
    );
  });
  it("tells the requester to wait for a different admin", () => {
    expect(requestLine(r({ requested_by_you: true }))).toBe(
      "Ada Bakare asked to turn it On · 2 Feb 2027 · Waiting for a different platform admin to approve",
    );
  });
});

describe("signoffProblem", () => {
  const FILL =
    "Fill in who signed, when, and the document for clinical, privacy and legal";
  it("is null when all three are complete", () => {
    expect(signoffProblem(signoffs, "2026-10-23")).toBeNull();
  });
  it("asks for legal when it is missing", () => {
    expect(signoffProblem({ clinical: ok, privacy: ok }, "2026-10-23")).toBe(
      FILL,
    );
  });
  it("asks when a field is blank or the date is malformed", () => {
    expect(
      signoffProblem(
        { ...signoffs, legal: { ...ok, ref: "  " } },
        "2026-10-23",
      ),
    ).toBe(FILL);
    expect(
      signoffProblem(
        { ...signoffs, legal: { ...ok, at: "yesterday" } },
        "2026-10-23",
      ),
    ).toBe(FILL);
  });
  it("limits each field to 200 characters", () => {
    expect(
      signoffProblem(
        { ...signoffs, privacy: { ...ok, ref: "x".repeat(201) } },
        "2026-10-23",
      ),
    ).toBe("Keep each sign-off entry to 200 characters or fewer");
    expect(
      signoffProblem(
        { ...signoffs, privacy: { ...ok, ref: "x".repeat(200) } },
        "2026-10-23",
      ),
    ).toBeNull();
  });
  it("refuses a date in the future", () => {
    expect(
      signoffProblem(
        { ...signoffs, legal: { ...ok, at: "2026-10-24" } },
        "2026-10-23",
      ),
    ).toBe("A sign-off date can't be in the future");
    expect(
      signoffProblem(
        { ...signoffs, legal: { ...ok, at: "2026-10-23" } },
        "2026-10-23",
      ),
    ).toBeNull();
  });
});
