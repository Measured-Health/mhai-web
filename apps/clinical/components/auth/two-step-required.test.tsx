import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { TwoStepRequired } from "./two-step-required";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function Probe({ queryKey }: { queryKey: string[] }) {
  const { user } = useAuth();
  useQuery({
    queryKey,
    retry: false,
    queryFn: async () => {
      throw new ApiError(403, "mfa_required");
    },
  });
  return <p>two-step {user?.mfaEnabled ? "on" : "off"}</p>;
}

describe("TwoStepRequired", () => {
  it.each([
    [["analysis", "prevalence"]],
    [["admin", "staff"]],
    [["clearances", "list"]],
  ])(
    "marks the person as without two-step when %j needs it",
    async (queryKey) => {
      renderWithAuth(
        <TwoStepRequired>
          <Probe queryKey={queryKey} />
        </TwoStepRequired>,
        { ...TEST_USER, roles: ["clinician", "analyst"] },
      );
      expect(screen.getByText("two-step on")).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByText("two-step off")).toBeInTheDocument(),
      );
    },
  );
});
