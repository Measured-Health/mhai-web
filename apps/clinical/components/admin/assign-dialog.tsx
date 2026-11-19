"use client";
import { useId, useState } from "react";
import type { OversightItemOut } from "@/lib/api/admin-contract";
import { useAssignReviewer, useEligibleReviewers } from "@/lib/admin-queries";
import { adminError, assignError, type AdminError } from "@/lib/admin/errors";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";

/** Pick one eligible reviewer for a waiting correction. Mounted while open. */
export function AssignDialog({
  item,
  onClose,
  onGone,
}: {
  item: OversightItemOut;
  onClose(): void;
  /** The correction was decided meanwhile: it has left the list. */
  onGone?(id: string): void;
}) {
  const reviewers = useEligibleReviewers(item.id);
  const assign = useAssignReviewer();
  const toast = useToast();
  const { online } = useNetwork();
  const group = useId();
  const offlineId = useId();
  // "" is "nobody": clears the assignment.
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<AdminError | null>(null);

  function send() {
    if (pick === null || !online) return;
    setError(null);
    const staffId = pick === "" ? null : pick;
    assign.mutate(
      { id: item.id, staffId },
      {
        onSuccess: () => {
          const name = reviewers.data?.find((r) => r.id === pick)?.display_name;
          toast.show(
            staffId === null
              ? {
                  title: "Assignment cleared",
                  body: `Everyone who can review ${item.ref} sees it.`,
                  tone: "ok",
                }
              : {
                  title: "Reviewer assigned",
                  body: name
                    ? `${name} has been asked to review ${item.ref}.`
                    : undefined,
                  tone: "ok",
                },
          );
          onClose();
        },
        onError: (e) => {
          const err = assignError(e);
          if (err.gone) {
            toast.show({ title: err.title, body: err.body });
            onGone?.(item.id);
            onClose();
          } else setError(err);
        },
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="Assign a reviewer">
      <p className="text-sm text-ink-2">
        {item.ref} · {item.specialty ?? "No specialty"}. Only people who can
        review it are listed. They get an email saying so.
        {item.assigned_to &&
          ` Assigned to ${item.assigned_to.display_name} now.`}
      </p>
      <fieldset className="mt-3" aria-describedby={group}>
        <legend id={group} className="sr-only">
          Reviewers
        </legend>
        {reviewers.isPending ? (
          <p className="text-[13px] text-ink-3">Loading reviewers…</p>
        ) : reviewers.isError && !reviewers.data ? (
          <Banner tone="bad" title={adminError(reviewers.error).title}>
            {adminError(reviewers.error).body}
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void reviewers.refetch()}
              >
                Try again
              </Button>
            </span>
          </Banner>
        ) : reviewers.data?.length ? (
          [
            ...(item.assigned_to
              ? [
                  {
                    id: "",
                    display_name: "Nobody (clear the assignment)",
                    specialty: null,
                  },
                ]
              : []),
            ...reviewers.data,
          ].map((r) => (
            <label
              key={r.id}
              className="flex min-h-11 items-center gap-2.5 text-[14px] [overflow-wrap:anywhere]"
            >
              <input
                type="radio"
                name="reviewer"
                className="size-4 accent-mint"
                checked={pick === r.id}
                onChange={() => setPick(r.id)}
              />
              <span>
                {r.display_name}
                {r.specialty && (
                  <span className="text-ink-3"> · {r.specialty}</span>
                )}
              </span>
            </label>
          ))
        ) : (
          <p className="text-[13px] text-ink-2">
            Nobody can review this yet. Every active clinician except the person
            who suggested it can review; add one in Staff.
          </p>
        )}
      </fieldset>
      {!online && (
        <p id={offlineId} className="mt-3 text-[12px] text-ink-3">
          You&apos;re offline. Reconnect to assign a reviewer.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={pick === null || !online || assign.isPending}
          aria-describedby={online ? undefined : offlineId}
          onClick={send}
        >
          Assign
        </Button>
      </div>
    </Dialog>
  );
}
