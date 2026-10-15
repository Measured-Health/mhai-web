"use client";
import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackDialog } from "./feedback-dialog";

/** Height of the ribbon strip; the app shell subtracts it from 100dvh. */
export const DEMO_RIBBON_HEIGHT = "44px";

export function DemoRibbon() {
  const [open, setOpen] = useState(false);
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") return null;
  return (
    <div
      role="note"
      className="flex h-11 items-center gap-3 bg-bloom px-4 text-[12px] text-white print:hidden md:px-[26px]"
    >
      <b className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider">
        Demo
      </b>
      <span>Demo · sample data, not for clinical use</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
      >
        <MessageSquarePlus aria-hidden className="size-3.5" />
        Give feedback
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
