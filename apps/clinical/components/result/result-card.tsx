"use client";
import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { sourceStatus } from "@/lib/labels";
import type { ResultView } from "@/lib/result-view";
import { REDUCED_ACCURACY, REVIEW_EYEBROW } from "../feedback/export-model";
import { Banner } from "@mhai/ui/banner";
import { ConfidencePill } from "../ui/confidence-pill";
import { useToast } from "@mhai/ui/toast";
import { CitationTag } from "./citation-tag";
import type { ParsedBody } from "./parse-body";
import { ResultBanner } from "./result-banner";

export function ResultCard({
  view,
  parsed,
  actions,
  feedback,
}: {
  view: ResultView;
  parsed: ParsedBody;
  actions?: ReactNode;
  feedback?: ReactNode;
}) {
  const toast = useToast();
  const review = view.kind === "review";
  const icd10 = view.icd10;
  // Safety rule: a result that needs review never shows a confidence level.
  const confidence = review ? null : view.confidence;
  const hasBody = parsed.summary !== "" || parsed.steps.length > 0;
  const n = view.sources.length;
  return (
    <div className="reveal mx-auto max-w-[700px]">
      <ResultBanner view={view} />
      {view.reducedAccuracy && (
        <div className="mb-3.5">
          <Banner tone="info" title={REDUCED_ACCURACY.title}>
            {REDUCED_ACCURACY.body}
          </Banner>
        </div>
      )}
      <article className="card-v3 px-5 py-6 md:px-[26px]">
        {(review || icd10 || confidence) && (
          <div className="flex flex-wrap items-center gap-2.5">
            {review && (
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-bad">
                {REVIEW_EYEBROW}
              </span>
            )}
            {icd10 && (
              <button
                type="button"
                title={`ICD-10 diagnosis code: ${view.title}. Click to copy.`}
                aria-label={`ICD-10 ${icd10}, copy`}
                onClick={() => {
                  const fail = () =>
                    toast.show({ title: "Couldn't copy the code", ms: 1800 });
                  if (!navigator.clipboard) return fail();
                  navigator.clipboard
                    .writeText(icd10)
                    .then(
                      () =>
                        toast.show({ title: "ICD-10 code copied", ms: 1800 }),
                      fail,
                    );
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-lilac px-2.5 py-1 font-mono text-[11px] text-bloom md:min-h-0"
              >
                ICD-10 · {icd10}
                <Copy aria-hidden className="size-3 opacity-60" />
              </button>
            )}
            {confidence && (
              <span className="ml-auto">
                <ConfidencePill {...confidence} />
              </span>
            )}
          </div>
        )}
        <h2
          className={`mb-2 mt-2.5 font-display text-[38px] font-black leading-[.95] ${review ? "text-ink-2" : ""}`}
        >
          {view.title}
        </h2>
        {!hasBody && (
          <p className="text-[14.5px] leading-[1.75] text-ink-3">
            The written assessment isn&apos;t available for this result.
          </p>
        )}
        {parsed.summary && (
          <p className="text-[14.5px] leading-[1.75] text-ink-2">
            {parsed.summary}
          </p>
        )}
        {parsed.steps.length > 0 && (
          <section className="mt-[18px]">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[.08em] text-ink-3">
              Recommended next steps
            </h3>
            <ul className="list-disc space-y-1 pl-[18px] text-[14.5px] leading-[1.75] text-ink-2">
              {parsed.steps.map((s, i) => (
                <li key={i}>
                  {s.citation &&
                  sourceStatus(s.citation.action) === "removed" ? (
                    <s className="decoration-bad">{s.text}</s>
                  ) : (
                    s.text
                  )}
                  {s.citation && <CitationTag c={s.citation} />}
                </li>
              ))}
            </ul>
          </section>
        )}
        {actions && (
          <div className="mt-[22px] flex flex-wrap items-center gap-2 border-t border-line pt-[18px]">
            {actions}
          </div>
        )}
        {feedback}
        <p className="mt-3 flex gap-3.5 font-mono text-[11.5px] text-ink-3">
          <span>Completed in {view.seconds} s</span>
          {n > 0 && <span>{n === 1 ? "1 source" : `${n} sources`}</span>}
        </p>
      </article>
      <p className="mt-4 text-center text-[11.5px] text-ink-3">
        Decision support only. Final clinical judgement rests with the treating
        clinician.
        {review &&
          " No confidence level is shown for results that need review."}
      </p>
    </div>
  );
}
