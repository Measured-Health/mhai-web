import { PenLine } from "lucide-react";
import { useId } from "react";
import type { CorrectionOut } from "@/lib/api/contract";
import { citationTag } from "@/lib/labels";
import { wordDiff, type DiffPart } from "@/lib/word-diff";
import { Chip } from "../ui/chip";

const WRAP = "[overflow-wrap:anywhere] whitespace-pre-line";
const H = "mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[.1em]";
const BOX =
  "rounded-[18px] border border-line bg-white px-[18px] py-4 text-[14px] leading-relaxed text-ink-2";

/** One side of the diff. Changes carry a hidden word as well as the styling. */
export function DiffText({
  parts,
  side,
}: {
  parts: DiffPart[];
  side: "before" | "after";
}) {
  const hidden = side === "before" ? "add" : "del";
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === hidden) return null;
        if (p.kind === "same" || !p.text.trim())
          return <span key={i}>{p.text}</span>;
        return p.kind === "del" ? (
          <del
            key={i}
            className="rounded bg-bad-wash px-0.5 text-bad-deep decoration-bad decoration-2"
          >
            <span className="sr-only">Removed: </span>
            {p.text}
          </del>
        ) : (
          <ins
            key={i}
            className="rounded bg-ok-wash px-0.5 text-ok-deep underline decoration-2 underline-offset-2"
          >
            <span className="sr-only">Added: </span>
            {p.text}
          </ins>
        );
      })}
    </>
  );
}

/** What the system said beside the correction, then why and the evidence. */
export function CorrectionCompare({
  c,
  mine,
}: {
  c: CorrectionOut;
  mine: boolean;
}) {
  const id = useId();
  const parts = wordDiff(c.original.diagnosis ?? "", c.corrected_diagnosis);
  const correction = mine ? "Your correction" : "Suggested correction";
  const why = mine
    ? "Your reason"
    : `Why (from ${c.submitted_by.display_name})`;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 md:grid-cols-2">
        <section aria-labelledby={`${id}-a`} className={BOX}>
          <h3 id={`${id}-a`} className={`${H} text-ink-3`}>
            What the system said
          </h3>
          {c.original.diagnosis ? (
            <p className={WRAP}>
              <DiffText parts={parts} side="before" />
            </p>
          ) : (
            <p className="text-ink-3">No diagnosis was given.</p>
          )}
        </section>
        <section
          aria-labelledby={`${id}-b`}
          className="rounded-[18px] border border-mint-2/40 bg-mint-wash px-[18px] py-4 text-[14px] leading-relaxed text-ink"
        >
          <h3 id={`${id}-b`} className={`${H} text-mint-deep`}>
            <PenLine aria-hidden className="size-3.5" />
            {correction}
          </h3>
          <p className={WRAP}>
            <DiffText parts={parts} side="after" />
          </p>
        </section>
      </div>
      <p className="text-[12px] text-ink-3">
        Changes: <del className="decoration-bad">struck through</del> was
        removed, <ins className="underline underline-offset-2">underlined</ins>{" "}
        was added.
      </p>
      <div className="grid gap-3.5 md:grid-cols-2">
        <section aria-labelledby={`${id}-c`} className={BOX}>
          <h3 id={`${id}-c`} className={`${H} text-ink-3`}>
            {why}
          </h3>
          <p className={WRAP}>{c.reason}</p>
        </section>
        <section aria-labelledby={`${id}-d`} className={BOX}>
          <h3 id={`${id}-d`} className={`${H} text-ink-3`}>
            Evidence on file
          </h3>
          {c.original.citations.length ? (
            <ul className="flex flex-col gap-2 text-[13px]">
              {c.original.citations.map((s, i) => {
                const tag = citationTag(s.action);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-2 border-t border-line pt-2 first:border-0 first:pt-0"
                  >
                    <Chip tone={tag.tone}>{tag.label}</Chip>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <b className="font-semibold">{s.source_title}</b> ·{" "}
                      {s.claim_text}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-3">No sources were cited.</p>
          )}
        </section>
      </div>
    </div>
  );
}
