import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { useStaff, useStaffAction } from "@/lib/admin-queries";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import type { Role } from "@/lib/auth/types";
import { screenAdminAs } from "@/tests/admin";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
const adminHolder = vi.hoisted(() => ({
  client: null as unknown as AdminClient,
}));
vi.mock("@/lib/api/admin", () => ({
  getAdminClient: () => adminHolder.client,
}));
import HospitalAdminLayout from "./layout";

const NEEDS_TWO_STEP = new ApiError(403, "mfa_required");

function StaffScreen() {
  const staff = useStaff();
  const act = useStaffAction();
  return (
    <>
      <p>
        {staff.isError
          ? "couldn't load staff"
          : staff.data
            ? `${staff.data.length} on staff`
            : "loading staff"}
      </p>
      <button
        type="button"
        onClick={() => act.mutate({ id: "s-okafor", action: "deactivate" })}
      >
        deactivate
      </button>
    </>
  );
}
const page = () => (
  <HospitalAdminLayout params={Promise.resolve({})}>
    <StaffScreen />
  </HospitalAdminLayout>
);

const ADMINS = [
  ["an admin-only person", ["hospital_admin"]],
  ["a medical director", ["clinician", "hospital_admin"]],
] as [string, Role[]][];

beforeEach(() => {
  replace.mockClear();
  adminHolder.client = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
});

describe("The hospital admin side's layout", () => {
  it.each(ADMINS)("shows the admin side to %s", async (_who, roles) => {
    renderWithAuth(page(), { ...TEST_USER, roles });
    expect(await screen.findByText(/\d+ on staff/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(ADMINS)(
    "sends %s to the two-step setup step when a page load says it's needed",
    async (_who, roles) => {
      vi.spyOn(adminHolder.client, "listStaff").mockRejectedValue(
        NEEDS_TWO_STEP,
      );
      renderWithAuth(page(), { ...TEST_USER, roles });
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
      expect(screen.queryByText(/staff/)).toBeNull();
    },
  );

  it.each(ADMINS)(
    "sends %s to the two-step setup step when a change says it's needed",
    async (_who, roles) => {
      vi.spyOn(adminHolder.client, "staffAction").mockRejectedValue(
        NEEDS_TWO_STEP,
      );
      renderWithAuth(page(), { ...TEST_USER, roles });
      await screen.findByText(/\d+ on staff/);
      await userEvent.click(screen.getByRole("button", { name: "deactivate" }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
      expect(screen.queryByText(/on staff/)).toBeNull();
    },
  );

  it("leaves other refusals to the page", async () => {
    vi.spyOn(adminHolder.client, "listStaff").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    renderWithAuth(page(), { ...TEST_USER, roles: ["hospital_admin"] });
    // The page shows its own error and stays.
    expect(await screen.findByText("couldn't load staff")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
