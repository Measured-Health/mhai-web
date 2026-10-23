import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import type { AdminClient } from "@/lib/api/admin";
import type { AnalysisClient } from "@/lib/api/analysis";
import type { AnalysisFilters } from "@/lib/api/analysis-contract";
import { createMockAnalysis } from "@/lib/api/mock-analysis";
import { AuthProvider } from "@/lib/auth/auth-context";
import { createMockAuthClient, DEMO_EMAILS } from "@/lib/auth/mock";
import type { User } from "@/lib/auth/types";
import { SessionProvider } from "@/lib/session-store";
import { ToastProvider } from "@mhai/ui/toast";
import { DIRECTOR, HOSPITAL_ADMIN } from "./admin-render";
import { TEST_USER } from "./auth-wrapper";

/** A year of sample data, in which "Sex: Female" is a shown, drillable count. */
export const NAMED_FILTERS: AnalysisFilters = {
  from: "2025-10-22",
  to: "2026-10-21",
  condition: null,
  age_band: null,
  sex: null,
  location: null,
  setting: null,
  specialty: null,
  source: null,
};

const named = (u: User): User => ({
  ...u,
  features: { analysis: true, named: true },
});

/** Grace Nwosu, hospital admin, covered by the active letter cl_act. */
export const GRACE = named(HOSPITAL_ADMIN);
/** Dr. Obi, director, with only a waiting letter (ruling 9). */
export const OBI = named(DIRECTOR);
/** Dr. Kemi Adeyemi, clinician and Analyst, covered by cl_soon. */
export const KEMI = named({
  ...TEST_USER,
  username: "analyst.adeyemi",
  email: DEMO_EMAILS.analyst,
  displayName: "Dr. Adeyemi",
  fullName: "Dr. Kemi Adeyemi",
  roles: ["clinician", "analyst"],
});

/** The sample Analysis for `user`, reading roles and letters live. */
export const analysisAs = (
  user: User,
  admin: AdminClient,
  namedAccess: "off" | "letters_only" | "on" = "on",
): AnalysisClient =>
  createMockAnalysis({
    delayMs: 0,
    me: async () => user.email,
    staff: () => admin.listStaff(),
    namedAccess,
  });

/** Signed in as `user`, on the given query cache (so tests can look in it). */
export function renderSignedIn(ui: ReactElement, user: User, qc: QueryClient) {
  const Wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <AuthProvider client={createMockAuthClient()} initialUser={user}>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrap });
}

/** Show names, choosing `purpose` (and a note) in the purpose dialog. */
export async function showNames(
  purpose = "Clinical follow-up",
  note?: string,
  user: Pick<UserEvent, "click" | "type"> = userEvent,
) {
  await user.click(await screen.findByRole("button", { name: "Show names" }));
  const dialog = await screen.findByRole("dialog", { name: "Show names" });
  await user.click(within(dialog).getByRole("radio", { name: purpose }));
  if (note) await user.type(within(dialog).getByRole("textbox"), note);
  await user.click(within(dialog).getByRole("button", { name: "Show names" }));
  return screen.findByRole("table", { name: /^Named patients/ });
}
