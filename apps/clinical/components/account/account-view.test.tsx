import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import {
  createMockAuthClient,
  MOCK_BACKUP_CODES,
  MOCK_CODE,
} from "@/lib/auth/mock";
import { AuthError } from "@/lib/auth/types";
import { OutboxProvider } from "@/lib/offline/outbox-context";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { outboxCount, resetOutbox, seedOutbox } from "@/tests/outbox";
import { ToastProvider } from "@mhai/ui/toast";
import { AccountView } from "./account-view";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
const flush = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/review/pending-approvals", () => ({
  flushPendingApprovals: flush,
  registerPendingFlush: () => () => {},
  endApprovalSession: () => {},
  approvalSession: () => 0,
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/account",
}));
beforeEach(() => {
  replace.mockClear();
  holder.client = createMockClient();
});

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
    const client = await signedIn();
    const everywhere = vi.spyOn(client, "signOutEverywhere");
    const devices = await screen.findByRole("region", {
      name: "Active devices",
    });
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
    // A waiting approval is sent before the sessions end.
    expect(flush).toHaveBeenCalled();
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
      everywhere.mock.invocationCallOrder[0]!,
    );
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
    expect(screen.queryByRole("region", { name: "Active devices" })).toBeNull();
  });
});

describe("AccountView feedback", () => {
  it("has no feedback section for a hospital admin who isn't a clinician", async () => {
    const getStats = vi.spyOn(holder.client, "getMyFeedbackStats");
    await signedIn({ ...TEST_USER, roles: ["hospital_admin"] });
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "My feedback" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My feedback" })).toBeNull();
    expect(getStats).not.toHaveBeenCalled();
    // Close goes back to their own side, not the clinical home.
    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute(
      "href",
      "/admin/staff",
    );
  });
  it("shows your feedback counts and links to My feedback & corrections", async () => {
    await signedIn();
    const section = await screen.findByRole("region", { name: "My feedback" });
    const agreed = await within(section).findByText("Results agreed");
    expect(agreed.parentElement).toHaveTextContent("Results agreed42");
    expect(
      within(section).getByText("Corrections waiting").parentElement,
    ).toHaveTextContent("Corrections waiting1");
    expect(
      within(section).getByText("Corrections approved").parentElement,
    ).toHaveTextContent("Corrections approved1");
    expect(
      within(section).getByText("Corrections rejected").parentElement,
    ).toHaveTextContent("Corrections rejected1");
    expect(
      within(section).getByRole("link", {
        name: /See my feedback & corrections/,
      }),
    ).toHaveAttribute("href", "/my-feedback");
    expect(
      within(
        screen.getByRole("navigation", { name: "Account sections" }),
      ).getByRole("link", { name: "My feedback" }),
    ).toHaveAttribute("href", "#feedback");
  });

  it("says the numbers aren't available, and keeps the link", async () => {
    holder.client.getMyFeedbackStats = () =>
      Promise.reject(new ApiError(404, "gone"));
    await signedIn();
    const section = await screen.findByRole("region", { name: "My feedback" });
    expect(
      await within(section).findByText(
        "Your feedback numbers aren't available right now.",
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("link", {
        name: /See my feedback & corrections/,
      }),
    ).toHaveAttribute("href", "/my-feedback");
  });
});

describe("AccountView backup code", () => {
  afterEach(() => vi.useRealTimers());

  it("makes a new backup code through the step-up, shown once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await signedIn({ ...TEST_USER, backupCodesLeft: 1 });
    const security = screen.getByRole("region", { name: "Security" });
    expect(
      within(security).getByText(/You get a new one each time/),
    ).toBeInTheDocument();
    await user.click(
      within(security).getByRole("button", { name: "Make a new backup code" }),
    );
    const dialog = screen.getByRole("dialog", { name: "New backup code" });
    // The sixth digit confirms.
    await user.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await user.keyboard(MOCK_CODE);
    const code = await screen.findByRole("group", {
      name: "Your backup code",
    });
    expect(code).toHaveTextContent(MOCK_BACKUP_CODES[1]);
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toHaveAttribute("aria-disabled", "true");
    act(() => vi.advanceTimersByTime(3000));
    await user.click(go);
    expect(screen.queryByText(MOCK_BACKUP_CODES[1])).toBeNull();
  });

  it("says a wrong code didn't work, and makes nothing", async () => {
    const user = userEvent.setup();
    await signedIn({ ...TEST_USER, backupCodesLeft: 1 });
    await user.click(
      screen.getByRole("button", { name: "Make a new backup code" }),
    );
    const dialog = screen.getByRole("dialog", { name: "New backup code" });
    await user.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await user.keyboard("000000");
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Your backup code" }),
    ).toBeNull();
  });

  it("warns when no backup code is ready, and offers to make one", async () => {
    const user = userEvent.setup();
    await signedIn({ ...TEST_USER, backupCodesLeft: 0 });
    const security = screen.getByRole("region", { name: "Security" });
    expect(
      within(security).getByText("You have no backup code"),
    ).toBeInTheDocument();
    const make = within(security).getAllByRole("button", {
      name: "Make a new backup code",
    });
    expect(make).toHaveLength(1);
    await user.click(make[0]!);
    expect(
      screen.getByRole("dialog", { name: "New backup code" }),
    ).toBeInTheDocument();
  });

  it("hides the row when two-step is off", async () => {
    await signedIn({ ...TEST_USER, mfaEnabled: false });
    expect(screen.queryByText("Backup code")).toBeNull();
  });

  it("explains the backup code when the count is unknown", async () => {
    await signedIn({ ...TEST_USER, backupCodesLeft: null });
    expect(
      screen.getByText(/Use it if you don't have your phone/),
    ).toBeInTheDocument();
    expect(screen.queryByText("You have no backup code")).toBeNull();
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
    const devices = await screen.findByRole("region", {
      name: "Active devices",
    });
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
    const devices = await screen.findByRole("region", {
      name: "Active devices",
    });
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
    const devices = await screen.findByRole("region", {
      name: "Active devices",
    });
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
    const devices = await screen.findByRole("region", {
      name: "Active devices",
    });
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
    const devices = await screen.findByRole("region", {
      name: "Active devices",
    });
    await within(devices).findByText("Firefox on Linux");
    expect(within(devices).getByText("Lagos")).toBeInTheDocument();
    expect(devices).not.toHaveTextContent(/NaN| ago/);
  });
});

describe("AccountView notifications", () => {
  it("has a Notifications section for clinicians, after Security", async () => {
    await signedIn();
    expect(
      await screen.findByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
    const links = within(
      screen.getByRole("navigation", { name: "Account sections" }),
    ).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Profile",
      "Security",
      "Notifications",
      "Devices",
      "My feedback",
    ]);
    expect(
      await screen.findByRole("switch", { name: "Pop-ups for patient alerts" }),
    ).toBeChecked();
  });

  it("has none for a hospital admin who isn't a clinician", async () => {
    await signedIn({ ...TEST_USER, roles: ["hospital_admin"] });
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
  });
});
