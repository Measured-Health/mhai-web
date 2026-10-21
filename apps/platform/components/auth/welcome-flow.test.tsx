import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_BACKUP_CODES } from "@/lib/api/step-up";
import { NEW_ADMIN_EMAIL } from "@/lib/auth/mock";
import { auth, GrabAuth, renderWithAuth } from "@/tests/render";
import { WelcomeFlow } from "./welcome-flow";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

const SKIP = /skip|later|not now/i;
function expectNoSkip() {
  for (const role of ["button", "link"] as const)
    expect(screen.queryAllByRole(role, { name: SKIP })).toEqual([]);
}

async function startAsNewAdmin() {
  renderWithAuth(
    <>
      <GrabAuth />
      <WelcomeFlow />
    </>,
    { user: null },
  );
  await act(() => auth.current.signIn(NEW_ADMIN_EMAIL, "temporary"));
}

async function passwordAndTerms(user: ReturnType<typeof userEvent.setup>) {
  expect(screen.getByText("Step 1 of 4 · Your password")).toBeInTheDocument();
  expectNoSkip();
  await user.type(screen.getByLabelText("New password"), "tram-lantern-okra");
  await user.type(
    screen.getByLabelText("Confirm password"),
    "tram-lantern-okra",
  );
  await user.click(screen.getByRole("button", { name: "Save password" }));

  expect(
    await screen.findByText("Step 2 of 4 · Terms of use"),
  ).toBeInTheDocument();
  expectNoSkip();
  const go = screen.getByRole("button", { name: "Continue" });
  expect(go).toBeDisabled();
  await user.click(screen.getByLabelText("I understand and agree"));
  await user.click(go);

  expect(
    await screen.findByText("Step 3 of 4 · Protect your account"),
  ).toBeInTheDocument();
  expectNoSkip();
}

describe("WelcomeFlow", () => {
  it("the new admin must set a password, accept terms and set up two-step, with no way to skip", async () => {
    await startAsNewAdmin();
    const user = userEvent.setup();
    await passwordAndTerms(user);

    expect(
      await screen.findByRole("img", {
        name: "QR code for your authenticator app",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");

    expect(
      await screen.findByText("Step 4 of 4 · Backup codes"),
    ).toBeInTheDocument();
    expectNoSkip();
    // Still owed until the codes are saved: no way round.
    expect(auth.current.steps).toEqual(["mfa"]);
    await user.click(
      screen.getByLabelText("I've saved these codes somewhere safe"),
    );
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/hospitals"));
    expect(auth.current.steps).toEqual([]);
    expect(auth.current.user?.mfaEnabled).toBe(true);
  });

  it("a wrong setup code clears the boxes", async () => {
    await startAsNewAdmin();
    const user = userEvent.setup();
    await passwordAndTerms(user);
    await screen.findByRole("img", {
      name: "QR code for your authenticator app",
    });
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code didn't work.",
    );
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveValue("");
  });

  it("backup codes are shown once after two-step setup", async () => {
    await startAsNewAdmin();
    const user = userEvent.setup();
    await passwordAndTerms(user);
    await screen.findByRole("img", {
      name: "QR code for your authenticator app",
    });
    // Not before the code is confirmed.
    expect(screen.queryByRole("list", { name: "Backup codes" })).toBeNull();
    await user.click(screen.getByLabelText("Digit 1 of 6"));
    await user.keyboard("123456");

    const list = await screen.findByRole("list", { name: "Backup codes" });
    expect(list).toHaveTextContent(MOCK_BACKUP_CODES[0]);
    expect(list.querySelectorAll("li")).toHaveLength(10);
    await user.click(
      screen.getByLabelText("I've saved these codes somewhere safe"),
    );
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    // Done: the flow leaves, and the codes are gone from the screen.
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Backup codes" })).toBeNull(),
    );
    expect(screen.queryByText(MOCK_BACKUP_CODES[0])).toBeNull();
    expect(replace).toHaveBeenCalledWith("/hospitals");
  });

  it("sends someone with nothing owed home", () => {
    renderWithAuth(<WelcomeFlow />);
    expect(replace).toHaveBeenCalledWith("/hospitals");
  });

  it("sends a guest to sign-in", () => {
    renderWithAuth(<WelcomeFlow />, { user: null });
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
