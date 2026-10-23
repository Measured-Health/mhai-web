"use client";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Copies `value`, then says "Copied" for a moment. `label` names the thing. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      next = "failed";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2_000);
  }

  const Icon = state === "copied" ? Check : Copy;
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold text-ink-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep"
      >
        <Icon aria-hidden className="size-3.5" />
        Copy
      </button>
      <span role="status" className="text-[12.5px] text-ink-2">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Couldn't copy"
            : ""}
      </span>
    </>
  );
}
