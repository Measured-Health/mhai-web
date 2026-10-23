import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, renderWithAuth } from "@/tests/render";
import { SettingsView } from "./settings-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function install(over: Partial<PlatformClient> = {}) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  const api = { ...m, ...over } as PlatformClient;
  __setPlatformClientForTests(api);
  return { m, api };
}
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

describe("the Settings page", () => {
  it("the top bar reads Settings, then the changes waiting, records retention, triage and the learning data", async () => {
    install();
    renderWithAuth(<SettingsView />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeInTheDocument();
    await screen.findByRole("region", { name: "Records retention" });
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Changes waiting for approval",
      "Records retention",
      "Triage",
      "Clear unapproved learning data",
    ]);
  });

  it("a failed read shows each section's own Couldn't load, and Try again reads again", async () => {
    const { m } = install();
    let fail = true;
    const get = vi.fn(async () => {
      if (fail) throw new ApiError(503, "unavailable");
      return m.getSettings();
    });
    install({ getSettings: get });
    renderWithAuth(<SettingsView />);
    expect(
      await screen.findByText(
        "Couldn't load the changes waiting for approval.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't load records retention."),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn't load triage.")).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't load the learning data."),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(
      screen.getAllByRole("button", { name: "Try again" })[0]!,
    );
    await waitFor(() =>
      expect(screen.queryByText(/^Couldn't load/)).toBeNull(),
    );
    expect(
      screen.getByRole("region", { name: "Records retention" }),
    ).toBeInTheDocument();
  });

  it("an unknown value fails its own section only", async () => {
    const { m } = install();
    install({
      getSettings: async () => {
        const s = await m.getSettings();
        (s.retention.items[2] as { type: string }).type = "backups";
        return s;
      },
    });
    renderWithAuth(<SettingsView />);
    expect(
      await screen.findByText("Couldn't load records retention."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No changes waiting for approval."),
    ).toBeInTheDocument();
  });
});
