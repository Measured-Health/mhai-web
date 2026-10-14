"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Hash, Printer } from "lucide-react";
import type { ResultView } from "@/lib/result-view";
import type { parseBody } from "../result/parse-body";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { resultAsText } from "./result-text";

export function ExportMenu({
  queryId,
  view,
  parsed,
}: {
  queryId: string;
  view: ResultView;
  parsed: ReturnType<typeof parseBody>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resultAsText(view, parsed));
      setCopied(true);
      toast.show({ title: "Copied to clipboard", ms: 1800 });
    } catch {
      toast.show({
        title: "Couldn't copy. Select the text and copy it.",
        ms: 3000,
      });
    }
    setOpen(false);
  };
  const item =
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13.5px] hover:bg-bg";
  return (
    <div ref={ref} className="relative ml-auto inline-flex">
      <Button variant="ghost" onClick={copy} className="rounded-r-none">
        {copied ? (
          "✓ Copied"
        ) : (
          <>
            <Copy aria-hidden className="size-4" />
            Copy
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        aria-label="More export options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-l-none border-l-0 px-2.5"
      >
        <ChevronDown aria-hidden className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[270px] rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <button role="menuitem" className={item} onClick={copy}>
            <Copy aria-hidden className="size-4" />
            Copy as text
            <kbd className="ml-auto font-mono text-[10.5px] text-ink-3">⇧C</kbd>
          </button>
          <Link role="menuitem" className={item} href={`/print/${queryId}`}>
            <Printer aria-hidden className="size-4" />
            Print or save as PDF
            <kbd className="ml-auto font-mono text-[10.5px] text-ink-3">⌘P</kbd>
          </Link>
          {view.icd10 && (
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                void navigator.clipboard?.writeText(view.icd10 ?? "");
                setOpen(false);
                toast.show({ title: "ICD-10 code copied", ms: 1800 });
              }}
            >
              <Hash aria-hidden className="size-4" />
              Copy ICD-10 code
            </button>
          )}
          <p className="border-t border-line px-2.5 py-2 text-[11.5px] text-ink-3">
            Exports include the sources and the disclaimer.
          </p>
        </div>
      )}
    </div>
  );
}
