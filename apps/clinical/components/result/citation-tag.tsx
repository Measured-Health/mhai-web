"use client";
import { Check, Info, X } from "lucide-react";
import type { Citation } from "@/lib/api/contract";
import { citationTag, sourceStatus } from "@/lib/labels";
import { useHighlight } from "@/lib/highlight";
import { cn } from "@mhai/ui/cn";

const TONE = {
  ok: "bg-ok-wash text-ok-deep",
  warn: "bg-warn-wash text-warn-deep",
  bad: "bg-bad-wash text-bad-deep",
} as const;
const ICON = { ok: Check, warn: Info, bad: X } as const;

export function CitationTag({ c }: { c: Citation }) {
  const { source, set } = useHighlight();
  const t = citationTag(c.action);
  const Icon = ICON[t.tone];
  const verified = sourceStatus(c.action) === "verified";
  return (
    <button
      type="button"
      onMouseEnter={() => set(c.source_title)}
      onMouseLeave={() => set(null)}
      onFocus={() => set(c.source_title)}
      onBlur={() => set(null)}
      className={cn(
        // The ::before box extends the hit area to 44 px tall without
        // changing the line height of the step text (touch targets, R4).
        "relative ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-[7px] px-2 py-0.5 align-middle text-[11px] font-medium transition-shadow duration-[var(--t-fast)] before:absolute before:inset-x-0 before:-inset-y-3 before:content-['']",
        TONE[t.tone],
        source === c.source_title && "ring-2 ring-mint",
      )}
    >
      <Icon aria-hidden className="size-3" />
      {verified ? `${t.label}: ${c.source_title}` : t.label}
    </button>
  );
}
