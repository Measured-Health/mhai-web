import { screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/settings",
}));
import { SettingsView, settingsPatch } from "./settings-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => vi.restoreAllMocks());

const ready = () =>
  screen.findByRole("switch", { name: "Reviewers must share the specialty" });

describe("SettingsView", () => {
  it("shows the hospital's rules, with sign-in read-only", async () => {
    renderAdmin(<SettingsView />);
    expect(await ready()).toBeChecked();
    expect(screen.getByLabelText("Flag as overdue after")).toHaveValue("4");
    expect(
      screen.getByRole("switch", {
        name: "Require 2-step verification for clinicians",
      }),
    ).toBeChecked();
    expect(
      screen.getByText("Hospital admins always need it"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Sign out after inactivity")).toHaveValue(
      "15",
    );
    expect(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    ).toBeChecked();
    const signIn = screen.getByRole("region", { name: "Sign-in" });
    expect(within(signIn).getByText("Connected")).toBeInTheDocument();
    expect(
      within(signIn).getByText(/Connected to havanahospital\.org/),
    ).toBeInTheDocument();
    expect(within(signIn).getByText("havanahospital.org")).toBeInTheDocument();
    expect(within(signIn).queryByRole("textbox")).toBeNull();
    expect(within(signIn).queryByRole("switch")).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves only what changed, with the version", async () => {
    const update = vi.spyOn(holder.client, "updateSettings");
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Sign out after inactivity"),
      "5",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        { version: 1, allow_trust_device: false, idle_timeout_minutes: 5 },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    ).not.toBeChecked();
  });

  it("keeps your changes when someone else saved first (Review Focus 2)", async () => {
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.selectOptions(
      screen.getByLabelText("Sign out after inactivity"),
      "5",
    );
    // Another admin saves a different setting first.
    await holder.client.updateSettings({ version: 1, review_overdue_hours: 8 });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Someone else saved the settings just now"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Flag as overdue after")).toHaveValue("8"),
    );
    expect(screen.getByLabelText("Sign out after inactivity")).toHaveValue("5");
    const update = vi.spyOn(holder.client, "updateSettings");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        { version: 2, idle_timeout_minutes: 5 },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Settings saved")).toBeInTheDocument();
  });

  it("undoes unsaved changes", async () => {
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", {
        name: "Reviewers must share the specialty",
      }),
    );
    expect(
      screen.getByText(/Off: any clinician except the person who suggested it/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo changes" }));
    expect(await ready()).toBeChecked();
  });

  it("asks before leaving with unsaved changes", async () => {
    renderAdmin(
      <>
        <SettingsView />
        <a href="/admin/staff">Go to staff</a>
      </>,
    );
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    await userEvent.click(screen.getByRole("link", { name: "Go to staff" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Leave without saving?",
    });
    expect(
      within(dialog).getByText(
        "Your changes to the hospital settings will be lost.",
      ),
    ).toBeInTheDocument();
  });

  it("can't save offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(
      screen.getByText("You're offline. Saving needs a connection."),
    ).toBeInTheDocument();
  });

  it("links the offline reason to the disabled Save", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderAdmin(<SettingsView />);
    await ready();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAccessibleDescription("You're offline. Saving needs a connection.");
  });

  it("offers Try again when the settings can't load", async () => {
    vi.spyOn(holder.client, "getSettings").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<SettingsView />);
    expect(await screen.findByText("You can't do this")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
  });

  it("says so, not a skeleton, when first opened offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    onlineManager.setOnline(false);
    try {
      renderAdmin(<SettingsView />);
      expect(
        await screen.findByText(
          "You're offline. Settings will load when you reconnect.",
        ),
      ).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("keeps the form when a refresh fails, with the banner above it", async () => {
    renderAdmin(<SettingsView />);
    await ready();
    await userEvent.click(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    );
    vi.spyOn(holder.client, "updateSettings").mockRejectedValue(
      new ApiError(409, "conflict"),
    );
    vi.spyOn(holder.client, "getSettings").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(await ready()).toBeChecked();
    expect(
      screen.getByRole("switch", { name: 'Allow "trust this device"' }),
    ).not.toBeChecked();
  });
});

describe("settingsPatch", () => {
  it("sends only real changes", async () => {
    const s = await screenAdminAs(null).getSettings();
    expect(settingsPatch(s, {})).toBeNull();
    expect(settingsPatch(s, { allow_trust_device: true })).toBeNull();
    expect(settingsPatch(s, { allow_trust_device: false })).toEqual({
      version: 1,
      allow_trust_device: false,
    });
  });
});
