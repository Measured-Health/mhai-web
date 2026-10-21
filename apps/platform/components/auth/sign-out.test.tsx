import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, GrabAuth, renderWithAuth, testAuthClient } from "@/tests/render";
import { SignOut } from "./sign-out";
import { SignInForm } from "./sign-in-form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("SignOut", () => {
  it("signs out, clears the cached data and goes to sign-in", async () => {
    const client = testAuthClient();
    const signOut = vi.spyOn(client, "signOut");
    const queryClient = new QueryClient();
    queryClient.setQueryData(["hospitals"], [{ id: "h_1" }]);
    renderWithAuth(
      <>
        <GrabAuth />
        <SignOut />
      </>,
      { client, queryClient },
    );
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
    expect(auth.current.signedOutReason).toBe("manual");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["hospitals"])).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("the sign-in page then says so", async () => {
    renderWithAuth(
      <>
        <GrabAuth />
        <SignOut />
        <SignInForm />
      </>,
    );
    expect(await screen.findByText("You've signed out.")).toBeInTheDocument();
  });

  it("sends a guest straight to sign-in", () => {
    renderWithAuth(<SignOut />, { user: null });
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
