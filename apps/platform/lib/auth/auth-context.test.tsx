import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportUnauthorized } from "./events";
import { homeFor, isAuditor, isPlatformAdmin } from "./auth-context";
import {
  ADA,
  AMARA,
  auth,
  FROM_CLIENT,
  GrabAuth,
  renderWithAuth,
  testAuthClient,
} from "@/tests/render";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import {
  handOffHospital,
  takeHandedOffHospital,
} from "@/lib/analysis/scope-handoff";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("auth helpers", () => {
  it("homeFor: /welcome when steps are owed, else /hospitals", () => {
    expect(homeFor({ steps: ["mfa"] })).toBe("/welcome");
    expect(homeFor({ steps: [] })).toBe("/hospitals");
  });

  it("isPlatformAdmin and isAuditor read the roles", () => {
    expect(isPlatformAdmin(ADA)).toBe(true);
    expect(isAuditor(ADA)).toBe(false);
    expect(isPlatformAdmin(AMARA)).toBe(false);
    expect(isAuditor(AMARA)).toBe(true);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isAuditor({ ...ADA, roles: undefined as never })).toBe(false);
  });
});

describe("AuthProvider", () => {
  it("loads the session from the client", async () => {
    const client = testAuthClient();
    await client.signIn(TEAM_EMAILS.ada, "pw");
    await client.verifyCode("123456", { backup: false });
    renderWithAuth(<GrabAuth />, { user: FROM_CLIENT, client });
    await waitFor(() => expect(auth.current.status).toBe("signed_in"));
    expect(auth.current.user?.email).toBe(TEAM_EMAILS.ada);
  });

  it("is signed out when there is no session", async () => {
    renderWithAuth(<GrabAuth />, { user: FROM_CLIENT });
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
  });

  it("a live call finding the session gone signs out with reason expired", async () => {
    renderWithAuth(<GrabAuth />);
    act(() => reportUnauthorized());
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
    expect(auth.current.signedOutReason).toBe("expired");
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("sign-out happens once however often it is asked", async () => {
    const client = testAuthClient();
    const signOut = vi.spyOn(client, "signOut");
    renderWithAuth(<GrabAuth />, { client });
    await act(async () => {
      await Promise.all([
        auth.current.signOut("manual"),
        auth.current.signOut("idle"),
      ]);
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(auth.current.signedOutReason).toBe("manual");
  });

  it("sign-out drops a hospital handed to Analysis, so the next person never opens on it", async () => {
    renderWithAuth(<GrabAuth />);
    handOffHospital("h_havana");
    await act(() => auth.current.signOut("manual"));
    expect(takeHandedOffHospital()).toBeNull();
  });

  it("a new sign-in clears the notice", async () => {
    renderWithAuth(<GrabAuth />);
    await act(() => auth.current.signOut("idle"));
    expect(auth.current.signedOutReason).toBe("idle");
    await act(() => auth.current.signIn(TEAM_EMAILS.ada, "pw"));
    expect(auth.current.mfaPending).toBe(true);
    await act(() => auth.current.verifyCode("123456", { backup: false }));
    expect(auth.current.signedOutReason).toBeNull();
    expect(auth.current.status).toBe("signed_in");
  });

  it("nothing is written to browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderWithAuth(<GrabAuth />, { user: null });
    await act(() => auth.current.signIn(TEAM_EMAILS.ada, "pw"));
    await act(() => auth.current.verifyCode("123456", { backup: false }));
    await act(() => auth.current.signOut("manual"));
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    setItem.mockRestore();
  });
});
