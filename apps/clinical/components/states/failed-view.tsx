import { RotateCw } from "lucide-react";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";

/** Couldn't complete: the inputs are kept; Try again is the main action. */
export function FailedView({
  onRetry,
  onEdit,
  stalled,
  retrying,
  retryError,
}: {
  onRetry(): void;
  onEdit(): void;
  stalled?: boolean;
  retrying?: boolean;
  /** The last Try again could not be sent. */
  retryError?: boolean;
}) {
  return (
    <section className="card-v3 mx-auto mt-8 max-w-[520px] p-7 text-center">
      <div
        aria-hidden
        className="mx-auto mb-3.5 grid size-16 place-items-center rounded-[20px] bg-bad-wash text-bad"
      >
        <RotateCw className="size-7" />
      </div>
      <h2 className="font-display text-[34px] font-black leading-none">
        We couldn&apos;t complete this one
      </h2>
      <p className="mt-3 leading-relaxed text-ink-2">
        {stalled
          ? "The analysis is taking much longer than usual, so we stopped waiting."
          : "The analysis service didn't respond in time."}{" "}
        Your answers are still here. Nothing was lost.
      </p>
      {retryError && (
        <div className="mt-4 text-left">
          <Banner tone="bad" title="Couldn't send it again">
            Try again, or edit the question.
          </Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <Button onClick={onRetry} disabled={retrying}>
          <RotateCw aria-hidden className="size-4" />
          Try again
        </Button>
        <Button variant="soft" onClick={onEdit}>
          Edit question
        </Button>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">
        Still failing? Ask your hospital admin to check the system status.
      </p>
    </section>
  );
}
