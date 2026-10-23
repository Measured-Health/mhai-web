"use client";
import { Check } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "@mhai/api-client/errors";
import { POSITION_LABEL } from "@mhai/ui/clearances";
import {
  SIGNOFF_KINDS,
  type NamedAccessOut,
  type NamedPosition,
  type Signoffs,
} from "@/lib/api/clearances-contract";
import type { Person } from "@/lib/api/contract";
import {
  FILL_IN,
  lowerOptions,
  raiseOptions,
  SIGNOFF_MAX,
  signoffProblem,
} from "@/lib/clearances/switch";
import {
  useLowerNamedAccess,
  useRequestNamedAccess,
} from "@/lib/queries/clearances";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Modal } from "../team/modal";

export const RAISE_INTRO =
  "A different platform admin must approve before this takes effect.";
export const LOWER_INTRO =
  "This takes effect at once and ends every named view on screen.";
export const SAME_PERSON =
  "You asked for this change, so a different platform admin must approve it";
export const ABOVE_GLOBAL =
  "A hospital can't be turned higher than every hospital's switch";

/** The switch's refusals in its own words (S21), for `platformError`. */
export const SWITCH_ERRORS: Partial<Record<string, string>> = {
  same_person: SAME_PERSON,
  above_global: ABOVE_GLOBAL,
  signoff_missing: FILL_IN,
};

/**
 * Refusals that mean the switch isn't as the person saw it, or isn't
 * theirs to change: the dialog closes, the panel says why and reloads.
 */
export const SWITCH_REFUSED = [
  "above_global",
  "same_person",
  "expired",
  "conflict",
  "not_found",
];

/** "every hospital", or the hospital's name. */
export const scopeWords = (hospital: Person | null) =>
  hospital ? hospital.name : "every hospital";

const KIND_LABEL: Record<keyof Signoffs, string> = {
  clinical: "Clinical",
  privacy: "Privacy",
  legal: "Legal",
};
const LONGEST_REASON = 500;

export type SwitchScope = { hospital: Person | null };

type FlowProps = {
  scope: SwitchScope;
  /** Where the scope's own switch stands. */
  current: NamedPosition;
  /** The scope's version as the person saw it; sent with the change. */
  version: number;
  onClose(): void;
  /** It went through: the server's reply and the position asked for. */
  onDone(r: NamedAccessOut, position: NamedPosition): void;
  /** A refusal that closed the dialog (e.g. Changed by someone else). */
  onRefused(e: ApiError): void;
};

export type SwitchRequestDialogProps = FlowProps & {
  open: boolean;
  /** The highest it may go: the global position for a hospital, On for global. */
  ceiling: NamedPosition;
  /** The server's day: no sign-off may be dated after it. */
  today: string;
};

/**
 * Ask for a raise: the position (never above `ceiling`), the clinical,
 * privacy and legal sign-offs, then the person's two-step code in the same
 * code fields as every step-up. A different platform admin approves it
 * later. Content mounts only while open, so each opening starts empty.
 */
export function SwitchRequestDialog({
  open,
  ...props
}: SwitchRequestDialogProps) {
  return open ? <RaiseFlow {...props} /> : null;
}

type Entries = Record<keyof Signoffs, { by: string; at: string; ref: string }>;
const EMPTY: Entries = {
  clinical: { by: "", at: "", ref: "" },
  privacy: { by: "", at: "", ref: "" },
  legal: { by: "", at: "", ref: "" },
};
const trimmed = (e: Entries): Signoffs => {
  const out = {} as Signoffs;
  for (const k of SIGNOFF_KINDS)
    out[k] = { by: e[k].by.trim(), at: e[k].at.trim(), ref: e[k].ref.trim() };
  return out;
};

