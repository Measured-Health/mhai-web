import { describe, expect, it } from "vitest";
import {
  correctionSchema,
  emptyForm,
  fromQuery,
  validate,
} from "./form-schema";

const good = {
  ...emptyForm,
  age: "54",
  sex: "male" as const,
  urgency: "urgent" as const,
  symptoms: ["Chest pain"],
  question:
    "Central chest pain for 40 min radiating to left arm. Likely diagnosis?",
};

describe("validate", () => {
  it("accepts a complete form and builds the API body", () => {
    const r = validate(good);
    expect(r.ok && r.data).toEqual({
      patient_data: { age: 54, sex: "male", symptoms: ["Chest pain"] },
      clinical_question: good.question,
      urgency: "urgent",
    });
  });
  it("rejects an age outside 0–120 with a plain message", () => {
    const r = validate({ ...good, age: "154" });
    expect(!r.ok && r.errors.age).toBe("Must be 0–120");
  });
  it("asks for more detail when the question is under 10 characters", () => {
    const r = validate({ ...good, question: "Chest pain".slice(0, 9) });
    expect(!r.ok && r.errors.question).toMatch(/at least 10 characters/);
  });
  it("blocks a question over 2000 characters without trimming it", () => {
    const long = "x".repeat(2001);
    const r = validate({ ...good, question: long });
    expect(!r.ok && r.errors.question).toBe(
      "Shorten to 2000 characters or fewer (now 2001)",
    );
  });
  it("needs at least one symptom and at most 20", () => {
    expect(!validate({ ...good, symptoms: [] }).ok).toBe(true);
    expect(!validate({ ...good, symptoms: Array(21).fill("a") }).ok).toBe(true);
  });
  it("includes optional fields only when filled", () => {
    const r = validate({ ...good, specialty: "Cardiology", history: "T2DM" });
    expect(r.ok && r.data.specialty).toBe("Cardiology");
    expect(r.ok && r.data.patient_data.medical_history).toBe("T2DM");
  });
});

describe("correctionSchema", () => {
  it("requires 3+ characters for both fields", () => {
    expect(
      correctionSchema.safeParse({ corrected_diagnosis: "ab", reason: "abc" })
        .success,
    ).toBe(false);
    expect(
      correctionSchema.safeParse({ corrected_diagnosis: "abc", reason: "abc" })
        .success,
    ).toBe(true);
  });
});

describe("fromQuery", () => {
  it("turns a submitted query back into form values (round trip)", () => {
    const full = {
      ...good,
      specialty: "Emergency",
      history: "Type 2 diabetes",
    };
    const r = validate(full);
    if (!r.ok) throw new Error("expected a valid form");
    expect(fromQuery(r.data)).toEqual(full);
  });
  it("fills optional fields with empty strings when absent", () => {
    const r = validate(good);
    if (!r.ok) throw new Error("expected a valid form");
    expect(fromQuery(r.data)).toEqual(good);
  });
});
