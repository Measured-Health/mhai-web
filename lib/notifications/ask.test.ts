import { describe, expect, it } from "vitest";
import { ALERT_NOW, makeAlert } from "@/tests/alerts";
import { validate } from "../form-schema";
import { askFromAlert, clearPrefill, readPrefill, stashPrefill } from "./ask";

describe("askFromAlert", () => {
  it("fills age, sex, priority, and the finding as a symptom and the question", () => {
    const v = askFromAlert(makeAlert(), ALERT_NOW);
    expect(v).toEqual({
      age: "67",
      sex: "female",
      urgency: "emergency",
      symptoms: ["Result: Potassium 2.9 mmol/L (low; normal 3.5–5.1)"],
      question:
        "Potassium 2.9 mmol/L (low; normal 3.5–5.1), recorded 08:42. What are the likely causes, and what should I check or do next?",
      specialty: "",
      history: "",
    });
    expect(validate(v).ok).toBe(true);
  });

  it("never copies the name, MRN, location, source, record link or suggested causes (R11)", () => {
    const a = makeAlert();
    const text = JSON.stringify(askFromAlert(a, ALERT_NOW));
    for (const s of [
      a.patient.full_name,
      "Maryam",
      "Abdullahi",
      a.patient.mrn,
      "Ward 3",
      "Bed 12",
      a.source_label!,
      a.emr_link!,
      "Diuretic",
      "magnesium",
    ])
      expect(text).not.toContain(s);
  });

  it("maps severity to priority and leaves unknowns blank", () => {
    expect(
      askFromAlert(makeAlert({ severity: "urgent" }), ALERT_NOW).urgency,
    ).toBe("urgent");
    expect(
      askFromAlert(makeAlert({ severity: "info" }), ALERT_NOW).urgency,
    ).toBe("routine");
    const sparse = askFromAlert(
      makeAlert({
        age: null,
        sex: null,
        finding: { ...makeAlert().finding, recorded_at: null },
      }),
      ALERT_NOW,
    );
    expect(sparse).toMatchObject({ age: "", sex: "" });
    expect(sparse.question).toBe(
      "Potassium 2.9 mmol/L (low; normal 3.5–5.1). What are the likely causes, and what should I check or do next?",
    );
    expect(askFromAlert(makeAlert({ age: 130 }), ALERT_NOW).age).toBe("");
  });

  it("shortens a long name first, keeping value, unit, flag and range", () => {
    const base = makeAlert().finding;
    const v = askFromAlert(
      makeAlert({ finding: { ...base, name: "x".repeat(3000) } }),
      ALERT_NOW,
    );
    expect(Array.from(v.symptoms[0]!).length).toBeLessThanOrEqual(200);
    expect(v.symptoms[0]).toMatch(
      /^Result: x+… 2\.9 mmol\/L \(low; normal 3\.5–5\.1\)$/,
    );
    expect(v.question.length).toBeLessThanOrEqual(2000);
    expect(v.question).toMatch(/^x+… 2\.9 mmol\/L .*check or do next\?$/);
  });

  it("never splits a surrogate pair", () => {
    const base = makeAlert().finding;
    const v = askFromAlert(
      makeAlert({ finding: { ...base, name: "😀".repeat(500) } }),
      ALERT_NOW,
    );
    for (const t of [v.symptoms[0]!, v.question])
      expect(t).not.toMatch(
        /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/,
      );
    expect(Array.from(v.symptoms[0]!).length).toBeLessThanOrEqual(200);
  });
});

describe("the prefill hand-over", () => {
  it("is read by its token only, in memory, until replaced or cleared", () => {
    const v = askFromAlert(makeAlert(), ALERT_NOW);
    const t = stashPrefill(v);
    expect(t).toMatch(/^[a-z0-9]{12}$/);
    expect(readPrefill(t)).toEqual(v);
    // Reading twice is safe: React may run an initialiser twice.
    expect(readPrefill(t)).toEqual(v);
    expect(readPrefill("other")).toBeNull();
    expect(readPrefill(null)).toBeNull();
    const t2 = stashPrefill({ ...v, age: "1" });
    expect(readPrefill(t)).toBeNull();
    expect(readPrefill(t2)?.age).toBe("1");
    clearPrefill();
    expect(readPrefill(t2)).toBeNull();
  });
});
