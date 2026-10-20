"use client";
import { useId, useState } from "react";
import type {
  StaffOut,
  StaffPatchIn,
  StaffRole,
} from "@/lib/api/admin-contract";
import { useUpdateStaff } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { ROLE_LABEL, guardFor } from "@/lib/admin/staff";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";

const ROLES: readonly StaffRole[] = ["clinician", "hospital_admin"];

export interface AccessDraft {
  roles: StaffRole[];
  specialty: string | null;
  canReview: boolean;
  reviewIn: string[];
}

const fromRow = (s: StaffOut): AccessDraft => ({
  roles: [...s.roles],
  specialty: s.specialty,
  canReview: s.can_review,
  reviewIn: [...s.review_specialties],
});
const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
const toggle = <T extends string>(xs: T[], x: T): T[] =>
  xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];

/** Only what changed, with the row's version (R7); null when nothing did. */
export function patchFor(row: StaffOut, d: AccessDraft): StaffPatchIn | null {
  const p: StaffPatchIn = { version: row.version };
  if (!same(d.roles, row.roles))
    p.roles = ROLES.filter((r) => d.roles.includes(r));
  if (d.specialty !== row.specialty) p.specialty = d.specialty;
  const canReview = d.canReview && d.roles.includes("clinician");
  if (canReview !== row.can_review) p.can_review = canReview;
  const reviewIn = canReview ? d.reviewIn : [];
  if (!same(reviewIn, row.review_specialties)) p.review_specialties = reviewIn;
  return Object.keys(p).length > 1 ? p : null;
}

function problemOf(d: AccessDraft): string | null {
  if (!d.roles.length) return "Choose at least one role.";
  if (d.canReview && d.roles.includes("clinician") && !d.reviewIn.length)
    return "Choose at least one specialty they can review in.";
  return null;
}

/** Roles, specialty and review rights (hospital-admin.html tab 3). */
export function AccessEditor({
  row,
  list,
  specialties,
}: {
  row: StaffOut;
  list: StaffOut[];
  specialties: string[];
}) {
  const update = useUpdateStaff();
  const toast = useToast();
  const { online } = useNetwork();
  const heading = useId();
  const lockId = useId();
  const offlineId = useId();
  const selfId = useId();
  const [draft, setDraft] = useState(() => fromRow(row));
  const [seen, setSeen] = useState(row.version);
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
  // Your own roles: allowed, but recorded and flagged in the activity log.
  const selfRoles = row.is_you && !!patch?.roles;
  const options =
    row.specialty && !specialties.includes(row.specialty)
      ? [row.specialty, ...specialties]
      : specialties;

  function save() {
    if (!patch || problem || !online) return;
    setError(null);
    update.mutate(
      { id: row.id, p: patch },
      {
        onSuccess: () =>
          toast.show({
            title: "Changes saved",
            body: `${row.display_name}'s access is updated.`,
            tone: "ok",
          }),
        onError: (e) => setError(adminError(e)),
      },
    );
  }

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
          {ROLES.map((r) => {
            const locked =
              r === "hospital_admin" && !lock.ok && draft.roles.includes(r);
            return (
              <label
                key={r}
                className="flex min-h-11 items-center gap-2 text-[14px]"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-mint"
                  checked={draft.roles.includes(r)}
                  disabled={locked}
                  aria-describedby={locked ? lockId : undefined}
                  onChange={() =>
                    setDraft((d) => ({ ...d, roles: toggle(d.roles, r) }))
                  }
                />
                {ROLE_LABEL[r]}
              </label>
            );
          })}
        </div>
        {!lock.ok && (
          <p id={lockId} className="text-[12.5px] text-ink-3">
            {lock.reason}
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

      <fieldset disabled={!clinician}>
        <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
          Reviewing corrections
        </legend>
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            className="size-4 accent-mint"
            checked={draft.canReview && clinician}
            onChange={() =>
              setDraft((d) => ({ ...d, canReview: !d.canReview }))
            }
          />
          Can review corrections
        </label>
        {!clinician && (
          <p className="text-[12.5px] text-ink-3">
            Only clinicians can review corrections.
          </p>
        )}
        {clinician && draft.canReview && (
          <div
            role="group"
            aria-label="Specialties they can review in"
            className="ml-6 flex flex-wrap gap-x-4"
          >
            {specialties.map((s) => (
              <label
                key={s}
                className="flex min-h-11 items-center gap-2 text-[13.5px]"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-mint"
                  checked={draft.reviewIn.includes(s)}
                  onChange={() =>
                    setDraft((d) => ({ ...d, reviewIn: toggle(d.reviewIn, s) }))
                  }
                />
                {s}
              </label>
            ))}
          </div>
        )}
      </fieldset>

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
      {selfRoles && (
        <p id={selfId} className="text-[13px] text-ink-2">
          This change is recorded in the activity log and flagged for your
          hospital&apos;s admins. It takes effect next time you sign in.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!patch || !!problem || !online || update.isPending}
          aria-describedby={
            [!online && offlineId, selfRoles && selfId]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onClick={save}
        >
          {update.isPending ? "Saving…" : "Save changes"}
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
    </section>
  );
}
