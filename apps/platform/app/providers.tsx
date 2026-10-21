"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { IdleGuard } from "@/components/states/idle-guard";
import { AuthProvider } from "@/lib/auth/auth-context";
import { READ_RETRY } from "@mhai/api-client/network";
import { ToastProvider } from "@mhai/ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  // Memory-only cache: no persister is ever attached. Sign-out clears it.
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // A 4xx won't change on retry (and a 401 has already signed out).
          queries: { ...READ_RETRY, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthProvider>
          {children}
          {/* The 15-minute idle sign-out, on every page while signed in. */}
          <IdleGuard />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
