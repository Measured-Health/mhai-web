"use client";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { InviteOut, StaffRole } from "@/lib/api/admin-contract";
import {
  useHospitalSettings,
  useInviteStaff,
  useStaff,
} from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import {
  INVITE_DAYS,
  INVITE_MAX,
  INVITE_PROBLEM,
  SKIP_REASON,
  okEmails,
  parseInviteList,
  type InviteLineStatus,
} from "@/lib/admin/invite";
import { ROLE_LABEL } from "@/lib/admin/staff";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";

const ROLES: readonly StaffRole[] = ["clinician", "hospital_admin"];
const field =
  "w-full rounded-xl border border-lilac-2 bg-white text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/** Invite one person or a pasted list (hospital-admin.html tab 2, R8). */
export function InviteDialog({ onClose }: { onClose(): void }) {
  const staff = useStaff();
  const settings = useHospitalSettings();
  const invite = useInviteStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const emailsId = useId();
  const hintId = useId();
  const problemsId = useId();
  const needId = useId();
  const roleNeedId = useId();
  const offlineId = useId();
  const capId = useId();
  const [text, setText] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>(["clinician"]);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const [result, setResult] = useState<InviteOut | null>(null);

  const s = settings.data;
  const sso = s?.sso.status === "connected";
  const lines = parseInviteList(text, {
    existing: (staff.data ?? []).map((x) => x.email),
    domains: s?.allowed_email_domains ?? [],
  });
  const emails = okEmails(lines);
  const problems = lines.filter(
    (l): l is { email: string; status: Exclude<InviteLineStatus, "ok"> } =>
      l.status !== "ok",
  );
  const tooMany = emails.length > INVITE_MAX;
  const noRole = roles.length === 0;
  const canSend =
    !!s &&
    emails.length > 0 &&
    !tooMany &&
    !noRole &&
    online &&
    !invite.isPending;
  const sendLabel =
    emails.length === 1 ? "Send 1 invite" : `Send ${emails.length} invites`;

  function send() {
    if (!canSend) return;
    setError(null);
    invite.mutate(
      { emails, roles: ROLES.filter((r) => roles.includes(r)), specialty },
      {
        onSuccess: (r) => {
          const n = r.invited.length;
          if (n)
            toast.show({
              title: n === 1 ? "Invite sent" : `${n} invites sent`,
              body: sso
                ? "They can sign in with their hospital account now."
                : `The invites expire in ${INVITE_DAYS} days.`,
              tone: "ok",
            });
          if (r.skipped.length) setResult(r);
          else onClose();
        },
        onError: (e) => setError(adminError(e)),
      },
    );
  }

  if (result) {
    const n = result.invited.length;
    return (
      <Dialog
        key="result"
        open
        onClose={onClose}
        title={n ? "Invites sent" : "No invites sent"}
      >
        <p className="text-sm text-ink-2">
          {n === 0
            ? "No invites were sent."
            : n === 1
              ? "1 invite was sent."
              : `${n} invites were sent.`}{" "}
          These weren&apos;t sent:
        </p>
        <ul
          tabIndex={0}
          aria-label="Not sent"
          className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto text-[13px]"
        >
          {result.skipped.map((x, i) => (
            <li
              key={`${i}-${x.email}-${x.reason}`}
              className="[overflow-wrap:anywhere]"
            >
              {x.email} — {SKIP_REASON[x.reason] ?? "Not sent"}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      key="invite"
      open
      onClose={invite.isPending ? () => {} : onClose}
      title="Invite staff"
    >
      <p className="text-sm text-ink-2">
        {s === undefined
          ? "Loading your hospital's settings…"
          : sso
            ? "These people sign in with their hospital account, so no password is needed."
            : `They'll get an email invite that expires in ${INVITE_DAYS} days, then go through first sign-in.`}
      </p>

      <label
        htmlFor={emailsId}
        className="mt-4 block text-[12.5px] font-semibold text-ink-2"
      >
        Work emails
      </label>
      <textarea
        id={emailsId}
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-describedby={problems.length ? `${hintId} ${problemsId}` : hintId}
        className={`${field} mt-1 p-3 [overflow-wrap:anywhere]`}
      />
      <p
        id={hintId}
        className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-ink-3"
      >
        <span>Separate with commas, or paste a column from a spreadsheet</span>
        <span aria-live="polite">
          {emails.length === 1 ? "1 person" : `${emails.length} people`}
        </span>
      </p>
      {problems.length > 0 && (
        <ul
          id={problemsId}
          tabIndex={0}
          aria-label="Not invited"
          className="mt-2 flex max-h-32 flex-col gap-1 overflow-auto text-[12.5px] text-warn-deep"
        >
          {problems.map((l, i) => (
            <li
              key={`${i}-${l.email}`}
              className="flex gap-1.5 [overflow-wrap:anywhere]"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {l.email} — {INVITE_PROBLEM[l.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tooMany && (
        <p
          id={capId}
          role="alert"
          className="mt-2 text-[13px] font-semibold text-bad-deep"
        >
          Invite at most {INVITE_MAX} people at a time.
        </p>
      )}

      <fieldset className="mt-4">
        <legend className="text-[12.5px] font-semibold text-ink-2">Role</legend>
        <div className="flex flex-wrap gap-x-5">
          {ROLES.map((r) => (
            <label
              key={r}
              className="flex min-h-11 items-center gap-2 text-[14px]"
            >
              <input
                type="checkbox"
                className="size-4 accent-mint"
                checked={roles.includes(r)}
                onChange={() =>
                  setRoles((x) =>
                    x.includes(r) ? x.filter((y) => y !== r) : [...x, r],
                  )
                }
              />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      {noRole && (
        <p
          id={roleNeedId}
          role="alert"
          className="text-[13px] font-semibold text-bad-deep"
        >
          Choose at least one role.
        </p>
      )}

      <label className="mt-3 flex flex-col gap-1 text-[12.5px] font-semibold text-ink-2">
        Specialty
        <select
          value={specialty ?? ""}
          onChange={(e) => setSpecialty(e.target.value || null)}
          className={`${field} min-h-11 px-3 font-normal text-ink`}
        >
          <option value="">No specialty</option>
          {(s?.specialties ?? []).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>

      {!online && (
        <p id={offlineId} className="mt-3 text-[13px] text-ink-3">
          You&apos;re offline. Invites need a connection.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      {emails.length === 0 && (
        <p id={needId} className="mt-3 text-[13px] text-ink-3">
          Add at least one hospital email address.
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={invite.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!canSend}
          onClick={send}
          aria-describedby={
            [
              emails.length === 0 && needId,
              noRole && roleNeedId,
              tooMany && capId,
              !online && offlineId,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          {invite.isPending ? "Sending…" : sendLabel}
        </Button>
      </div>
    </Dialog>
  );
}
