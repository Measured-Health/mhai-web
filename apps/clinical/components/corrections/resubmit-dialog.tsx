"use client";
import type { CorrectionOut } from "@/lib/api/contract";
import { useFeedback } from "@/lib/queries";
import { CorrectionForm } from "../feedback/correction-form";
import { Banner } from "@mhai/ui/banner";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";

/** A rejected correction, changed and sent again as a new correction. */
export function ResubmitDialog({
  correction,
  onClose,
}: {
  correction: CorrectionOut | null;
  onClose(): void;
}) {
  const fb = useFeedback();
  const toast = useToast();
  const close = () => {
    fb.reset();
    onClose();
  };
  return (
    <Dialog open={correction !== null} onClose={close} title="Suggest it again">
      {correction && (
        <>
          <p className="text-sm text-ink-2">
            Change it with the reviewer&apos;s reason in mind. A second
            clinician reviews it again.
          </p>
          {fb.isError && (
            <div className="mt-3">
              <Banner tone="bad" title="Couldn't send your correction">
                Check your connection and try again.
              </Banner>
            </div>
          )}
          <CorrectionForm
            key={correction.id}
            initial={{
              corrected_diagnosis: correction.corrected_diagnosis,
              reason: correction.reason,
            }}
            busy={fb.isPending}
            onCancel={close}
            onSubmit={(v) =>
              fb.mutate(
                { query_id: correction.query_id, action: "correct", ...v },
                {
                  onSuccess: (r) => {
                    close();
                    toast.show(
                      r.status === "queued"
                        ? {
                            title: "Saved on this device",
                            body: "It will be sent when you're back online.",
                            tone: "info",
                          }
                        : {
                            title: "Sent for review again",
                            body: "A second clinician will review it.",
                            tone: "ok",
                          },
                    );
                  },
                },
              )
            }
          />
        </>
      )}
    </Dialog>
  );
}
