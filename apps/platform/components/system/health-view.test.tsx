import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import type { HealthMode } from "@/lib/api/ops-fixtures";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { HealthView } from "./health-view";
import { SystemTabs } from "./system-tabs";

const env = vi.hoisted(() => ({ online: true, path: "/system/health" }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => env.online }));
vi.mock("next/navigation", () => ({
  usePathname: () => env.path,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
function install(health: HealthMode = "normal") {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
    health,
  });
  __setPlatformClientForTests(api);
}
function setVisible(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => v,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  env.online = true;
  env.path = "/system/health";
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
  install();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setVisible("visible");
  __resetPlatformClientForTests();
});

const overall = () => screen.getByRole("region", { name: "Overall" });
const section = (n: string) => screen.getByRole("region", { name: n });
async function open(user = ADA) {
  renderWithAuth(<HealthView />, { user });
  await screen.findByRole("region", { name: "Overall" });
}

describe("the Health tab", () => {
  it("normal shows Working normally with an icon, every part, the queue, failed jobs, times, errors", async () => {
    await open();
    expect(
      await within(overall()).findByText("Working normally"),
    ).toBeInTheDocument();
    expect(overall().querySelector("svg")).not.toBeNull();
    expect(
      within(overall()).getByText(/^Updated \d{2}:\d{2}$/),
    ).toBeInTheDocument();
    const parts = await screen.findByRole("list", {
      name: "Parts of the system",
    });
    for (const w of [
      "Sign-in and the app · Working normally",
      "Answering questions · Working normally",
      "Checking evidence · Working normally",
      "Reading documents · Working normally",
      "Finding guidelines · Working normally",
      "Records clean-up · Working normally",
    ])
      expect(within(parts).getByText(w)).toBeInTheDocument();
    expect(
      within(parts).getByText(/^Last run .* · finished$/),
    ).toBeInTheDocument();
    expect(within(parts).getByText("Triage · Off")).toBeInTheDocument();
    expect(
      screen.getByText("Questions waiting: 2 · oldest 3 s"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Failed jobs: \d+ · \d+ new in the last 24 hours$/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View failed jobs" }),
    ).toHaveAttribute("href", "/system/jobs");
    const times = section("Answer times");
    expect(
      within(times).getAllByText("Half within 2.4 s · 95 in 100 within 6.1 s"),
    ).toHaveLength(1);
    expect(within(times).getAllByText("Writing the answer")).toHaveLength(2);
    expect(within(times).getByText("Last hour")).toBeInTheDocument();
    expect(within(times).getByText("Last 24 hours")).toBeInTheDocument();
    const errors = section("Recent errors");
    expect(within(errors).getByText("Took too long")).toBeInTheDocument();
    expect(within(errors).getByText("Unreadable document")).toBeInTheDocument();
  });

  it("problem shows Having problems and Reading documents · Having problems", async () => {
    install("problem");
    await open();
    expect(
      await within(overall()).findByText("Having problems"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Reading documents · Having problems"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Questions waiting: 31 · oldest 7 min"),
    ).toBeInTheDocument();
  });

  it("slow shows Slower than usual", async () => {
    install("slow");
    await open();
    expect(
      await within(overall()).findByText("Slower than usual"),
    ).toBeInTheDocument();
  });

  it("stale shows Couldn't check with Last good reading and no figures", async () => {
    install("stale");
    await open();
    expect(
      await within(overall()).findByText("Couldn't check"),
    ).toBeInTheDocument();
    expect(
      within(overall()).getByText(/^Last good reading /),
    ).toBeInTheDocument();
    expect(within(overall()).queryByText("Working normally")).toBeNull();
    expect(screen.queryByText(/Questions waiting/)).toBeNull();
    expect(screen.queryByText(/Half within/)).toBeNull();
    expect(screen.queryByText(/Failed jobs:/)).toBeNull();
    expect(screen.queryByText(/Working normally/)).toBeNull();
  });

  it("unavailable shows Couldn't check and No reading yet, never zeros", async () => {
    install("unavailable");
    await open();
    expect(
      await within(overall()).findByText("Couldn't check"),
    ).toBeInTheDocument();
    expect(within(overall()).getByText("No reading yet")).toBeInTheDocument();
    expect(screen.queryByText(/Questions waiting/)).toBeNull();
    expect(screen.queryByText(/: 0/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("it polls every 30 s while visible and not while hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi.spyOn(api, "getHealth");
    await open();
    await within(overall()).findByText("Working normally");
    expect(read).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    expect(read).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(read).toHaveBeenCalledTimes(3);

    await act(async () => setVisible("hidden"));
    const before = read.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(read).toHaveBeenCalledTimes(before);

    // Shown again after a long while: the first paint is Couldn't check,
    // then a fresh reading replaces it.
    await act(async () => setVisible("visible"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(read.mock.calls.length).toBeGreaterThan(before);
    expect(
      await within(overall()).findByText("Working normally"),
    ).toBeInTheDocument();
  });

  it("does not poll while offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    env.online = false;
    const read = vi.spyOn(api, "getHealth");
    await open();
    await within(overall()).findByText("Working normally");
    await act(() => vi.advanceTimersByTimeAsync(130_000));
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeDisabled();
    expect(
      screen.getByText("You're offline. This needs a connection."),
    ).toBeInTheDocument();
  });

  it("polls send background; Refresh now doesn't", async () => {
    const read = vi.spyOn(api, "getHealth");
    await open();
    await within(overall()).findByText("Working normally");
    expect(read).toHaveBeenLastCalledWith({ background: true });
    await userEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenLastCalledWith({ background: false });
  });

  it("the demo switch shows only in the demo and changes the status", async () => {
    await open();
    await within(overall()).findByText("Working normally");
    expect(screen.queryByRole("group", { name: "Sample data" })).toBeNull();
  });

  it("the demo switch changes the status in the demo", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    await open();
    await within(overall()).findByText("Working normally");
    const group = screen.getByRole("group", { name: "Sample data" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.parentElement?.textContent),
    ).toEqual(["Normal", "Slower", "Problems"]);
    await userEvent.click(
      within(group).getByRole("radio", { name: "Problems" }),
    );
    expect(
      await within(overall()).findByText("Having problems"),
    ).toBeInTheDocument();
    await userEvent.click(within(group).getByRole("radio", { name: "Slower" }));
    expect(
      await within(overall()).findByText("Slower than usual"),
    ).toBeInTheDocument();
  });

  it("versions are collapsed", async () => {
    await open();
    await screen.findByRole("list", { name: "Parts of the system" });
    const details = screen.getByText("Versions").closest("details")!;
    expect(details).not.toHaveAttribute("open");
  });

  it("a block that fails alone says so and the rest stays", async () => {
    const real = api.getHealth.bind(api);
    vi.spyOn(api, "getHealth").mockImplementation(async (o) => ({
      ...(await real(o)),
      queue: { waiting: -1, oldest_wait_s: null },
    }));
    await open();
    expect(
      await screen.findByText("Couldn't load the questions waiting."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Parts of the system" }),
    ).toBeInTheDocument();
  });

  it("an auditor sees the same page", async () => {
    await open(AMARA);
    expect(
      await within(overall()).findByText("Working normally"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("list", { name: "Parts of the system" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeEnabled();
  });
});

describe("the System tabs", () => {
  it("Health is current on /system/health", () => {
    renderWithAuth(<SystemTabs />);
    expect(screen.getByRole("link", { name: "Health" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Failed jobs" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Failed jobs" })).toHaveAttribute(
      "href",
      "/system/jobs",
    );
  });

  it("Failed jobs is current on /system/jobs", () => {
    env.path = "/system/jobs";
    renderWithAuth(<SystemTabs />);
    expect(screen.getByRole("link", { name: "Failed jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Health" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
