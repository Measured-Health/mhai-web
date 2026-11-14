import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { dateLabel } from "@/lib/format";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { HoldView } from "./hold-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/legal-holds/hold_hv",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
let who: string;
function install(over: Partial<PlatformClient> = {}) {
  who = ADA.email;
  const m = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
  });
  api = { ...m, ...over } as PlatformClient;
  __setPlatformClientForTests(api);
  return m;
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const details = () => screen.getByRole("region", { name: "Details" });
const term = (t: string) =>
  within(details()).getByText(t, { selector: "dt" }).nextElementSibling!;

describe("a hold's page", () => {
  it("shows every field to an auditor, with no controls; no note and no name of who asked (core 1.26.0)", async () => {
    renderWithAuth(<HoldView id="hold_hh" />, { user: AMARA });
    expect(
      await screen.findByRole("heading", { name: "BRD-2026-03" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Havana Hospital", { selector: "p" }),
    ).toBeVisible();
    expect(
      within(term("Hospital") as HTMLElement).getByRole("link", {
        name: "Havana Hospital",
      }),
    ).toHaveAttribute("href", "/hospitals/h_havana");
    expect(term("What it covers")).toHaveTextContent("All records");
    expect(term("Reason")).toHaveTextContent("Other");
    expect(term("Reference")).toHaveTextContent("BRD-2026-03");
    expect(within(details()).queryByText("Asked for by")).toBeNull();
    expect(within(details()).queryByText("Note")).toBeNull();
    expect(term("Placed")).toHaveTextContent(/^Placed by Ada Bakare · /);
    expect(term("Review date")).toBeInTheDocument();
    expect(term("Status")).toHaveTextContent(/^Lifted by Ada Bakare · /);
    // Nothing to press but the menu and the bell.
    for (const b of screen.getAllByRole("button"))
      expect(b).toHaveAccessibleName(/Open menu|Notifications/);
  });

  it("an auditor sees a lift request's line but no buttons", async () => {
    renderWithAuth(<HoldView id="hold_rc" />, { user: AMARA });
    expect(
      await screen.findByText(/^Requested by Tunde Okafor · /),
    ).toBeInTheDocument();
    for (const b of screen.getAllByRole("button"))
      expect(b).toHaveAccessibleName(/Open menu|Notifications/);
  });

  it("an active hold says Active · placed by {name} · {date}", async () => {
    renderWithAuth(<HoldView id="hold_hv" />);
    const h = await api.getHold("hold_hv");
    expect(
      await within(
        await screen.findByRole("region", { name: "Details" }),
      ).findByText(`Active · placed by Ada Bakare · ${dateLabel(h.placed_at)}`),
    ).toBeInTheDocument();
  });

  it("a hold the command line placed says Placed by the system, with no reason", async () => {
    renderWithAuth(<HoldView id="hold_rg" />, { user: AMARA });
    expect(
      await screen.findByRole("heading", { name: "LH-2025-0042" }),
    ).toBeInTheDocument();
    expect(term("Placed")).toHaveTextContent(/^Placed by the system · /);
    expect(term("Reason")).toHaveTextContent(
      "Not given (placed by the system)",
    );
    expect(screen.queryByText(/Provisioning command line/)).toBeNull();
  });

  it("stopped_removal shows the banner", async () => {
    const m = install();
    install({
      getHold: async (id) => ({
        ...(await m.getHold(id)),
        stopped_removal: true,
      }),
    });
    renderWithAuth(<HoldView id="hold_hv" />);
    expect(
      await screen.findByText(
        "Placing this hold stopped Harbour View Hospital's scheduled removal and sent it back to Removal pending.",
      ),
    ).toBeInTheDocument();
  });

  it("a hold that's gone shows This was removed or no longer exists. with Back to Legal holds", async () => {
    install({
      getHold: async () => {
        throw new ApiError(404, "not_found");
      },
    });
    renderWithAuth(<HoldView id="hold_nope" />);
    expect(
      await screen.findByText("This was removed or no longer exists."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Legal holds" }),
    ).toHaveAttribute("href", "/legal-holds");
  });

  it("a code this app doesn't know fails closed", async () => {
    const m = install();
    install({
      getHold: async (id) =>
        ({ ...(await m.getHold(id)), reason: "subpoena" }) as never,
    });
    renderWithAuth(<HoldView id="hold_hv" />);
    expect(
      await screen.findByText("Couldn't load this legal hold."),
    ).toBeInTheDocument();
    expect(screen.queryByText("subpoena")).toBeNull();
  });
});

describe("changing a hold's review date", () => {
  it("core doesn't serve it yet: the dialog says Not available yet, calmly, and nothing changes", async () => {
    const spy = vi.spyOn(api, "editHold");
    renderWithAuth(<HoldView id="hold_hv" />);
    await userEvent.click(
      await within(
        await screen.findByRole("region", { name: "Details" }),
      ).findByRole("button", { name: "Change review date" }),
    );
    const d = screen.getByRole("dialog", { name: "Change the review date" });
    // Only the review date: a hold has no note.
    expect(within(d).queryAllByRole("textbox")).toHaveLength(0);
    for (const l of [/^Note/, /What it covers/, /^Reason/, /^Reference/])
      expect(within(d).queryByLabelText(l)).toBeNull();
    const before = term("Review date").textContent;
    const date = within(d).getByLabelText(/^Review date/);
    await userEvent.clear(date);
    await userEvent.type(date, "2031-03-03");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    const note = await within(d).findByText("Not available yet");
    expect(note.closest("[role=status]")).not.toBeNull();
    expect(within(d).queryByRole("alert")).toBeNull();
    expect(within(d).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(spy.mock.calls[0]![1]).toEqual({
      review_on: "2031-03-03",
      version: 1,
    });
    expect(term("Review date").textContent).toBe(before);
  });

  it("a lifted hold has no Change review date", async () => {
    renderWithAuth(<HoldView id="hold_lc" />);
    await screen.findByRole("region", { name: "Details" });
    expect(
      within(details()).queryByRole("button", { name: "Change review date" }),
    ).toBeNull();
  });
});
