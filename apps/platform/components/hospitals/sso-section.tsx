"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@mhai/api-client/errors";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { SSO_TEST_FIRST } from "@/lib/labels";
import type { SsoIn, SsoOut } from "@/lib/api/contract";
import { useSaveSso, useSso, useTestSso } from "@/lib/queries/sso";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { Switch } from "@mhai/ui/switch";
import { useToast } from "@mhai/ui/toast";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

const HTTPS = "Use an address that starts with https://.";
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

type Field = "url" | "clientId" | "issuer" | "domains" | "secret";
const ORDER: Field[] = ["url", "clientId", "issuer", "domains", "secret"];

/** In the viewer's own time zone: "20 Oct 2026, 10:42". */
const when = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date}, ${time}`;
};
const split = (t: string) => [
  ...new Set(
    t
      .split(/[,\n\r]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  ),
];
const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** The last test's result with its time, in words. */
function TestResult({ t }: { t: SsoOut["last_test"] }) {
  if (!t) return <span>Not tested yet.</span>;
  return t.ok ? (
    <span>{`Worked · ${when(t.at)}`}</span>
  ) : (
    <span>{`Didn't work: ${t.message}`}</span>
  );
}

/**
 * Single sign-on for one hospital. Platform admins edit it; auditors see it.
 * The client secret is write-only: it is never shown, and is dropped from
 * state the moment a save is sent.
 */
export function SsoSection({
  hospitalId,
  hospitalName,
}: {
  hospitalId: string;
  hospitalName?: string;
}) {
  const { user } = useAuth();
  const q = useSso(hospitalId);
  // Bumped by Reload so the form starts again from the server's copy.
  const [fresh, setFresh] = useState(0);
  const admin = isPlatformAdmin(user);

  let body;
  if (q.data) {
    body = admin ? (
      <Editor
        key={`${q.data.version}-${fresh}`}
        hospitalId={hospitalId}
        hospitalName={hospitalName}
        sso={q.data}
        onReload={async () => {
          await q.refetch();
          setFresh((n) => n + 1);
        }}
      />
    ) : (
      <ReadOnly sso={q.data} />
    );
  } else if (q.isError) {
    body = (
      <CouldntLoad what="single sign-on" onRetry={() => void q.refetch()} />
    );
  } else {
    body = <Loading label="Loading single sign-on" />;
  }
  return (
    <section
      aria-labelledby={`sso-${hospitalId}-h`}
      className="card-v3 px-[22px] py-5"
    >
      <h2 id={`sso-${hospitalId}-h`} className="mb-3 text-[16px] font-semibold">
        Single sign-on
      </h2>
      {body}
    </section>
  );
}

function ReadOnly({ sso }: { sso: SsoOut }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-[12.5px] text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-[14px]">{value}</dd>
    </div>
  );
  const none = "Not set";
  return (
    <dl className="flex flex-col gap-3">
      {row("Status", sso.enabled ? "On" : "Off")}
      {row("Sign-in address", sso.sign_in_url ?? none)}
      {row("Client ID", sso.client_id ?? none)}
      {row("Issuer", sso.issuer ?? none)}
      {row(
        "Allowed email domains",
        sso.allowed_domains.length ? sso.allowed_domains.join(", ") : none,
      )}
      {row(
        "Client secret",
        sso.secret_saved ? `Saved · ends ··${sso.secret_ends ?? ""}` : none,
      )}
      {row("Last test", <TestResult t={sso.last_test} />)}
    </dl>
  );
}

