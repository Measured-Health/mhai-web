"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SessionGuard } from "@/components/states/session-timeout";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider } from "@/lib/session-store";

export function Providers({ children }: { children: ReactNode }) {
  // Memory-only cache: no persister is ever attached (no PHI in browser storage).
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <ToastProvider>
          {/* Idle sign-out on every route, including /print. */}
          <SessionGuard>{children}</SessionGuard>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
