"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import type { StaffOut, StepUpAuth } from "@/lib/api/admin-contract";
import {
  useRemindStaff,
  useRemoveStaff,
  useSendLink,
  useStaffAction,
} from "@/lib/admin-queries";
import {
  accountError,
  adminError,
  staffReminderError,
  type AdminError,
} from "@/lib/admin/errors";
import { INVITE_DAYS } from "@/lib/admin/invite";
import { guardFor, isInvited, nameOf } from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { ENDS_NAMED } from "@/lib/clearances/summary";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { ShareLinkDialog, type SharedLink } from "./share-link-dialog";
import { StepUpDialog } from "./step-up-fields";

/** Every account change here needs the admin's own two-step code. */
export type AccountChange =
  | "deactivate"
  | "reactivate"
  | "reset-mfa"
  | "password-reset"
  | "resend-invite"
  | "remove";

type Copy = {
  title: string;
  body: string;
  keep: string;
  confirm: string;
  danger: boolean;
  blocked: string;
  doneTitle: string;
  doneBody: string;
};

const blocked = (what: string) =>
  `Turn on two-step verification in Profile & security to ${what}.`;

/** With named access, deactivating, resetting two-step and removing also end it (Plan 11). */
function copyFor(
  a: AccountChange,
  s: StaffOut,
  hospital: string,
  named = false,
): Copy {
  const ends = named ? ` ${ENDS_NAMED}` : "";
  const name = nameOf(s);
  switch (a) {
    case "deactivate":
      return {
        title: "Deactivate this account?",
        body: `${name} can't sign in from now on and is signed out everywhere. Their feedback, corrections and the activity log are kept, and you can reactivate them later.${s.roles.includes("analyst") ? " Their Analyst role ends; reactivating doesn't give it back." : ""}${ends}`,
        keep: "Keep account",
        confirm: "Deactivate",
        danger: true,
        blocked: blocked("deactivate staff"),
        doneTitle: "Account deactivated",
        doneBody: `${s.display_name} can't sign in. You can reactivate them here.`,
      };
    case "reactivate":
      return {
        title: "Reactivate this account?",
        body: `${name} can sign in again with their roles as they are now.`,
        keep: "Cancel",
        confirm: "Reactivate",
        danger: false,
        blocked: blocked("reactivate staff"),
        doneTitle: "Account reactivated",
        doneBody: `${s.display_name} can sign in again.`,
      };
    case "password-reset":
      return {
        title: "Send a password reset?",
        body: `${name} gets an email with a link to choose a new password, valid for 30 minutes. They're signed out everywhere now. Their current password keeps working until they choose a new one.`,
        keep: "Cancel",
        confirm: "Send reset link",
        danger: false,
        blocked: blocked("reset passwords"),
        doneTitle: "Reset link sent",
        doneBody: `${s.display_name} was signed out everywhere. The link works for 30 minutes.`,
      };
    case "reset-mfa":
      return {
        title: "Reset two-step verification?",
        body: `Use this when ${name} has lost their phone. Their two-step and backup codes are removed and they're signed out everywhere. They set two-step up again at their next sign-in, and get an email saying so.${ends}`,
        keep: "Cancel",
        confirm: "Reset two-step",
        danger: true,
        blocked: blocked("reset two-step verification"),
        doneTitle: "Two-step reset",
        doneBody: `${s.display_name} will set it up again at next sign-in.`,
      };
    case "resend-invite":
      return {
        title: "Send a new invite?",
        body: `${s.email} gets a new invite, valid for ${INVITE_DAYS} days. The old invite link stops working.`,
        keep: "Cancel",
        confirm: "Send new invite",
        danger: false,
        blocked: blocked("invite staff"),
        doneTitle: "New invite sent",
        doneBody: `${s.email} has a new invite for ${INVITE_DAYS} days.`,
      };
    case "remove":
      return isInvited(s)
        ? {
            title: "Cancel this invite?",
            body: `${s.email} won't be able to use the invite.`,
            keep: "Keep invite",
            confirm: "Cancel invite",
            danger: true,
            blocked: blocked("remove staff"),
            doneTitle: "Invite cancelled",
            doneBody: `${s.email} can't use the invite now.`,
          }
        : {
            title: "Remove this account?",
            body: `${name} (${s.email}) is removed from ${hospital} for good. This can't be undone. Their past consultations, feedback and the activity log are kept under their name.${ends}`,
            keep: "Keep account",
            confirm: "Remove account",
            danger: true,
            blocked: blocked("remove staff"),
            doneTitle: "Account removed",
            doneBody: `${name} is no longer on the staff list.`,
          };
  }
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

/** "Send a reminder" to set up two-step (no code; once a day per person). */
export function RemindButton({ row }: { row: StaffOut }) {
  const remind = useRemindStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const [error, setError] = useState<AdminError | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={!online || remind.isPending}
        onClick={() => {
          setError(null);
          remind.mutate(
            { id: row.id },
            {
              onSuccess: () =>
                toast.show({
                  title: "Reminder sent",
                  body: `${row.display_name} will get an email about setting up two-step.`,
                  tone: "ok",
                }),
              onError: (e) => setError(staffReminderError(e)),
            },
          );
        }}
      >
        Send a reminder
      </Button>
      {error && (
        <span role="alert" className="max-w-64 text-right text-[12.5px]">
          <b className="block">{error.title}</b>
          {error.body}
        </span>
      )}
    </span>
  );
}

