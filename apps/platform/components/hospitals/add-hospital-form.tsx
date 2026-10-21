"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@mhai/api-client/errors";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { ADD_OFFLINE } from "@/lib/labels";
import {
  parseHospitalForm,
  type FieldName,
  type FormValues,
} from "@/lib/hospitals/form";
import { useAddHospital } from "@/lib/queries/hospitals";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { TopBar } from "../shell/top-bar";
import { useNeedsConnection } from "../states/offline-strip";

const FALLBACK_ZONES = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "UTC",
];
const DEFAULT_ZONE = "Africa/Lagos";

function timeZones(): string[] {
  try {
    const f = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    const zones = f ? f("timeZone") : [];
    return zones.length ? zones : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

const FIELD_ORDER: FieldName[] = [
  "name",
  "shortCode",
  "country",
  "timeZone",
  "domains",
  "adminName",
  "adminEmail",
];

const EMPTY: FormValues = {
  name: "",
  shortCode: "",
  country: "NG",
  timeZone: DEFAULT_ZONE,
  domains: "",
  adminName: "",
  adminEmail: "",
};

/** The Add hospital page: view-only accounts get the reason, not the form. */
export function AddHospitalForm() {
  const { user } = useAuth();
  return (
    <>
      <TopBar title="Add hospital" sub="A new hospital on MHAI" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto max-w-[640px]">
          {isPlatformAdmin(user) ? (
            <Fields />
          ) : (
            <Banner tone="warn" title="Your account can only view this." />
          )}
        </div>
      </div>
    </>
  );
}

function Fields() {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const net = useNeedsConnection();
  const add = useAddHospital();
  const zones = useMemo(() => {
    const z = timeZones();
    return z.includes(DEFAULT_ZONE) ? z : [DEFAULT_ZONE, ...z];
  }, []);
  const [v, setV] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  // Which field to move focus to after the errors have rendered.
  const [focusReq, setFocusReq] = useState<{ k: FieldName } | null>(null);
  useEffect(() => {
    if (focusReq) document.getElementById(`${id}-${focusReq.k}`)?.focus();
  }, [focusReq, id]);
  const set = (k: FieldName) => (value: string) => {
    setV((p) => ({ ...p, [k]: value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (add.isPending || net.offline) return;
    setFailure(null);
    const r = parseHospitalForm(v);
    if (!r.ok) {
      setErrors(r.errors);
      const first = FIELD_ORDER.find((k) => r.errors[k]);
      if (first) setFocusReq({ k: first });
      return;
    }
    setErrors({});
    add.mutate(r.value, {
      onSuccess: (h) => {
        toast.show({
          title: `Hospital added. Invite sent to ${r.value.first_admin.email}.`,
          tone: "ok",
          live: "polite",
        });
        router.push(`/hospitals/${h.id}`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "duplicate") {
          setErrors({ shortCode: platformError(err).title });
          return setFocusReq({ k: "shortCode" });
        }
        // Nothing to highlight: the service refused the whole form.
        setFailure(
          err instanceof ApiError && err.code === "invalid"
            ? "Check the details and try again."
            : platformError(err).title,
        );
      },
    });
  };

  const field = (
    k: FieldName,
    label: string,
    props: {
      type?: string;
      autoComplete?: string;
      hint?: string;
      placeholder?: string;
    } = {},
  ) => {
    const fid = `${id}-${k}`;
    const err = errors[k];
    const describedBy =
      [err && `${fid}-err`, props.hint && `${fid}-hint`]
        .filter(Boolean)
        .join(" ") || undefined;
    return (
      <div>
        <label htmlFor={fid} className="mb-1.5 block text-[12.5px] text-ink-2">
          {label}
        </label>
        <input
          id={fid}
          type={props.type ?? "text"}
          autoComplete={props.autoComplete ?? "off"}
          placeholder={props.placeholder}
          value={v[k]}
          onChange={(e) => set(k)(e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
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

  const zoneId = `${id}-timeZone`;
  const domId = `${id}-domains`;
  return (
    <form
      onSubmit={submit}
      noValidate
      className="card-v3 flex flex-col gap-4 px-[22px] py-5"
    >
      {failure && (
        <Banner tone="bad" title={failure}>
          Nothing was added.
        </Banner>
      )}
      {field("name", "Name")}
      {field("shortCode", "Short code", {
        hint: "2 to 8 letters or numbers. It can't be used twice.",
      })}
      {field("country", "Country", { hint: "For example NG." })}
      <div>
        <label
          htmlFor={zoneId}
          className="mb-1.5 block text-[12.5px] text-ink-2"
        >
          Time zone
        </label>
        <select
          id={zoneId}
          value={v.timeZone}
          onChange={(e) => set("timeZone")(e.target.value)}
          className={inputClass}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor={domId}
          className="mb-1.5 block text-[12.5px] text-ink-2"
        >
          Allowed email domains
        </label>
        <textarea
          id={domId}
          rows={3}
          value={v.domains}
          onChange={(e) => set("domains")(e.target.value)}
          aria-invalid={errors.domains ? true : undefined}
          aria-describedby={`${domId}-hint${errors.domains ? ` ${domId}-err` : ""}`}
          className={`${inputClass} py-2.5`}
        />
        <p id={`${domId}-hint`} className="mt-1 text-[12px] text-ink-3">
          Separate with commas or new lines. Only these email addresses can be
          invited.
        </p>
        {errors.domains && (
          <p id={`${domId}-err`} className="mt-1 text-[13px] text-bad">
            {errors.domains}
          </p>
        )}
      </div>
      <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
        <legend className="mb-2 text-[14px] font-semibold">
          First hospital admin
        </legend>
        {field("adminName", "First admin name", { autoComplete: "off" })}
        {field("adminEmail", "First admin email", { type: "email" })}
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/hospitals"
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-mint-deep"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          disabled={net.offline || add.isPending}
          aria-describedby={net.offline ? `${id}-offline` : undefined}
        >
          {add.isPending ? "Adding…" : "Add hospital"}
        </Button>
      </div>
      {net.offline && (
        <p id={`${id}-offline`} className="text-right text-[12px] text-ink-3">
          {ADD_OFFLINE}
        </p>
      )}
    </form>
  );
}
