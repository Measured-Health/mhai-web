import { describe, expect, it } from "vitest";
import { ALERT_NOW, at, makeAlert } from "@/tests/alerts";
import { FORBIDDEN_TERMS } from "../labels";
import {
  ALERT_STATUS_LABEL,
  DISMISS_REASONS,
  LOCATION_NOT_RECORDED,
  NOT_STANDARDISED,
  SEVERITY,
  findingLine,
  handledLine,
  likelyCauses,
  locationLabel,
  recordLink,
  recordedLabel,
  severityOf,
  showSources,
} from "./alert-view";

const f = makeAlert().finding;

describe("alert wording", () => {
  it("writes the finding as in the spec's example", () => {
    expect(findingLine(f)).toBe("Potassium 2.9 mmol/L (low; normal 3.5–5.1)");
    expect(recordedLabel(f, ALERT_NOW)).toBe("08:42");
  });

  it("says where the patient is", () => {
    expect(
      locationLabel({ kind: "admitted", ward: "Ward 3", bed: "Bed 12" }),
    ).toBe("Ward 3 · Bed 12");
    expect(locationLabel({ kind: "admitted", ward: "Ward 5", bed: null })).toBe(
      "Ward 5",
    );
    expect(
      locationLabel({ kind: "outpatient", clinic: "Cardiology clinic" }),
    ).toBe("Outpatient · Cardiology clinic");
    expect(locationLabel({ kind: "outpatient", clinic: null })).toBe(
      "Outpatient",
    );
    expect(locationLabel({ kind: "emergency" })).toBe("Emergency department");
    expect(locationLabel(null)).toBe("Location not recorded");
  });

  it("gives likely causes the result labels' words, at most three", () => {
    expect(likelyCauses(makeAlert())).toEqual([
      { label: "Diuretic treatment", level: "high", word: "High confidence" },
      {
        label: "Vomiting or diarrhoea",
        level: "caution",
        word: "Use with caution",
      },
      { label: "Low magnesium", level: "review", word: "Needs review" },
    ]);
    const four = makeAlert({
      likely_causes: [
        ...makeAlert().likely_causes,
        { label: "Fourth", confidence: "high" },
      ],
    });
    expect(likelyCauses(four)).toHaveLength(3);
  });

  it("says who handled it and when", () => {
    expect(handledLine(makeAlert(), ALERT_NOW)).toBeNull();
    expect(
      handledLine(
        makeAlert({
          status: "handled",
          handled_by: { display_name: "Dr. Reyes" },
          handled_at: at(9, 12),
        }),
        ALERT_NOW,
      ),
    ).toBe("Acknowledged by Dr. Reyes · 09:12");
    expect(
      handledLine(
        makeAlert({
          status: "dismissed",
          handled_by: { display_name: "Nurse Bello" },
          handled_at: new Date(2026, 9, 16, 4, 20).toISOString(),
          dismiss_reason: "already_known",
        }),
        ALERT_NOW,
      ),
    ).toBe("Dismissed by Nurse Bello · 16 Oct 04:20 · Already known");
  });

  it("opens only an https record link from the API (R8)", () => {
    expect(recordLink("https://record.example/open/a1")).toBe(
      "https://record.example/open/a1",
    );
    for (const bad of [
      null,
      undefined,
      "",
      "http://record.example/open/a1",
      "javascript:alert(1)",
      "/open/a1",
      "not a url",
    ])
      expect(recordLink(bad)).toBeNull();
  });

  it("shows sources only with more than one connected system (R10)", () => {
    expect(showSources(["Main record"])).toBe(false);
    expect(showSources(["Main record", "Results system"])).toBe(true);
    expect(showSources(undefined)).toBe(false);
  });

  it("degrades missing and unusual data without guessing (Review Focus 4)", () => {
    expect(locationLabel(null)).toBe(LOCATION_NOT_RECORDED);
    expect(locationLabel({ kind: "ward-ish" } as never)).toBe(
      LOCATION_NOT_RECORDED,
    );
    expect(
      findingLine({
        ...f,
        value: null,
        flag: null,
        reference_range: null,
      }),
    ).toBe("Potassium");
    expect(findingLine({ ...f, reference_range: null })).toBe(
      "Potassium 2.9 mmol/L (low)",
    );
    expect(findingLine({ ...f, flag: null })).toBe(
      "Potassium 2.9 mmol/L (normal 3.5–5.1)",
    );
    expect(findingLine({ ...f, unit: null })).toBe(
      "Potassium 2.9 (low; normal 3.5–5.1)",
    );
    // An unknown flag is still out of range: it never reads as normal (F4).
    expect(findingLine({ ...f, flag: "sideways" as never })).toBe(
      "Potassium 2.9 mmol/L (abnormal; normal 3.5–5.1)",
    );
    expect(
      findingLine({
        ...f,
        flag: "constructor" as never,
        reference_range: null,
      }),
    ).toBe("Potassium 2.9 mmol/L (abnormal)");
    expect(recordedLabel({ recorded_at: null }, ALERT_NOW)).toBeNull();
    expect(recordedLabel({ recorded_at: "garbage" }, ALERT_NOW)).toBeNull();
    expect(severityOf("critical")).toBe("critical");
    expect(severityOf("catastrophic")).toBe("urgent");
    expect(severityOf("constructor")).toBe("urgent");
    expect(likelyCauses(makeAlert({ likely_causes: [] }))).toEqual([]);
    expect(
      likelyCauses(
        makeAlert({
          likely_causes: [
            { label: "Odd", confidence: "certain" as never },
            { label: "  ", confidence: "high" },
          ],
        }),
      ),
    ).toEqual([{ label: "Odd", level: "review", word: "Needs review" }]);
    expect(
      handledLine(
        makeAlert({ status: "handled", handled_by: null, handled_at: null }),
        ALERT_NOW,
      ),
    ).toBe("Acknowledged");
  });

  it("keeps the backend codes out of every shown word", () => {
    for (const code of ["invalid_reason", "note_too_long", "invalid_cursor"])
      expect(FORBIDDEN_TERMS).toContain(code);
  });

  it("uses plain words only, and never 'lab'", () => {
    const shown = [
      ...Object.values(SEVERITY).map((s) => s.label),
      ...Object.values(ALERT_STATUS_LABEL),
      ...DISMISS_REASONS.map((r) => r.label),
      LOCATION_NOT_RECORDED,
      NOT_STANDARDISED,
    ].join(" ");
    for (const term of FORBIDDEN_TERMS)
      expect(shown.toLowerCase()).not.toContain(term.toLowerCase());
    expect(shown).not.toMatch(/\blab\b/i);
  });
});
