import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthClient } from "@/lib/auth/mock";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
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
