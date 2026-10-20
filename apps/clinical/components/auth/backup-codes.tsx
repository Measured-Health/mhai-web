"use client";
import { Copy, Download, Printer } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { AuthHeading } from "./auth-layout";

export function BackupCodes({
  codes,
  onFinish,
  finishLabel = "Finish setup",
  eyebrow,
}: {
  codes: string[];
  onFinish(): void;
  finishLabel?: string;
  eyebrow?: string;
}) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const id = useId();
  const text = `MHAI backup codes\nEach code works once.\n\n${codes.join("\n")}\n`;

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mhai-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ title: "Copied", ms: 1800 });
    } catch {
      toast.show({
        title: "Couldn't copy. Select the codes and copy them yourself.",
        ms: 3000,
      });
    }
  };

  return (
    <div>
      <AuthHeading
        eyebrow={eyebrow}
        title="Save your backup codes"
        sub="Each code works once if you lose your phone. Keep them somewhere safe, not on a sticky note on the ward PC."
      />
      <ul
        aria-label="Backup codes"
        className="grid grid-cols-2 gap-2 rounded-2xl bg-bg p-4 font-mono text-[15px] tracking-wider"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={download}>
          <Download aria-hidden className="size-4" /> Download .txt
        </Button>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" /> Print
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          <Copy aria-hidden className="size-4" /> Copy
        </Button>
      </div>
      <label
        htmlFor={id}
        className="mt-5 flex min-h-11 items-center gap-2.5 text-[13.5px] print:hidden"
      >
        <input
          id={id}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-mint-deep"
        />
        I&apos;ve saved these codes somewhere safe
      </label>
      <Button
        className="mt-3 w-full print:hidden"
        disabled={!saved}
        onClick={onFinish}
      >
        {finishLabel}
      </Button>
    </div>
  );
}
