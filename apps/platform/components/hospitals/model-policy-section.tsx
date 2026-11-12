"use client";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { Hospital } from "@/lib/api/contract";
import {
  AGREEMENT_REF,
  BUDGET_MAX,
  BUDGET_WARN,
  CLOUD_PROVIDERS,
  type CloudProvider,
  type ModelPolicy,
} from "@/lib/api/model-policy-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import {
  LOCAL_LABEL,
  monthLabel,
  parseBudget,
  policyLabel,
  providerName,
  tokens,
} from "@/lib/model-policy/labels";
import { useModelPolicy, useSetModelPolicy } from "@/lib/queries/model-policy";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { dateLabel } from "./format";
import { Section } from "./section";
import { codeOf, StepUpDialog, type StepUpInput } from "./step-up-dialog";

export const MODEL_TITLE = "AI model";
export const NOT_ENABLED =
  "This provider isn't switched on for this deployment. Choose another, or ask for it to be set up.";
export const REF_HINT =
  "AGR-YYYY-NNNN or DPA-YYYY-NNNN for the recorded agreement check, or DEMO-SYNTHETIC for sample data. A document reference, never a person's name.";
export const MASKED_NOTE =
  "Only masked text is sent: identifying patient details are masked where detected. Documents and images never leave.";
export const SAMPLE_ONLY =
  "Sample data only until the privacy, legal and clinical sign-offs are given.";
export const LIMIT_REACHED =
  "When the limit is used up, new questions get no cloud draft and go to clinician review until next month.";

/** A provider code, or `OFF`, which no code can be (`PROVIDER_CODE`). */
type Choice = string;
const OFF = "-off";
type Field = "provider" | "ref" | "budget";
type Draft = {
  /** A provider code: one of `CLOUD_PROVIDERS`, or the policy's own. */
  cloud_provider: string | null;
  agreement_ref: string | null;
  monthly_token_budget: number;
};

/**
 * Who drafts a hospital's answers (Plan 14): MHAI's own model, or a cloud
 * provider the hospital opted in to, with its agreement reference, monthly
 * token limit and this month's use. Platform admins change it with their
 * two-step code; auditors see it. Core decides; the checks here are a
 * convenience.
 */
