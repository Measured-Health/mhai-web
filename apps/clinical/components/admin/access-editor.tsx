"use client";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type {
  StaffOut,
  StaffPatchIn,
  StaffRole,
} from "@/lib/api/admin-contract";
import { useUpdateStaff } from "@/lib/admin-queries";
import { NOT_AVAILABLE, type AdminError } from "@/lib/admin/errors";
import {
  ANALYST_GIVES,
  analystBlocked,
  analystChangeNote,
  analystError,
} from "@/lib/admin/analyst";
import { ROLE_LABEL, SELF_ADD, guardFor, rolesText } from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { analysisOn } from "@/lib/auth/types";
import { ENDS_NAMED } from "@/lib/clearances/summary";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { StepUpDialog } from "./step-up-fields";

const ROLES: readonly StaffRole[] = ["clinician", "analyst", "hospital_admin"];
const ROLE_HINT: Partial<Record<StaffRole, string>> = {
  analyst: ANALYST_GIVES,
};

export interface AccessDraft {
  roles: StaffRole[];
  specialty: string | null;
}

const fromRow = (s: StaffOut): AccessDraft => ({
  roles: [...s.roles],
  specialty: s.specialty,
});
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const toggle = <T extends string>(xs: T[], x: T): T[] =>
  xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];

/** Analyst needs Clinician: without it the role is dropped, not sent. */
const effectiveRoles = (d: AccessDraft): StaffRole[] =>
  ROLES.filter(
    (r) =>
      d.roles.includes(r) && (r !== "analyst" || d.roles.includes("clinician")),
  );

/**
 * Only what changed, with the row's version (R7); null when nothing did.
 * Reviewing is never sent: core derives it from the Clinician role.
 */
export function patchFor(row: StaffOut, d: AccessDraft): StaffPatchIn | null {
  const p: StaffPatchIn = { version: row.version };
  const roles = effectiveRoles(d);
  if (!same(roles, row.roles)) p.roles = roles;
  if (d.specialty !== row.specialty) p.specialty = d.specialty;
  return Object.keys(p).length > 1 ? p : null;
}

function problemOf(d: AccessDraft): string | null {
  if (!effectiveRoles(d).length) return "Choose at least one role.";
  return null;
}

