"use client";
import { Lock } from "lucide-react";
import {
  ageLabel,
  correctionTitle,
  isOverdue,
  parseTime,
  type QueueItem,
} from "@/lib/corrections";
import { OriginalChip, OverdueChip } from "../corrections/chips";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";

/** The left column (desktop) or the card list (phones) of the review queue. */
export function QueueList({
  items,
  selectedId,
  now,
  onSelect,
}: {
  items: QueueItem[];
  selectedId: string | null;
  now: number;
  onSelect(i: QueueItem): void;
}) {
  return (
    <ul aria-label="Waiting corrections">
      {items.map((i) => {
        const { c } = i;
        const t = parseTime(c.submitted_at);
        const overdue = isOverdue(c, now);
        const on = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(i)}
              className={cn(
                "block w-full border-t border-line px-4 py-3 text-left text-[13px] hover:bg-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
                on && "bg-white shadow-[inset_3px_0_0_var(--color-mint)]",
              )}
            >
              <span className="flex justify-between gap-2 text-[14px] font-semibold">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {correctionTitle(c)}
                </span>
                {t !== null && (
                  <small
                    className={cn(
                      "whitespace-nowrap text-[11.5px] font-normal text-ink-3",
                      overdue && "font-bold text-bad",
                    )}
                  >
                    {ageLabel(t, now)}
                  </small>
                )}
              </span>
              <span className="mb-1.5 mt-1 line-clamp-2 block leading-snug text-ink-2 [overflow-wrap:anywhere]">
                {c.corrected_diagnosis}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
                <OriginalChip original={c.original} />
                {c.consultation.specialty && (
                  <Chip>{c.consultation.specialty}</Chip>
                )}
                {i.mine ? (
                  <span className="flex items-center gap-1 font-semibold text-bloom">
                    <Lock aria-hidden className="size-3" />
                    Your correction
                  </span>
                ) : (
                  <span>· {c.submitted_by.display_name}</span>
                )}
                {overdue && <OverdueChip />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
