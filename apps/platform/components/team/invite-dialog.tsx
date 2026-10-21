"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import type { TeamRole } from "@/lib/api/contract";
import { platformError, type PlatformErrorWords } from "@/lib/errors";
import { parseInvite } from "@/lib/hospitals/form";
import { useInviteTeam } from "@/lib/queries/team";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Modal } from "./modal";
import { RoleFields } from "./role-fields";

export function InviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return (
    <Modal open={open} title="Invite a team member" onClose={onClose}>
      <InviteForm onClose={onClose} />
    </Modal>
  );
}

function InviteForm({ onClose }: { onClose(): void }) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const invite = useInviteTeam();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Least access first: an admin is a deliberate choice.
  const [role, setRole] = useState<TeamRole>("auditor");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [failure, setFailure] = useState<PlatformErrorWords | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

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
    invite.mutate(
      { ...r.value, role },
      {
        onSuccess: () => {
          toast.show({
            title: `Invite sent to ${r.value.email}`,
            tone: "ok",
            live: "polite",
          });
          onClose();
        },
        onError: (err) =>
          setFailure(
            platformError(err, {
              duplicate: "That email is already on the team.",
            }),
          ),
      },
    );
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
        autoFocus={k === "name"}
        value={value}
        disabled={invite.isPending}
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
      <p className="text-sm text-ink-2">
        They get an email to set up their account.
      </p>
      {failure && (
        <Banner tone="bad" title={failure.title}>
          {failure.body || "No invite was sent."}
        </Banner>
      )}
      {field("name", "Name", name, setName, nameRef)}
      {field("email", "Email", email, setEmail, emailRef)}
      <RoleFields
        name={`${id}-role`}
        value={role}
        onChange={setRole}
        disabled={invite.isPending}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={invite.isPending} onClick={onClose}>
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
