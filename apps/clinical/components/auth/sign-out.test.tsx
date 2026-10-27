import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/auth-context";
import { OutboxProvider, useOutbox } from "@/lib/offline/outbox-context";
import { AuthTestProvider, renderWithAuth } from "@/tests/auth-wrapper";
import { SignOut } from "./sign-out";

const replace = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back }),
}));
beforeEach(async () => {
  replace.mockClear();
  back.mockClear();
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase("mhai-outbox");
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});

afterEach(() => vi.restoreAllMocks());

const Q = {
  clinical_question: "Central chest pain for 40 minutes. Likely diagnosis?",
  urgency: "urgent" as const,
  patient_data: { age: 54, sex: "male" as const, symptoms: ["Chest pain"] },
};

/** Queues one question, then opens /sign-out. */
function QueueThenSignOut() {
  const { queueQuery, items } = useOutbox();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void queueQuery(Q);
  }, [queueQuery]);
  return items.length ? <SignOut /> : null;
}
function Status() {
  return <output data-testid="auth">{useAuth().status}</output>;
}
// Offline, so the queued item stays unsent (online it would sync away).
const mountWithUnsent = () =>
  act(async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(
      <AuthTestProvider>
        <OutboxProvider>
          <Status />
          <QueueThenSignOut />
        </OutboxProvider>
      </AuthTestProvider>,
    );
  });

/**
 * If /sign-out is kept alive (React <Activity>), it stays mounted, hidden,
 * after a sign-out and is shown again on the next one.
 */
function KeptAlive() {
  const [mode, setMode] = useState<"visible" | "hidden">("visible");
  const { signIn } = useAuth();
  return (
    <>
      <button type="button" onClick={() => setMode("hidden")}>
        leave
      </button>
      <button type="button" onClick={() => void signIn("a@b.org", "x")}>
        sign in
      </button>
      <button type="button" onClick={() => setMode("visible")}>
        sign out again
      </button>
      <Status />
      <Activity mode={mode}>
        <SignOut />
      </Activity>
    </>
  );
}

describe("SignOut", () => {
  it("signs out again when the kept-alive page is shown a second time", async () => {
    renderWithAuth(<KeptAlive />);
    await waitFor(() =>
      expect(screen.getByTestId("auth")).toHaveTextContent("signed_out"),
    );
    await userEvent.click(screen.getByRole("button", { name: "leave" }));
    await userEvent.click(screen.getByRole("button", { name: "sign in" }));
    await waitFor(() =>
      expect(screen.getByTestId("auth")).toHaveTextContent("signed_in"),
    );
    replace.mockClear();
    await userEvent.click(
      screen.getByRole("button", { name: "sign out again" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth")).toHaveTextContent("signed_out"),
    );
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("signs out and lands on sign-in", async () => {
    renderWithAuth(<SignOut />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it("sends a signed-out visitor to sign-in", async () => {
    renderWithAuth(<SignOut />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
  it("asks before deleting unsent items; Stay signed in goes back", async () => {
    await mountWithUnsent();
    expect(
      await screen.findByRole("heading", { name: "You have 1 unsent item" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Signing out deletes them from this device."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Stay signed in" }),
    );
    expect(back).toHaveBeenCalled();
    expect(screen.getByTestId("auth")).toHaveTextContent("signed_in");
  });
  it("Sign out and delete clears the items, then signs out once", async () => {
    await mountWithUnsent();
    await userEvent.click(
      await screen.findByRole("button", { name: "Sign out and delete" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth")).toHaveTextContent("signed_out"),
    );
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it("still tries to delete unsent items when the outbox couldn't be read", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); // no sync
    const dbs = vi
      .spyOn(indexedDB, "databases")
      .mockRejectedValue(new Error("broken"));
    render(
      <AuthTestProvider>
        <OutboxProvider>
          <Status />
          <SignOut />
        </OutboxProvider>
      </AuthTestProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth")).toHaveTextContent("signed_out"),
    );
    // Once for the first read, once more for the best-effort delete.
    expect(dbs).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });
});
