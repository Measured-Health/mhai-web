import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { createMockAuthClient } from "@/lib/auth/mock";
import type { Area, Role } from "@/lib/auth/types";
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
const gated = (need?: Area | "any") => (
  <AuthGate need={need}>
    <Clinical />
  </AuthGate>
);
const as = (...roles: Role[]) => ({ ...TEST_USER, roles });

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
    renderWithAuth(gated(), { ...TEST_USER, roles: ["admin"] });
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
  it("sends an admin-only person from a clinical page to Staff, mounting nothing (Review Focus 5)", async () => {
    Clinical.mockClear();
    renderWithAuth(gated("clinical"), as("hospital_admin"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("sends a clinician who isn't an admin from an admin page home", async () => {
    Clinical.mockClear();
    renderWithAuth(gated("admin"), as("clinician"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("lets a medical director into both sides", () => {
    renderWithAuth(
      <>
        {gated("clinical")}
        {gated("admin")}
      </>,
      as("clinician", "hospital_admin"),
    );
    expect(screen.getAllByText("clinical screen")).toHaveLength(2);
    expect(replace).not.toHaveBeenCalled();
  });
  it("the shared shell admits both roles but never a platform account", async () => {
    const { unmount } = renderWithAuth(gated("any"), as("hospital_admin"));
    expect(screen.getByText("clinical screen")).toBeInTheDocument();
    unmount();
    Clinical.mockClear();
    renderWithAuth(gated("any"), as("auditor"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/no-access"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  // Amendment 3: every hospital admin needs two-step before any page.
  it.each([
    ["an admin-only person", ["hospital_admin"]],
    ["a medical director", ["clinician", "hospital_admin"]],
  ] as [string, Role[]][])(
    "sends %s without two-step to the setup step from every side",
    async (_who, roles) => {
      for (const need of ["clinical", "admin", "any"] as const) {
        Clinical.mockClear();
        replace.mockClear();
        const { unmount } = renderWithAuth(gated(need), {
          ...as(...roles),
          mfaEnabled: false,
        });
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
        expect(replace).toHaveBeenCalledTimes(1);
        expect(Clinical).not.toHaveBeenCalled();
        unmount();
      }
    },
  );
  it("doesn't ask a clinician who isn't an admin for two-step", () => {
    renderWithAuth(gated("clinical"), { ...TEST_USER, mfaEnabled: false });
    expect(screen.getByText("clinical screen")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