/** Roles and specialty (hospital-admin.html tab 3), saved with the admin's code. */
export function AccessEditor({
  row,
  list,
  specialties,
  named = false,
}: {
  row: StaffOut;
  list: StaffOut[];
  specialties: string[];
  /** A letter gives this person named access now (Plan 11). */
  named?: boolean;
}) {
  const update = useUpdateStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const { user } = useAuth();
  const heading = useId();
  const lockId = useId();
  const offlineId = useId();
  const selfId = useId();
  const endsId = useId();
  const [draft, setDraft] = useState(() => fromRow(row));
  const [seen, setSeen] = useState(row.version);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);
  // The row changed underneath (this save, or someone else's): start again
  // from it, so nobody saves over a change they haven't seen (R7).
  if (row.version !== seen) {
    setSeen(row.version);
    setDraft(fromRow(row));
  }

  const lock = row.roles.includes("hospital_admin")
    ? guardFor("drop_admin", row, list)
    : ({ ok: true } as const);
  const patch = patchFor(row, draft);
  const problem = problemOf(draft);
  const clinician = draft.roles.includes("clinician");
  // A letter covers only analysts and hospital admins: losing both ends
  // their named access. Said above Save, with no new confirm (ruling 8).
  const endsNamed =
    named &&
    !!patch?.roles &&
    !patch.roles.some((r) => r === "analyst" || r === "hospital_admin");
  const options =
    row.specialty && !specialties.includes(row.specialty)
      ? [row.specialty, ...specialties]
      : specialties;
  const shownRoles = ROLES;
  // You can't give yourself a role (core: 403 self_change, ruling 14 Nov).
  const selfLocked = (r: StaffRole) => row.is_you && !row.roles.includes(r);
  const anySelfLocked = shownRoles.some(selfLocked);
  // Analyst: off for the hospital, deactivated or without two-step can't be
  // given it (core's 409 analysis_off, 422 not_eligible); said beside the box.
  const analystBlock = analystBlocked(row, analysisOn(user));
  const analystNote = patch?.roles ? analystChangeNote(row, patch.roles) : null;

  return (
    <section aria-labelledby={heading} className="flex flex-col gap-4">
      <h3 id={heading} className="text-[13px] font-semibold">
        Access
      </h3>
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
          Roles
        </legend>
        <div className="flex flex-wrap gap-x-5">
          {shownRoles.map((r) => {
            const lockedAdmin =
              r === "hospital_admin" && !lock.ok && draft.roles.includes(r);
            const needsClinician = r === "analyst" && !clinician;
            const self = selfLocked(r);
            const blocked = r === "analyst" && !!analystBlock && !self;
            const hintId = `${lockId}-${r}`;
            const describedBy =
              [lockedAdmin && lockId, self && selfId, ROLE_HINT[r] && hintId]
                .filter(Boolean)
                .join(" ") || undefined;
            return (
              <div key={r} className="flex flex-col">
                <label className="flex min-h-11 items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    className="size-4 accent-mint"
                    checked={draft.roles.includes(r) && !needsClinician}
                    disabled={lockedAdmin || needsClinician || self || blocked}
                    aria-describedby={describedBy}
                    onChange={() =>
                      setDraft((d) => ({ ...d, roles: toggle(d.roles, r) }))
                    }
                  />
                  {ROLE_LABEL[r]}
                </label>
                {ROLE_HINT[r] && (
                  <p id={hintId} className="max-w-56 text-[12px] text-ink-3">
                    {ROLE_HINT[r]}
                    {blocked ? (
                      <b className="mt-0.5 block font-semibold text-ink-2">
                        {analystBlock}
                      </b>
                    ) : (
                      needsClinician && " Tick Clinician first."
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {!lock.ok && (
          <p id={lockId} className="text-[12.5px] text-ink-3">
            {lock.reason}
          </p>
        )}
        {anySelfLocked && (
          <p id={selfId} className="text-[12.5px] text-ink-3">
            {SELF_ADD}
          </p>
        )}
      </fieldset>

      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-2">
        Specialty
        <select
          value={draft.specialty ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, specialty: e.target.value || null }))
          }
          className="min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[14px] font-normal text-ink focus-visible:outline-2 focus-visible:outline-mint-deep"
        >
          <option value="">No specialty</option>
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div>
        <b className="mb-1 block text-[12.5px] font-semibold text-ink-2">
          Reviewing corrections
        </b>
        <p className="text-[13.5px]">
          {row.can_review
            ? "Reviews corrections in every specialty."
            : row.status === "active"
              ? "Doesn't review corrections. Only clinicians review them."
              : "Doesn't review corrections while deactivated."}
        </p>
        <p className="text-[12.5px] text-ink-3">
          Every active clinician reviews corrections, except their own. Choosing
          who reviews which specialty: {NOT_AVAILABLE.toLowerCase()}.
        </p>
      </div>

      {problem && patch && (
        <p role="alert" className="text-[13px] font-semibold text-bad-deep">
          {problem}
        </p>
      )}
      {error && (
        <Banner tone="bad" title={error.title}>
          {error.body}
        </Banner>
      )}
      {endsNamed && (
        <p
          id={endsId}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-warn-deep"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {ENDS_NAMED}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!patch || !!problem || !online}
          aria-describedby={
            [!online && offlineId, endsNamed && endsId]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Save changes
        </Button>
        {patch && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(fromRow(row));
              setError(null);
            }}
          >
            Undo changes
          </Button>
        )}
        {!online && (
          <span id={offlineId} className="text-[12.5px] text-ink-3">
            You&apos;re offline. Changes need a connection.
          </span>
        )}
      </div>
      {confirming && patch && (
        <StepUpDialog
          title={`Save ${row.display_name}'s access?`}
          keepLabel="Cancel"
          confirmLabel="Save changes"
          confirmVariant="primary"
          blockedTitle="Turn on two-step verification in Profile & security to change staff access."
          offline={!online}
          send={(auth) => update.mutateAsync({ id: row.id, p: patch, auth })}
          explain={(e) => analystError(e, row)}
          reset={update.reset}
          onKeep={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false);
            toast.show({
              title: "Changes saved",
              body: `${row.display_name}'s access is updated.`,
              tone: "ok",
            });
          }}
          onGone={() => setConfirming(false)}
          onStale={(e) => {
            setConfirming(false);
            setError(e);
          }}
        >
          <p>
            {patch.roles
              ? `Roles: ${rolesText(patch.roles)}.`
              : `Roles stay ${rolesText(row.roles)}.`}
            {patch.specialty !== undefined &&
              ` Specialty: ${patch.specialty ?? "none"}.`}
          </p>
          {analystNote && <p className="mt-2">{analystNote}</p>}
          {row.is_you && (
            <p className="mt-2">It takes effect next time you sign in.</p>
          )}
        </StepUpDialog>
      )}
    </section>
  );
}
