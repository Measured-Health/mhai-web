"use client";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import type { StaffAction } from "@/lib/api/admin";
import type { StaffOut, StaffRemoveAuth } from "@/lib/api/admin-contract";
import { ApiError } from "@/lib/api/errors";
import {
  isMfaRequired,
  useRemoveStaff,
  useStaffAction,
} from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { INVITE_DAYS } from "@/lib/admin/invite";
import { guardFor } from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { useNetwork } from "@mhai/api-client/network";
import {
  BACKUP_FAILED_BODY,
  BackupCodeInput,
  BackupCodeToggle,
  useCodeOrBackup,
} from "../auth/backup-code-toggle";
import { CodeInput } from "../auth/code-input";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { ConfirmDialog } from "./confirm-dialog";

export type Confirmable =
  "password-reset" | "reset-mfa" | "deactivate" | "remove";

type Copy = { title: string; body: string; keep: string; confirm: string };

function copyFor(c: Confirmable, s: StaffOut, hospital: string): Copy {
  switch (c) {
    case "password-reset":
      return {
        title: "Send a password reset?",
        body: `${s.full_name} gets an email with a link to set a new password, valid for 30 minutes. They're signed out everywhere.`,
        keep: "Cancel",
        confirm: "Send reset link",
      };
    case "reset-mfa":
      return {
        title: "Reset two-step verification?",
        body: `Use this when ${s.full_name} has lost their phone. They're signed out now and set up two-step again at their next sign-in.`,
        keep: "Cancel",
        confirm: "Reset two-step",
      };
    case "deactivate":
      return {
        title: "Deactivate this account?",
        body: `${s.full_name} can't sign in from now on. Their feedback, corrections and the activity log are kept, and you can reactivate them later.`,
        keep: "Keep account",
        confirm: "Deactivate",
      };
    case "remove":
      return s.status === "invited"
        ? {
            title: "Cancel this invite?",
            body: `${s.email} won't be able to use the invite.`,
            keep: "Keep invite",
            confirm: "Cancel invite",
          }
        : {
            title: "Remove this account?",
            body: `${s.full_name} (${s.email}) is removed from ${hospital}. This can't be undone. Past consultations, feedback and the activity log are kept.`,
            keep: "Keep account",
            confirm: "Remove account",
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
  children: ReactNode;
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

/** "Send a reminder" in the two-step policy warning. */
export function RemindButton({ row }: { row: StaffOut }) {
  const act = useStaffAction();
  const toast = useToast();
  const { online } = useNetwork();
  const [error, setError] = useState<AdminError | null>(null);
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={!online || act.isPending}
        onClick={() => {
          setError(null);
          act.mutate(
            { id: row.id, action: "remind" },
            {
              onSuccess: () =>
                toast.show({
                  title: "Reminder sent",
                  body: `${row.display_name} will get an email about setting up two-step.`,
                  tone: "ok",
                }),
              onError: (e) => setError(adminError(e)),
            },
          );
        }}
      >
        Send a reminder
      </Button>
      {!online && (
        <span className="text-[12.5px]">
          You&apos;re offline. This needs a connection.
        </span>
      )}
      {error && <span className="text-[12.5px]">{error.title}</span>}
    </span>
  );
}

/**
 * Remove (or cancel an invite) with the admin's own two-step code
 * (amendment 1): a 6-digit code that submits on its last digit, or a backup
 * code. A wrong code keeps the dialog open and the person on the list. The
 * request and its answer belong to AccountActions, which stays mounted.
 */
function RemoveDialog({
  row,
  hospital,
  offline,
  busy,
  error,
  required,
  onKeep,
  onClearError,
  onConfirm,
}: {
  row: StaffOut;
  hospital: string;
  offline: boolean;
  busy: boolean;
  error: AdminError | null;
  /** The API said this admin has no two-step (403 mfa_required). */
  required: boolean;
  onKeep(): void;
  onClearError(): void;
  /** Sends the code; `onWrong` runs when the API refuses it (mfa_invalid). */
  onConfirm(auth: StaffRemoveAuth, onWrong: () => void): void;
}) {
  const { user } = useAuth();
  const id = useId();
  const c = useCodeOrBackup();
  const [focusKey, setFocusKey] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);
  const copy = copyFor("remove", row, hospital);
  // Every admin has two-step (amendment 3), so this is only ever stale state.
  const blocked = required || user?.mfaEnabled === false;

  function confirm() {
    if (!c.ready || blocked) return;
    const backup = c.backup;
    onConfirm(backup ? { backupCode: c.value } : { mfaCode: c.value }, () => {
      c.setCode("");
      if (backup) backupRef.current?.focus();
      else setFocusKey((k) => k + 1);
    });
  }

  return (
    <ConfirmDialog
      open
      title={copy.title}
      keepLabel={copy.keep}
      confirmLabel={copy.confirm}
      onKeep={onKeep}
      onConfirm={confirm}
      busy={busy}
      error={error}
      offline={offline}
      ready={c.ready && !blocked}
    >
      <p>{copy.body}</p>
      {blocked ? (
        <div className="mt-3">
          <Banner
            tone="warn"
            title="Turn on two-step verification in Profile & security to remove staff."
          >
            Then come back and try again.{" "}
            <Link href="/account" className="font-semibold underline">
              Profile &amp; security
            </Link>
          </Banner>
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-[13px]">
            {c.backup
              ? "Enter one of your backup codes to confirm."
              : "Enter the 6-digit code from your authenticator app to confirm."}
          </p>
          {c.backup ? (
            <BackupCodeInput
              id={`${id}-backup`}
              inputRef={backupRef}
              value={c.code}
              onChange={c.setCode}
              disabled={busy}
            />
          ) : (
            <CodeInput
              autoSubmit
              value={c.code}
              onChange={c.setCode}
              label="Your two-step code"
              disabled={busy}
              invalid={error !== null}
              focusKey={focusKey}
            />
          )}
          <p className="mt-1 text-[13px] text-ink-3">
            <BackupCodeToggle
              backup={c.backup}
              onChange={(b) => {
                c.setBackup(b);
                onClearError();
              }}
            />
          </p>
        </div>
      )}
    </ConfirmDialog>
  );
}

/** Password, two-step, invite, deactivate and remove (R5). Destructive ones confirm. */
export function AccountActions({
  row,
  list,
  onRemoved,
}: {
  row: StaffOut;
  list: StaffOut[];
  onRemoved(): void;
}) {
  const act = useStaffAction();
  const remove = useRemoveStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const { user, updateUser } = useAuth();
  const heading = useId();
  const deactivateNote = useId();
  const removeNote = useId();
  const [pending, setPending] = useState<Confirmable | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const [removeError, setRemoveError] = useState<AdminError | null>(null);
  const [removeRequired, setRemoveRequired] = useState(false);
  // One confirmation sends one request (one key), even if a click and the
  // last digit land before the next render.
  const removing = useRef(false);

  const hospital = user?.hospital ?? "the hospital";
  const name = row.display_name;
  const invited = row.status === "invited";
  const active = row.status === "active";
  const password = active && row.sign_in !== null && row.sign_in !== "sso";
  const sso = active && row.sign_in === "sso";
  const deactivate = guardFor("deactivate", row, list);
  const removal = guardFor("remove", row, list);
  const busy = act.isPending;

  const ok = (title: string, body: string) =>
    toast.show({ title, body, tone: "ok" });
  const fail = (e: unknown) => {
    const err = adminError(e);
    // Gone: the panel shows "no longer on the staff list" instead.
    if (err.gone) setPending(null);
    setError(err);
  };
  const run = (action: StaffAction, after: () => void) => {
    setError(null);
    act.mutate(
      { id: row.id, action },
      {
        onSuccess: () => {
          setPending(null);
          after();
        },
        onError: fail,
      },
    );
  };

  const after: Record<Exclude<Confirmable, "remove">, () => void> = {
    "password-reset": () =>
      ok("Reset link sent", `${name} was signed out everywhere.`),
    "reset-mfa": () =>
      ok("Two-step reset", `${name} will set it up again at next sign-in.`),
    deactivate: () =>
      ok(
        "Account deactivated",
        `${name} can't sign in. You can reactivate them here.`,
      ),
  };

  const keep = () => {
    setPending(null);
    setError(null);
    setRemoveError(null);
    setRemoveRequired(false);
    // Forget the call, and with it the code in its variables.
    remove.reset();
    removing.current = false;
  };

  const confirmRemove = (auth: StaffRemoveAuth, onWrong: () => void) => {
    if (removing.current) return;
    removing.current = true;
    setRemoveError(null);
    const backup = "backupCode" in auth;
    remove.mutate(
      { id: row.id, auth },
      {
        onSuccess: () => {
          if (invited)
            ok("Invite cancelled", `${row.email} can't use the invite now.`);
          else
            ok(
              "Account removed",
              `${row.full_name} is no longer on the staff list.`,
            );
          // A backup code works once; Profile & security shows what's left.
          if (backup && user?.backupCodesLeft != null)
            updateUser({
              backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
            });
          setPending(null);
          onRemoved();
        },
        onError: (e) => {
          const err = adminError(e);
          if (err.gone) {
            keep();
            return setError(err);
          }
          if (isMfaRequired(e)) return setRemoveRequired(true);
          const wrong = e instanceof ApiError && e.code === "mfa_invalid";
          setRemoveError(
            wrong && backup ? { ...err, body: BACKUP_FAILED_BODY } : err,
          );
          if (wrong) onWrong();
        },
        onSettled: () => {
          removing.current = false;
        },
      },
    );
  };
  const ask = (c: Confirmable) => {
    setError(null);
    setPending(c);
  };
  const copy =
    pending && pending !== "remove" ? copyFor(pending, row, hospital) : null;

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
          <Row
            title="Password reset"
            body="Sends a reset link; signs them out everywhere"
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!online || busy}
              onClick={() => ask("password-reset")}
            >
              Send password reset
            </Button>
          </Row>
          <Row
            title="Reset two-step verification"
            body="For a lost phone. They set it up again at next sign-in."
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!online || busy}
              onClick={() => ask("reset-mfa")}
            >
              Reset two-step
            </Button>
          </Row>
        </>
      )}
      {sso && (
        <p className="py-2 text-[12.5px] text-ink-3">
          Signs in with their hospital account. Their password and two-step are
          managed by the hospital.
        </p>
      )}
      {invited && (
        <Row
          title="Invite"
          body={`Sends a fresh invite, valid for ${INVITE_DAYS} days.`}
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={!online || busy}
            onClick={() =>
              run("resend-invite", () =>
                ok("New invite sent", `${row.email} has a new invite.`),
              )
            }
          >
            Send a new invite
          </Button>
        </Row>
      )}
      {active && (
        <Row
          title="Deactivate"
          body="Blocks sign-in at once. Their feedback and corrections are kept."
          note={deactivate.ok ? undefined : deactivate.reason}
          noteId={deactivateNote}
        >
          <Button
            size="sm"
            variant="danger"
            disabled={!online || busy || !deactivate.ok}
            aria-describedby={deactivate.ok ? undefined : deactivateNote}
            onClick={() => ask("deactivate")}
          >
            Deactivate
          </Button>
        </Row>
      )}
      {row.status === "deactivated" && (
        <Row title="Reactivate" body="They can sign in again.">
          <Button
            size="sm"
            variant="ghost"
            disabled={!online || busy}
            onClick={() =>
              run("reactivate", () =>
                ok("Account reactivated", `${name} can sign in again.`),
              )
            }
          >
            Reactivate
          </Button>
        </Row>
      )}
      <Row
        title={invited ? "Cancel invite" : "Remove"}
        body={
          invited
            ? "The invite stops working. Needs your two-step code."
            : "Deletes the account. Needs your two-step code. Past consultations, feedback and the activity log are kept."
        }
        note={removal.ok ? undefined : removal.reason}
        noteId={removeNote}
      >
        <Button
          size="sm"
          variant="danger"
          disabled={!online || busy || !removal.ok}
          aria-describedby={removal.ok ? undefined : removeNote}
          onClick={() => ask("remove")}
        >
          {invited ? "Cancel invite" : "Remove"}
        </Button>
      </Row>
      {pending === "remove" && (
        <RemoveDialog
          row={row}
          hospital={hospital}
          offline={!online}
          busy={remove.isPending}
          error={removeError}
          required={removeRequired}
          onKeep={keep}
          onClearError={() => setRemoveError(null)}
          onConfirm={confirmRemove}
        />
      )}
      {copy && pending && pending !== "remove" && (
        <ConfirmDialog
          open
          title={copy.title}
          keepLabel={copy.keep}
          confirmLabel={copy.confirm}
          onKeep={keep}
          onConfirm={() => run(pending, after[pending])}
          busy={busy}
          error={error}
          offline={!online}
        >
          {copy.body}
        </ConfirmDialog>
      )}
    </section>
  );
}
