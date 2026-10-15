import { z } from "zod";
import type { QueryCreateIn, Sex, Urgency } from "./api/contract";

export interface FormValues {
  age: string;
  sex: Sex | "";
  urgency: Urgency | "";
  symptoms: string[];
  question: string;
  specialty: string;
  history: string;
}

export const emptyForm: FormValues = {
  age: "",
  sex: "",
  urgency: "",
  symptoms: [],
  question: "",
  specialty: "",
  history: "",
};

export const consultationSchema = z.object({
  age: z
    .string()
    .trim()
    .min(1, "Enter the patient's age")
    .refine((s) => /^\d{1,3}$/.test(s) && Number(s) <= 120, "Must be 0–120"),
  sex: z.enum(["female", "male", "other", "unknown"], { error: "Choose one" }),
  urgency: z.enum(["routine", "urgent", "emergency"], {
    error: "Choose a priority",
  }),
  symptoms: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(200, "Keep each symptom to 200 characters or fewer"),
    )
    .min(1, "Add at least one symptom")
    .max(20, "Up to 20 symptoms"),
  question: z.string().superRefine((s, ctx) => {
    const n = s.trim().length;
    if (n < 10)
      ctx.addIssue({
        code: "custom",
        message:
          "Add a bit more detail (at least 10 characters). Vitals, duration and history help most.",
      });
    if (s.length > 2000)
      ctx.addIssue({
        code: "custom",
        message: `Shorten to 2000 characters or fewer (now ${s.length})`,
      });
  }),
  specialty: z.string(),
  history: z.string().max(2000, "Keep medical history under 2000 characters"),
});

export function toQuery(v: FormValues): QueryCreateIn {
  return {
    patient_data: {
      age: Number(v.age),
      sex: v.sex as Sex,
      symptoms: v.symptoms.map((s) => s.trim()),
      ...(v.history.trim() ? { medical_history: v.history.trim() } : {}),
    },
    clinical_question: v.question.trim(),
    urgency: v.urgency as Urgency,
    ...(v.specialty ? { specialty: v.specialty } : {}),
  };
}

/** The inverse of `toQuery`: refills the form from a submitted query (Edit question). */
export function fromQuery(q: QueryCreateIn): FormValues {
  return {
    age: String(q.patient_data.age),
    sex: q.patient_data.sex,
    urgency: q.urgency,
    symptoms: q.patient_data.symptoms,
    question: q.clinical_question,
    specialty: q.specialty ?? "",
    history: q.patient_data.medical_history ?? "",
  };
}

export function validate(
  v: FormValues,
):
  | { ok: true; data: QueryCreateIn }
  | { ok: false; errors: Partial<Record<keyof FormValues, string>> } {
  const r = consultationSchema.safeParse(v);
  if (r.success) return { ok: true, data: toQuery(v) };
  const errors: Partial<Record<keyof FormValues, string>> = {};
  for (const i of r.error.issues) {
    const k = i.path[0] as keyof FormValues;
    errors[k] ??= i.message;
  }
  return { ok: false, errors };
}

export const correctionSchema = z.object({
  corrected_diagnosis: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(500),
  reason: z
    .string()
    .trim()
    .min(3, "Tell us why (at least 3 characters)")
    .max(1000),
});
