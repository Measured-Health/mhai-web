import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/auth-context";
import { createMockAuthClient } from "@/lib/auth/mock";
import type { AuthClient, User } from "@/lib/auth/types";
import { SessionProvider } from "@/lib/session-store";

export const TEST_USER: User = {
  username: "a.reyes",
  email: "a.reyes@havanahospital.org",
  displayName: "Dr. Reyes",
  fullName: "Dr. Ana Reyes",
  roles: ["clinician"],
  roleTitle: "Attending physician",
  specialty: "Internal Medicine",
  hospital: "Havana Hospital",
  mfaEnabled: true,
  backupCodesLeft: 8,
};

/** Pass as `user` to let the provider load the session from the client. */
export const FROM_CLIENT = Symbol("from client");
type StartUser = User | null | typeof FROM_CLIENT;

/** Query cache, session history and a signed-in mock user. */
export function AuthTestProvider({
  children,
  user = TEST_USER,
  client,
}: {
  children: ReactNode;
  user?: StartUser;
  client?: AuthClient;
}) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <AuthProvider
          client={client ?? createMockAuthClient()}
          initialUser={user === FROM_CLIENT ? undefined : user}
        >
          {children}
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export const renderWithAuth = (
  ui: ReactElement,
  user?: StartUser,
  client?: AuthClient,
) =>
  render(
    <AuthTestProvider user={user} client={client}>
      {ui}
    </AuthTestProvider>,
  );
