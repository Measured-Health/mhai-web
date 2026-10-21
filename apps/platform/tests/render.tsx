import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { createStepUp } from "@/lib/api/step-up";
import { AuthProvider, useAuth, type AuthCtx } from "@/lib/auth/auth-context";
import { createMockAuthClient } from "@/lib/auth/mock";
import type { AuthClient, User } from "@/lib/auth/types";
import { ToastProvider } from "@mhai/ui/toast";

export const ADA: User = {
  id: "ada.bakare",
  email: "ada.bakare@measured-health.example",
  name: "Ada Bakare",
  roles: ["platform_admin"],
  mfaEnabled: true,
  backupCodesLeft: 10,
};

export const AMARA: User = {
  id: "amara.eze",
  email: "amara.eze@measured-health.example",
  name: "Amara Eze",
  roles: ["auditor"],
  mfaEnabled: true,
  backupCodesLeft: 10,
};

/** Pass as `user` to let the provider load the session from the client. */
export const FROM_CLIENT = Symbol("from client");
type StartUser = User | null | typeof FROM_CLIENT;

/** A mock sign-in with its own two-step codes, so tests can't lock each other out. */
export const testAuthClient = () =>
  createMockAuthClient({ stepUp: createStepUp() });

export function TestProviders({
  children,
  user = ADA,
  client,
  queryClient,
}: {
  children: ReactNode;
  user?: StartUser;
  client?: AuthClient;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider
      client={
        queryClient ??
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <AuthProvider
          client={client ?? testAuthClient()}
          initialUser={user === FROM_CLIENT ? undefined : user}
        >
          {children}
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Renders inside the query cache, toasts and auth (Ada signed in by default). */
export function renderWithAuth(
  ui: ReactElement,
  {
    user,
    client,
    queryClient,
  }: { user?: StartUser; client?: AuthClient; queryClient?: QueryClient } = {},
) {
  return render(
    <TestProviders user={user} client={client} queryClient={queryClient}>
      {ui}
    </TestProviders>,
  );
}

/** The latest auth context, for driving sign-in from a test. */
export const auth: { current: AuthCtx } = {
  current: null as unknown as AuthCtx,
};
export function GrabAuth() {
  const a = useAuth();
  useEffect(() => {
    auth.current = a;
  });
  return null;
}
