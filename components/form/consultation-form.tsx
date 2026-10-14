"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Send } from "lucide-react";
import type { QueryCreateIn } from "@/lib/api/contract";
import { emptyForm, validate, type FormValues } from "@/lib/form-schema";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { ErrorSummary } from "./error-summary";
import { PriorityPicker } from "./priority-picker";
import { Segmented } from "./segmented";
import { SymptomInput } from "./symptom-input";

const LABELS: Record<keyof FormValues, string> = {
  age: "Age",
  sex: "Sex",
  urgency: "Priority",
  symptoms: "Presenting symptoms",
  question: "Clinical question",
  specialty: "Specialty area",
  history: "Medical history",
};
const STEP_OF: Record<keyof FormValues, 0 | 1 | 2> = {
  age: 0,
  sex: 0,
  urgency: 0,
  symptoms: 1,
  question: 1,
  specialty: 2,
  history: 2,
};
const input =
  "w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] outline-none transition-shadow duration-[var(--t-fast)] focus:border-mint focus:ring-4 focus:ring-mint/15";
const bad = "border-bad ring-4 ring-bad/10";

function Field({
  id,
  label,
  required,
  error,
  children,
  hint,
  group,
}: {
  group?: boolean;
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={`f-${id}`}>
      <label
        id={`l-${id}`}
        htmlFor={group ? undefined : id}
        className="mb-1.5 flex justify-between text-[12.5px] text-ink-2"
      >
        <span>{label}</span>
        {required && (
          <span aria-hidden className="text-bad">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p
          id={`e-${id}`}
          className="mt-1.5 animate-[fadeUp_var(--t-fast)_var(--e-out)_both] text-[12.5px] text-bad"
        >
          ✕ {error}
        </p>
      )}
      {hint}
    </div>
  );
}