export function ModelPolicySection({ hospital }: { hospital: Hospital }) {
  const { user } = useAuth();
  const q = useModelPolicy(hospital.id);
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);
  const canEdit = isPlatformAdmin(user) && hospital.status !== "removed";
  const p = q.data;

  let body: ReactNode;
  if (gone)
    body = (
      <Banner
        tone="warn"
        title={platformError(new ApiError(404, "not_found")).title}
      />
    );
  else if (p)
    body = editing ? (
      <EditForm
        hospital={hospital}
        policy={p}
        onDone={() => setEditing(false)}
        onGone={() => {
          setEditing(false);
          setGone(true);
        }}
      />
    ) : (
      <ReadView policy={p} />
    );
  else if (q.isError)
    body = <CouldntLoad what="the AI model" onRetry={() => void q.refetch()} />;
  else body = <Loading label="Loading the AI model" />;

  return (
    <Section
      title={MODEL_TITLE}
      action={
        canEdit && p && !editing && !gone ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
        ) : undefined
      }
    >
      {body}
    </Section>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{term}</dt>
      <dd className="[overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function ReadView({ policy: p }: { policy: ModelPolicy }) {
  const { used, reserved, month } = p.usage;
  const budget = p.monthly_token_budget;
  const share = Math.min(1, used / budget);
  const pct = Math.floor(share * 100);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-[160px_1fr]">
        {/* `provider_code`, never `cloud_provider`: that is null for Gemini
            (core 1.16.0), which is on, not off. */}
        <Row term="Drafts answers">{policyLabel(p.provider_code)}</Row>
        {p.provider_code !== null && (
          <Row term="Agreement reference">
            <span className="font-mono">{p.agreement_ref}</span>
          </Row>
        )}
        <Row term="Monthly limit">{`${tokens(budget)} tokens`}</Row>
        <Row term={`Used in ${monthLabel(month)}`}>
          <span>{`${tokens(used)} tokens (${used >= budget ? "all" : `${pct}%`} of the limit)`}</span>
          {reserved > 0 && (
            <span className="block text-ink-3">{`${tokens(reserved)} held for answers in progress`}</span>
          )}
          <span
            aria-hidden
            className="mt-1.5 block h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-lilac"
          >
            <span
              className={`block h-full ${share >= BUDGET_WARN ? "bg-warn" : "bg-mint-deep"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
        </Row>
        <Row term="Last changed">
          {p.updated_at ? dateLabel(p.updated_at) : "Never"}
        </Row>
      </dl>
      {share >= BUDGET_WARN && (
        <Banner
          tone="warn"
          title={
            used >= budget
              ? "This month's limit is used up"
              : "Near this month's limit"
          }
        >
          <p>{LIMIT_REACHED}</p>
        </Banner>
      )}
      {p.provider_code !== null && (
        <p className="text-[13px] text-ink-2">
          {MASKED_NOTE} {SAMPLE_ONLY}
        </p>
      )}
    </div>
  );
}

const ORDER: Field[] = ["provider", "ref", "budget"];

function EditForm({
  hospital,
  policy,
  onDone,
  onGone,
}: {
  hospital: Hospital;
  policy: ModelPolicy;
  onDone(): void;
  onGone(): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const save = useStepUpCall(useSetModelPolicy(hospital.id));
  const [choice, setChoice] = useState<Choice>(policy.provider_code ?? OFF);
  const [ref, setRef] = useState(policy.agreement_ref ?? "");
  const [budget, setBudget] = useState(tokens(policy.monthly_token_budget));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [asking, setAsking] = useState<Draft | null>(null);
  const [focusReq, setFocusReq] = useState<{ k: Field } | null>(null);
  useEffect(() => {
    if (!focusReq) return;
    const el =
      focusReq.k === "provider"
        ? document.querySelector<HTMLInputElement>(
            `input[name="${id}-provider"]:checked`,
          )
        : document.getElementById(`${id}-${focusReq.k}`);
    el?.focus();
  }, [focusReq, id]);

  const provider = choice === OFF ? null : choice;

  /** The draft as core takes it, or null with the fields marked. */
  const check = (): Draft | null => {
    const errs: Partial<Record<Field, string>> = {};
    const r = ref.trim().toUpperCase();
    if (provider && !r) errs.ref = "Enter the agreement reference.";
    else if (provider && !AGREEMENT_REF.test(r))
      errs.ref = "Use AGR-YYYY-NNNN, DPA-YYYY-NNNN or DEMO-SYNTHETIC.";
    const b = parseBudget(budget, BUDGET_MAX);
    if (b === null)
      errs.budget = `Enter a whole number of tokens from 1 to ${tokens(BUDGET_MAX)}.`;
    setErrors(errs);
    const first = ORDER.find((k) => errs[k]);
    if (first) {
      setFocusReq({ k: first });
      return null;
    }
    // Off has no reference: it is cleared, never sent.
    return {
      cloud_provider: provider,
      agreement_ref: provider ? r : null,
      monthly_token_budget: b!,
    };
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    setFailure(null);
    const d = check();
    if (!d) return;
    if (
      d.cloud_provider === policy.provider_code &&
      d.agreement_ref === policy.agreement_ref &&
      d.monthly_token_budget === policy.monthly_token_budget
    )
      return onDone();
    setAsking(d);
  };

  const close = () => {
    setAsking(null);
    save.clear();
  };

  const confirm = (input: StepUpInput) => {
    if (!asking) return;
    save.run(
      {
        ...asking,
        // One of the picker's providers, or the policy's own code unchanged.
        cloud_provider: asking.cloud_provider as CloudProvider | null,
        ...codeOf(input),
      },
      {
        onSuccess: () => {
          close();
          toast.show({ title: "AI model saved", tone: "ok", live: "polite" });
          onDone();
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) return false;
          if (err.code === "conflict") {
            close();
            setErrors({ provider: NOT_ENABLED });
            setFocusReq({ k: "provider" });
            return true;
          }
          if (err.code === "not_found") {
            close();
            onGone();
            return true;
          }
          // Core's body refusal (422 validation_failed).
          if (err.code === "validation_failed" && err.status === 422) {
            close();
            setFailure("Check the details and try again.");
            return true;
          }
          return false;
        },
      },
    );
  };

  const err = (k: Field) =>
    errors[k] ? (
      <p id={`${id}-${k}-err`} className="mt-1 text-[13px] text-bad">
        {errors[k]}
      </p>
    ) : null;
  const describe = (k: Field, hint?: boolean) =>
    [hint && `${id}-${k}-hint`, errors[k] && `${id}-${k}-err`]
      .filter(Boolean)
      .join(" ") || undefined;

  // The policy's own provider is always offered, even one added after this
  // app (shown as its code), so the form never opens on "off" for it.
  const own = policy.provider_code;
  const codes: string[] = [...CLOUD_PROVIDERS];
  if (own !== null && !codes.includes(own)) codes.push(own);
  const options: { value: Choice; label: string }[] = [
    { value: OFF, label: `${LOCAL_LABEL} (nothing leaves our servers)` },
    ...codes.map((c) => ({ value: c, label: policyLabel(c) })),
  ];

  const summary = asking
    ? asking.cloud_provider
      ? `Answers for ${hospital.name} will be drafted by ${providerName(asking.cloud_provider)}, a cloud provider, under ${asking.agreement_ref}, up to ${tokens(asking.monthly_token_budget)} tokens a month.`
      : `Answers for ${hospital.name} will be drafted by ${LOCAL_LABEL}. Nothing leaves our servers. It applies from the next question.`
    : "";

  // The step-up dialog has a form of its own, so it sits beside this one,
  // never inside it.
  return (
    <>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure && (
          <Banner tone="bad" title={failure}>
            <p>Nothing was saved.</p>
          </Banner>
        )}
        <fieldset aria-describedby={describe("provider")}>
          <legend className="mb-2 text-[12.5px] text-ink-2">
            Who drafts answers
          </legend>
          <div className="flex flex-col gap-1.5">
            {options.map((o) => (
              <label
                key={o.value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] sm:min-h-8"
              >
                <input
                  type="radio"
                  name={`${id}-provider`}
                  value={o.value}
                  checked={choice === o.value}
                  onChange={() => {
                    setChoice(o.value);
                    setErrors((p) => ({
                      ...p,
                      provider: undefined,
                      ref: undefined,
                    }));
                  }}
                  className="size-4 accent-ink"
                />
                {o.label}
              </label>
            ))}
          </div>
          {err("provider")}
        </fieldset>
        {provider && (
          <>
            <p className="text-[13px] text-ink-2">
              {MASKED_NOTE} {SAMPLE_ONLY}
            </p>
            <div>
              <label
                htmlFor={`${id}-ref`}
                className="mb-1.5 block text-[12.5px] text-ink-2"
              >
                Agreement reference
              </label>
              <input
                id={`${id}-ref`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                value={ref}
                aria-invalid={errors.ref ? true : undefined}
                aria-describedby={describe("ref", true)}
                onChange={(e) => {
                  setRef(e.target.value);
                  setErrors((p) => ({ ...p, ref: undefined }));
                }}
                className={`${inputClass} font-mono`}
              />
              <p id={`${id}-ref-hint`} className="mt-1 text-[12px] text-ink-3">
                {REF_HINT}
              </p>
              {err("ref")}
            </div>
          </>
        )}
        <div>
          <label
            htmlFor={`${id}-budget`}
            className="mb-1.5 block text-[12.5px] text-ink-2"
          >
            Monthly limit (tokens)
          </label>
          <input
            id={`${id}-budget`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            value={budget}
            aria-invalid={errors.budget ? true : undefined}
            aria-describedby={describe("budget", true)}
            onChange={(e) => {
              setBudget(e.target.value);
              setErrors((p) => ({ ...p, budget: undefined }));
            }}
            className={inputClass}
          />
          <p id={`${id}-budget-hint`} className="mt-1 text-[12px] text-ink-3">
            About 300 to 400 questions per 2,000,000 tokens. {LIMIT_REACHED}
          </p>
          {err("budget")}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" {...net.props} disabled={net.offline}>
            Save
          </Button>
        </div>
        <OfflineNote id={`${id}-offline`} />
      </form>
      <StepUpDialog
        open={!!asking}
        title="Change the AI model?"
        intro={<p>{summary}</p>}
        confirmLabel="Save"
        tone="primary"
        busy={save.busy}
        error={save.error}
        onClose={close}
        onConfirm={confirm}
      />
    </>
  );
}
