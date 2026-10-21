"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "@mhai/ui/hooks/use-online";

export const OFFLINE_NOTE = "You're offline. This needs a connection.";

/** For an action that needs the network: `disabled` and a `title` saying why. */
export function useNeedsConnection() {
  const online = useOnline();
  return online
    ? { offline: false, props: {} as { disabled?: boolean; title?: string } }
    : { offline: true, props: { disabled: true, title: OFFLINE_NOTE } };
}

export function OfflineStrip() {
  return useOnline() ? null : (
    <div
      role="status"
      className="flex items-center gap-2.5 bg-ink px-4 py-2 text-[13px] text-white md:px-[26px]"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      You&apos;re offline. Showing what&apos;s already loaded. Actions that
      change something are paused until you&apos;re back online.
    </div>
  );
}
