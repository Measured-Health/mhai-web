import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { ApiError } from "@mhai/api-client/errors";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { AccountView } from "./account-view";
import { AnalyticsEmailSection } from "./analytics-email-section";

const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
function install(email = ADA.email) {
  api = createMockPlatform({ delayMs: 0, me: () => email });
  __setPlatformClientForTests(api);
}
beforeEach(() => {
  net.online = true;
  install();
});
afterEach(() => __resetPlatformClientForTests());

const HELP =
  "Critical-type changes are sent straight away, at most once a day per hospital and measure. Everything else comes in a weekly summary on Mondays at 08:00 (Lagos time). Emails name the hospital and the change and link here. They never include patient details.";

describe("Analytics email", () => {
  it("shows the three modes and the help text, Off chosen by default", async () => {
    renderWithAuth(<AnalyticsEmailSection />);
    const group = await screen.findByRole("radiogroup", {
      name: "Analytics email",
    });
    expect(group).toBeVisible();
    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Critical only" })).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Critical and weekly digest" }),
    ).toBeVisible();
    expect(screen.getByText(HELP)).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Save sends the chosen mode with the version, and it stays", async () => {
    const u = userEvent.setup();
    const set = vi.spyOn(api, "setEmailPref");
    renderWithAuth(<AnalyticsEmailSection />);
    await u.click(
      await screen.findByRole("radio", { name: "Critical and weekly digest" }),
    );
    await u.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        { mode: "critical_and_digest", version: 1 },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
    );
    expect(
      screen.getByRole("radio", { name: "Critical and weekly digest" }),
    ).toBeChecked();
    expect(await api.getEmailPref()).toEqual({
      mode: "critical_and_digest",
      version: 2,
    });
  });

  it("a conflict says Changed by someone else and Reload shows the latest", async () => {
    const u = userEvent.setup();
    renderWithAuth(<AnalyticsEmailSection />);
    await u.click(await screen.findByRole("radio", { name: "Critical only" }));
    // Someone else saves first (a second tab).
    await api.setEmailPref(
      { mode: "critical_and_digest", version: 1 },
      { idempotencyKey: "other-tab" },
    );
    await u.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Changed by someone else")).toBeVisible();
    await u.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Critical and weekly digest" }),
      ).toBeChecked(),
    );
    expect(screen.queryByText("Changed by someone else")).toBeNull();
  });

  it("a failed load says so, with Try again", async () => {
    const u = userEvent.setup();
    const get = vi
      .spyOn(api, "getEmailPref")
      .mockRejectedValueOnce(new ApiError(500, "server"));
    renderWithAuth(<AnalyticsEmailSection />);
    expect(
      await screen.findByText("Couldn't load the email setting."),
    ).toBeVisible();
    await u.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radiogroup")).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("offline, it is disabled with the reason", async () => {
    net.online = false;
    renderWithAuth(<AnalyticsEmailSection />);
    const radio = await screen.findByRole("radio", { name: "Critical only" });
    expect(radio).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      screen.getAllByText("You're offline. This needs a connection.")[0],
    ).toBeVisible();
  });

  it("is on Account for platform admins only, and auditors send no request", async () => {
    const get = vi.spyOn(api, "getEmailPref");
    const { unmount } = renderWithAuth(<AccountView />, { user: ADA });
    expect(
      await screen.findByRole("radiogroup", { name: "Analytics email" }),
    ).toBeVisible();
    unmount();
    get.mockClear();
    renderWithAuth(<AccountView />, { user: AMARA });
    expect(await screen.findByText("Devices")).toBeVisible();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("Analytics email")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
