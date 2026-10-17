"use client";
import { CheckCircle2, CircleAlert, Link2Off } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type {
  HospitalSettingsOut,
  SettingsEditable,
  SettingsPatchIn,
  SsoStatus,
} from "@/lib/api/admin-contract";
import { useHospitalSettings, useUpdateSettings } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { useOnline } from "@/lib/hooks/use-online";
import { UnsavedGuard } from "../states/unsaved-guard";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AdminFrame } from "./admin-frame";

type Changes = Partial<SettingsEditable>;
const KEYS: readonly (keyof SettingsEditable)[] = [
  "review_overdue_hours",
  "reviewers_share_specialty",
  "require_mfa_for_clinicians",
  "idle_timeout_minutes",
  "allow_trust_device",
];

/** Only values that differ from what's saved, with the version (R7). */
export function settingsPatch(
  data: HospitalSettingsOut,
  changes: Changes,
): SettingsPatchIn | null {
  const p: SettingsPatchIn = { version: data.version };
  for (const k of KEYS) {
    const v = changes[k];
    if (v !== undefined && v !== data[k]) Object.assign(p, { [k]: v });
  }
  return Object.keys(p).length > 1 ? p : null;
}

const SSO: Record<
  SsoStatus,
  { label: string; tone: "ok" | "muted" | "warn"; Icon: typeof CheckCircle2 }
> = {
  connected: { label: "Connected", tone: "ok", Icon: CheckCircle2 },
  not_set_up: { label: "Not set up", tone: "muted", Icon: Link2Off },
  error: { label: "Needs attention", tone: "warn", Icon: CircleAlert },
};

const hours = (n: number) => (n === 1 ? "1 hour" : `${n} hours`);

