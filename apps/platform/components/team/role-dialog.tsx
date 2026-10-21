"use client";
import { useId, useState, type FormEvent } from "react";
import type { TeamMember, TeamRole } from "@/lib/api/contract";
import { platformError } from "@/lib/errors";
import { useChangeRole } from "@/lib/queries/team";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Modal } from "./modal";
import { RoleFields } from "./role-fields";

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
  return (
    <Modal
      open={!!member}
      title={member ? `Change role for ${member.name}` : "Change role"}
      onClose={onClose}
    >
      {member && (
        <RoleForm member={member} onClose={onClose} onStale={onStale} />
      )}
    </Modal>
  );
}

function RoleForm({
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
  const change = useChangeRole();
  const [role, setRole] = useState<TeamRole>(member.role);
  const words = change.error ? platformError(change.error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (change.isPending || net.offline) return;
    if (role === member.role) return onClose();
    change.mutate(
      { id: member.id, role, version: member.version },
      {
        onSuccess: () => {
          toast.show({
            title: "Role changed",
            body: `${member.name} is now ${role === "auditor" ? "an auditor" : "a platform admin"}.`,
            tone: "ok",
            live: "polite",
          });
          onClose();
        },
        onError: (err) => {
          const w = platformError(err);
          if (w.stale || w.gone) onStale();
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {words && (
        <Banner tone="bad" title={words.title}>
          {words.body}
        </Banner>
      )}
      <RoleFields
        name={`${id}-role`}
        value={role}
        onChange={setRole}
        disabled={change.isPending}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={change.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={change.isPending} {...net.props}>
          {change.isPending ? "Saving…" : "Save role"}
        </Button>
      </div>
      <OfflineNote id={`${id}-offline`} />
    </form>
  );
}
