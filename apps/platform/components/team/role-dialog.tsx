"use client";
import { useId, useState, type FormEvent } from "react";
import type { TeamMember, TeamRole } from "@/lib/api/contract";
import { platformError } from "@/lib/errors";
import { useChangeRole } from "@/lib/queries/team";
import { useStepUpCall } from "@/lib/queries/step-up-call";
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

const roleWords = (r: TeamRole) =>
  r === "auditor" ? "an auditor" : "a platform admin";

/** What a role change does, said before the code is asked for. */
export const ROLE_CHANGE_EFFECT =
  "Their sessions end at once: they sign in again with the new role.";

/**
 * Change a member's role: choose it, then confirm with your own two-step
 * code (core 1.26.0: a demotion does as much damage as a removal). The
 * refusals that need no code (your own role, the last platform admin,
 * someone else's change) come back before the code is spent.
 */
export function RoleDialog({
  member,
  onClose,
  onStale,
}: {
  /** The member being changed; null while closed. */
  member: TeamMember | null;
  onClose(): void;
  /** Someone else changed or removed them: reload the team. */
  onStale(): void;
}) {
  return member ? (
    <RoleFlow member={member} onClose={onClose} onStale={onStale} />
  ) : null;
}

function RoleFlow({
  member,
  onClose,
  onStale,
}: {
  member: TeamMember;
  onClose(): void;
  onStale(): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const change = useStepUpCall(useChangeRole());
  const [role, setRole] = useState<TeamRole>(member.role);
  // The version the person saw when they chose: they change that, only.
  const [seen] = useState(member.version);
  const [step, setStep] = useState<"choose" | "confirm">("choose");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    if (role === member.role) return onClose();
    setStep("confirm");
  };
  const back = () => {
    change.clear();
    setStep("choose");
  };
  const confirm = (input: StepUpInput) =>
    change.run(
      { id: member.id, role, version: seen, ...codeOf(input) },
      {
        onSuccess: () => {
          toast.show({
            title: "Role changed",
            body: `${member.name} is now ${roleWords(role)}. They sign in again.`,
            tone: "ok",
            live: "polite",
          });
          onClose();
        },
        onError: (err) => {
          const w = platformError(err);
          if (w.stale || w.gone) onStale();
          // Shown in the code step; the code is never kept.
          return false;
        },
      },
    );

  return (
    <>
      <Modal
        open={step === "choose"}
        title={`Change role for ${member.name}`}
        onClose={onClose}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          <RoleFields name={`${id}-role`} value={role} onChange={setRole} />
          <p className="text-[13px] text-ink-2">{ROLE_CHANGE_EFFECT}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" {...net.props}>
              Continue
            </Button>
          </div>
          <OfflineNote id={`${id}-offline`} />
        </form>
      </Modal>
      <StepUpDialog
        open={step === "confirm"}
        title={`Make ${member.name} ${roleWords(role)}?`}
        intro={<p>{ROLE_CHANGE_EFFECT}</p>}
        confirmLabel="Change role"
        dismissLabel="Back"
        tone="danger"
        busy={change.busy}
        error={change.error}
        onClose={back}
        onConfirm={confirm}
      />
    </>
  );
}
