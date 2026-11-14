"use client";
import { useId, useState, type ReactNode } from "react";
import type { StaffAction } from "@/lib/api/admin";
import type { StaffOut } from "@/lib/api/admin-contract";
import { useStaffAction } from "@/lib/admin-queries";
import { NOT_AVAILABLE, type AdminError } from "@/lib/admin/errors";
import { guardFor } from "@/lib/admin/staff";
import { ENDS_NAMED } from "@/lib/clearances/summary";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { StepUpDialog } from "./step-up-fields";

type Copy = {
  title: string;
  body: string;
  keep: string;
  confirm: string;
  blocked: string;
  doneTitle: string;
  doneBody: string;
};

/** With named access, deactivating also ends it (Plan 11). */
function copyFor(a: StaffAction, s: StaffOut, named = false): Copy {
  const ends = named ? ` ${ENDS_NAMED}` : "";
  if (a === "deactivate")
    return {
      title: "Deactivate this account?",
      body: `${s.full_name} can't sign in from now on and is signed out everywhere. Their feedback, corrections and the activity log are kept, and you can reactivate them later.${s.roles.includes("analyst") ? " Their Analyst role ends; reactivating doesn't give it back." : ""}${ends}`,
      keep: "Keep account",
      confirm: "Deactivate",
      blocked:
        "Turn on two-step verification in Profile & security to deactivate staff.",
      doneTitle: "Account deactivated",
      doneBody: `${s.display_name} can't sign in. You can reactivate them here.`,
    };
  return {
    title: "Reactivate this account?",
    body: `${s.full_name} can sign in again with their roles as they are now.`,
    keep: "Cancel",
    confirm: "Reactivate",
    blocked:
      "Turn on two-step verification in Profile & security to reactivate staff.",
    doneTitle: "Account reactivated",
    doneBody: `${s.display_name} can sign in again.`,
  };
}

function Row({
  title,
  body,
  children,
  note,
  noteId,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  note?: string;
  noteId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0 flex-1 basis-[200px]">
        <b className="block text-[13.5px]">{title}</b>
        <span className="text-[12.5px] text-ink-3">{body}</span>
        {note && (
          <p id={noteId} className="mt-1 text-[12.5px] text-ink-2">
            {note}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** A feature MHAI doesn't do yet (core 501): said calmly, with what to do instead. */
function NotYet({ title, body }: { title: string; body: string }) {
  return (
    <Row title={title} body={body}>
      <span className="rounded-full bg-bg px-3 py-1 text-[12.5px] font-semibold text-ink-2">
        {NOT_AVAILABLE}
      </span>
    </Row>
  );
}

/**
 * Deactivate and reactivate, each with the admin's own two-step code (core
 * 1.24.0). Password and two-step resets and removing a person aren't in MHAI
 * yet: they say so, and what to do instead.
 */
export function AccountActions({
  row,
  list,
  named = false,
}: {
  row: StaffOut;
  list: StaffOut[];
  /** A letter gives this person named access now (Plan 11). */
  named?: boolean;
}) {
  const act = useStaffAction();
  const toast = useToast();
  const { online } = useNetwork();
  const heading = useId();
  const deactivateNote = useId();
  const [pending, setPending] = useState<StaffAction | null>(null);
  const [error, setError] = useState<AdminError | null>(null);

  const active = row.status === "active";
  const password = active && row.sign_in !== null && row.sign_in !== "sso";
  const sso = active && row.sign_in === "sso";
  const deactivate = guardFor("deactivate", row, list);
  const copy = pending ? copyFor(pending, row, named) : null;

  const ask = (a: StaffAction) => {
    setError(null);
    setPending(a);
  };

  return (
    <section aria-labelledby={heading}>
      <h3 id={heading} className="mb-1 text-[13px] font-semibold">
        Account
      </h3>
      {!online && (
        <p className="mb-2 text-[12.5px] text-ink-3">
          You&apos;re offline. Account changes need a connection.
        </p>
      )}
      {error && !pending && (
        <div className="mb-2">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      {password && (
        <>
          <NotYet
            title="Password reset"
            body="MHAI can't send reset links yet. Measured Health support can reset a password for now."
          />
          <NotYet
            title="Reset two-step verification"
            body="For a lost phone. Measured Health support can do this for now."
          />
        </>
      )}
      {sso && (
        <p className="py-2 text-[12.5px] text-ink-3">
          Signs in with their hospital account. Their password and two-step are
          managed by the hospital.
        </p>
      )}
      {active && (
        <Row
          title="Deactivate"
          body="Blocks sign-in at once. Their feedback and corrections are kept. Needs your two-step code."
          note={deactivate.ok ? undefined : deactivate.reason}
          noteId={deactivateNote}
        >
          <Button
            size="sm"
            variant="danger"
            disabled={!online || !deactivate.ok}
            aria-describedby={deactivate.ok ? undefined : deactivateNote}
            onClick={() => ask("deactivate")}
          >
            Deactivate
          </Button>
        </Row>
      )}
      {row.status === "deactivated" && (
        <Row
          title="Reactivate"
          body="They can sign in again. Needs your two-step code."
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={!online}
            onClick={() => ask("reactivate")}
          >
            Reactivate
          </Button>
        </Row>
      )}
      <NotYet
        title="Remove"
        body="Removing an account isn't in MHAI yet. Deactivate it instead: they can't sign in, and their history is kept."
      />
      {copy && pending && (
        <StepUpDialog
          title={copy.title}
          keepLabel={copy.keep}
          confirmLabel={copy.confirm}
          confirmVariant={pending === "deactivate" ? "danger" : "primary"}
          blockedTitle={copy.blocked}
          offline={!online}
          send={(auth) =>
            act.mutateAsync({ id: row.id, action: pending, auth })
          }
          reset={act.reset}
          onKeep={() => setPending(null)}
          onDone={() => {
            setPending(null);
            toast.show({
              title: copy.doneTitle,
              body: copy.doneBody,
              tone: "ok",
            });
          }}
          onGone={(e) => {
            // The panel shows "no longer on the staff list" instead.
            setPending(null);
            setError(e);
          }}
        >
          <p>{copy.body}</p>
        </StepUpDialog>
      )}
    </section>
  );
}