function Setting({
  title,
  sub,
  children,
}: {
  title: ReactNode;
  sub: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3.5 first:border-t-0">
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="text-[14px] font-semibold">{title}</div>
        <p className="text-[12.5px] text-ink-3">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2">
      {/* The real control sits, transparent, over the track: clickable and labelled. */}
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 rounded-full bg-lilac-2 transition-colors duration-[var(--t-fast)] after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-[var(--t-fast)] peer-checked:bg-mint peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep"
        />
      </span>
      <span aria-hidden>{checked ? "On" : "Off"}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3
        id={id}
        className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

const select =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/** Hospital settings (hospital-admin.html tab 4). */
export function SettingsView() {
  const q = useHospitalSettings();
  const save = useUpdateSettings();
  const toast = useToast();
  const online = useOnline();
  const overdueId = useId();
  const idleId = useId();
  const [changes, setChanges] = useState<Changes>({});
  const [error, setError] = useState<AdminError | null>(null);

  const failed = q.isError ? adminError(q.error) : null;
  const retry = failed && (
    <div className="mb-4">
      <Banner tone="bad" title={failed.title}>
        {failed.body}
        <span className="mt-2 block">
          <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </span>
      </Banner>
    </div>
  );

  if (!q.data)
    return (
      <AdminFrame title="Hospital settings">
        {retry}
        {q.isPending && !q.isError && q.fetchStatus === "paused" ? (
          <div
            role="status"
            className="card-v3 p-6 text-center text-[14px] text-ink-2"
          >
            You&apos;re offline. Settings will load when you reconnect.
          </div>
        ) : q.isError ? null : (
          <Skeleton className="h-96 rounded-2xl" />
        )}
      </AdminFrame>
    );

  const data = q.data;
  const value = <K extends keyof SettingsEditable>(k: K): SettingsEditable[K] =>
    (changes[k] ?? data[k]) as SettingsEditable[K];
  const set = <K extends keyof SettingsEditable>(
    k: K,
    v: SettingsEditable[K],
  ) => setChanges((c) => ({ ...c, [k]: v }));
  const patch = settingsPatch(data, changes);
  const sso = SSO[data.sso.status];

  function submit() {
    if (!patch || !online) return;
    setError(null);
    save.mutate(patch, {
      onSuccess: () => {
        setChanges({});
        toast.show({
          title: "Settings saved",
          body: "They apply at each person's next sign-in.",
          tone: "ok",
        });
      },
      onError: (e) => {
        const err = adminError(e);
        // Their values load underneath; yours stay on top (R7).
        setError(
          err.stale
            ? {
                ...err,
                title: "Someone else saved the settings just now",
                body: "We've loaded their changes. Yours are still here: check them and save again.",
              }
            : err,
        );
      },
    });
  }

  return (
    <AdminFrame title="Hospital settings">
      <div className="flex max-w-[760px] flex-col gap-4">
        {retry}
        <Section title="Corrections review">
          <Setting
            title={<label htmlFor={overdueId}>Flag as overdue after</label>}
            sub="Reviewers get a reminder; it shows red in the queue"
          >
            <select
              id={overdueId}
              className={select}
              value={value("review_overdue_hours")}
              onChange={(e) =>
                set("review_overdue_hours", Number(e.target.value))
              }
            >
              {data.limits.review_overdue_hours.map((h) => (
                <option key={h} value={h}>
                  {hours(h)}
                </option>
              ))}
            </select>
          </Setting>
          <Setting
            title="Reviewers must share the specialty"
            sub={
              value("reviewers_share_specialty")
                ? "On: only reviewers in the correction's specialty can review it"
                : "Off: any clinician except the person who suggested it can review"
            }
          >
            <Switch
              label="Reviewers must share the specialty"
              checked={value("reviewers_share_specialty")}
              onChange={(v) => set("reviewers_share_specialty", v)}
            />
          </Setting>
        </Section>

        <Section title="Security">
          <Setting
            title="Require 2-step verification for clinicians"
            sub="Hospital admins always need it"
          >
            <Switch
              label="Require 2-step verification for clinicians"
              checked={value("require_mfa_for_clinicians")}
              onChange={(v) => set("require_mfa_for_clinicians", v)}
            />
          </Setting>
          <Setting
            title={<label htmlFor={idleId}>Sign out after inactivity</label>}
            sub="Shared ward computers: keep this short"
          >
            <select
              id={idleId}
              className={select}
              value={value("idle_timeout_minutes")}
              onChange={(e) =>
                set("idle_timeout_minutes", Number(e.target.value))
              }
            >
              {data.limits.idle_timeout_minutes.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Setting>
          <Setting
            title='Allow "trust this device"'
            sub="Skips 2-step for 30 days on a personal device"
          >
            <Switch
              label='Allow "trust this device"'
              checked={value("allow_trust_device")}
              onChange={(v) => set("allow_trust_device", v)}
            />
          </Setting>
        </Section>

        <Section title="Sign-in">
          <Setting
            title="Hospital single sign-on"
            sub={
              data.sso.domain
                ? `Connected to ${data.sso.domain} · managed by Measured Health`
                : "Managed by Measured Health"
            }
          >
            <Chip tone={sso.tone}>
              <sso.Icon aria-hidden className="size-3.5" />
              {sso.label}
            </Chip>
          </Setting>
          <Setting
            title="Allowed email domains"
            sub="Invites outside these are blocked"
          >
            <span className="flex flex-wrap gap-1.5 font-mono text-[12.5px] [overflow-wrap:anywhere]">
              {data.allowed_email_domains.length
                ? data.allowed_email_domains.map((d) => (
                    <span key={d} className="rounded-lg bg-bg px-2 py-1">
                      {d}
                    </span>
                  ))
                : "Any"}
            </span>
          </Setting>
          <p className="pt-1 text-[12px] text-ink-3">
            Measured Health sets these up. Contact them to change how people
            sign in.
          </p>
        </Section>

        {error && (
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!patch || !online || save.isPending}
            aria-describedby={online ? undefined : "settings-offline"}
            onClick={submit}
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {patch && (
            <Button
              variant="ghost"
              onClick={() => {
                setChanges({});
                setError(null);
              }}
            >
              Undo changes
            </Button>
          )}
          <span
            id={online ? undefined : "settings-offline"}
            className="text-[12.5px] text-ink-3"
          >
            {online
              ? "Changes are logged and apply at each person's next sign-in."
              : "You're offline. Saving needs a connection."}
          </span>
        </div>
      </div>
      <UnsavedGuard
        dirty={patch !== null}
        onDiscard={() => setChanges({})}
        title="Leave without saving?"
        body="Your changes to the hospital settings will be lost."
      />
    </AdminFrame>
  );
}
