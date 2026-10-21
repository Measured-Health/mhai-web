"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { IdleGuard } from "@/components/states/idle-guard";
import { AuthProvider } from "@/lib/auth/auth-context";
import type { AuthClient, User } from "@/lib/auth/types";
import { READ_RETRY } from "@mhai/api-client/network";
import { ToastProvider } from "@mhai/ui/toast";

export function Providers({
  children,
  auth,
}: {
  children: ReactNode;
  /** Tests only: a specific client or a starting user. */
  auth?: { client?: AuthClient; initialUser?: User | null };
}) {
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
        <AuthProvider client={auth?.client} initialUser={auth?.initialUser}>
          {children}
          {/* The 15-minute idle sign-out, on every page while signed in. */}
          <IdleGuard />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