function Editor({
  hospitalId,
  hospitalName,
  sso,
  onReload,
}: {
  hospitalId: string;
  hospitalName?: string;
  sso: SsoOut;
  onReload(): Promise<void>;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const save = useSaveSso(hospitalId);
  const test = useTestSso(hospitalId);
  const [url, setUrl] = useState(sso.sign_in_url ?? "");
  const [clientId, setClientId] = useState(sso.client_id ?? "");
  const [issuer, setIssuer] = useState(sso.issuer ?? "");
  const [domains, setDomains] = useState(sso.allowed_domains.join(", "));
  const [enabled, setEnabled] = useState(sso.enabled);
  const [secret, setSecret] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<{
    title: string;
    stale: boolean;
  } | null>(null);
  const [testFailure, setTestFailure] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [focusReq, setFocusReq] = useState<{ k: string } | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const cancelSave = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusReq) document.getElementById(`${id}-${focusReq.k}`)?.focus();
  }, [focusReq, id]);

  const showSecretInput = !sso.secret_saved || replacing;
  const configDirty =
    url.trim() !== (sso.sign_in_url ?? "") ||
    clientId.trim() !== (sso.client_id ?? "") ||
    issuer.trim() !== (sso.issuer ?? "") ||
    split(domains).join(",") !== sso.allowed_domains.join(",") ||
    secret !== "";
  // The server clears its last test whenever the set-up changes, so a passing
  // one is about the saved copy; unsaved edits have not been tested.
  const tested = sso.last_test?.ok === true && !configDirty;
  const lockedOff = !enabled && !tested;

  const edit = (k: Field, set: (v: string) => void) => (v: string) => {
    set(v);
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  /** Field checks; `requireAll` is true when the result will be switched on. */
  const check = (requireAll: boolean) => {
    const errs: Partial<Record<Field, string>> = {};
    const u = url.trim();
    const iss = issuer.trim();
    if (u && !isHttps(u)) errs.url = HTTPS;
    else if (requireAll && !u) errs.url = "Enter the sign-in address.";
    if (iss && !isHttps(iss)) errs.issuer = HTTPS;
    else if (requireAll && !iss) errs.issuer = "Enter the issuer.";
    if (requireAll && !clientId.trim()) errs.clientId = "Enter the client ID.";
    if (split(domains).some((d) => !DOMAIN.test(d)))
      errs.domains = "Use domains like hospital.org, separated by commas.";
    if (secret !== "" && secret.length < 8)
      errs.secret = "Use at least 8 characters.";
    setErrors(errs);
    const first = ORDER.find((k) => errs[k]);
    if (first) setFocusReq({ k: first });
    return !first;
  };

  /** Edits to a live set-up switch it off until they are tested. */
  const switchesOff = sso.enabled && enabled && configDirty;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending || net.offline) return;
    setFailure(null);
    if (!check(enabled)) return;
    if (switchesOff) return setConfirmSave(true);
    send(false);
  };

  /** Sends the draft; `off` saves it switched off whatever the switch says. */
  const send = (off: boolean) => {
    if (save.isPending || net.offline) return;
    setFailure(null);
    if (!check(off ? false : enabled)) return;
    // Changing the set-up switches it off until it has been tested again.
    const sendOn = !off && enabled && !configDirty;
    const sentSecret = secret;
    const input: SsoIn = {
      enabled: sendOn,
      sign_in_url: url.trim(),
      client_id: clientId.trim(),
      issuer: issuer.trim(),
      allowed_domains: split(domains),
      version: sso.version,
      // Only a new secret is sent, never an empty one.
      ...(sentSecret ? { client_secret: sentSecret } : {}),
    };
    // Gone from state before the reply, whether the save works or not.
    setSecret("");
    setReplacing(false);
    save.mutate(input, {
      onSuccess: () =>
        toast.show({
          title:
            sso.enabled && !off && !sendOn
              ? "Saved. Single sign-on is off until you test it."
              : "Saved.",
          tone: "ok",
          live: "polite",
        }),
      onError: (err) => {
        if (err instanceof ApiError && err.code === "invalid")
          return setFailure({
            title: "Check the details and try again.",
            stale: false,
          });
        const w = platformError(err);
        setFailure({ title: w.title, stale: w.stale });
      },
    });
  };

  const runTest = () => {
    setTestFailure(null);
    test.mutate(undefined, {
      onError: (err) =>
        setTestFailure(
          err instanceof ApiError && err.code === "conflict"
            ? "Save the address and secret first."
            : platformError(err).title,
        ),
    });
  };

  const testBlock = configDirty
    ? "Save your changes, then test."
    : !sso.sign_in_url || !sso.secret_saved
      ? "Save the address and secret first."
      : null;

  const field = (
    k: Field,
    label: string,
    value: string,
    set: (v: string) => void,
    props: { type?: string; hint?: string; rows?: number } = {},
  ) => {
    const fid = `${id}-${k}`;
    const err = errors[k];
    const describedBy =
      [err && `${fid}-err`, props.hint && `${fid}-hint`]
        .filter(Boolean)
        .join(" ") || undefined;
    const common = {
      id: fid,
      value,
      autoComplete: "off",
      onChange: (e: { target: { value: string } }) =>
        edit(k, set)(e.target.value),
      "aria-invalid": err ? (true as const) : undefined,
      "aria-describedby": describedBy,
    };
    return (
      <div>
        <label htmlFor={fid} className="mb-1.5 block text-[12.5px] text-ink-2">
          {label}
        </label>
        {props.rows ? (
          <textarea
            {...common}
            rows={props.rows}
            className={`${inputClass} py-2.5`}
          />
        ) : (
          <input
            {...common}
            type={props.type ?? "text"}
            className={inputClass}
          />
        )}
        {props.hint && (
          <p id={`${fid}-hint`} className="mt-1 text-[12px] text-ink-3">
            {props.hint}
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

  const lockedId = `${id}-locked`;
  const staff = `Staff at ${hospitalName ?? "this hospital"} will sign in with email and password instead.`;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {failure && (
        <Banner tone="bad" title={failure.title}>
          {failure.stale ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => void onReload()}
            >
              Reload
            </Button>
          ) : (
            <p>Nothing was saved.</p>
          )}
        </Banner>
      )}
      <div>
        <Switch
          label="Single sign-on"
          checked={enabled}
          disabled={lockedOff}
          describedBy={lockedOff ? lockedId : undefined}
          onChange={(v) =>
            v
              ? setEnabled(true)
              : sso.enabled
                ? setConfirmOff(true)
                : setEnabled(false)
          }
        />
        {lockedOff && (
          <p id={lockedId} className="text-[13px] text-ink-3">
            {SSO_TEST_FIRST}
          </p>
        )}
        {enabled && !sso.enabled && (
          <p className="text-[13px] text-ink-3">Save to switch on.</p>
        )}
      </div>
      {field("url", "Sign-in address", url, setUrl, {
        type: "url",
        hint: "Must start with https://.",
      })}
      {field("clientId", "Client ID", clientId, setClientId)}
      {field("issuer", "Issuer", issuer, setIssuer, { type: "url" })}
      {field("domains", "Allowed email domains", domains, setDomains, {
        rows: 2,
        hint: "Separate with commas or new lines.",
      })}
      {showSecretInput ? (
        <div>
          {field("secret", "Client secret", secret, setSecret, {
            type: "password",
            hint: sso.secret_saved
              ? "Leave empty to keep the saved secret."
              : "It can't be shown again once saved.",
          })}
          {sso.secret_saved && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setSecret("");
                setReplacing(false);
                setFocusReq({ k: "replace" });
              }}
            >
              Keep current secret
            </Button>
          )}
        </div>
      ) : (
        <div>
          <span className="mb-1.5 block text-[12.5px] text-ink-2">
            Client secret
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[14px]">{`Saved · ends ··${sso.secret_ends ?? ""}`}</span>
            <Button
              variant="ghost"
              size="sm"
              id={`${id}-replace`}
              onClick={() => {
                setReplacing(true);
                setFocusReq({ k: "secret" });
              }}
            >
              Replace secret
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-[14px]" aria-live="polite">
          <TestResult t={sso.last_test} />
        </p>
        {testFailure && (
          <p role="alert" className="text-[13px] text-bad">
            {testFailure}
          </p>
        )}
        {switchesOff && (
          <p className="text-[13px] text-ink-2">
            Saving changes switches single sign-on off until you test them.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={runTest}
            {...net.props}
            disabled={net.offline || test.isPending || testBlock !== null}
            aria-describedby={
              net.offline
                ? `${id}-offline`
                : testBlock
                  ? `${id}-test-block`
                  : undefined
            }
          >
            {test.isPending ? "Testing…" : "Test sign-in"}
          </Button>
          <Button
            type="submit"
            {...net.props}
            disabled={net.offline || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        {!net.offline && testBlock && (
          <p id={`${id}-test-block`} className="text-[12px] text-ink-3">
            {testBlock}
          </p>
        )}
        <OfflineNote id={`${id}-offline`} />
      </div>
      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Switch off single sign-on?"
      >
        <p className="mb-5 text-[14px] text-ink-2">{staff}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOff(false)}>
            Keep it on
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmOff(false);
              send(true);
            }}
          >
            {configDirty ? "Switch off and save" : "Switch off"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title="Save and switch off single sign-on?"
        initialFocus={cancelSave}
      >
        <p className="mb-5 text-[14px] text-ink-2">
          {`Saving these changes switches single sign-on off until you test them. ${staff}`}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            ref={cancelSave}
            variant="ghost"
            onClick={() => setConfirmSave(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmSave(false);
              send(false);
            }}
          >
            Save and switch off
          </Button>
        </div>
      </Dialog>
    </form>
  );
}
