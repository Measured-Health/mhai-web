import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createStepUp, MOCK_BACKUP_CODES } from "@/lib/api/step-up";
import { createMockAuthClient } from "@/lib/auth/mock";
import { useAuth } from "@/lib/auth/auth-context";
import { auth, GrabAuth, renderWithAuth, testAuthClient } from "@/tests/render";
import { CodeForm } from "./code-form";
import { SignInForm } from "./sign-in-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

async function pending(
  client = createMockAuthClient({ stepUp: createStepUp() }),
) {
  renderWithAuth(
    <>
      <GrabAuth />
      <CodeForm />
    </>,
    { user: null, client },
  );
  await act(() => auth.current.signIn(TEAM_EMAILS.ada, "pw"));
}

const digits = () =>
  Array.from({ length: 6 }, (_, i) =>
    screen.getByLabelText(`Digit ${i + 1} of 6`),
  );

describe("CodeForm", () => {
  it("asks for the authenticator code", async () => {
    await pending();
    expect(
      screen.getByText("Enter the 6-digit code from your authenticator app"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use a backup code instead" }),
    ).toBeInTheDocument();
  });

  it("a wrong code shows the error and clears the input", async () => {
    await pending();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code didn't work.",
    );
    for (const d of digits()) expect(d).toHaveValue("");
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveFocus();
    expect(auth.current.status).not.toBe("signed_in");
  });

  it("five wrong codes show 'Too many wrong codes. Try again in 15 minutes.'", async () => {
    await pending();
    const user = userEvent.setup();
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByLabelText("Digit 1 of 6"));
      await user.keyboard("000000");
      await screen.findByRole("alert");
    }
    // Locked: even the right code is refused now.
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many wrong codes. Try again in 15 minutes.",
      ),
    );
    expect(auth.current.status).not.toBe("signed_in");
  });

  it("accepts a backup code instead, and it is spent", async () => {
    const stepUp = createStepUp();
    await pending(createMockAuthClient({ stepUp }));
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Use a backup code instead" }),
    );
    await user.type(screen.getByLabelText("Backup code"), MOCK_BACKUP_CODES[1]);
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/hospitals"));
    // The step-ups share the same codes: it can't be used again.
    expect(stepUp.takeBackup(MOCK_BACKUP_CODES[1])).toBe(false);
  });

  it("after a wrong backup code the focus is on the backup field", async () => {
    await pending();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Use a backup code instead" }),
    );
    await user.type(screen.getByLabelText("Backup code"), "AAAA-BBBB");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That backup code didn't work.",
    );
    expect(screen.getByLabelText("Backup code")).toHaveValue("");
    expect(screen.getByLabelText("Backup code")).toHaveFocus();
  });

  it("a hospital account turned away at the code step is told why on the sign-in page", async () => {
    const client = testAuthClient();
    vi.spyOn(client, "verifyCode").mockResolvedValue({
      status: "not_platform",
    });
    function Pages() {
      return useAuth().mfaPending ? <CodeForm /> : <SignInForm />;
    }
    renderWithAuth(
      <>
        <GrabAuth />
        <Pages />
      </>,
      { user: null, client },
    );
    await act(() => auth.current.signIn(TEAM_EMAILS.ada, "pw"));
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account can't use the platform admin app.",
    );
    expect(
      screen.getByRole("heading", { name: "Sign in to MHAI Platform" }),
    ).toBeInTheDocument();
    expect(auth.current.status).toBe("signed_out");
    expect(auth.current.signedOutReason).toBe("not_platform");
    expect(await client.getSession()).toBeNull();
  });

  it("sends a deep link with nothing pending back to sign-in", () => {
    renderWithAuth(<CodeForm />, { user: null });
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
