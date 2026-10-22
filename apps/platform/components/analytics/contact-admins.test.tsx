import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Hospital } from "@/lib/api/contract";
import { renderWithAuth, TestProviders } from "@/tests/render";
import { ContactAdmins } from "./contact-admins";

vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/** A hand-made record: no active admin, and the first-admin invite ran out (R6). */
const EASTBROOK: Hospital = {
  id: "h_eastbrook",
  name: "Eastbrook Medical Centre",
  short_code: "EMC",
  status: "active",
  staff_count: 40,
  sso_enabled: false,
  created_at: "2026-09-01T09:00:00Z",
  last_activity_at: null,
  country: "NG",
  time_zone: "Africa/Lagos",
  email_domains: ["eastbrook.example"],
  version: 1,
  deactivation: null,
  first_admin: {
    invite_id: "inv_eastbrook1",
    name: "Chiamaka Obi",
    email: "chiamaka.obi@eastbrook.example",
    status: "expired",
    sent_at: "2026-09-01T09:00:00Z",
    expires_at: "2026-09-08T09:00:00Z",
  },
  removal: null,
  admins: [],
};

describe("ContactAdmins", () => {
  it("Eastbrook shows No active hospital admin and Invite expired", () => {
    const { rerender } = renderWithAuth(<ContactAdmins hospital={EASTBROOK} />);
    const r = screen.getByRole("region", { name: "Hospital admin" });
    expect(within(r).getByText("No active hospital admin")).toBeInTheDocument();
    expect(within(r).getByText(/Invite expired/)).toBeInTheDocument();
    // Never someone who can't act: no email to copy.
    expect(within(r).queryByRole("button", { name: /Copy email/ })).toBeNull();
    expect(within(r).queryByText("chiamaka.obi@eastbrook.example")).toBeNull();
    expect(
      within(r).getByRole("link", { name: "Open hospital" }),
    ).toHaveAttribute("href", "/hospitals/h_eastbrook");
    const pending: Hospital = {
      ...EASTBROOK,
      first_admin: { ...EASTBROOK.first_admin!, status: "pending" },
    };
    rerender(
      <TestProviders>
        <ContactAdmins hospital={pending} />
      </TestProviders>,
    );
    expect(screen.getByText(/Invite pending/)).toBeInTheDocument();
    expect(screen.queryByText(/Invite expired/)).toBeNull();
  });
});
