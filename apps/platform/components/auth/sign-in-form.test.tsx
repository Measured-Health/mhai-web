import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { auth, GrabAuth, renderWithAuth, testAuthClient } from "@/tests/render";
import { CodeForm } from "./code-form";
import { GuestGate } from "./guest-gate";
import { SignInForm } from "./sign-in-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

/** The sign-in page, then the code page once a code is owed. */
function Pages() {
  const a = useAuth();
  return a.mfaPending ? (
    <CodeForm />
  ) : (
    <GuestGate>
      <SignInForm />
    </GuestGate>
  );
}

async function signInWith(email: string, password = "any-password") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Work email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("SignInForm", () => {
  it("has the platform heading and fields", () => {
    renderWithAuth(<SignInForm />, { user: null });
    expect(
      screen.getByRole("heading", { name: "Sign in to MHAI Platform" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("signs in as Ada with password then code and lands on /hospitals", async () => {
    renderWithAuth(
      <>
        <GrabAuth />
        <Pages />
      </>,
      { user: null },
    );
    const user = await signInWith(TEAM_EMAILS.ada);
    expect(push).toHaveBeenCalledWith("/sign-in/code");
    expect(
      await screen.findByText(
        "Enter the 6-digit code from your authenticator app",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/hospitals"));
    expect(auth.current.status).toBe("signed_in");
    expect(auth.current.user?.email).toBe(TEAM_EMAILS.ada);
  });

  it("a clinician email shows the can't-use message and stays signed out", async () => {
    const client = testAuthClient();
    renderWithAuth(
      <>
        <GrabAuth />
        <Pages />
      </>,
      { user: null, client },
    );
    await signInWith("a.reyes@havanahospital.org");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account can't use the platform admin app.",
    );
    expect(auth.current.status).toBe("signed_out");
    expect(auth.current.mfaPending).toBe(false);
    expect(await client.getSession()).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("a wrong password shows the error", async () => {
    renderWithAuth(<SignInForm />, { user: null });
    await signInWith(TEAM_EMAILS.ada, "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email and password don't match.",
    );
  });

  it("asks for a missing email", async () => {
    renderWithAuth(<SignInForm />, { user: null });
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your work email.")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveFocus();
  });

  it("no trust-this-device control exists", async () => {
    const { container } = renderWithAuth(
      <>
        <GrabAuth />
        <Pages />
      </>,
      { user: null },
    );
    expect(screen.queryByText(/trust/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await signInWith(TEAM_EMAILS.ada);
    await screen.findByText(
      "Enter the 6-digit code from your authenticator app",
    );
    expect(screen.queryByText(/trust|remember/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.textContent).not.toMatch(/30 days/);
  });
});
