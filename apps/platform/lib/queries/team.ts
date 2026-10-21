"use client";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { StepUp, TeamMember, TeamRole } from "../api/contract";
import { queryKeys } from "./keys";

/** The team list. */
export const teamKey = [...queryKeys.team, "list"] as const;

/** The whole team: a handful of people, so no paging. */
export function useTeam() {
  return useQuery({
    queryKey: teamKey,
    queryFn: () => getPlatformClient().listTeam(),
    select: (d) => d.members,
  });
}

/** After a change: the team list and the activity feed refetch. */
function changed(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: teamKey });
  void qc.invalidateQueries({ queryKey: queryKeys.activity });
}

export type InviteTeamInput = { name: string; email: string; role: TeamRole };

/** Invites a team member: one Idempotency-Key per submit, reused on retries. */
export function useInviteTeam() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: InviteTeamInput, key) =>
      getPlatformClient().inviteTeam(body, { idempotencyKey: key }),
    { onSuccess: () => changed(qc) },
  );
}

export type ChangeRoleInput = { id: string; role: TeamRole; version: number };

/** Changes a role; `version` is the one the person saw. */
export function useChangeRole() {
  const qc = useQueryClient();
  return useKeyedMutation(
    ({ id, ...body }: ChangeRoleInput, key) =>
      getPlatformClient().changeRole(id, body, { idempotencyKey: key }),
    { onSuccess: () => changed(qc) },
  );
}

export type RemoveMemberInput = { id: string } & StepUp;

/**
 * Removes a member with the person's own two-step code in the variables, so
 * the cache forgets the call at once (gcTime 0); callers `reset()` after.
 */
export function useRemoveMember() {
  const qc = useQueryClient();
  return useKeyedMutation(
    ({ id, ...code }: RemoveMemberInput, key) =>
      getPlatformClient().removeMember(id, code as StepUp, {
        idempotencyKey: key,
      }),
    {
      onSuccess: (_r, v) => {
        // The row goes now; the refetch confirms it.
        qc.setQueryData<{ members: TeamMember[] }>(teamKey, (d) =>
          d ? { members: d.members.filter((m) => m.id !== v.id) } : d,
        );
        changed(qc);
      },
    },
    { gcTime: 0 },
  );
}
