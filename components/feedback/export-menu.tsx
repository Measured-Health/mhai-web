"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Hash, Printer } from "lucide-react";
import { useEscape } from "@/lib/hooks/use-escape";
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
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);
  useEscape(open, () => close(true));

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  async function copyText(text: string, successTitle: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ title: successTitle, ms: 1800 });
      return true;
    } catch {
      toast.show({
        title: "Couldn't copy. Select the text and copy it instead.",
        ms: 3000,
      });
      return false;
    }
  }
  const copyAll = async () => {
    if (await copyText(resultAsText(view, parsed), "Copied to clipboard"))
      setCopied(true);
    close(open);
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    items[to]?.focus();
  };
  const item =
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13.5px] hover:bg-bg";
  return (
    <div
      ref={ref}
      className="relative ml-auto inline-flex"
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <Button variant="ghost" onClick={copyAll} className="rounded-r-none">
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
        ref={trigger}
        variant="ghost"
        aria-label="More export options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-l-none border-l-0 px-2.5"
      >
        <ChevronDown aria-hidden className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Export options"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[270px] rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <button role="menuitem" className={item} onClick={copyAll}>
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
              onClick={async () => {
                await copyText(view.icd10 ?? "", "ICD-10 code copied");
                close(true);
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
