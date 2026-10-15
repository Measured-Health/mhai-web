"use client";
import { CloudUpload } from "lucide-react";
import { useOutbox } from "@/lib/offline/outbox-context";

/** "N waiting to send" under New consultation; hidden when nothing waits. */
export function OutboxIndicator({ rail }: { rail: boolean }) {
  const { items, syncing } = useOutbox();
  if (!items.length) return null;
  const waiting = items.filter((i) => i.status === "waiting").length;
  const text = syncing
    ? "Sending…"
    : `${waiting || items.length} waiting to send`;
  return (
    <p
      role="status"
      title={text}
      className="mt-2 flex min-h-9 items-center gap-2 px-2.5 text-[12.5px] font-medium text-bloom"
    >
      <CloudUpload aria-hidden className="size-4 shrink-0" />
      <span className={rail ? "sr-only" : undefined}>{text}</span>
    </p>
  );
}
