import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { createMockAuthClient } from "@/lib/auth/mock";
import { FROM_CLIENT, renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { AuthGate } from "./auth-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

const Clinical = vi.fn(() => <p>clinical screen</p>);
async function newUserClient() {
  const client = createMockAuthClient();
  await client.signIn("new@h.org", "pw");
  return client;
}
const gated = () => (
  <AuthGate>
    <Clinical />
  </AuthGate>
);

describe("AuthGate", () => {
  it("shows the clinical app to a signed-in clinician", () => {
    renderWithAuth(gated());
    expect(screen.getByText("clinical screen")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
  it("sends a signed-out visitor to sign in, mounting nothing", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("sends an admin to the 403 page, mounting nothing clinical", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), { ...TEST_USER, role: "admin" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/no-access"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("sends someone with first sign-in steps owed to /welcome", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), FROM_CLIENT, await newUserClient());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("still redirects to sign-in after a sign-out, mounting nothing", async () => {
    function Out() {
      const { signOut } = useAuth();
      return <button onClick={() => void signOut("manual")}>out</button>;
    }
    renderWithAuth(
      <>
        <Out />
        {gated()}
      </>,
    );
    expect(screen.getByText("clinical screen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("out"));
    await waitFor(() =>
      expect(screen.queryByText("clinical screen")).not.toBeInTheDocument(),
    );
    // signOut navigates once, and the gate redirects too (Back-safe).
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace).toHaveBeenNthCalledWith(1, "/sign-in");
    expect(replace).toHaveBeenNthCalledWith(2, "/sign-in");
  });
});
