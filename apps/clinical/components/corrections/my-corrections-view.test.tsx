import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import { OutboxProvider } from "@/lib/offline/outbox-context";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { ToastProvider } from "@mhai/ui/toast";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/my-feedback",
}));
import { MyCorrectionsView } from "./my-corrections-view";

const ui = () =>
  renderWithAuth(
    <ToastProvider>
      <OutboxProvider>
        <MyCorrectionsView />
      </OutboxProvider>
    </ToastProvider>,
  );
const list = () => screen.findByRole("list", { name: "Your corrections" });

beforeEach(() => {
  holder.client = createMockClient();
});
afterEach(() => {
  vi.restoreAllMocks();
  // Back online, so a test that went offline can't leave queries paused.
  act(() => void window.dispatchEvent(new Event("online")));
});

describe("MyCorrectionsView", () => {
  it("lists your corrections by status, with the reviewer's reason", async () => {
    ui();
    const rows = within(await list()).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(screen.getByRole("button", { name: "All · 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const text = rows.map((r) => r.textContent).join("\n");
    expect(text).toMatch(/Waiting.*Febrile seizure, simple.*Submitted 5 h ago/);
    expect(text).toMatch(/Over 4 h/);
    expect(text).toMatch(/Approved.*Unstable angina.*Approved by Dr\. Okafor/);
    expect(text).toMatch(
      /Rejected.*Hypokalaemia, cause unclear.*Rejected by Nurse Bello/,
    );
    expect(text).toContain(
      'Reviewer\'s reason: “Partly right, needs rewording: Keep "cause unclear"',
    );
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    await user.click(screen.getByRole("button", { name: "Rejected · 1" }));
    const rows = within(await list()).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Hypokalaemia, cause unclear");
  });

  it("shows what changed when you open one", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    const view = screen.getByRole("button", {
      name: "View: Febrile seizure, simple",
    });
    await user.click(view);
    expect(view).toHaveAttribute("aria-expanded", "true");
    const before = screen.getByRole("region", { name: "What the system said" });
    expect(before.querySelector("del")).toHaveTextContent("Removed: simple");
    expect(screen.getByRole("region", { name: "Your reason" })).toBeVisible();
  });

  it("asks before withdrawing, with a safe default, then withdraws", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    await user.click(
      screen.getByRole("button", { name: "Withdraw: Febrile seizure, simple" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw this correction?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Keep it" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("Correction withdrawn")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Withdrawn · 1" }),
    ).toBeVisible();
  });

  it("explains when the correction was decided before you withdrew it", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "withdrawCorrection").mockRejectedValueOnce(
      new ApiError(409, "already_decided"),
    );
    ui();
    await list();
    await user.click(
      screen.getByRole("button", { name: "Withdraw: Febrile seizure, simple" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Withdraw this correction?" }),
      ).getByRole("button", { name: "Withdraw" }),
    );
    expect(
      await screen.findByText("This correction was already decided"),
    ).toBeVisible();
  });

  it("disables withdrawing while offline, and says why", async () => {
    ui();
    await list();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const button = screen.getByRole("button", {
      name: "Withdraw: Febrile seizure, simple",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "You're offline. Withdrawing needs a connection.",
    );
  });

  it("resubmits a rejected correction with your text to change", async () => {
    const user = userEvent.setup();
    const send = vi.spyOn(holder.client, "sendFeedback");
    ui();
    await list();
    await user.click(
      screen.getByRole("button", {
        name: "Resubmit: Hypokalaemia, cause unclear",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Suggest it again" });
    const what = within(dialog).getByLabelText(/What should the diagnosis/);
    expect(what).toHaveValue("Hypokalaemia from vomiting");
    await user.clear(what);
    await user.type(what, "Hypokalaemia, cause unclear; monitor the heart");
    await user.click(
      within(dialog).getByRole("button", { name: "Submit correction" }),
    );
    expect(await screen.findByText("Sent for review again")).toBeVisible();
    expect(send).toHaveBeenCalledWith(
      {
        query_id: "q-c-vomiting",
        action: "correct",
        corrected_diagnosis: "Hypokalaemia, cause unclear; monitor the heart",
        reason: "Two days of vomiting explain it.",
      },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("names each row's buttons exactly, in every browser", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    const view = screen.getByRole("button", {
      name: "View: Febrile seizure, simple",
    });
    expect(view).toHaveAttribute("aria-label", "View: Febrile seizure, simple");
    await user.click(view);
    expect(view).toHaveAttribute("aria-label", "Hide: Febrile seizure, simple");
    expect(
      screen.getByRole("button", { name: "Withdraw: Febrile seizure, simple" }),
    ).toHaveAttribute("aria-label", "Withdraw: Febrile seizure, simple");
    expect(
      screen.getByRole("button", {
        name: "Resubmit: Hypokalaemia, cause unclear",
      }),
    ).toHaveAttribute("aria-label", "Resubmit: Hypokalaemia, cause unclear");
  });

  it("says so when a filter has nothing in it", async () => {
    const user = userEvent.setup();
    await holder.client.withdrawCorrection("c-seizure");
    ui();
    await list();
    await user.click(screen.getByRole("button", { name: "Waiting · 0" }));
    expect(screen.getByText("Nothing here.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Your corrections" })).toBeNull();
  });

  it("says when there's nothing yet", async () => {
    vi.spyOn(holder.client, "listMyCorrections").mockResolvedValue([]);
    ui();
    expect(await screen.findByText("No corrections yet")).toBeVisible();
  });

  it("offers to try again when the list can't load", async () => {
    const user = userEvent.setup();
    // A 4xx isn't retried, so the error shows at once.
    const load = vi
      .spyOn(holder.client, "listMyCorrections")
      .mockRejectedValueOnce(new ApiError(404, "not_found"));
    ui();
    expect(
      await screen.findByText("Couldn't load your corrections"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await list()).toBeVisible();
  });
});
