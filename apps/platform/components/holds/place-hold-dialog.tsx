"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Person } from "@/lib/api/contract";
import { HOLD_REASONS, type LegalHoldDetail } from "@/lib/api/holds-contract";
import { ApiError } from "@mhai/api-client/errors";
import { platformError } from "@/lib/errors";
import { HOLD_HINT, holdReasonLabel } from "@/lib/holds/labels";
import {
  REFERENCE_HINT,
  REFERENCE_MAX,
  defaultReviewOn,
  todayLocal,
  validatePlace,
  type PlaceForm,
} from "@/lib/holds/rules";
import { usePlaceHold } from "@/lib/queries/holds";
import { queryKeys } from "@/lib/queries/keys";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { Modal } from "../team/modal";
import { HospitalPicker } from "./hospital-picker";

/** Refusals that end the placement: the form shows them, not the code step. */
const ENDS_IT = ["removal_started", "hospital_removed", "conflict"];
/** Placing: a clash is a reference already used by an open hold. */
const PLACE_WORDS = {
  conflict: "An open legal hold already has this reference. Use another.",
};

type Errors = ReturnType<typeof validatePlace>;

const blank = (hospital: Person | null): PlaceForm => ({
  hospital,
  reason: "",
  reference: "",
  review_on: defaultReviewOn(todayLocal()),
});

/**
 * Place a hold: a form, then **Continue** to the person's two-step code. A
 * hold keeps all of the hospital's records and carries no note and no name
 * of who asked (core 1.26.0): only the reason, a document reference and the
 * review date.
 * With `hospital` given it is fixed (a hospital's own page); otherwise it is
 * chosen here. Content mounts only while open, so each opening starts empty.
 */
export function PlaceHoldDialog({
  open,
  hospital,
  onClose,
  onPlaced,
}: {
  open: boolean;
  hospital?: Person;
  onClose(): void;
  onPlaced(hold: LegalHoldDetail): void;
}) {
  return open ? (
    <PlaceFlow hospital={hospital} onClose={onClose} onPlaced={onPlaced} />
  ) : null;
}

