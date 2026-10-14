import { Plus } from "lucide-react";
import type { FormValues } from "@/lib/form-schema";
import { emptyForm } from "@/lib/form-schema";
import { Button } from "../ui/button";

// Synthetic examples only: no real patient data.
const EXAMPLES: { title: string; hint: string; v: FormValues }[] = [
  {
    title: "Febrile child",
    hint: "3 F, fever 3 days, rash. Dengue?",
    v: {
      ...emptyForm,
      age: "3",
      sex: "female",
      urgency: "urgent",
      symptoms: ["Fever", "Rash"],
      question:
        "3-year-old girl, fever for 3 days with a maculopapular rash, lives in a dengue area. Likely diagnosis and when to admit?",
    },
  },
  {
    title: "Chest pain",
    hint: "54 M, central pain radiating to arm.",
    v: {
      ...emptyForm,
      age: "54",
      sex: "male",
      urgency: "urgent",
      symptoms: ["Chest pain", "Sweating"],
      question:
        "54-year-old male, central chest pain for 40 min radiating to the left arm, diaphoretic. BP 150/95, HR 104. Likely diagnosis and immediate management?",
    },
  },
  {
    title: "Low potassium",
    hint: "K⁺ 2.9 on routine bloods.",
    v: {
      ...emptyForm,
      age: "67",
      sex: "female",
      urgency: "routine",
      symptoms: ["Weakness"],
      question:
        "67-year-old woman, serum potassium 2.9 mmol/L on routine bloods, on a thiazide. Causes and replacement plan?",
    },
  },
];

export function FirstVisit({
  name,
  onStart,
  onExample,
}: {
  name: string;
  onStart(): void;
  onExample(v: FormValues): void;
}) {
  return (
    <section className="mx-auto mt-8 max-w-[700px] text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
        Welcome, {name}
      </p>
      <h2 className="my-2.5 font-display text-5xl font-black leading-[.95]">
        Ask your first clinical question
      </h2>
      <p className="mx-auto mb-6 max-w-[520px] text-[15.5px] leading-relaxed text-ink-2">
        Describe a patient and what you need to know. You&apos;ll get an
        evidence-checked answer with sources.
      </p>
      <Button onClick={onStart}>
        <Plus aria-hidden className="size-4" />
        Start a consultation
      </Button>
      <p className="mb-2 mt-8 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">
        Or try an example
      </p>
      <div className="grid gap-2.5 text-left sm:grid-cols-3">
        {EXAMPLES.map((e) => (
          <button
            key={e.title}
            type="button"
            onClick={() => onExample(e.v)}
            className="card-v3 min-h-11 px-4 py-3.5 text-left"
          >
            <b>{e.title}</b>
            <span className="mt-1 block text-[12.5px] text-ink-3">
              {e.hint}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
