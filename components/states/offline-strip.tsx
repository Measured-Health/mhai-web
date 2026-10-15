"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/hooks/use-online";

export function OfflineStrip() {
  return useOnline() ? null : (
    <div
      role="status"
      className="flex items-center gap-2.5 bg-ink px-4 py-2 text-[13px] text-white md:px-[26px]"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      You&apos;re offline. Showing what&apos;s already loaded. Analyse will work
      again when you&apos;re back online.
    </div>
  );
}