function PlaceFlow({
  hospital,
  onClose,
  onPlaced,
}: {
  hospital?: Person;
  onClose(): void;
  onPlaced(hold: LegalHoldDetail): void;
}) {
  const qc = useQueryClient();
  const place = useStepUpCall(usePlaceHold());
  const [f, setF] = useState<PlaceForm>(() => blank(hospital ?? null));
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [refusal, setRefusal] = useState<string | null>(null);
  const set = <K extends keyof PlaceForm>(k: K, v: PlaceForm[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const confirm = (input: StepUpInput) => {
    const code = codeOf(input);
    place.run(
      {
        hospital_id: f.hospital!.id,
        reason: f.reason as Exclude<PlaceForm["reason"], "">,
        reference: f.reference.trim(),
        review_on: f.review_on,
        ...code,
      },
      {
        onSuccess: (hold) => {
          onClose();
          onPlaced(hold);
        },
        onError: (e) => {
          if (!(e instanceof ApiError && ENDS_IT.includes(e.code)))
            return false;
          setRefusal(platformError(e, PLACE_WORDS).title);
          setStep("form");
          if (e.code === "hospital_removed")
            void qc.invalidateQueries({ queryKey: queryKeys.hospitals });
          return true;
        },
      },
    );
  };

  const back = () => {
    place.clear();
    setStep("form");
  };

  return (
    <>
      <Modal
        open={step === "form"}
        title="Place a legal hold"
        onClose={onClose}
      >
        <FormStep
          f={f}
          set={set}
          errors={errors}
          fixed={!!hospital}
          refusal={refusal}
          onCancel={onClose}
          onContinue={() => {
            setRefusal(null);
            const e = validatePlace(f);
            setErrors(e);
            if (Object.keys(e).length === 0) setStep("confirm");
          }}
        />
      </Modal>
      <StepUpDialog
        open={step === "confirm"}
        title={`Place a legal hold on ${f.hospital?.name ?? "this hospital"}?`}
        intro={
          <>
            <p>All of the hospital&apos;s records.</p>
            <p className="mt-1">
              They are kept until two platform admins lift the hold.
            </p>
          </>
        }
        confirmLabel="Place hold"
        dismissLabel="Back"
        tone="primary"
        busy={place.busy}
        error={place.error}
        onClose={back}
        onConfirm={confirm}
      />
    </>
  );
}

function FormStep({
  f,
  set,
  errors,
  fixed,
  refusal,
  onCancel,
  onContinue,
}: {
  f: PlaceForm;
  set: <K extends keyof PlaceForm>(k: K, v: PlaceForm[K]) => void;
  errors: Errors;
  fixed: boolean;
  refusal: string | null;
  onCancel(): void;
  onContinue(): void;
}) {
  const id = useId();
  const hospitalRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLInputElement>(null);
  // Focus waits a tick for the messages to render; never after unmount.
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  const ORDER = ["hospital", "reason", "reference", "review_on"] as const;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Focus the first field with a message once it has rendered.
    const bad = ORDER.find((k) => validatePlace(f)[k]);
    onContinue();
    if (bad) {
      const target = {
        hospital: hospitalRef,
        reason: reasonRef,
        reference: referenceRef,
        review_on: reviewRef,
      }[bad];
      clearTimeout(focusTimer.current);
      focusTimer.current = setTimeout(() => target.current?.focus(), 0);
    }
  };
  const err = (k: keyof PlaceForm) =>
    errors[k] ? (
      <p id={`${id}-${k}-err`} className="mt-1.5 text-[13px] text-bad">
        {errors[k]}
      </p>
    ) : null;
  const describe = (k: keyof PlaceForm) => {
    const ids = [
      k === "reference" ? `${id}-${k}-hint` : null,
      errors[k] ? `${id}-${k}-err` : null,
    ].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  };
  const hint = (k: string): ReactNode => (
    <p id={`${id}-${k}-hint`} className="mt-1 text-[12.5px] text-ink-3">
      {REFERENCE_HINT}
    </p>
  );
  const label = "mb-1.5 block text-[12.5px] text-ink-2";
  const legend = "mb-2 text-[13px] font-semibold";
  const chip =
    "flex min-h-11 items-center gap-1.5 rounded-full border border-lilac-2 bg-white px-3 text-[12.5px] text-ink-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9";

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {refusal && <Banner tone="bad" title={refusal} />}
      <div>
        <p className={legend}>Hospital</p>
        {fixed ? (
          <p className="text-[14px] font-semibold [overflow-wrap:anywhere]">
            {f.hospital?.name}
          </p>
        ) : (
          <HospitalPicker
            value={f.hospital}
            onChange={(h) => set("hospital", h)}
            error={errors.hospital}
            inputRef={hospitalRef}
          />
        )}
      </div>

      <div>
        <p className={legend}>What it covers</p>
        <p className="text-[14px]">All records</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{HOLD_HINT}</p>
      </div>

      <fieldset aria-describedby={describe("reason")}>
        <legend className={legend}>
          Reason <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {HOLD_REASONS.map((r, i) => (
            <label key={r} className="cursor-pointer">
              <input
                ref={i === 0 ? reasonRef : undefined}
                type="radio"
                name={`${id}-reason`}
                value={r}
                checked={f.reason === r}
                onChange={() => set("reason", r)}
                className="peer sr-only"
              />
              <span className={chip}>
                {f.reason === r && <Check aria-hidden className="size-3.5" />}
                {holdReasonLabel(r)}
              </span>
            </label>
          ))}
        </div>
        {err("reason")}
      </fieldset>

      <div>
        <label htmlFor={`${id}-reference`} className={label}>
          Reference (document reference) <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          ref={referenceRef}
          id={`${id}-reference`}
          type="text"
          maxLength={REFERENCE_MAX}
          value={f.reference}
          aria-invalid={errors.reference ? true : undefined}
          aria-describedby={describe("reference")}
          onChange={(e) => set("reference", e.target.value)}
          className={inputClass}
        />
        {hint("reference")}
        {err("reference")}
      </div>

      <div>
        <label htmlFor={`${id}-review_on`} className={label}>
          Review date <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          ref={reviewRef}
          id={`${id}-review_on`}
          type="date"
          value={f.review_on}
          aria-invalid={errors.review_on ? true : undefined}
          aria-describedby={describe("review_on")}
          onChange={(e) => set("review_on", e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-[12.5px] text-ink-3">
          The hold shows Review due on this date. Nothing else happens.
        </p>
        {err("review_on")}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  );
}
