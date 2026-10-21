"use client";
import { useEffect, type ReactNode } from "react";
import { NOTIFICATION_TAG } from "@/lib/notifications/popups";
import { DecisionsProvider } from "../corrections/decisions-provider";
import { useToast } from "@mhai/ui/toast";
import { AlertsProvider } from "./alerts-provider";

/**
 * The notification centre for clinicians (spec §2): decisions on your
 * corrections and patient alerts. It lives in AppShell, so it goes at
 * sign-out and takes every pop-up, and the words read out, with it (R4).
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { clear } = useToast();
  useEffect(() => () => clear(NOTIFICATION_TAG), [clear]);
  return (
    <DecisionsProvider>
      <AlertsProvider>{children}</AlertsProvider>
    </DecisionsProvider>
  );
}
