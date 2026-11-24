import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import {
  MOCK_BACKUP_CODES,
  MOCK_TOTP_SECRET,
  createMockAuthClient,
} from "@/lib/auth/mock";
import { totp } from "@mhai/api-client/totp";
import { FROM_CLIENT, renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { ToastProvider } from "@mhai/ui/toast";
import { WelcomeFlow } from "./welcome-flow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => {
  replace.mockClear();
  // The backup code screen waits 3 s before its button works.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

let auth: ReturnType<typeof useAuth>;
function Grab() {
  const a = useAuth();
  useEffect(() => {
    auth = a;
  });
  return null;
}

/**
 * The backup code screen: the one code shows, and its button works only
 * after the 3-second wait.
 */
async function finishSetup(user: ReturnType<typeof userEvent.setup>) {
  expect(
    await screen.findByRole("group", { name: "Your backup code" }),
  ).toHaveTextContent(MOCK_BACKUP_CODES[0]);
  const finish = screen.getByRole("button", { name: "Finish setup" });
  expect(finish).toHaveAttribute("aria-disabled", "true");
  act(() => vi.advanceTimersByTime(3000));
  await user.click(finish);
}

describe("WelcomeFlow", () => {
  it("offers a way out on every step: Not you? Sign out", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("new.nurse@pilot-hospital.example", "temp"));
    const out = () => screen.getByRole("link", { name: "Not you? Sign out" });
    expect(screen.getByText("Step 1 of 4 · Your password")).toBeInTheDocument();
    expect(out()).toHaveAttribute("href", "/sign-out");
    await user.type(screen.getByLabelText("Temporary password"), "temp");
    await user.type(screen.getByLabelText("New password"), "tram-lantern-okra");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(
      await screen.findByText("Step 2 of 4 · Protect your account"),
    ).toBeInTheDocument();
    expect(out()).toHaveAttribute("href", "/sign-out");
  });

  it("walks a new account through password, two-step, codes, then the terms, then home", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("new.nurse@pilot-hospital.example", "temp"));

    expect(screen.getByText("Step 1 of 4 · Your password")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Temporary password"), "temp");
    await user.type(screen.getByLabelText("New password"), "tram-lantern-okra");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(
      await screen.findByText("Step 2 of 4 · Protect your account"),
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
      await screen.findByText("Step 3 of 4 · Just in case"),
    ).toBeInTheDocument();
    expect(auth.user?.mfaEnabled).toBe(true);
    await finishSetup(user);

    expect(
      await screen.findByText("Step 4 of 4 · Terms of use"),
    ).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeDisabled();
    await user.click(
      screen.getByLabelText("I understand and agree to use MHAI this way"),
    );
    await user.click(go);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("the password step needs the temporary password, and says when it's wrong", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("new.nurse@pilot-hospital.example", "temp"));
    await user.type(screen.getByLabelText("New password"), "tram-lantern-okra");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByLabelText("Temporary password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Step 1 of 4 · Your password")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Temporary password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(
      await screen.findByText(
        "That isn't the temporary password you were given.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Temporary password")).toHaveFocus();
  });

  it("sends a new hospital admin through the steps, then to the admin side", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithAuth(
      <ToastProvider>
        <Grab />
        <WelcomeFlow />
      </ToastProvider>,
      null,
    );
    await act(() => auth.signIn("newadmin.eze@pilot-hospital.example", "temp"));
    expect(screen.getByText("Step 1 of 4 · Your password")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Temporary password"), "temp");
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
    await finishSetup(user);
    await user.click(
      await screen.findByLabelText(
        "I understand and agree to use MHAI this way",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
  });

  it.each([
    ["an admin-only person", ["hospital_admin"], "/admin/staff"],
    ["a medical director", ["clinician", "hospital_admin"], "/"],
  ] as const)(
    "makes %s without two-step set it up before any page (amendment 3)",
    async (_who, roles, home) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const client = createMockAuthClient();
      await client.signIn("admin.nwosu@pilot-hospital.example", "pw");
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
      await finishSetup(user);
      await waitFor(() => expect(replace).toHaveBeenCalledWith(home));
      expect(auth.user?.mfaEnabled).toBe(true);
    },
  );

  it("rejects a wrong setup code and lets you try again", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "temp");
    await client.acceptTerms();
    await client.changePassword("temp", "tram-lantern-okra");
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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "temp");
    await client.acceptTerms();
    await client.changePassword("temp", "tram-lantern-okra");
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
    expect(auth.user?.backupCodesLeft).toBe(1);
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