function RaiseFlow({
  scope,
  current,
  ceiling,
  today,
  version,
  onClose,
  onDone,
  onRefused,
}: Omit<SwitchRequestDialogProps, "open">) {
  const id = useId();
  const net = useNeedsConnection(`${id}-offline`);
  // What the person saw when they began: they act on that, only.
  const [seen] = useState(() => ({ current, ceiling, today, version }));
  const options = raiseOptions(seen.current, seen.ceiling);
  const [position, setPosition] = useState<NamedPosition | null>(
    options.length === 1 ? options[0]! : null,
  );
  const [entries, setEntries] = useState<Entries>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const save = useStepUpCall(useRequestNamedAccess());
  const where = scopeWords(scope.hospital);

  const proceed = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    if (!position) return setProblem("Choose a position.");
    const p = signoffProblem(trimmed(entries), seen.today);
    setProblem(p);
    if (!p) setStep("confirm");
  };
  const back = () => {
    save.clear();
    setStep("choose");
  };
  const set = (k: keyof Signoffs, field: "by" | "at" | "ref", v: string) => {
    setEntries((p) => ({ ...p, [k]: { ...p[k], [field]: v } }));
    setProblem(null);
  };

  const confirm = (input: StepUpInput) => {
    if (!position) return;
    save.run(
      {
        hospital: scope.hospital?.id ?? null,
        position,
        signoffs: trimmed(entries),
        version: seen.version,
        ...codeOf(input),
      },
      {
        onSuccess: (r) => onDone(r, position),
        onError: (e) => {
          if (!(e instanceof ApiError)) return false;
          // The server found a sign-off missing: back to the form, which says so.
          if (e.code === "signoff_missing") {
            setProblem(FILL_IN);
            setStep("choose");
            return true;
          }
          if (!SWITCH_REFUSED.includes(e.code)) return false;
          onRefused(e);
          return true;
        },
      },
    );
  };

  const label = position ? POSITION_LABEL[position] : "";
  return (
    <>
      <Modal
        open={step === "choose"}
        title={`Turn up named access for ${where}`}
        onClose={onClose}
      >
        <form noValidate onSubmit={proceed}>
          <p className="text-sm leading-relaxed text-ink-2">{RAISE_INTRO}</p>
          <p className="mt-1 text-[13px] text-ink-3 [overflow-wrap:anywhere]">
            Now {POSITION_LABEL[seen.current]}
            {scope.hospital
              ? ` · every hospital's switch is ${POSITION_LABEL[seen.ceiling]}`
              : ""}
          </p>
          <Positions
            name={`${id}-to`}
            options={options}
            value={position}
            onChange={(p) => {
              setPosition(p);
              setProblem(null);
            }}
          />
          {SIGNOFF_KINDS.map((k) => (
            <fieldset key={k} className="mt-4">
              <legend className="mb-2 text-[13px] font-semibold">
                {KIND_LABEL[k]}
              </legend>
              <div className="flex flex-col gap-2.5">
                <Field id={`${id}-${k}-by`} label="Signed by (name and role)">
                  <input
                    id={`${id}-${k}-by`}
                    type="text"
                    maxLength={SIGNOFF_MAX}
                    aria-required
                    value={entries[k].by}
                    onChange={(e) => set(k, "by", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Field id={`${id}-${k}-at`} label="Date">
                    <input
                      id={`${id}-${k}-at`}
                      type="date"
                      max={seen.today}
                      aria-required
                      value={entries[k].at}
                      onChange={(e) => set(k, "at", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field id={`${id}-${k}-ref`} label="Document reference">
                    <input
                      id={`${id}-${k}-ref`}
                      type="text"
                      maxLength={SIGNOFF_MAX}
                      aria-required
                      value={entries[k].ref}
                      onChange={(e) => set(k, "ref", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </fieldset>
          ))}
          {problem && (
            <p role="alert" className="mt-3 text-[13px] text-bad">
              {problem}
            </p>
          )}
          <OfflineNote id={`${id}-offline`} />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" {...net.props}>
              Continue
            </Button>
          </div>
        </form>
      </Modal>
      <StepUpDialog
        open={step === "confirm"}
        title={`Ask to turn named access for ${where} ${label}?`}
        intro={
          <>
            <p>{RAISE_INTRO}</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              {SIGNOFF_KINDS.map((k) => (
                <li key={k}>
                  {KIND_LABEL[k]}: {entries[k].by.trim()} ·{" "}
                  {entries[k].ref.trim()}
                </li>
              ))}
            </ul>
          </>
        }
        dismissLabel="Back"
        confirmLabel="Ask for approval"
        tone="primary"
        busy={save.busy}
        error={save.error}
        onClose={back}
        onConfirm={confirm}
      />
    </>
  );
}

export type SwitchLowerDialogProps = FlowProps & { open: boolean };

/**
 * Turn a switch down: choose a lower position and Continue, then a reason
 * and the person's code. One admin; it takes effect at once.
 */
export function SwitchLowerDialog({ open, ...props }: SwitchLowerDialogProps) {
  return open ? <LowerFlow {...props} /> : null;
}

function LowerFlow({
  scope,
  current,
  version,
  onClose,
  onDone,
  onRefused,
}: FlowProps) {
  const id = useId();
  const net = useNeedsConnection(`${id}-offline`);
  const [seen] = useState(() => ({ current, version }));
  const options = lowerOptions(seen.current);
  const [position, setPosition] = useState<NamedPosition | null>(
    options.length === 1 ? options[0]! : null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const save = useStepUpCall(useLowerNamedAccess());
  const where = scopeWords(scope.hospital);

  const proceed = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    if (!position) return setProblem("Choose a position.");
    setProblem(null);
    setStep("confirm");
  };
  const back = () => {
    save.clear();
    setStep("choose");
  };
  const confirm = (input: StepUpInput) => {
    if (!position) return;
    save.run(
      {
        hospital: scope.hospital?.id ?? null,
        position,
        reason: input.reason ?? "",
        version: seen.version,
        ...codeOf(input),
      },
      {
        onSuccess: (r) => onDone(r, position),
        onError: (e) => {
          if (!(e instanceof ApiError && SWITCH_REFUSED.includes(e.code)))
            return false;
          onRefused(e);
          return true;
        },
      },
    );
  };

  const label = position ? POSITION_LABEL[position] : "";
  return (
    <>
      <Modal
        open={step === "choose"}
        title={`Turn down named access for ${where}`}
        onClose={onClose}
      >
        <form noValidate onSubmit={proceed}>
          <p className="text-sm leading-relaxed text-ink-2">
            Now {POSITION_LABEL[seen.current]}. {LOWER_INTRO}
          </p>
          <Positions
            name={`${id}-to`}
            options={options}
            value={position}
            onChange={(p) => {
              setPosition(p);
              setProblem(null);
            }}
          />
          {problem && (
            <p role="alert" className="mt-3 text-[13px] text-bad">
              {problem}
            </p>
          )}
          <OfflineNote id={`${id}-offline`} />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" {...net.props}>
              Continue
            </Button>
          </div>
        </form>
      </Modal>
      <StepUpDialog
        open={step === "confirm"}
        title={`Turn named access for ${where} down to ${label}?`}
        intro={<p>{LOWER_INTRO}</p>}
        freeReason
        noteMax={LONGEST_REASON}
        dismissLabel="Back"
        confirmLabel="Turn down"
        tone="danger"
        busy={save.busy}
        error={save.error}
        onClose={back}
        onConfirm={confirm}
      />
    </>
  );
}

/** The positions to choose from, as radios with words. */
function Positions({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: NamedPosition[];
  value: NamedPosition | null;
  onChange(p: NamedPosition): void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-[13px] font-semibold">
        Turn it to <span aria-hidden>*</span>
        <span className="sr-only">(required)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => (
          <label key={p} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={p}
              checked={value === p}
              onChange={() => onChange(p)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-lilac-2 bg-white px-3 text-[12.5px] text-ink-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9">
              {value === p && <Check aria-hidden className="size-3.5" />}
              {POSITION_LABEL[p]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      {/* Every field is needed; each input says so with aria-required. */}
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}
