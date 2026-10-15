import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { SignOut } from "./sign-out";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("SignOut", () => {
  it("signs out and lands on sign-in", async () => {
    renderWithAuth(<SignOut />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it("sends a signed-out visitor to sign-in", async () => {
    renderWithAuth(<SignOut />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});
