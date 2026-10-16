import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient } from "@/lib/auth/mock";
import { AuthError } from "@/lib/auth/types";
import { OutboxProvider } from "@/lib/offline/outbox-context";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { outboxCount, resetOutbox, seedOutbox } from "@/tests/outbox";
import { ToastProvider } from "../ui/toast";
import { AccountView } from "./account-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/account",
}));
beforeEach(() => replace.mockClear());

async function signedIn(user = TEST_USER) {
  const client = createMockAuthClient();
  await client.signIn(user.email!, "pw");
  renderWithAuth(
    <ToastProvider>
      <AccountView />
    </ToastProvider>,
    user,
    client,
  );
  return client;
}

describe("AccountView", () => {
  it("shows the profile from hospital records, hiding empty rows", async () => {
    await signedIn({ ...TEST_USER, specialty: null });
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(within(profile).getByText("Dr. Ana Reyes")).toBeInTheDocument();
    expect(
      within(profile).getByText("Attending physician"),
    ).toBeInTheDocument();
    expect(within(profile).queryByText("Specialty")).toBeNull();
    expect(within(profile).getAllByText("from hospital records").length).toBe(
      2,
    );
  });

  it("changes the password, and explains a wrong current password", async () => {
    const user = userEvent.setup();
    await signedIn();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog", { name: "Change your password" });
    await user.type(within(dialog).getByLabelText("Current password"), "wrong");
    await user.type(
      within(dialog).getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await user.type(
      within(dialog).getByLabelText("Confirm password"),
      "tram-lantern-okra",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save password" }),
    );
    expect(
      await within(dialog).findByText("That isn't your current password."),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Current password"));
    await user.type(within(dialog).getByLabelText("Current password"), "pw");
    await user.click(
      within(dialog).getByRole("button", { name: "Save password" }),
    );
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
  });

  it("offers two-step setup when it's off", async () => {
    await signedIn({ ...TEST_USER, mfaEnabled: false });
    const security = screen.getByRole("region", { name: "Security" });
    expect(within(security).getByText("Off")).toBeInTheDocument();
    await userEvent.click(
      within(security).getByRole("button", {
        name: "Set up two-step verification",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Two-step verification" }),
    ).toBeInTheDocument();
  });

  it("lists devices, signs one out, and confirms sign out everywhere", async () => {
    const user = userEvent.setup();
    await signedIn();
    const devices = await screen.findByRole("region", { name: "Devices" });
    expect(await within(devices).findByText("This device")).toBeInTheDocument();
    await user.click(
      within(devices).getByRole("button", {
        name: "Sign out Safari on iPhone",
      }),
    );
    await waitFor(() =>
      expect(within(devices).queryByText("Safari on iPhone")).toBeNull(),
    );
    await user.click(
      within(devices).getByRole("button", { name: "Sign out everywhere" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Sign out everywhere?",
    });
    await user.click(
      within(confirm).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("hides devices when the backend can't list them", async () => {
    const client = createMockAuthClient();
    Object.assign(client, {
      capabilities: { ...client.capabilities, devices: false },
    });
    renderWithAuth(
      <ToastProvider>
        <AccountView />
      </ToastProvider>,
      TEST_USER,
      client,
    );
    expect(screen.queryByRole("region", { name: "Devices" })).toBeNull();
  });
});

describe("AccountView backup codes", () => {
  it("shows backup codes left and replaces them", async () => {
    const user = userEvent.setup();
    await signedIn({ ...TEST_USER, backupCodesLeft: 8 });
    const security = screen.getByRole("region", { name: "Security" });
    expect(within(security).getByText("8 of 10 left")).toBeInTheDocument();
    await user.click(
      within(security).getByRole("button", { name: "Get new backup codes" }),
    );
    const dialog = screen.getByRole("dialog", { name: "New backup codes" });
    await user.click(
      within(dialog).getByRole("button", { name: "Get new codes" }),
    );
    expect(
      await within(dialog).findByRole("list", { name: "Backup codes" }),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByLabelText("I've saved these codes somewhere safe"),
    );
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(within(security).getByText("10 of 10 left")).toBeInTheDocument();
  });
  it("hides the row when two-step is off", async () => {
    await signedIn({ ...TEST_USER, mfaEnabled: false });
    expect(screen.queryByText("Backup codes")).toBeNull();
  });
  it("explains backup codes when the count is unknown", async () => {
    await signedIn({ ...TEST_USER, backupCodesLeft: null });
    expect(
      screen.getByText("Use one if you lose your phone"),
    ).toBeInTheDocument();
  });
});

describe("AccountView sign out everywhere failing", () => {
  it("stays signed in and says so", async () => {
    const user = userEvent.setup();
    const client = createMockAuthClient();
    await client.signIn(TEST_USER.email!, "pw");
    client.signOutEverywhere = () => Promise.reject(new Error("offline"));
    renderWithAuth(
      <ToastProvider>
        <AccountView />
      </ToastProvider>,
      TEST_USER,
      client,
    );
    const devices = await screen.findByRole("region", { name: "Devices" });
    await user.click(
      within(devices).getByRole("button", { name: "Sign out everywhere" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Sign out everywhere?",
    });
    await user.click(
      within(confirm).getByRole("button", { name: "Sign out everywhere" }),
    );
    expect(
      await screen.findByText("We couldn't sign out your other devices."),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("AccountView sign out everywhere with unsent items", () => {
  it("warns about them, then deletes them from this device", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await resetOutbox();
    await seedOutbox(TEST_USER.username);
    const user = userEvent.setup();
    const client = createMockAuthClient();
    await client.signIn(TEST_USER.email!, "pw");
    renderWithAuth(
      <ToastProvider>
        <OutboxProvider>
          <AccountView />
        </OutboxProvider>
      </ToastProvider>,
      TEST_USER,
      client,
    );
    const devices = await screen.findByRole("region", { name: "Devices" });
    await user.click(
      within(devices).getByRole("button", { name: "Sign out everywhere" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Sign out everywhere?",
    });
    expect(
      await within(confirm).findByText(
        "Your 1 unsent item on this device will be deleted.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(confirm).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(await outboxCount(TEST_USER.username)).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("AccountView sign out everywhere when the session expired", () => {
  it("still deletes the unsent items it promised to, then signs out", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    // No reset: the provider's cached device key must stay valid.
    expect(await outboxCount(TEST_USER.username)).toBe(0);
    await seedOutbox(TEST_USER.username);
    const user = userEvent.setup();
    const client = createMockAuthClient();
    await client.signIn(TEST_USER.email!, "pw");
    client.signOutEverywhere = () =>
      Promise.reject(new AuthError("session_expired"));
    renderWithAuth(
      <ToastProvider>
        <OutboxProvider>
          <AccountView />
        </OutboxProvider>
      </ToastProvider>,
      TEST_USER,
      client,
    );
    const devices = await screen.findByRole("region", { name: "Devices" });
    await user.click(
      within(devices).getByRole("button", { name: "Sign out everywhere" }),
    );
    const confirm = screen.getByRole("dialog", {
      name: "Sign out everywhere?",
    });
    await within(confirm).findByText(
      "Your 1 unsent item on this device will be deleted.",
    );
    await user.click(
      within(confirm).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(await outboxCount(TEST_USER.username)).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("AccountView signing out one device", () => {
  async function render(fail: Error) {
    const client = createMockAuthClient();
    await client.signIn(TEST_USER.email!, "pw");
    client.signOutDevice = () => Promise.reject(fail);
    renderWithAuth(
      <ToastProvider>
        <AccountView />
      </ToastProvider>,
      TEST_USER,
      client,
    );
    const devices = await screen.findByRole("region", { name: "Devices" });
    await userEvent.click(
      await within(devices).findByRole("button", {
        name: "Sign out Safari on iPhone",
      }),
    );
    return devices;
  }

  it("says so when it fails, and keeps the device listed", async () => {
    const devices = await render(new Error("offline"));
    expect(
      await screen.findByText("We couldn't sign out that device."),
    ).toBeInTheDocument();
    expect(within(devices).getByText("Safari on iPhone")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("signs out here when the session expired", async () => {
    await render(new AuthError("session_expired"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByText("We couldn't sign out that device.")).toBeNull();
  });
});

describe("AccountView devices without a usable last-active time", () => {
  it("hides the time instead of showing NaN", async () => {
    const client = createMockAuthClient();
    await client.signIn(TEST_USER.email!, "pw");
    client.listDevices = async () => [
      {
        id: "a",
        label: "Firefox on Linux",
        place: "Lagos",
        lastActiveAt: Number.NaN,
        current: false,
      },
      // NaN becomes null on its way through JSON.
      {
        id: "b",
        label: "Edge on Windows",
        place: null,
        lastActiveAt: null,
        current: false,
      },
    ];
    renderWithAuth(
      <ToastProvider>
        <AccountView />
      </ToastProvider>,
      TEST_USER,
      client,
    );
    const devices = await screen.findByRole("region", { name: "Devices" });
    await within(devices).findByText("Firefox on Linux");
    expect(within(devices).getByText("Lagos")).toBeInTheDocument();
    expect(devices).not.toHaveTextContent(/NaN| ago/);
  });
});
