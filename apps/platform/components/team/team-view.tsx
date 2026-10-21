"use client";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import type { TeamMember } from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { useRemoveMember, useTeam } from "@/lib/queries/team";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useToast } from "@mhai/ui/toast";
import { StepUpDialog, type StepUpInput } from "../hospitals/step-up-dialog";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { InviteDialog } from "./invite-dialog";
import { RoleDialog } from "./role-dialog";
import { TeamCards } from "./team-cards";
import { TeamTable } from "./team-table";

export function TeamView() {
  const { user, updateUser } = useAuth();
  const canAct = isPlatformAdmin(user);
  const desktop = useIsDesktop();
  const toast = useToast();
  const net = useNeedsConnection("team-offline");
  const team = useTeam();
  const remove = useRemoveMember();
  const rows = team.data ?? [];
  const [inviting, setInviting] = useState(false);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  // Read the latest row, so a reload brings the new version into the dialog.
  const roleFor = rows.find((m) => m.id === roleId) ?? null;
  const List = desktop ? TeamTable : TeamCards;
  const waiting = team.isPending && team.fetchStatus === "paused";

  const closeRemove = () => {
    setRemoving(null);
    // Forget the call, and with it the code in its variables.
    remove.reset();
  };
  const confirmRemove = (input: StepUpInput) => {
    if (!removing) return;
    const code =
      "backup_code" in input
        ? { backup_code: input.backup_code }
        : { mfa_code: input.mfa_code };
    const backup = "backup_code" in code;
    remove.mutate(
      { id: removing.id, ...code },
      {
        onSuccess: () => {
          toast.show({
            title: "Team member removed",
            body: `${removing.name} no longer has platform access.`,
            tone: "ok",
            live: "polite",
          });
          // A backup code works once; Account shows what's left.
          if (backup && user?.backupCodesLeft != null)
            updateUser({
              backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
            });
          closeRemove();
        },
        onError: (e) => {
          // Already gone: show the latest team.
          if (platformError(e).gone) {
            closeRemove();
            void team.refetch();
          }
        },
      },
    );
  };

  return (
    <>
      <TopBar
        title="Team"
        sub="Measured Health staff with platform access"
        actions={
          canAct ? (
            <Button {...net.props} onClick={() => setInviting(true)}>
              <UserPlus aria-hidden className="size-4" />
              Invite team member
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto max-w-[1100px]">
          {canAct && <OfflineNote id="team-offline" />}
          {team.isError && !team.data ? (
            <CouldntLoad what="the team" onRetry={() => void team.refetch()} />
          ) : waiting ? (
            <div
              role="status"
              className="card-v3 p-6 text-center text-[14px] text-ink-2"
            >
              You&apos;re offline. The team will load when you reconnect.
            </div>
          ) : team.isPending ? (
            <Loading label="Loading the team" />
          ) : rows.length === 0 ? (
            <Empty title="No team members yet" />
          ) : (
            <List
              rows={rows}
              canAct={canAct}
              netProps={net.props}
              onRole={(m) => setRoleId(m.id)}
              onRemove={setRemoving}
            />
          )}
          {team.isError && team.data && (
            <p role="alert" className="mt-3 text-[13px] text-bad">
              {platformError(team.error).title}
            </p>
          )}
          {team.data && (
            <p role="status" className="sr-only">
              {rows.length === 1
                ? "1 team member shown"
                : `${rows.length} team members shown`}
            </p>
          )}
        </div>
      </div>
      {canAct && (
        <>
          <InviteDialog open={inviting} onClose={() => setInviting(false)} />
          <RoleDialog
            member={roleFor}
            onClose={() => setRoleId(null)}
            onStale={() => void team.refetch()}
          />
          <StepUpDialog
            open={!!removing}
            title={removing ? `Remove ${removing.name}?` : "Remove"}
            intro={
              removing && <p>{removing.name} loses platform access at once.</p>
            }
            confirmLabel="Remove"
            tone="danger"
            busy={remove.isPending}
            error={remove.error}
            onClose={closeRemove}
            onConfirm={confirmRemove}
          />
        </>
      )}
    </>
  );
}
