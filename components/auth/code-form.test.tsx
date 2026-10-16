import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { createMockAuthClient, MOCK_BACKUP_CODES } from "@/lib/auth/mock";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { CodeForm } from "./code-form";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

let auth: ReturnType<typeof useAuth>;
function Grab() {
  const a = useAuth();
  useEffect(() => {
    auth = a;
  });
  return null;
}
async function pending() {
  renderWithAuth(
    <>
      <Grab />
      <CodeForm />
    </>,
    null,
  );
  await act(() => auth.signIn("mfa@h.org", "pw"));
}

describe("CodeForm", () => {
  it("verifies a six-digit code and goes home", async () => {
    await pending();
    const verify = screen.getByRole("button", { name: "Verify" });
    expect(verify).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    // The sixth digit submits on its own.
    await userEvent.keyboard("123456");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("clears the boxes after a wrong code", async () => {
    await pending();
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code didn't work.",
    );
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveFocus();
  });

  it("accepts a backup code instead", async () => {
    await pending();
    await userEvent.click(
      screen.getByRole("button", { name: "Use a backup code" }),
    );
    await userEvent.type(
      screen.getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[1]!,
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("offers to trust the device only when supported", async () => {
    await pending();
    expect(
      screen.getByLabelText("Trust this device for 30 days"),
    ).toBeInTheDocument();
  });

  it("sends a deep link with nothing pending back to sign-in", async () => {
    renderWithAuth(<CodeForm />, null, createMockAuthClient());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("goes back to sign-in on request", async () => {
    await pending();
    await userEvent.click(
      screen.getByRole("button", { name: "Back to sign in" }),
    );
    expect(auth.mfaPending).toBe(false);
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
