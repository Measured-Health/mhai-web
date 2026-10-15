import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient, MOCK_RESET_TOKEN } from "@/lib/auth/mock";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { ForgotPassword } from "./forgot-password";
import { ResetPassword } from "./reset-password";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => search,
}));
beforeEach(() => {
  search = new URLSearchParams();
});
afterEach(() => vi.useRealTimers());

describe("ForgotPassword", () => {
  it("sends the link and shows the same reply for any email", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "requestPasswordReset");
    renderWithAuth(<ForgotPassword />, null, client);
    await userEvent.type(screen.getByLabelText("Work email"), "who@ever.org");
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/If an account exists for/)).toHaveTextContent(
      "who@ever.org",
    );
    expect(spy).toHaveBeenCalledWith("who@ever.org");
    expect(window.location.search).not.toMatch(/who/);
  });

  it("waits 60 seconds before allowing a resend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithAuth(<ForgotPassword />, null);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText("Work email"), "a@h.org");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    const resend = await screen.findByRole("button", { name: /Resend link/ });
    expect(resend).toBeDisabled();
    expect(resend).toHaveTextContent("1:00");
    for (let i = 0; i < 60; i++) act(() => vi.advanceTimersByTime(1000));
    expect(resend).toBeEnabled();
  });

  it("checks the email looks right before sending", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "requestPasswordReset");
    renderWithAuth(<ForgotPassword />, null, client);
    await userEvent.type(screen.getByLabelText("Work email"), "not-an-email");
    await userEvent.click(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    expect(
      screen.getByText("Enter a work email, like name@hospital.org."),
    ).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("points to the admin when reset isn't supported", () => {
    const client = createMockAuthClient();
    Object.assign(client, {
      capabilities: { ...client.capabilities, passwordReset: false },
    });
    renderWithAuth(<ForgotPassword />, null, client);
    expect(
      screen.getByText("Ask your hospital admin to reset your password."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Work email")).toBeNull();
  });
});

describe("ResetPassword", () => {
  it("strips the token from the address bar, then saves the new password", async () => {
    window.history.replaceState(
      null,
      "",
      `/reset-password?token=${MOCK_RESET_TOKEN}`,
    );
    search = new URLSearchParams({ token: MOCK_RESET_TOKEN });
    renderWithAuth(<ResetPassword />, null);
    expect(window.location.search).toBe("");
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save new password" }),
    );
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    search = new URLSearchParams({ token: "old" });
    renderWithAuth(<ResetPassword />, null);
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await userEvent.type(
      screen.getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save new password" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link has expired or was already used.",
    );
    expect(
      screen.getByRole("link", { name: "Send a new link" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("handles a link with no token", () => {
    renderWithAuth(<ResetPassword />, null);
    expect(
      screen.getByText("This link is missing or incomplete."),
    ).toBeInTheDocument();
  });
});
