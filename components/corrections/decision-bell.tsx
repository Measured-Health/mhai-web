"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ageLabel } from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { StatusChip } from "./chips";
import { useDecisions } from "./decisions-provider";

/** The top bar's bell: this session's decisions on your corrections. */
export function DecisionBell() {
  const d = useDecisions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const now = useNow(60_000);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("[data-panel] a")?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  if (!d) return null;
  const label = d.unseen
    ? `Decisions on your corrections, ${d.unseen} new`
    : "Decisions on your corrections";
  const onKey = (e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          d.markSeen();
        }}
        className="relative grid size-11 place-items-center rounded-xl border border-line bg-white text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep md:size-[34px] md:rounded-[10px]"
      >
        <Bell aria-hidden className="size-4" />
        {d.unseen > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad-deep px-1 font-mono text-[10px] font-bold text-white"
          >
            {d.unseen}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          data-panel
          role="region"
          aria-label="Decisions this session"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(340px,90vw)] rounded-2xl bg-white p-3 text-left shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <h2 className="px-1 text-[13px] font-semibold">
            Decisions this session
          </h2>
          {d.notes.length ? (
            <ul className="mt-2 flex max-h-[50vh] flex-col overflow-auto">
              {d.notes.map((n) => (
                <li
                  key={`${n.id}-${n.at}`}
                  className="flex flex-col gap-1 border-t border-line px-1 py-2.5 text-[13px] first:border-0"
                >
                  <span className="flex items-center gap-2">
                    <StatusChip status={n.status} />
                    <b className="min-w-0 [overflow-wrap:anywhere]">
                      {n.title}
                    </b>
                  </span>
                  <small className="text-ink-3">
                    {[n.by, `${ageLabel(n.at, now)} ago`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {n.reason && (
                    <small className="text-bad-deep [overflow-wrap:anywhere]">
                      Reason: {n.reason}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 px-1 text-[13px] text-ink-3">
              No decisions yet. When a reviewer decides on a correction you
              suggested, it shows here.
            </p>
          )}
          <Link
            href="/my-feedback"
            onClick={() => setOpen(false)}
            className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-lilac text-[13px] font-semibold text-bloom"
          >
            My feedback &amp; corrections
          </Link>
          <p className="mt-2 px-1 text-[11px] text-ink-3">
            Kept for this session only.
          </p>
        </div>
      )}
    </div>
  );
}
