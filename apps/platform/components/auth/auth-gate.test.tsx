import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/types";
import {
  ADA,
  AMARA,
  auth,
  GrabAuth,
  renderWithAuth,
  testAuthClient,
} from "@/tests/render";
import { AuthGate } from "./auth-gate";
import { GuestGate } from "./guest-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

const NO_ROLE: User = { ...ADA, id: "a.reyes", roles: [] };

describe("AuthGate", () => {
  it("shows the page to a platform admin or an auditor", () => {
    renderWithAuth(<AuthGate>secret page</AuthGate>);
    expect(screen.getByText("secret page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the page to an auditor", () => {
    renderWithAuth(<AuthGate>secret page</AuthGate>, { user: AMARA });
    expect(screen.getByText("secret page")).toBeInTheDocument();
  });

  it("sends a guest to /sign-in", () => {
    renderWithAuth(<AuthGate>secret page</AuthGate>, { user: null });
    expect(screen.queryByText("secret page")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("sends anyone owing steps to /welcome", async () => {
    renderWithAuth(
      <>
        <GrabAuth />
        <AuthGate>secret page</AuthGate>
      </>,
      { user: null },
    );
    await act(() =>
      auth.current.signIn("new.admin@measured-health.example", "temp"),
    );
    expect(screen.queryByText("secret page")).toBeNull();
    expect(replace).toHaveBeenLastCalledWith("/welcome");
  });

  it("refuses an account with no platform role and signs it out", async () => {
    const client = testAuthClient();
    const signOut = vi.spyOn(client, "signOut");
    renderWithAuth(
      <>
        <GrabAuth />
        <AuthGate>secret page</AuthGate>
      </>,
      { user: NO_ROLE, client },
    );
    expect(screen.queryByText("secret page")).toBeNull();
    expect(
      screen.getByText("This account can't use the platform admin app."),
    ).toBeInTheDocument();
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
    expect(signOut).toHaveBeenCalled();
    // The refusal stays on screen; it doesn't flip to the sign-in redirect.
    expect(
      screen.getByText("This account can't use the platform admin app."),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith("/sign-in");
  });
});

describe("GuestGate", () => {
  it("shows the page to a guest", () => {
    renderWithAuth(<GuestGate>sign-in page</GuestGate>, { user: null });
    expect(screen.getByText("sign-in page")).toBeInTheDocument();
  });

  it("sends a signed-in user home", () => {
    renderWithAuth(<GuestGate>sign-in page</GuestGate>);
    expect(screen.queryByText("sign-in page")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/hospitals");
  });
});
