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
  RULE_SET_SHA256,
  RULE_SET_VERSION,
  type EmrRuleSet,
} from "@/lib/api/emr-rule-set-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { useEmrRuleSet, useSetEmrRuleSet } from "@/lib/queries/emr-rule-set";
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

export const RULE_SET_TITLE = "Patient alerts";
export const SHADOW_TEXT =
  "Off: trial run. MHAI checks this hospital's records and stores what it finds for review. No alert is sent to anyone.";
export const sendsAlerts = (hospital: string) =>
  `This sends patient alerts to ${hospital}'s clinicians`;
export const WARNING_BODY =
  "From then on, clinicians get alerts and pop-ups for patients whose results meet these rules. Switch it on only after the trial run has been reviewed and signed off.";
export const LOADED_NOTE =
  "Alerts start once MHAI's record service runs this same rule set.";
export const NOT_READY =
  "Patient records aren't switched on for this deployment, so alerts can't be switched here.";
export const VERSION_HINT =
  "The reviewed rule set's version, as the rules check prints it, e.g. 0-synthetic.";
export const SHA_HINT =
  "Its SHA-256 fingerprint: 64 characters, 0-9 and a-f, as the rules check prints it.";

type Field = "version" | "sha" | "confirm";
type Draft = { version: string | null; sha256: string | null };

/**
 * Whether a hospital's record findings become patient alerts (EMR rule
 * set, core 1.20.0): off (shadow, the default: findings are stored for
 * review, no alert) or on with a reviewed rule set, named by version and
 * SHA-256. Platform admins switch it with their two-step code, after saying
 * they understand it sends alerts to clinicians; auditors see it.
 */
export function RuleSetSection({ hospital }: { hospital: Hospital }) {
  const { user } = useAuth();
  const q = useEmrRuleSet(hospital.id);
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);
  const canEdit = isPlatformAdmin(user) && hospital.status !== "removed";
  const r = q.data;

  let body: ReactNode;
  if (gone)
    body = (
      <Banner
        tone="warn"
        title={platformError(new ApiError(404, "not_found")).title}
      />
    );
  else if (r)
    body = editing ? (
      <EditForm
        hospital={hospital}
        current={r}
        onDone={() => setEditing(false)}
        onGone={() => {
          setEditing(false);
          setGone(true);
        }}
      />
    ) : (
      <ReadView hospital={hospital} ruleSet={r} />
    );
  else if (q.isError)
    body = (
      <CouldntLoad what="patient alerts" onRetry={() => void q.refetch()} />
    );
  else body = <Loading label="Loading patient alerts" />;

  return (
    <Section
      title={RULE_SET_TITLE}
      action={
        canEdit && r && !editing && !gone ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {r.version === null ? "Switch on alerts" : "Change"}
          </Button>
        ) : undefined
      }
    >
      {body}
    </Section>
  );
}

function ReadView({
  hospital,
  ruleSet: r,
}: {
  hospital: Hospital;
  ruleSet: EmrRuleSet;
}) {
  if (r.version === null)
    return <p className="text-[13.5px] text-ink-2">{SHADOW_TEXT}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] font-semibold text-warn-deep">
        On: MHAI sends patient alerts to {hospital.name}&apos;s clinicians.
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-[160px_1fr]">
        <dt className="text-ink-3">Rule set</dt>
        <dd className="font-mono">{r.version}</dd>
        <dt className="text-ink-3">Fingerprint (SHA-256)</dt>
        <dd className="font-mono text-[12.5px] [overflow-wrap:anywhere]">
          {r.sha256}
        </dd>
        <dt className="text-ink-3">Switched on</dt>
        <dd>{r.activated_at ? dateLabel(r.activated_at) : "Not recorded"}</dd>
      </dl>
      <p className="text-[13px] text-ink-2">{LOADED_NOTE}</p>
    </div>
  );
}

