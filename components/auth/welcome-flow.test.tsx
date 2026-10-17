import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { MOCK_TOTP_SECRET, createMockAuthClient } from "@/lib/auth/mock";
import { totp } from "@/lib/auth/totp";
import { FROM_CLIENT, renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";
import { WelcomeFlow } from "./welcome-flow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

let auth: ReturnType<typeof useAuth>;
function Grab() {
  const a = useAuth();
  useEffect(() => {
    auth = a;
  });
  return null;
}

describe("WelcomeFlow", () => {
  it("offers a way out on every step: Not you? Sign out", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("new.nurse@havanahospital.org", "temp"));
    const out = () => screen.getByRole("link", { name: "Not you? Sign out" });
    expect(screen.getByText("Step 1 of 4 · First sign-in")).toBeInTheDocument();
    expect(out()).toHaveAttribute("href", "/sign-out");
    await user.click(
      screen.getByLabelText("I understand and agree to use MHAI this way"),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Step 2 of 4 · Your password"),
    ).toBeInTheDocument();
    expect(out()).toHaveAttribute("href", "/sign-out");
  });

  it("walks a new account through all four steps, then home", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("new.nurse@havanahospital.org", "temp"));

    expect(screen.getByText("Step 1 of 4 · First sign-in")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeDisabled();
    await user.click(
      screen.getByLabelText("I understand and agree to use MHAI this way"),
    );
    await user.click(go);

    expect(
      await screen.findByText("Step 2 of 4 · Your password"),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "tram-lantern-okra");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(
      await screen.findByText("Step 3 of 4 · Protect your account"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /QR code/ }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Can't scan? Show key" }),
    );
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");

    expect(
      await screen.findByText("Step 4 of 4 · Just in case"),
    ).toBeInTheDocument();
    expect(auth.user?.mfaEnabled).toBe(true);
    await user.click(
      screen.getByLabelText("I've saved these codes somewhere safe"),
    );
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("sends a new hospital admin through the steps, then to the admin side", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("newadmin.eze@havanahospital.org", "temp"));
    expect(screen.getByText("Step 1 of 4 · First sign-in")).toBeInTheDocument();
    await user.click(
      screen.getByLabelText("I understand and agree to use MHAI this way"),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      await screen.findByLabelText("New password"),
      "tram-lantern-okra",
    );
    await user.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    await user.click(await screen.findByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    await user.click(
      await screen.findByLabelText("I've saved these codes somewhere safe"),
    );
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
  });

  it.each([
    ["an admin-only person", ["hospital_admin"], "/admin/staff"],
    ["a medical director", ["clinician", "hospital_admin"], "/"],
  ] as const)(
    "makes %s without two-step set it up before any page (amendment 3)",
    async (_who, roles, home) => {
      const user = userEvent.setup();
      const client = createMockAuthClient();
      await client.signIn("admin.nwosu@havanahospital.org", "pw");
      renderWithAuth(
        <ToastProvider>
          <Grab />
          <WelcomeFlow />
        </ToastProvider>,
        { ...TEST_USER, roles: [...roles], mfaEnabled: false },
        client,
      );
      expect(
        await screen.findByRole("heading", {
          name: "Set up two-step verification",
        }),
      ).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      expect(
        screen.getByText("Step 1 of 2 · Protect your account"),
      ).toBeInTheDocument();
      await user.click(await screen.findByLabelText("Digit 1 of 6"));
      await user.keyboard("123456");
      await user.click(
        await screen.findByLabelText("I've saved these codes somewhere safe"),
      );
      await user.click(screen.getByRole("button", { name: "Finish setup" }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith(home));
      expect(auth.user?.mfaEnabled).toBe(true);
    },
  );

  it("rejects a wrong setup code and lets you try again", async () => {
    const user = userEvent.setup();
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "temp");
    await client.acceptTerms();
    await client.changePassword(null, "tram-lantern-okra");
    renderWithAuth(
      <ToastProvider>
        <WelcomeFlow />
      </ToastProvider>,
      FROM_CLIENT,
      client,
    );
    expect(
      await screen.findByText("Step 1 of 2 · Protect your account"),
    ).toBeInTheDocument();
    await screen.findByRole("img", { name: /QR code/ });
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code didn't work.",
    );
  });

  it("accepts a real authenticator code for the demo key", async () => {
    const user = userEvent.setup();
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "temp");
    await client.acceptTerms();
    await client.changePassword(null, "tram-lantern-okra");
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      FROM_CLIENT,
      client,
    );
    await screen.findByRole("img", { name: /QR code/ });
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard(await totp(MOCK_TOTP_SECRET, Date.now()));
    expect(
      await screen.findByText("Step 2 of 2 · Just in case"),
    ).toBeInTheDocument();
    expect(auth.user?.backupCodesLeft).toBe(10);
  });

  it("sends a signed-out visitor to sign in", async () => {
    renderWithAuth(<WelcomeFlow />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("sends someone with nothing left to do home", async () => {
    renderWithAuth(<WelcomeFlow />, TEST_USER);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
