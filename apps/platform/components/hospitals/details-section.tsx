"use client";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { Hospital } from "@/lib/api/contract";
import { platformError, type PlatformErrorWords } from "@/lib/errors";
import {
  parseDetailsForm,
  type DetailValues,
  type FieldName,
} from "@/lib/hospitals/form";
import { useUpdateHospital } from "@/lib/queries/hospitals";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { timeZones } from "./add-hospital-form";
import { dateLabel } from "./format";
import { Section } from "./section";

const ORDER: (keyof DetailValues)[] = [
  "name",
  "shortCode",
  "country",
  "timeZone",
  "domains",
];

const valuesOf = (h: Hospital): DetailValues => ({
  name: h.name,
  shortCode: h.short_code,
  country: h.country,
  timeZone: h.time_zone,
  domains: h.email_domains.join(", "),
});

/**
 * The details: a read view, and Edit for platform admins. A save sends the
 * version the edit started from, so it never overwrites someone else's
 * change; a clash says so and Reload shows theirs, dropping these edits.
 */
export function DetailsSection({
  hospital,
  canEdit,
  onReload,
}: {
  hospital: Hospital;
  canEdit: boolean;
  /** Refetches the hospital (after a clash, or when it's gone). */
  onReload(): Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [stale, setStale] = useState(false);
  const reload = async () => {
    setEditing(false);
    setStale(false);
    await onReload();
  };
  return (
    <Section
      title="Details"
      action={
        canEdit && !editing ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStale(false);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        ) : undefined
      }
    >
      {stale && !editing && <StaleBanner onReload={() => void reload()} />}
      {editing ? (
        <EditForm
          hospital={hospital}
          onDone={() => setEditing(false)}
          onStale={() => setStale(true)}
          stale={stale}
          onReload={() => void reload()}
          onGone={() => void onReload()}
        />
      ) : (
        <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-[160px_1fr]">
          <Row term="Name">{hospital.name}</Row>
          <Row term="Short code">
            <span className="font-mono">{hospital.short_code}</span>
          </Row>
          <Row term="Country">{hospital.country}</Row>
          <Row term="Time zone">{hospital.time_zone}</Row>
          <Row term="Allowed email domains">
            {hospital.email_domains.length
              ? hospital.email_domains.join(", ")
              : "Any"}
          </Row>
          <Row term="Created">{dateLabel(hospital.created_at)}</Row>
        </dl>
      )}
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

function StaleBanner({ onReload }: { onReload(): void }) {
  const w = platformError(new ApiError(409, "conflict"));
  return (
    <div className="mb-3">
      <Banner tone="warn" title={w.title}>
        <p>{w.body}</p>
        <Button size="sm" variant="ghost" className="mt-2" onClick={onReload}>
          Reload
        </Button>
      </Banner>
    </div>
  );
}

function EditForm({
  hospital,
  stale,
  onDone,
  onStale,
  onReload,
  onGone,
}: {
  hospital: Hospital;
  stale: boolean;
  onDone(): void;
  onStale(): void;
  onReload(): void;
  onGone(): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const save = useUpdateHospital(hospital.id);
  // The version and values the edit started from: a refetch underneath
  // never changes what this save claims to replace.
  const [start] = useState(() => ({
    version: hospital.version,
    values: valuesOf(hospital),
  }));
  const [v, setV] = useState<DetailValues>(start.values);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [failure, setFailure] = useState<PlatformErrorWords | null>(null);
  const [focusReq, setFocusReq] = useState<{ k: FieldName }>({ k: "name" });
  useEffect(() => {
    document.getElementById(`${id}-${focusReq.k}`)?.focus();
  }, [focusReq, id]);
  const zones = useMemo(() => {
    const z = timeZones();
    return z.includes(start.values.timeZone)
      ? z
      : [start.values.timeZone, ...z];
  }, [start.values.timeZone]);
  const set = (k: keyof DetailValues) => (value: string) => {
    setV((p) => ({ ...p, [k]: value }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending || net.offline || stale) return;
    setFailure(null);
    const r = parseDetailsForm(v);
    if (!r.ok) {
      setErrors(r.errors);
      const first = ORDER.find((k) => r.errors[k]);
      if (first) setFocusReq({ k: first });
      return;
    }
    save.mutate(
      { ...r.value, version: start.version },
      {
        onSuccess: () => {
          toast.show({ title: "Details saved", tone: "ok", live: "polite" });
          onDone();
        },
        onError: (err) => {
          const w = platformError(err);
          if (w.stale) return onStale();
          if (w.gone) return onGone();
          if (err instanceof ApiError && err.code === "duplicate") {
            setErrors({ shortCode: w.title });
            return setFocusReq({ k: "shortCode" });
          }
          setFailure(
            err instanceof ApiError && err.code === "invalid"
              ? { ...w, title: "Check the details and try again." }
              : w,
          );
        },
      },
    );
  };

  const field = (
    k: keyof DetailValues,
    label: string,
    input: (p: {
      id: string;
      "aria-invalid"?: boolean;
      "aria-describedby"?: string;
    }) => ReactNode,
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
          {label}
        </label>
        {input({
          id: fid,
          "aria-invalid": err ? true : undefined,
          "aria-describedby": describedBy,
        })}
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
  const text = (k: keyof DetailValues) =>
    function TextInput(p: object) {
      return (
        <input
          {...p}
          type="text"
          autoComplete="off"
          value={v[k]}
          onChange={(e) => set(k)(e.target.value)}
          className={inputClass}
        />
      );
    };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {stale && <StaleBanner onReload={onReload} />}
      {failure && (
        <Banner tone="bad" title={failure.title}>
          {failure.body || "Nothing was saved."}
        </Banner>
      )}
      {field("name", "Name", text("name"))}
      {field(
        "shortCode",
        "Short code",
        text("shortCode"),
        "2 to 8 letters or numbers. It can't be used twice.",
      )}
      {field("country", "Country", text("country"), "For example NG.")}
      {field("timeZone", "Time zone", (p) => (
        <select
          {...p}
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
      ))}
      {field(
        "domains",
        "Allowed email domains",
        (p) => (
          <textarea
            {...p}
            rows={2}
            value={v.domains}
            onChange={(e) => set("domains")(e.target.value)}
            className={`${inputClass} py-2.5`}
          />
        ),
        "Separate with commas or new lines.",
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          disabled={save.isPending}
          onClick={() => {
            save.reset();
            onDone();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || stale} {...net.props}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <OfflineNote id={`${id}-offline`} />
    </form>
  );
}
