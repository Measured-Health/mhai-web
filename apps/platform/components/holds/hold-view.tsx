"use client";
import Link from "next/link";
import { useState } from "react";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { holdIsKnown } from "@/lib/holds/labels";
import { useHold } from "@/lib/queries/holds";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { EditHoldDialog } from "./edit-hold-dialog";
import { HoldFacts } from "./hold-facts";
import { HoldHistory } from "./hold-history";
import { LiftPanel } from "./lift-panel";

/**
 * One legal hold: its facts (the note included), the lift controls and its
 * history. Platform admins edit the review date and note and lift it;
 * auditors see all of it and none of the controls.
 */
export function HoldView({ id }: { id: string }) {
  const { user } = useAuth();
  const q = useHold(id);
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => Date.now());
  const h = q.data;
  const gone = q.isError && platformError(q.error).gone;
  const canAct = isPlatformAdmin(user);
  const reload = () => void q.refetch();
  // A code this app has no words for fails the page, never printed raw.
  const strange = !!h && !holdIsKnown(h);
  const shown = h && !strange && !gone ? h : null;

  return (
    <>
      <TopBar
        title={shown?.reference ?? "Legal hold"}
        sub={shown?.hospital.name}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[880px] flex-col gap-4">
          {gone ? (
            <Banner tone="warn" title="This was removed or no longer exists.">
              <Link
                href="/legal-holds"
                className="mt-1 inline-flex min-h-11 items-center font-semibold underline sm:min-h-0"
              >
                Back to Legal holds
              </Link>
            </Banner>
          ) : strange || (q.isError && !h) ? (
            <CouldntLoad what="this legal hold" onRetry={reload} />
          ) : !shown ? (
            <Loading label="Loading legal hold" />
          ) : (
            <>
              {shown.stopped_removal && (
                <Banner
                  tone="warn"
                  title={`Placing this hold stopped ${shown.hospital.name}'s scheduled removal and sent it back to Removal pending.`}
                />
              )}
              <HoldFacts
                hold={shown}
                now={now}
                action={
                  canAct && shown.status !== "lifted" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </Button>
                  ) : undefined
                }
              />
              <LiftPanel hold={shown} />
              <HoldHistory events={shown.history} onRetry={reload} />
              {canAct && (
                <EditHoldDialog
                  open={editing && shown.status !== "lifted"}
                  hold={shown}
                  onClose={() => setEditing(false)}
                  onReload={reload}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
