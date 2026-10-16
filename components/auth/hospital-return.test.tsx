import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_SSO_CODE } from "@/lib/auth/mock";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { GuestGate } from "./guest-gate";
import { HospitalReturn } from "./hospital-return";

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => search,
}));
beforeEach(() => replace.mockClear());

const page = () =>
  renderWithAuth(
    <GuestGate>
      <HospitalReturn />
    </GuestGate>,
    null,
  );

describe("HospitalReturn", () => {
  it("finishes sign-on with the code, then strips it and goes home", async () => {
    window.history.replaceState(
      null,
      "",
      `/sign-in/hospital?code=${MOCK_SSO_CODE}`,
    );
    search = new URLSearchParams({ code: MOCK_SSO_CODE });
    page();
    expect(window.location.search).toBe("");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
  it("explains a failed sign-on", async () => {
    search = new URLSearchParams({ code: "stale" });
    page();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you in with your hospital account.",
    );
    expect(
      screen.getByRole("heading", { name: "Hospital sign-in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });
  it("handles a return with no code", async () => {
    search = new URLSearchParams();
    page();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
