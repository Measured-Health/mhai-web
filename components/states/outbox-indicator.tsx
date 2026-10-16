"use client";
import { CloudAlert, CloudUpload } from "lucide-react";
import { useOutbox } from "@/lib/offline/outbox-context";

const ROW =
  "mt-2 flex min-h-9 items-center gap-2 px-2.5 text-[12.5px] font-medium";

/**
 * Under New consultation: "N waiting to send" (or "Sending…") and, apart,
 * "N couldn't send". Each row is hidden at zero.
 */
export function OutboxIndicator({ rail }: { rail: boolean }) {
  const { items, syncing } = useOutbox();
  const waiting = items.filter((i) => i.status === "waiting").length;
  const failed = items.length - waiting;
  const label = rail ? "sr-only" : undefined;
  const sending = syncing ? "Sending…" : `${waiting} waiting to send`;
  return (
    <>
      {waiting > 0 && (
        <p role="status" title={sending} className={`${ROW} text-bloom`}>
          <CloudUpload aria-hidden className="size-4 shrink-0" />
          <span className={label}>{sending}</span>
        </p>
      )}
      {failed > 0 && (
        <p
          role="status"
          title={`${failed} couldn't send`}
          className={`${ROW} text-bad`}
        >
          <CloudAlert aria-hidden className="size-4 shrink-0" />
          <span className={label}>{failed} couldn&apos;t send</span>
        </p>
      )}
    </>
  );
}
