import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveAuthClient } from "@/lib/auth/live";
import { IdleGuard, TAB_CHANNEL } from "@/components/states/idle-guard";
import { auth, GrabAuth, renderWithAuth } from "@/tests/render";
import { DevicesSection } from "./devices-section";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useRouter: () => ({ push: vi.fn(), replace }),
}));

/** jsdom has no BroadcastChannel: an in-memory one, delivered at once. */
class FakeChannel {
  static open = new Set<FakeChannel>();
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.add(this);
  }
  postMessage(data: unknown) {
    for (const c of [...FakeChannel.open])
      if (c !== this && c.name === this.name)
        c.onmessage?.({ data: structuredClone(data) });
  }
  close() {
    FakeChannel.open.delete(this);
  }
}

beforeEach(() => {
  replace.mockClear();
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});
afterEach(() => {
  vi.unstubAllGlobals();
  FakeChannel.open.clear();
});

/** The live client over a fake BFF, recording each call as "METHOD path". */
function liveClient(failDevice?: string) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/auth/devices" && init?.method === "GET")
      return Response.json([
        { id: "this", label: "This laptop", current: true },
        { id: "phone_1", label: "Phone", current: false },
      ]);
    if (failDevice && url === `/api/auth/devices/${failDevice}`)
      return Response.json({ code: "unavailable" }, { status: 503 });
    return new Response(null, { status: 204 });
  });
  const client = createLiveAuthClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

async function confirmEverywhere(u: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Phone");
  await u.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  const dialog = screen
    .getByRole("heading", { name: "Sign out everywhere?" })
    .closest("dialog")!;
  await u.click(
    within(dialog).getByRole("button", { name: "Sign out everywhere" }),
  );
}

describe("Sign out everywhere", () => {
  it("ends the other sessions, then this one, asking the server to sign out once", async () => {
    const u = userEvent.setup();
    const { client, calls } = liveClient();
    const other = new BroadcastChannel(TAB_CHANNEL);
    const heard: unknown[] = [];
    other.onmessage = (e) => heard.push(e.data);
    renderWithAuth(
      <>
        <GrabAuth />
        <IdleGuard />
        <DevicesSection />
      </>,
      { client },
    );
    await confirmEverywhere(u);
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
    await act(async () => {});
    expect(replace).toHaveBeenCalledWith("/sign-in");
    // The other device first, then this session: one /logout, not two.
    // (Activity's keep-alive, POST /session, is left out.)
    const writes = calls.filter(
      (c) => c.startsWith("DELETE ") || c === "POST /api/auth/logout",
    );
    expect(writes).toEqual([
      "DELETE /api/auth/devices/phone_1",
      "POST /api/auth/logout",
    ]);
    // The other tabs follow to the sign-in page.
    expect(heard).toContainEqual({ type: "signed-out", reason: "manual" });
    other.close();
  });

  it("a device that can't be signed out is reported; this session still ends once", async () => {
    const u = userEvent.setup();
    const { client, calls } = liveClient("phone_1");
    renderWithAuth(
      <>
        <GrabAuth />
        <DevicesSection />
      </>,
      { client },
    );
    await confirmEverywhere(u);
    expect(
      await screen.findByText("We couldn't sign out your other devices."),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c === "POST /api/auth/logout")).toHaveLength(1);
  });
});
