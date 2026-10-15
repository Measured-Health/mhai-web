import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient } from "@/lib/auth/mock";
import { AuthError, type AuthClient } from "@/lib/auth/types";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { GuestGate } from "./guest-gate";
import { SignInForm } from "./sign-in-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

const page = (client: AuthClient = createMockAuthClient()) =>
  renderWithAuth(
    <GuestGate>
      <SignInForm />
    </GuestGate>,
    null,
    client,
  );
async function signIn(login: string, password: string) {
  const user = userEvent.setup();
  if (login) await user.type(screen.getByLabelText("Work email"), login);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInForm", () => {
  it("signs a clinician in and goes home", async () => {
    page();
    await signIn("a.reyes@havanahospital.org", "pw");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("goes to the code step when two-step is on", async () => {
    page();
    await signIn("mfa@h.org", "pw");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in/code"));
  });

  it("says what's missing and sends nothing", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "signIn");
    page(client);
    await signIn("", "");
    expect(screen.getByText("Enter your work email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("explains a wrong password with the attempts left", async () => {
    page();
    await signIn("x@h.org", "wrong");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password don't match.");
    expect(alert).toHaveTextContent("4 attempts left before a 15-minute lock.");
    expect(
      screen.getByRole("link", { name: "Reset your password" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("never guesses attempts the backend didn't send", async () => {
    const client = createMockAuthClient();
    vi.spyOn(client, "signIn").mockRejectedValue(
      new AuthError("invalid_credentials"),
    );
    page(client);
    await signIn("x@h.org", "pw");
    expect(await screen.findByRole("alert")).not.toHaveTextContent(
      /attempts? left/,
    );
  });

  it("tells a locked account to wait", async () => {
    page();
    await signIn("locked@h.org", "pw");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your account is locked for 15 minutes.",
    );
  });

  it("blames the connection, not the password, when the API is down", async () => {
    const client = createMockAuthClient();
    vi.spyOn(client, "signIn").mockRejectedValue(new TypeError("fetch failed"));
    page(client);
    await signIn("x@h.org", "pw");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We can't reach MHAI right now.");
    expect(alert).not.toHaveTextContent(/match/);
  });

  it("hides what the backend can't do", () => {
    const client = createMockAuthClient();
    Object.assign(client, {
      capabilities: {
        sso: false,
        emailLogin: false,
        passwordReset: false,
        devices: false,
        trustDevice: false,
      },
    });
    page(client);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /hospital account/ }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Forgot?" })).toBeNull();
  });

  it("signs in with the hospital account in the demo", async () => {
    page();
    await userEvent.click(
      screen.getByRole("button", { name: "Continue with hospital account" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("fills the form from a sample account", async () => {
    page();
    await userEvent.click(
      screen.getByRole("button", {
        name: /Use New account \(new\.bello@havanahospital\.org\)/,
      }),
    );
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "new.bello@havanahospital.org",
    );
    expect(screen.getByLabelText("Password")).toHaveValue("demo-password");
  });
});
