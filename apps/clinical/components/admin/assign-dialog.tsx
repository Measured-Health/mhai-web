"use client";
import { useId, useState } from "react";
import type { OversightItemOut } from "@/lib/api/admin-contract";
import { useAssignReviewer, useEligibleReviewers } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

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
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState<AdminError | null>(null);

  function send() {
    if (!pick || !online) return;
    setError(null);
    assign.mutate(
      { id: item.id, staffId: pick },
      {
        onSuccess: () => {
          const name = reviewers.data?.find((r) => r.id === pick)?.display_name;
          toast.show({
            title: "Reviewer assigned",
            body: name
              ? `${name} has been asked to review ${item.ref}.`
              : undefined,
            tone: "ok",
          });
          onClose();
        },
        onError: (e) => {
          const err = adminError(e);
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
        review it are listed.
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
          reviewers.data.map((r) => (
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
            Nobody can review this yet. Give someone review rights for this
            specialty in Staff.
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
          disabled={!pick || !online || assign.isPending}
          aria-describedby={online ? undefined : offlineId}
          onClick={send}
        >
          Assign
        </Button>
      </div>
    </Dialog>
  );
}
