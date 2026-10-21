"use client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Hospital, InviteStatus } from "@/lib/api/contract";
import { platformError, type PlatformErrorWords } from "@/lib/errors";
import { parseInvite } from "@/lib/hospitals/form";
import { useInviteAdmin, useResendInvite } from "@/lib/queries/hospitals";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { dateLabel } from "./format";
import { Section } from "./section";

const INVITE: Record<
  InviteStatus,
  { label: string; tone: "ok" | "warn" | "bad"; Icon: LucideIcon }
> = {
  pending: { label: "Pending", tone: "warn", Icon: Clock },
  accepted: { label: "Accepted", tone: "ok", Icon: CheckCircle2 },
  expired: { label: "Expired", tone: "bad", Icon: AlertTriangle },
};

/** The invite's status as an icon and the word: never colour alone. */
function InviteChip({ status }: { status: InviteStatus }) {
  const { label, tone, Icon } = INVITE[status];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </Chip>
  );
}

/** Invites can be sent while staff can still sign in. */
const canInviteTo = (h: Hospital) =>
  h.status === "active" || h.status === "setup_incomplete";

/**
 * The hospital's first admin: who, and where their invite stands. Platform
 * admins can resend a pending or expired invite, or invite one if none.
 */
export function FirstAdminSection({
  hospital: h,
  canAct,
  onGone,
}: {
  hospital: Hospital;
  canAct: boolean;
  onGone(): void;
}) {
  const a = h.first_admin;
  const resend = useResendInvite(h.id);
  const toast = useToast();
  const net = useNeedsConnection("admin-offline");
  const [error, setError] = useState<PlatformErrorWords | null>(null);
  const [inviting, setInviting] = useState(false);
  const fail = (e: Error) => {
    const w = platformError(e);
    if (w.gone || w.stale) onGone();
    setError(w);
  };

  const canResend =
    canAct && !!a && a.status !== "accepted" && h.status !== "removed";
  return (
    <Section
      title="First hospital admin"
      action={
        canResend ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={resend.isPending}
            {...net.props}
            onClick={() => {
              setError(null);
              resend.mutate(a.invite_id, {
                onSuccess: (next) =>
                  toast.show({
                    title: `Invite sent again to ${a.email}`,
                    body: next.first_admin
                      ? `It expires ${dateLabel(next.first_admin.expires_at)}.`
                      : undefined,
                    tone: "ok",
                    live: "polite",
                  }),
                onError: fail,
              });
            }}
          >
            {resend.isPending ? "Sending…" : "Resend"}
          </Button>
        ) : !a && canAct && canInviteTo(h) && !inviting ? (
          <Button
            size="sm"
            variant="ghost"
            {...net.props}
            onClick={() => {
              setError(null);
              setInviting(true);
            }}
          >
            Invite
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      {a ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px]">
          <div className="min-w-0">
            <b className="block">{a.name}</b>
            <span className="text-ink-3 [overflow-wrap:anywhere]">
              {a.email}
            </span>
          </div>
          <InviteChip status={a.status} />
          {a.status === "pending" && (
            <span className="text-ink-3">
              Expires {dateLabel(a.expires_at)}
            </span>
          )}
          {a.status === "expired" && (
            <span className="text-ink-3">
              Expired {dateLabel(a.expires_at)}
            </span>
          )}
        </div>
      ) : inviting ? (
        <InviteForm
          hospital={h}
          onDone={() => setInviting(false)}
          onGone={onGone}
        />
      ) : (
        <p className="text-[13.5px] text-ink-3">No first admin yet.</p>
      )}
      {canAct && <OfflineNote id="admin-offline" />}
    </Section>
  );
}

function InviteForm({
  hospital,
  onDone,
  onGone,
}: {
  hospital: Hospital;
  onDone(): void;
  onGone(): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const invite = useInviteAdmin(hospital.id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [failure, setFailure] = useState<PlatformErrorWords | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invite.isPending || net.offline) return;
    setFailure(null);
    const r = parseInvite(name, email);
    if (!r.ok) {
      setErrors(r.errors);
      (r.errors.name ? nameRef : emailRef).current?.focus();
      return;
    }
    invite.mutate(r.value, {
      onSuccess: () => {
        toast.show({
          title: `Invite sent to ${r.value.email}`,
          tone: "ok",
          live: "polite",
        });
        onDone();
      },
      onError: (err) => {
        const w = platformError(err);
        if (w.gone || w.stale) onGone();
        setFailure(w);
      },
    });
  };
  const field = (
    k: "name" | "email",
    label: string,
    value: string,
    set: (v: string) => void,
    ref: typeof nameRef,
  ) => (
    <div>
      <label
        htmlFor={`${id}-${k}`}
        className="mb-1.5 block text-[12.5px] text-ink-2"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={`${id}-${k}`}
        type={k === "email" ? "email" : "text"}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setErrors((p) => ({ ...p, [k]: undefined }));
        }}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `${id}-${k}-err` : undefined}
        className={inputClass}
      />
      {errors[k] && (
        <p id={`${id}-${k}-err`} className="mt-1 text-[13px] text-bad">
          {errors[k]}
        </p>
      )}
    </div>
  );
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {failure && (
        <Banner tone="bad" title={failure.title}>
          {failure.body || "No invite was sent."}
        </Banner>
      )}
      {field("name", "Name", name, setName, nameRef)}
      {field("email", "Email", email, setEmail, emailRef)}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={invite.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={invite.isPending} {...net.props}>
          {invite.isPending ? "Sending…" : "Send invite"}
        </Button>
      </div>
      <OfflineNote id={`${id}-offline`} />
    </form>
  );
}
