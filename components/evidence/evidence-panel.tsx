"use client";
import { AlertTriangle, Check, ShieldCheck, X } from "lucide-react";
import type { SourceStatus } from "@/lib/labels";
import type { ResultView } from "@/lib/result-view";
import { useHighlight } from "@/lib/highlight";
import { cn } from "../ui/cn";

/**
 * "Why this confidence" only appears when a confidence level is shown and
 * the API returned at least one measure. Never for results that need review
 * (R11), never when the score is missing, never with invented bars.
 */
export const hasConfidenceBreakdown = (view: ResultView) =>
  view.kind !== "review" &&
  view.confidence !== null &&
  view.measures.length > 0;

function Ci({ tone }: { tone: "ok" | "warn" | "bad" }) {
  const I = tone === "ok" ? Check : tone === "warn" ? AlertTriangle : X;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-[7px]",
        tone === "ok"
          ? "bg-ok-wash text-ok"
          : tone === "warn"
            ? "bg-warn-wash text-warn"
            : "bg-bad-wash text-bad",
      )}
    >
      <I className="size-3" />
    </span>
  );
}

const H3 =
  "mb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3";

export function SafetyChecks({ view }: { view: ResultView }) {
  const { verified, total } = view.claims;
  // Nothing checked is not an all-clear.
  const tone =
    total === 0
      ? "warn"
      : verified === total
        ? "ok"
        : verified / total >= 0.5
          ? "warn"
          : "bad";
  const open = total - verified;
  return (
    <section aria-label="Safety checks">
      <h3 className={H3}>Safety checks</h3>
      <p className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <Ci tone="ok" />
        Patient data protected
      </p>
      <p className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <Ci tone={view.kind === "review" ? "warn" : "ok"} />
        Consistent reasoning
      </p>
      <p className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <Ci tone={tone} />
        <span>
          Evidence-backed claims
          <small className="block text-[11.5px] text-ink-3">
            {total === 0
              ? "No claims could be checked against guidelines"
              : `${verified} of ${total} claims verified`}
          </small>
        </span>
      </p>
      {open > 0 && view.kind === "caution" && (
        <p className="mt-1.5 rounded-xl border border-warn-line bg-warn-wash px-3 py-2.5 text-[12.5px] font-semibold text-warn-deep">
          {open} recommendation{open === 1 ? "" : "s"} needs review
        </p>
      )}
    </section>
  );
}

export function ConfidenceBars({ view }: { view: ResultView }) {
  if (!hasConfidenceBreakdown(view)) return null;
  return (
    <section aria-label="Why this confidence">
      <h3 className={H3}>Why this confidence</h3>
      {view.measures.map((m) => {
        const pct = Math.round(m.value * 100);
        return (
          <div key={m.label} className="my-2.5">
            <div className="mb-1 flex justify-between text-[12.5px] text-ink-2">
              <span>{m.label}</span>
              <span className="font-mono tabular">{pct}%</span>
            </div>
            <div
              role="meter"
              aria-label={m.label}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-[7px] overflow-hidden rounded-full bg-lilac"
            >
              <i
                className={cn(
                  "block h-full rounded-full motion-safe:animate-[grow_var(--t-story)_var(--e-out)_both]",
                  pct >= 75
                    ? "bg-gradient-to-r from-mint to-mint-2"
                    : "bg-gradient-to-r from-warn to-[#d4983c]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

const BADGE: Record<SourceStatus, readonly [string, string]> = {
  verified: ["Verified", "bg-ok-wash text-ok-deep"],
  review: ["Needs review", "bg-warn-wash text-warn-deep"],
  removed: ["Removed", "bg-bad-wash text-bad-deep"],
};

export function SourceCards({ view }: { view: ResultView }) {
  const { source } = useHighlight();
  if (!view.sources.length)
    return (
      <p className="text-[12.5px] text-ink-3">
        No sources were used for this answer.
      </p>
    );
  return (
    <section aria-label="Sources used">
      <h3 className={H3}>Sources used</h3>
      {view.sources.map((s) => (
        <div
          key={s.title}
          className={cn(
            "mb-2 rounded-[14px] border bg-white px-3 py-2.5 text-[12.5px] leading-snug transition-[border-color,box-shadow,transform] duration-[var(--t-base)] ease-[var(--e-spring)]",
            source === s.title
              ? "motion-safe:-translate-x-1 border-mint shadow-[0_0_0_3px_#15999e1f]"
              : "border-line",
          )}
        >
          <div className="flex items-center justify-between gap-2 font-semibold">
            {s.title}
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px]",
                BADGE[s.status][1],
              )}
            >
              {BADGE[s.status][0]}
            </span>
          </div>
          {s.excerpt && (
            <q className="my-1.5 block italic text-ink-2">{s.excerpt}</q>
          )}
          <small className="text-[11px] text-ink-3">
            Used {s.uses} {s.uses === 1 ? "time" : "times"}
          </small>
        </div>
      ))}
    </section>
  );
}

export function EvidencePanel({ view }: { view: ResultView }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span
          className={cn(
            "grid size-[30px] place-items-center rounded-[9px]",
            view.kind === "review"
              ? "bg-bad-wash text-bad"
              : view.kind === "caution"
                ? "bg-warn-wash text-warn"
                : "bg-mint-wash text-mint-deep",
          )}
        >
          <ShieldCheck aria-hidden className="size-4" />
        </span>
        Evidence &amp; safety
      </h2>
      <SafetyChecks view={view} />
      <ConfidenceBars view={view} />
      <SourceCards view={view} />
    </div>
  );
}
