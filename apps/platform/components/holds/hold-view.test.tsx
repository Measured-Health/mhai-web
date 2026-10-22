import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { dateLabel } from "@/lib/format";
import { HOLD_HINT } from "@/lib/holds/labels";
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

/** As another person, straight to the API. */
async function as<T>(email: string, fn: () => Promise<T>) {
  const was = who;
  who = email;
  try {
    return await fn();
  } finally {
    who = was;
  }
}

const details = () => screen.getByRole("region", { name: "Details" });
const term = (t: string) =>
  within(details()).getByText(t, { selector: "dt" }).nextElementSibling!;

describe("a hold's page", () => {
  it("shows every field, including the note, to an auditor, with no controls", async () => {
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
    expect(term("Asked for by")).toHaveTextContent("Havana Hospital's board");
    expect(term("Note")).toHaveTextContent(
      "Board request pending legal review",
    );
    expect(term("Placed by")).toHaveTextContent(/^Ada Bakare · /);
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

describe("editing a hold", () => {
  it("edit changes the review date; scope, reason and reference have no edit control", async () => {
    const spy = vi.spyOn(api, "editHold");
    renderWithAuth(<HoldView id="hold_hv" />);
    await userEvent.click(
      await within(
        await screen.findByRole("region", { name: "Details" }),
      ).findByRole("button", { name: "Edit" }),
    );
    const d = screen.getByRole("dialog", { name: "Edit the legal hold" });
    // Only the review date and the note.
    expect(within(d).getAllByRole("textbox")).toHaveLength(1);
    expect(within(d).getByLabelText(/^Note/)).toHaveAttribute(
      "maxLength",
      "500",
    );
    expect(within(d).getByLabelText(/^Note/)).toHaveAccessibleDescription(
      HOLD_HINT,
    );
    for (const l of [/What it covers/, /^Reason/, /^Reference/])
      expect(within(d).queryByLabelText(l)).toBeNull();
    const date = within(d).getByLabelText(/^Review date/);
    await userEvent.clear(date);
    await userEvent.type(date, "2031-03-03");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(term("Review date")).toHaveTextContent("3 Mar 2031"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy.mock.calls[0]![1]).toMatchObject({
      review_on: "2031-03-03",
      version: 1,
    });
    // No step-up for an edit.
    expect(spy.mock.calls[0]![1]).not.toHaveProperty("mfa_code");
  });

  it("a stale edit shows Changed by someone else and reloads", async () => {
    renderWithAuth(<HoldView id="hold_hv" />);
    await userEvent.click(
      await within(
        await screen.findByRole("region", { name: "Details" }),
      ).findByRole("button", { name: "Edit" }),
    );
    const d = screen.getByRole("dialog", { name: "Edit the legal hold" });
    // Tunde changes it meanwhile.
    await as(TEAM_EMAILS.tunde, () =>
      api.editHold(
        "hold_hv",
        { review_on: "2032-01-15", version: 1 },
        { idempotencyKey: "t" },
      ),
    );
    await userEvent.type(within(d).getByLabelText(/^Note/), "Ada's note");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(
      await within(d).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Reload" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(term("Review date")).toHaveTextContent("15 Jan 2032"),
    );
    expect(term("Note")).not.toHaveTextContent("Ada's note");
  });

  it("a lifted hold has no Edit", async () => {
    renderWithAuth(<HoldView id="hold_lc" />);
    await screen.findByRole("region", { name: "Details" });
    expect(
      within(details()).queryByRole("button", { name: "Edit" }),
    ).toBeNull();
  });
});