function EditForm({
  hospital,
  current,
  onDone,
  onGone,
}: {
  hospital: Hospital;
  current: EmrRuleSet;
  onDone(): void;
  onGone(): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const save = useStepUpCall(useSetEmrRuleSet(hospital.id));
  const [on, setOn] = useState(current.version !== null);
  const [version, setVersion] = useState(current.version ?? "");
  const [sha, setSha] = useState(current.sha256 ?? "");
  const [understood, setUnderstood] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [asking, setAsking] = useState<Draft | null>(null);
  const [focusReq, setFocusReq] = useState<{ k: Field } | null>(null);
  useEffect(() => {
    if (focusReq) document.getElementById(`${id}-${focusReq.k}`)?.focus();
  }, [focusReq, id]);

  const check = (): Draft | null => {
    if (!on) return { version: null, sha256: null };
    const v = version.trim();
    const s = sha.trim().toLowerCase();
    const errs: Partial<Record<Field, string>> = {};
    if (!RULE_SET_VERSION.test(v))
      errs.version =
        "Enter the version: lower-case letters, digits and hyphens.";
    if (!RULE_SET_SHA256.test(s))
      errs.sha = "Enter the 64-character SHA-256 fingerprint.";
    if (!understood)
      errs.confirm = "Confirm that you understand this sends alerts.";
    setErrors(errs);
    const first = (["version", "sha", "confirm"] as Field[]).find(
      (k) => errs[k],
    );
    if (first) {
      setFocusReq({ k: first });
      return null;
    }
    return { version: v, sha256: s };
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    setFailure(null);
    const d = check();
    if (!d) return;
    if (d.version === current.version && d.sha256 === current.sha256)
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
      { ...asking, ...codeOf(input) },
      {
        onSuccess: (r) => {
          close();
          toast.show({
            title:
              r.version === null
                ? "Patient alerts switched off"
                : "Patient alerts switched on",
            tone: "ok",
            live: "polite",
          });
          onDone();
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) return false;
          if (err.code === "not_found") {
            close();
            onGone();
            return true;
          }
          if (err.code === "not_ready" && err.status === 503) {
            close();
            setFailure(NOT_READY);
            return true;
          }
          if (err.code === "validation_failed" && err.status === 422) {
            close();
            setFailure("Check the version and fingerprint and try again.");
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
  const clear = (k: Field) => setErrors((p) => ({ ...p, [k]: undefined }));

  const turningOn = !!asking?.version;
  return (
    <>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure && (
          <Banner tone="bad" title={failure}>
            <p>Nothing was saved.</p>
          </Banner>
        )}
        <fieldset>
          <legend className="mb-2 text-[12.5px] text-ink-2">
            Patient alerts for {hospital.name}
          </legend>
          <div className="flex flex-col gap-1.5">
            {[
              { value: false, label: "Off: trial run, no alerts are sent" },
              {
                value: true,
                label: "On: send patient alerts to clinicians",
              },
            ].map((o) => (
              <label
                key={String(o.value)}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] sm:min-h-8"
              >
                <input
                  type="radio"
                  name={`${id}-on`}
                  checked={on === o.value}
                  onChange={() => {
                    setOn(o.value);
                    setErrors({});
                  }}
                  className="size-4 accent-ink"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {!on && <p className="text-[13px] text-ink-2">{SHADOW_TEXT}</p>}
        {on && (
          <>
            <Banner tone="warn" title={sendsAlerts(hospital.name)}>
              <p>{WARNING_BODY}</p>
              <p className="mt-1">{LOADED_NOTE}</p>
            </Banner>
            <div>
              <label
                htmlFor={`${id}-version`}
                className="mb-1.5 block text-[12.5px] text-ink-2"
              >
                Rule set version
              </label>
              <input
                id={`${id}-version`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={63}
                value={version}
                aria-invalid={errors.version ? true : undefined}
                aria-describedby={describe("version", true)}
                onChange={(e) => {
                  setVersion(e.target.value);
                  clear("version");
                }}
                className={`${inputClass} font-mono`}
              />
              <p
                id={`${id}-version-hint`}
                className="mt-1 text-[12px] text-ink-3"
              >
                {VERSION_HINT}
              </p>
              {err("version")}
            </div>
            <div>
              <label
                htmlFor={`${id}-sha`}
                className="mb-1.5 block text-[12.5px] text-ink-2"
              >
                Fingerprint (SHA-256)
              </label>
              <input
                id={`${id}-sha`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                value={sha}
                aria-invalid={errors.sha ? true : undefined}
                aria-describedby={describe("sha", true)}
                onChange={(e) => {
                  setSha(e.target.value);
                  clear("sha");
                }}
                className={`${inputClass} font-mono`}
              />
              <p id={`${id}-sha-hint`} className="mt-1 text-[12px] text-ink-3">
                {SHA_HINT}
              </p>
              {err("sha")}
            </div>
            <div>
              <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[14px] font-semibold sm:min-h-8">
                <input
                  id={`${id}-confirm`}
                  type="checkbox"
                  checked={understood}
                  aria-invalid={errors.confirm ? true : undefined}
                  aria-describedby={describe("confirm")}
                  onChange={(e) => {
                    setUnderstood(e.target.checked);
                    clear("confirm");
                  }}
                  className="mt-0.5 size-4 accent-ink"
                />
                I understand this sends patient alerts to {hospital.name}
                &apos;s clinicians.
              </label>
              {err("confirm")}
            </div>
          </>
        )}
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
        title={
          turningOn
            ? "Send patient alerts to clinicians?"
            : "Stop sending patient alerts?"
        }
        intro={
          turningOn ? (
            <p>
              {hospital.name}&apos;s clinicians will get patient alerts from
              rule set <span className="font-mono">{asking?.version}</span>.{" "}
              {LOADED_NOTE}
            </p>
          ) : (
            <p>
              {hospital.name}&apos;s clinicians stop getting new patient alerts
              from MHAI. What MHAI finds in the records is still stored for
              review.
            </p>
          )
        }
        confirmLabel={turningOn ? "Send alerts" : "Switch off alerts"}
        tone="danger"
        busy={save.busy}
        error={save.error}
        onClose={close}
        onConfirm={confirm}
      />
    </>
  );
}
