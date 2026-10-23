"use client";
import { useId, useState, type FormEvent } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { RetentionItem } from "@/lib/api/settings-contract";
import { retentionTypeLabel } from "@/lib/settings/labels";
import {
  daysLabel,
  isShorter,
  periodOptions,
  previewLine,
} from "@/lib/settings/rules";
import { useRetentionPreview, useSetRetention } from "@/lib/queries/settings";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { WAITING } from "../shared/two-person";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Modal } from "../team/modal";

/** Refusals that mean the setting isn't as the person saw it: close, reload. */
const REFUSED = ["conflict", "not_found"];

/**
 * Change how long one type is kept: choose a period (never below the
 * minimum), then Continue. Longer applies at once with a reason and the
 * person's code. Shorter first shows what the next clean-up would delete,
 * then makes a request a different platform admin must approve. Content
 * mounts only while open, so each opening starts from the period in force.
 */
export function RetentionChangeDialog({
  item,
  open,
  onClose,
  onRefused,
}: {
  item: RetentionItem;
  open: boolean;
  onClose(): void;
  /** A refusal that closed the dialog (e.g. Changed by someone else). */
  onRefused(e: ApiError): void;
}) {
  return open ? (
    <ChangeFlow item={item} onClose={onClose} onRefused={onRefused} />
  ) : null;
}

function ChangeFlow({
  item,
  onClose,
  onRefused,
}: {
  item: RetentionItem;
  onClose(): void;
  onRefused(e: ApiError): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  // The period and version the person saw when they began: they act on that.
  const [seen] = useState(() => ({
    days: item.days,
    version: item.version,
    minimum: item.minimum_days,
  }));
  const [days, setDays] = useState(seen.days);
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [missing, setMissing] = useState<string | null>(null);
  const save = useStepUpCall(useSetRetention());
  const shorter = isShorter(days, seen.days);
  const preview = useRetentionPreview(
    item.type,
    days,
    step === "confirm" && shorter,
  );
  const what = retentionTypeLabel(item.type);
  const period = daysLabel(days);
  const options = periodOptions(seen.minimum, seen.days);
  // A shorter period waits for its preview before the code is asked for.
  const asking = step === "confirm" && (!shorter || preview.isSuccess);

  const proceed = (e: FormEvent) => {
    e.preventDefault();
    if (net.offline) return;
    if (days === seen.days) return setMissing("Choose a different period.");
    setMissing(null);
    if (step === "confirm" && preview.isError) void preview.refetch();
    setStep("confirm");
  };
  const back = () => {
    save.clear();
    setStep("choose");
  };

  const confirm = (input: StepUpInput) =>
    save.run(
      {
        type: item.type,
        days,
        reason: input.reason ?? "",
        version: seen.version,
        ...codeOf(input),
      },
      {
        onSuccess: () => {
          onClose();
          toast.show(
            shorter
              ? { title: WAITING, tone: "ok", live: "polite" }
              : {
                  title: `${what}: kept for ${period}`,
                  tone: "ok",
                  live: "polite",
                },
          );
        },
        onError: (e) => {
          if (!(e instanceof ApiError && REFUSED.includes(e.code)))
            return false;
          onClose();
          onRefused(e);
          return true;
        },
      },
    );

  const checking = step === "confirm" && shorter && preview.isFetching;
  const previewFailed =
    step === "confirm" && shorter && preview.isError && !preview.isFetching;

  return (
    <>
      <Modal
        open={!asking}
        title={`How long to keep ${what}`}
        onClose={onClose}
      >
        <form noValidate onSubmit={proceed}>
          <p className="text-[13.5px] text-ink-2">
            Now {daysLabel(seen.days)} · the least allowed is{" "}
            {daysLabel(seen.minimum)}.
          </p>
          <label
            htmlFor={`${id}-days`}
            className="mb-1.5 mt-4 block text-[12.5px] text-ink-2"
          >
            Keep for
          </label>
          <select
            id={`${id}-days`}
            value={days}
            aria-invalid={missing ? true : undefined}
            aria-describedby={missing ? `${id}-err` : undefined}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setMissing(null);
              setStep("choose");
            }}
            className={inputClass}
          >
            {options.map((d) => (
              <option key={d} value={d}>
                {daysLabel(d)}
              </option>
            ))}
          </select>
          {missing && (
            <p id={`${id}-err`} className="mt-1.5 text-[13px] text-bad">
              {missing}
            </p>
          )}
          {shorter && (
            <p className="mt-3 text-[13px] text-ink-3">
              A shorter period needs a different platform admin to approve it.
            </p>
          )}
          {checking && (
            <p role="status" className="mt-3 text-[13px] text-ink-3">
              Checking what the next clean-up would delete…
            </p>
          )}
          {previewFailed && (
            <div className="mt-3">
              <Banner tone="bad" title="Couldn't check what would be deleted.">
                Try again.
              </Banner>
            </div>
          )}
          <OfflineNote id={`${id}-offline`} />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={checking} {...net.props}>
              Continue
            </Button>
          </div>
        </form>
      </Modal>
      <StepUpDialog
        open={asking && !shorter}
        title={`Keep ${what} for ${period}?`}
        intro={<p>This applies at once.</p>}
        freeReason
        dismissLabel="Back"
        confirmLabel={`Keep for ${period}`}
        tone="primary"
        busy={save.busy}
        error={save.error}
        onClose={back}
        onConfirm={confirm}
      />
      <StepUpDialog
        open={asking && shorter}
        title={`Shorten ${what} to ${period}?`}
        intro={
          <>
            <p>{previewLine(days, preview.data?.would_delete ?? 0)}</p>
            <p className="mt-1">
              A different platform admin must approve this before it applies.
            </p>
          </>
        }
        freeReason
        dismissLabel="Back"
        confirmLabel="Ask to shorten"
        tone="danger"
        busy={save.busy}
        error={save.error}
        onClose={back}
        onConfirm={confirm}
      />
    </>
  );
}
