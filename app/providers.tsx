"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { SessionGuard } from "@/components/states/session-timeout";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth/auth-context";
import type { AuthClient, User } from "@/lib/auth/types";
import { SessionProvider } from "@/lib/session-store";

export function Providers({
  children,
  auth,
}: {
  children: ReactNode;
  /** Tests only: a specific client or a starting user. */
  auth?: { client?: AuthClient; initialUser?: User | null };
}) {
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
          <AuthProvider client={auth?.client} initialUser={auth?.initialUser}>
            {/* Idle sign-out on every route, including /print, while signed in. */}
            <SessionGuard>{children}</SessionGuard>
          </AuthProvider>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
