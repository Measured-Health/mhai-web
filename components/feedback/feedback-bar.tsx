"use client";
import { useState } from "react";
import { Check, PenLine } from "lucide-react";
import { useFeedback } from "@/lib/queries";
import type { ResultView } from "@/lib/result-view";
import { useSession } from "@/lib/session-store";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { CorrectionForm } from "./correction-form";

export function FeedbackBar({
  queryId,
  view,
  onDone,
  trailing,
}: {
  queryId: string;
  view: ResultView;
  onDone?(k: "agree" | "correct"): void;
  trailing?: React.ReactNode;
}) {
  const fb = useFeedback();
  const session = useSession();
  const [mode, setMode] = useState<
    "idle" | "correcting" | "agreed" | "corrected"
  >("idle");
  const done = mode === "agreed" || mode === "corrected";
  const agreeLabel = view.kind === "review" ? "Mark as reviewed" : "I agree";
  return (
    <>
      {done && (
        <div className="order-first mb-3 w-full">
          <Banner
            tone="ok"
            title={
              mode === "agreed"
                ? "Thanks, your agreement was recorded"
                : "Thanks, your correction was sent for review"
            }
          >
            {mode === "agreed"
              ? "It helps us measure how often the system gets it right."
              : "A second clinician will review it before anything changes."}
          </Banner>
        </div>
      )}
      {fb.isError && !done && (
        <div className="order-first mb-3 w-full">
          <Banner tone="bad" title="Couldn't send your feedback">
            Check your connection and try again.
          </Banner>
        </div>
      )}
      <Button
        variant="agree"
        disabled={done || fb.isPending}
        onClick={() =>
          fb.mutate(
            { query_id: queryId, action: "validate" },
            {
              onSuccess: () => {
                session.update(queryId, { agreedAt: Date.now() });
                setMode("agreed");
                onDone?.("agree");
              },
            },
          )
        }
      >
        <Check aria-hidden className="size-4" />
        {mode === "agreed" ? "Agreed" : agreeLabel}
      </Button>
      <Button
        variant="soft"
        disabled={done}
        aria-expanded={mode === "correcting"}
        onClick={() => setMode("correcting")}
        className={
          view.kind === "caution" && mode === "idle"
            ? "ring-2 ring-warn"
            : undefined
        }
      >
        <PenLine aria-hidden className="size-4" />
        Suggest correction
      </Button>
      {trailing}
      {mode === "correcting" && (
        <div className="w-full">
          <CorrectionForm
            busy={fb.isPending}
            onCancel={() => setMode("idle")}
            onSubmit={(v) =>
              fb.mutate(
                { query_id: queryId, action: "correct", ...v },
                {
                  onSuccess: () => {
                    setMode("corrected");
                    onDone?.("correct");
                  },
                },
              )
            }
          />
        </div>
      )}
    </>
  );
}
