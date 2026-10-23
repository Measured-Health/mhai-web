"use client";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { StepUp } from "@/lib/api/contract";
import type {
  ConnectionIn,
  ConnectionPatch,
  ConnectorType,
  EmrConnection,
} from "@/lib/api/emr-contract";
import {
  validateConnection,
  type ConnectionForm as FormValues,
} from "@/lib/emr/state";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { codeOf, StepUpDialog } from "../hospitals/step-up-dialog";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { ConnectorFields, fieldId, type FieldKind } from "./connector-fields";

/** What the person filled in, for the call that sends it. */
export type Draft = { type: ConnectorType; form: FormValues };

const LABEL_HINT =
  "Shown to the hospital's staff, for example Main record. Don't use a product name.";
const NEEDS_TEST =
  "You'll need to test the connection again before it can be switched on.";

/** Leaving the page (reload, closing the tab) with edits asks first. */
export function UnsavedGuard({ when }: { when: boolean }) {
  useEffect(() => {
    if (!when) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [when]);
  return null;
}

/** The text fields and secrets of this type, trimmed, empty ones left out. */
function pick(d: Draft) {
  const settings: Record<string, string> = {};
  const credentials: Record<string, string> = {};
  for (const f of d.type.fields) {
    if (f.kind === "secret") {
      const v = d.form.credentials[f.key] ?? "";
      if (v) credentials[f.key] = v;
    } else {
      const v = (d.form.settings[f.key] ?? "").trim();
      if (v) settings[f.key] = v;
    }
  }
  return { settings, credentials };
}

/** What Add sends, without the person's code. */
export function addInput(d: Draft): Omit<ConnectionIn, keyof StepUp> {
  return {
    type: d.type.id,
    source_label: d.form.source_label.trim(),
    base_url: d.form.base_url.trim(),
    ...pick(d),
  };
}

/** Only what changed from the saved connection, without version or code. */
export function patchInput(
  d: Draft,
  c: EmrConnection,
): Omit<ConnectionPatch, "version" | keyof StepUp> {
  const out: Omit<ConnectionPatch, "version" | keyof StepUp> = {};
  const label = d.form.source_label.trim();
  const url = d.form.base_url.trim();
  if (label !== c.source_label) out.source_label = label;
  if (url !== c.base_url) out.base_url = url;
  const { settings, credentials } = pick(d);
  const changed: Record<string, string> = {};
  for (const f of d.type.fields)
    if (f.kind === "text") {
      const now = settings[f.key] ?? "";
      if (now !== (c.settings[f.key] ?? "")) changed[f.key] = now;
    }
  if (Object.keys(changed).length) out.settings = changed;
  if (Object.keys(credentials).length) out.credentials = credentials;
  return out;
}

/** Anything but the name changed: the saved test no longer applies. */
const needsTest = (p: ReturnType<typeof patchInput>) =>
  p.base_url !== undefined ||
  p.settings !== undefined ||
  p.credentials !== undefined;

/**
 * The form for adding a connection or changing one. It checks the fields,
 * then asks for the person's two-step code in a dialog; the caller sends.
 * Secrets stay here only until the save works (the form is then gone), so a
 * wrong code can be retried without typing them again.
 */
export function ConnectionForm({
  mode,
  types,
  connection,
  hospitalName,
  busy,
  error,
  cancel,
  onSend,
  onCloseDialog,
  onNothingChanged,
  savedCount = 0,
}: {
  mode: "add" | "edit";
  /** Add: the choices. Edit: only needed to find the connection's type. */
  types: ConnectorType[];
  connection?: EmrConnection;
  hospitalName?: string;
  busy: boolean;
  /** The last refusal for the dialog to show. */
  error: unknown;
  cancel: ReactNode;
  onSend(draft: Draft, code: StepUp): void;
  /** The dialog closed: forget the call and its code. */
  onCloseDialog(): void;
  /** Edit, with nothing different from the saved connection. */
  onNothingChanged?(): void;
  /** Goes up by one each time a save works: the typed secrets are cleared. */
  savedCount?: number;
}) {
  const id = useId();
  const net = useNeedsConnection(`${id}-offline`);
  const [typeId, setTypeId] = useState(connection?.type ?? "");
  const [label, setLabel] = useState(connection?.source_label ?? "");
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? "");
  const [settings, setSettings] = useState<Record<string, string>>(
    connection?.settings ?? {},
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [asking, setAsking] = useState(false);
  const [focusReq, setFocusReq] = useState<{ k: string } | null>(null);
  // A save worked: drop the typed secrets (adjusted during render).
  const [seenSaves, setSeenSaves] = useState(savedCount);
  if (savedCount !== seenSaves) {
    setSeenSaves(savedCount);
    setCredentials({});
  }
  useEffect(() => {
    if (focusReq) document.getElementById(focusReq.k)?.focus();
  }, [focusReq]);

  const type = types.find((t) => t.id === typeId) ?? null;
  const draft = (t: ConnectorType): Draft => ({
    type: t,
    form: {
      source_label: label,
      base_url: baseUrl,
      settings,
      credentials,
    },
  });
  const dirty = connection
    ? type !== null &&
      Object.keys(patchInput(draft(type), connection)).length > 0
    : label !== "" ||
      baseUrl !== "" ||
      typeId !== "" ||
      Object.values(settings).some(Boolean) ||
      Object.values(credentials).some(Boolean);

  const clear = (k: string) => setErrors((p) => ({ ...p, [k]: undefined }));
  const pickType = (t: string) => {
    setTypeId(t);
    // Another type has other fields: start them empty.
    setSettings({});
    setCredentials({});
    setErrors({});
  };
  const change = (kind: FieldKind, key: string, value: string) => {
    (kind === "settings" ? setSettings : setCredentials)((p) => ({
      ...p,
      [key]: value,
    }));
    clear(key);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || net.offline) return;
    if (!type) {
      setErrors({ type: "Choose a connection type." });
      return setFocusReq({ k: `${id}-type` });
    }
    const errs = validateConnection(draft(type).form, type, mode);
    setErrors(errs);
    const order = [
      "source_label",
      "base_url",
      ...type.fields.map((f) => f.key),
    ];
    const first = order.find((k) => errs[k]);
    if (first)
      return setFocusReq({
        k:
          first === "source_label" || first === "base_url"
            ? `${id}-${first}`
            : fieldId(id, first),
      });
    if (
      connection &&
      Object.keys(patchInput(draft(type), connection)).length === 0
    )
      return onNothingChanged?.();
    setAsking(true);
  };

  const close = () => {
    setAsking(false);
    onCloseDialog();
  };

  const textField = (
    k: "source_label" | "base_url",
    text: string,
    set: (v: string) => void,
    name: string,
    hint?: string,
  ) => {
    const fid = `${id}-${k}`;
    const err = errors[k];
    const describedBy =
      [err && `${fid}-err`, hint && `${fid}-hint`].filter(Boolean).join(" ") ||
      undefined;
    return (
      <div>
        <label htmlFor={fid} className="mb-1.5 block text-[12.5px] text-ink-2">
          {name}
        </label>
        <input
          id={fid}
          type="text"
          autoComplete="off"
          value={text}
          aria-invalid={err ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            set(e.target.value);
            clear(k);
          }}
          className={inputClass}
        />
        {hint && (
          <p id={`${fid}-hint`} className="mt-1 text-[12px] text-ink-3">
            {hint}
          </p>
        )}
        {err && (
          <p id={`${fid}-err`} className="mt-1 text-[13px] text-bad">
            {err}
          </p>
        )}
      </div>
    );
  };

  const patch = connection && type ? patchInput(draft(type), connection) : null;
  const title =
    mode === "add"
      ? `Add ${type?.label ?? "connection"} for ${hospitalName ?? "this hospital"}?`
      : `Save changes to ${connection?.source_label ?? "this connection"}?`;
  const intro =
    mode === "add"
      ? "It will be saved switched off. Test it, then switch it on."
      : patch && needsTest(patch)
        ? NEEDS_TEST
        : undefined;

  return (
    <>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <UnsavedGuard when={dirty} />
        {mode === "add" && (
          <fieldset
            aria-describedby={errors.type ? `${id}-type-err` : undefined}
          >
            <legend className="mb-2 text-[13px] font-semibold">
              Connection type
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {types.map((t, i) => (
                <label key={t.id} className="cursor-pointer">
                  <input
                    id={i === 0 ? `${id}-type` : undefined}
                    type="radio"
                    name={`${id}-type`}
                    value={t.id}
                    checked={typeId === t.id}
                    onChange={() => {
                      pickType(t.id);
                      clear("type");
                    }}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 flex-col gap-0.5 rounded-2xl border border-line bg-white px-4 py-3 peer-checked:border-ink peer-checked:ring-1 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep">
                    <span className="text-[14px] font-semibold">{t.label}</span>
                    <span className="text-[12.5px] text-ink-3">
                      {t.summary}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {errors.type && (
              <p id={`${id}-type-err`} className="mt-1.5 text-[13px] text-bad">
                {errors.type}
              </p>
            )}
          </fieldset>
        )}
        {(mode === "edit" || type) && (
          <>
            {textField(
              "source_label",
              label,
              setLabel,
              "Name the hospital sees",
              LABEL_HINT,
            )}
            {textField("base_url", baseUrl, setBaseUrl, "Base address")}
            {type && (
              <ConnectorFields
                key={type.id}
                type={type}
                values={settings}
                secrets={credentials}
                savedCredentials={connection?.credentials ?? []}
                errors={errors}
                onChange={change}
                mode={mode}
                idPrefix={id}
              />
            )}
          </>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {cancel}
          <Button type="submit" {...net.props}>
            {mode === "add" ? "Continue" : "Save changes"}
          </Button>
        </div>
        <OfflineNote id={`${id}-offline`} />
      </form>
      {/* Outside the form: the dialog has a form of its own. */}
      <StepUpDialog
        open={asking}
        title={title}
        intro={intro ? <p>{intro}</p> : undefined}
        confirmLabel={mode === "add" ? "Add connection" : "Save changes"}
        tone="primary"
        busy={busy}
        error={error}
        onClose={close}
        onConfirm={(input) => {
          if (type) onSend(draft(type), codeOf(input));
        }}
      />
    </>
  );
}
