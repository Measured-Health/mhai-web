import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { createMockAuthClient, MOCK_BACKUP_CODES } from "@/lib/auth/mock";
import { AuthError } from "@/lib/auth/types";
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
    // Focus moves in an effect after the error renders.
    await waitFor(() =>
      expect(screen.getByLabelText("Digit 1 of 6")).toHaveFocus(),
    );
  });

  it("accepts a backup code, shows the new one, and goes home only after Continue", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      await pending();
      await user.click(
        screen.getByRole("button", { name: "Use a backup code" }),
      );
      await user.type(
        screen.getByLabelText("Backup code"),
        MOCK_BACKUP_CODES[0],
      );
      await user.click(screen.getByRole("button", { name: "Verify" }));
      expect(
        await screen.findByRole("heading", {
          name: "Save your new backup code",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Your backup code" }),
      ).toHaveTextContent(MOCK_BACKUP_CODES[1]);
      expect(auth.status).toBe("signed_in");
      expect(auth.user?.backupCodesLeft).toBe(1);
      // Nowhere but the screen: not the URL, not browser storage.
      expect(replace).not.toHaveBeenCalledWith("/");
      expect(
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ).not.toContain(MOCK_BACKUP_CODES[1]);
      const go = screen.getByRole("button", { name: "Continue" });
      await user.click(go);
      expect(replace).not.toHaveBeenCalledWith("/");
      act(() => vi.advanceTimersByTime(3000));
      await user.click(go);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
      expect(auth.newBackupCode).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a backup code that isn't the current one is refused", async () => {
    await pending();
    await userEvent.click(
      screen.getByRole("button", { name: "Use a backup code" }),
    );
    await userEvent.type(
      screen.getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[1],
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That backup code didn't work.",
    );
  });

  it("a sign-in refused after the backup code was spent shows the new one, then the refusal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      const client = createMockAuthClient();
      vi.spyOn(client, "verifyCode").mockRejectedValue(
        new AuthError("unavailable", undefined, "rrrrr-sssss"),
      );
      renderWithAuth(
        <>
          <Grab />
          <CodeForm />
        </>,
        null,
        client,
      );
      await act(() => auth.signIn("mfa@h.org", "pw"));
      await user.click(
        screen.getByRole("button", { name: "Use a backup code" }),
      );
      await user.type(
        screen.getByLabelText("Backup code"),
        MOCK_BACKUP_CODES[0],
      );
      await user.click(screen.getByRole("button", { name: "Verify" }));
      expect(
        await screen.findByRole("group", { name: "Your backup code" }),
      ).toHaveTextContent("rrrrr-sssss");
      // Not signed in: no way to the account page from here.
      expect(
        screen.queryByRole("link", { name: /Lost your phone/ }),
      ).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      act(() => vi.advanceTimersByTime(3000));
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("rrrrr-sssss")).toBeNull();
      expect(auth.newBackupCode).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the refusal the page keeps holds no code; the code is held for the screen", async () => {
    const client = createMockAuthClient();
    vi.spyOn(client, "verifyCode").mockRejectedValue(
      new AuthError("unavailable", undefined, "rrrrr-sssss"),
    );
    renderWithAuth(<Grab />, null, client);
    await act(() => auth.signIn("mfa@h.org", "pw"));
    let refusal: unknown;
    await act(async () => {
      refusal = await auth
        .verifyCode(MOCK_BACKUP_CODES[0], { backup: true, trustDevice: false })
        .catch((e: unknown) => e);
    });
    expect(refusal).toBeInstanceOf(AuthError);
    expect(refusal).toMatchObject({ code: "unavailable" });
    expect((refusal as AuthError).newBackupCode).toBeUndefined();
    expect(auth.newBackupCode).toBe("rrrrr-sssss");
  });

  it("a two-step code shows no backup code screen", async () => {
    await pending();
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Save your new backup code")).toBeNull();
    expect(auth.newBackupCode).toBeNull();
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

  it("shows the live demo's two-step code in the live demo only", async () => {
    await pending();
    expect(screen.queryByLabelText("Demo two-step code")).toBeNull();
    cleanup();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "true");
    try {
      await pending();
      // The code is made asynchronously (Web Crypto); the box shows first.
      await waitFor(() =>
        expect(screen.getByLabelText("Demo two-step code")).toHaveTextContent(
          /\d{6}/,
        ),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