/**
 * Every account change, each with the admin's own two-step code (core
 * 1.33.0): password and two-step resets, a new invite, deactivate,
 * reactivate and remove. On the demo deployment a reset or invite hands its
 * link back; it is shown once and forgotten.
 */
export function AccountActions({
  row,
  list,
  named = false,
  onRemoved,
}: {
  row: StaffOut;
  list: StaffOut[];
  /** A letter gives this person named access now (Plan 11). */
  named?: boolean;
  /** The person is gone from the list: close the panel. */
  onRemoved?(): void;
}) {
  const act = useStaffAction();
  const link = useSendLink();
  const remove = useRemoveStaff();
  const toast = useToast();
  const { user } = useAuth();
  const { online } = useNetwork();
  const heading = useId();
  const notes = useId();
  const [pending, setPending] = useState<AccountChange | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  // The demo's link: component state only, dropped when its dialog closes.
  const [shared, setShared] = useState<{
    title: string;
    links: SharedLink[];
  } | null>(null);
  // Whether the last answer brought a link (read in `onDone`, same tick).
  const gotLink = useRef(false);

  const hospital = user?.hospital ?? "the hospital";
  const invited = isInvited(row);
  // An invited person is `active` in core but hasn't joined yet.
  const active = row.status === "active" && !invited;
  const password = active && row.sign_in !== null && row.sign_in !== "sso";
  const sso = active && row.sign_in === "sso";
  const noTwoStep = row.issues.includes("mfa_not_set_up");
  const guards = {
    deactivate: guardFor("deactivate", row, list),
    remove: guardFor("remove", row, list),
    "password-reset": guardFor("password-reset", row, list),
    "reset-mfa": guardFor("reset-mfa", row, list),
  };
  const copy = pending ? copyFor(pending, row, hospital, named) : null;

  const ask = (a: AccountChange) => {
    setError(null);
    setPending(a);
  };

  async function send(a: AccountChange, auth: StepUpAuth) {
    if (a === "remove") return remove.mutateAsync({ id: row.id, auth });
    if (a === "password-reset" || a === "resend-invite") {
      const r = await link.mutateAsync({ id: row.id, action: a, auth });
      gotLink.current = r.link !== null;
      if (r.link)
        setShared({
          title:
            a === "password-reset" ? "Reset link ready" : "New invite ready",
          links: [{ who: row.email, link: r.link }],
        });
      return;
    }
    return act.mutateAsync({ id: row.id, action: a, auth });
  }
  const resetFor = (a: AccountChange) =>
    a === "remove"
      ? remove.reset
      : a === "password-reset" || a === "resend-invite"
        ? link.reset
        : act.reset;

  /** One action row with its button; a guard's reason when it's refused here. */
  const action = (
    a: AccountChange,
    title: string,
    body: string,
    label: string,
    variant: "ghost" | "danger" = "ghost",
  ) => {
    const g = a in guards ? guards[a as keyof typeof guards] : { ok: true };
    const reason = g.ok ? undefined : (g as { reason: string }).reason;
    const noteId = `${notes}-${a}`;
    return (
      <Row title={title} body={body} note={reason} noteId={noteId}>
        <Button
          size="sm"
          variant={variant}
          disabled={!online || !!reason}
          aria-describedby={reason ? noteId : undefined}
          onClick={() => ask(a)}
        >
          {label}
        </Button>
      </Row>
    );
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
      {password &&
        action(
          "password-reset",
          "Password reset",
          "Sends a link to choose a new password and signs them out everywhere. Needs your two-step code.",
          "Send password reset",
        )}
      {password &&
        !noTwoStep &&
        action(
          "reset-mfa",
          "Reset two-step verification",
          "For a lost phone. They set it up again at next sign-in. Needs your two-step code.",
          "Reset two-step",
        )}
      {active && noTwoStep && (
        <Row
          title="Two-step reminder"
          body="Emails them to set up two-step verification. Once a day."
        >
          <RemindButton row={row} />
        </Row>
      )}
      {sso && (
        <p className="py-2 text-[12.5px] text-ink-3">
          Signs in with their hospital account. Their password and two-step are
          managed by the hospital.
        </p>
      )}
      {invited &&
        action(
          "resend-invite",
          "Invite",
          `Sends a fresh invite, valid for ${INVITE_DAYS} days. The old link stops working. Needs your two-step code.`,
          "Send a new invite",
        )}
      {active &&
        action(
          "deactivate",
          "Deactivate",
          "Blocks sign-in at once. Their feedback and corrections are kept. Needs your two-step code.",
          "Deactivate",
          "danger",
        )}
      {row.status === "deactivated" &&
        action(
          "reactivate",
          "Reactivate",
          "They can sign in again. Needs your two-step code.",
          "Reactivate",
        )}
      {action(
        "remove",
        invited ? "Cancel invite" : "Remove",
        invited
          ? "The invite stops working. Needs your two-step code."
          : "Removes the account for good. Needs your two-step code. Past consultations, feedback and the activity log are kept.",
        invited ? "Cancel invite" : "Remove",
        "danger",
      )}
      {copy && pending && (
        <StepUpDialog
          key={pending}
          title={copy.title}
          keepLabel={copy.keep}
          confirmLabel={copy.confirm}
          confirmVariant={copy.danger ? "danger" : "primary"}
          blockedTitle={copy.blocked}
          offline={!online}
          explain={
            pending === "deactivate" || pending === "reactivate"
              ? adminError
              : accountError
          }
          send={(auth) => send(pending, auth)}
          reset={resetFor(pending)}
          onKeep={() => setPending(null)}
          onDone={() => {
            const removed = pending === "remove";
            const linkShown = gotLink.current;
            gotLink.current = false;
            setPending(null);
            // With a link to share, its dialog says what happened instead.
            if (!linkShown)
              toast.show({
                title: copy.doneTitle,
                body: copy.doneBody,
                tone: "ok",
              });
            if (removed) onRemoved?.();
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
      {shared && (
        <ShareLinkDialog
          title={shared.title}
          links={shared.links}
          onClose={() => setShared(null)}
        />
      )}
    </section>
  );
}