export function ConsultationForm({
  initial = emptyForm,
  onSubmit,
  onDirtyChange,
}: {
  initial?: FormValues;
  onSubmit(q: QueryCreateIn): void;
  onDirtyChange?(dirty: boolean): void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormValues, string>>
  >({});
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [moreOpen, setMoreOpen] = useState(Boolean(initial.history));
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) =>
    setV((x) => ({ ...x, [k]: val }));

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(v) !== JSON.stringify(emptyForm));
  }, [v, onDirtyChange]);

  const submit = () => {
    const r = validate(v);
    if (r.ok) {
      setErrors({});
      onSubmit(r.data);
      return;
    }
    const first = (Object.keys(LABELS) as (keyof FormValues)[]).find(
      (k) => r.errors[k],
    )!;
    focusField(first, r.errors);
  };

  // Reveal the field's step synchronously, then focus it. Without flushSync
  // the group would still be display:none (mobile) when focus() runs.
  const focusField = (
    k: keyof FormValues,
    nextErrors: Partial<Record<keyof FormValues, string>> = errors,
  ) => {
    flushSync(() => {
      setErrors(nextErrors);
      setStep(STEP_OF[k]);
      if (k === "history") setMoreOpen(true);
    });
    formRef.current
      ?.querySelector<HTMLElement>(
        `#${k}, #f-${k} [role=radio], #f-${k} button`,
      )
      ?.focus();
  };

  const group = (n: 0 | 1 | 2) =>
    cn(
      "border-t border-line py-[18px] first:border-t-0 first:pt-1",
      step !== n && "max-md:hidden",
    );

  return (
    <form
      ref={formRef}
      noValidate
      className="card-v3 px-5 py-5 md:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div aria-hidden className="mb-3 flex gap-1.5 md:hidden">
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= step ? "bg-mint" : "bg-lilac-2",
            )}
          />
        ))}
      </div>
      <ErrorSummary
        errors={errors}
        labels={LABELS}
        onSelect={(k) => focusField(k as keyof FormValues)}
      />

      <fieldset className={group(0)}>
        <legend className="mb-3 flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-mint">
            01
          </span>
          <b className="text-sm">Patient</b>
        </legend>
        <div className="grid grid-cols-[140px_1fr] gap-3.5 max-sm:grid-cols-1">
          <Field id="age" label="Age" required error={errors.age}>
            <input
              id="age"
              inputMode="numeric"
              aria-invalid={errors.age ? true : undefined}
              aria-describedby={errors.age ? "e-age" : undefined}
              value={v.age}
              onChange={(e) => set("age", e.target.value)}
              className={cn(
                input,
                "font-mono tabular",
                errors.age ? bad : "border-lilac-2",
              )}
            />
          </Field>
          <Field id="sex" label="Sex" required error={errors.sex} group>
            <Segmented
              name="sex"
              labelledBy="l-sex"
              invalid={Boolean(errors.sex)}
              describedBy={errors.sex ? "e-sex" : undefined}
              value={v.sex}
              onChange={(x) => set("sex", x)}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
                { value: "unknown", label: "Unknown" },
              ]}
            />
          </Field>
        </div>
        <div className="mt-3.5">
          <Field
            id="urgency"
            label="Priority"
            required
            error={errors.urgency}
            group
          >
            <PriorityPicker
              invalid={Boolean(errors.urgency)}
              describedBy={errors.urgency ? "e-urgency" : undefined}
              value={v.urgency}
              onChange={(x) => set("urgency", x)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className={group(1)}>
        <legend className="mb-3 flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-mint">
            02
          </span>
          <b className="text-sm">Presentation</b>
        </legend>
        <Field
          id="symptoms"
          label="Presenting symptoms"
          required
          error={errors.symptoms}
        >
          <SymptomInput
            id="symptoms"
            value={v.symptoms}
            onChange={(x) => set("symptoms", x)}
            invalid={Boolean(errors.symptoms)}
            describedBy={errors.symptoms ? "e-symptoms" : undefined}
          />
        </Field>
        <div className="mt-3.5">
          <Field
            id="question"
            label="Clinical question"
            required
            error={errors.question}
            hint={
              <p className="mt-1.5 flex justify-between text-xs text-ink-3">
                <span>Tip: include vitals, duration and relevant history.</span>
                <span
                  className={cn(
                    "font-mono tabular",
                    v.question.length > 2000 && "font-semibold text-bad",
                  )}
                >
                  {v.question.length} / 2000
                </span>
              </p>
            }
          >
            <textarea
              id="question"
              rows={5}
              aria-invalid={errors.question ? true : undefined}
              aria-describedby={errors.question ? "e-question" : undefined}
              value={v.question}
              onChange={(e) => set("question", e.target.value)}
              className={cn(
                input,
                "min-h-28 leading-relaxed",
                errors.question ? bad : "border-lilac-2",
              )}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className={group(2)}>
        <legend className="mb-3 flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-mint">
            03
          </span>
          <b className="text-sm">Optional</b>
        </legend>
        <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
          <Field id="specialty" label="Specialty area">
            <select
              id="specialty"
              value={v.specialty}
              onChange={(e) => set("specialty", e.target.value)}
              className={cn(input, "border-lilac-2")}
            >
              <option value="">Let the system decide</option>
              <option>Diagnosis</option>
              <option>Emergency</option>
            </select>
          </Field>
          <div className="self-end">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(input, "border-lilac-2 text-left text-ink-2")}
            >
              {moreOpen ? "−" : "＋"} Additional context (medical history)
            </button>
          </div>
        </div>
        {moreOpen && (
          <div className="mt-3.5">
            <Field id="history" label="Medical history" error={errors.history}>
              <textarea
                id="history"
                rows={3}
                aria-invalid={errors.history ? true : undefined}
                aria-describedby={errors.history ? "e-history" : undefined}
                value={v.history}
                onChange={(e) => set("history", e.target.value)}
                className={cn(input, "border-lilac-2")}
              />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-3 pt-4">
        {step > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="md:hidden"
            onClick={() => setStep((s) => (s - 1) as 0 | 1)}
          >
            ←
          </Button>
        )}
        {step < 2 && (
          <Button
            type="button"
            className="flex-1 md:hidden"
            onClick={() => setStep((s) => (s + 1) as 1 | 2)}
          >
            Next
          </Button>
        )}
        <Button type="submit" className={cn(step < 2 && "max-md:hidden")}>
          <Send aria-hidden className="size-4" />
          Analyse
          <kbd className="ml-1 rounded border border-white/40 px-1.5 font-mono text-[10.5px] max-md:hidden">
            ⌘ ↵
          </kbd>
        </Button>
        <span className="text-[12.5px] text-ink-3 max-md:hidden">
          Patient details are masked before analysis.
        </span>
      </div>
    </form>
  );
}
