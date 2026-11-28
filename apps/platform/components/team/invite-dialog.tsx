"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { TeamRole } from "@/lib/api/contract";
import { parseInvite } from "@/lib/hospitals/form";
import { useInviteTeam } from "@/lib/queries/team";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Modal } from "./modal";
import { RoleFields } from "./role-fields";

/** What the dialog says for each refusal it handles itself (core 1.43.0). */
export const INVITE_WORDS = {
  duplicate: "Someone already has an account with this email.",
  noDelivery:
    "Email isn't set up, so the invite couldn't be sent. No one was invited.",
  invalid: "Check the name and email and try again.",
  // 424 `not_delivered`: they were invited, only the email didn't go. Never
  // "no one was invited", and never sent again (that would be a duplicate).
  notDelivered: "Invited, but the invite email didn't go through",
  notDeliveredBody: "Check their email address with them.",
} as const;

const roleWords = (r: TeamRole) =>
  r === "auditor" ? "an auditor" : "a platform admin";

export function InviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return open ? <InviteFlow onClose={onClose} /> : null;
}

/**
 * Invite a team member: the name, email and role, then the person's own
 * two-step code (core 1.43.0: an invite can make a platform admin). The
 * refusals that need no code (an email already used, email not set up)
 * come back to the form.
 */
function InviteFlow({ onClose }: { onClose(): void }) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const invite = useStepUpCall(useInviteTeam());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Least access first: an admin is a deliberate choice.
  const [role, setRole] = useState<TeamRole>("auditor");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [value, setValue] = useState<{ name: string; email: string } | null>(
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    setFailure(null);
    const r = parseInvite(name, email);
    if (!r.ok) {
      setErrors(r.errors);
      (r.errors.name ? nameRef : emailRef).current?.focus();
      return;
    }
    setValue(r.value);
    setStep("confirm");
  };
  const back = () => {
    invite.clear();
    setStep("form");
  };
  const confirm = (input: StepUpInput) => {
    if (!value) return;
    invite.run(
      { ...value, role, ...codeOf(input) },
      {
        onSuccess: () => {
          toast.show({
            title: `Invite sent to ${value.email}`,
            tone: "ok",
            live: "polite",
          });
          onClose();
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) return false;
          const toForm = (words: string, field?: "email") => {
            invite.clear();
            setStep("form");
            if (field) setErrors({ email: words });
            else setFailure(words);
            return true;
          };
          if (err.status === 409 && err.code === "duplicate")
            return toForm(INVITE_WORDS.duplicate, "email");
          if (err.status === 503 && err.code === "no_delivery")
            return toForm(INVITE_WORDS.noDelivery);
          if (
            err.status === 422 &&
            (err.code === "validation_failed" || err.code === "invalid")
          )
            return toForm(INVITE_WORDS.invalid);
          if (err.code === "not_delivered") {
            invite.clear();
            toast.show({
              title: INVITE_WORDS.notDelivered,
              body: INVITE_WORDS.notDeliveredBody,
              tone: "info",
              ms: null,
              live: "assertive",
            });
            onClose();
            return true;
          }
          // Shown in the code step; the code is never kept.
          return false;
        },
      },
    );
  };

  const field = (
    k: "name" | "email",
    label: string,
    v: string,
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
        value={v}
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
    <>
      <Modal
        open={step === "form"}
        title="Invite a team member"
        onClose={onClose}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            They get an email to set up their account.
          </p>
          {failure && (
            <Banner tone="bad" title={failure}>
              No invite was sent.
            </Banner>
          )}
          {field("name", "Name", name, setName, nameRef)}
          {field("email", "Email", email, setEmail, emailRef)}
          <RoleFields name={`${id}-role`} value={role} onChange={setRole} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" {...net.props}>
              Send invite
            </Button>
          </div>
          <OfflineNote id={`${id}-offline`} />
        </form>
      </Modal>
      <StepUpDialog
        open={step === "confirm"}
        title={`Invite ${value?.name ?? ""} as ${roleWords(role)}?`}
        intro={
          <p>
            They get an email at {value?.email} to set their password, then set
            up two-step when they first sign in.
          </p>
        }
        confirmLabel="Send invite"
        dismissLabel="Back"
        tone={role === "platform_admin" ? "danger" : "primary"}
        busy={invite.busy}
        error={invite.error}
        onClose={back}
        onConfirm={confirm}
      />
    </>
  );
}
