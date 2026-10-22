import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import type { User } from "@/lib/auth/types";
import { dateLabel } from "@/lib/format";
import { HOLD_HINT } from "@/lib/holds/labels";
import { useHold } from "@/lib/queries/holds";
import { ADA, renderWithAuth } from "@/tests/render";
import { LiftPanel } from "./lift-panel";

const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/legal-holds/hold_rc",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TUNDE: User = {
  ...ADA,
  id: "tunde.okafor",
  email: TEAM_EMAILS.tunde,
  name: "Tunde Okafor",
};
const D = 24 * 3_600_000;

let api: PlatformClient;
let who: string;
let clock: number;
function install(email: string = ADA.email) {
  who = email;
  clock = Date.now();
  api = createMockPlatform({
    delayMs: 0,
    now: () => clock,
    me: () => who,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => install());
afterEach(() => {
  net.online = true;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

/** The page's wiring: the hold from the cache, and its lift panel. */
function Page({ id }: { id: string }) {
  const q = useHold(id);
  return q.data ? <LiftPanel hold={q.data} /> : <p>Loading</p>;
}
async function open(id: string, user: User = ADA) {
  renderWithAuth(<Page id={id} />, { user });
  return screen.findByRole("region", { name: "Lift" });
}
const panel = () => screen.getByRole("region", { name: "Lift" });
const btn = (name: string) => within(panel()).getByRole("button", { name });
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

describe("requesting a lift", () => {
  it("Request lift needs a reason, the authority and the code; Other needs a note", async () => {
    const spy = vi.spyOn(api, "requestLift");
    await open("hold_hv");
    await userEvent.click(btn("Request lift"));
    const d = screen.getByRole("dialog", { name: /^Lift legal hold/ });
    const confirm = within(d).getByRole("button", { name: "Request lift" });
    await userEvent.click(confirm);
    expect(within(d).getByText("Choose a reason.")).toBeInTheDocument();
    await userEvent.click(within(d).getByLabelText("Other"));
    await userEvent.click(confirm);
    expect(within(d).getByText("Add a note.")).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/^Note/), "Settled");
    await userEvent.click(confirm);
    expect(
      within(d).getByText("Enter authority for lifting."),
    ).toBeInTheDocument();
    await userEvent.type(
      within(d).getByLabelText(/^Authority for lifting/),
      "Counsel's letter 20 Oct 2026",
    );
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await typeCode(d);
    await userEvent.click(confirm);
    // The dialog (which says it too) closes once the request is made.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      within(panel()).getByText(
        "The hold stays active until a different platform admin approves.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText(
        "Waiting for a different platform admin to approve",
      ),
    ).toBeInTheDocument();
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "other",
      note: "Settled",
      authority: "Counsel's letter 20 Oct 2026",
      mfa_code: MOCK_CODE,
    });
  });

  it("the hint shows under the note and the authority", async () => {
    await open("hold_ng");
    await userEvent.click(btn("Request lift"));
    const d = screen.getByRole("dialog", { name: /^Lift legal hold/ });
    expect(within(d).getAllByText(HOLD_HINT)).toHaveLength(2);
    expect(within(d).getByLabelText(/^Note/)).toHaveAccessibleDescription(
      HOLD_HINT,
    );
    const authority = within(d).getByLabelText(/^Authority for lifting/);
    expect(authority).toHaveAttribute("maxLength", "200");
    expect(authority).toHaveAccessibleDescription(
      `For example: Counsel's letter 14 Oct 2026, ref ABC-123 ${HOLD_HINT}`,
    );
  });

  it("a wrong code shows That code didn't work", async () => {
    await open("hold_hv");
    await userEvent.click(btn("Request lift"));
    const d = screen.getByRole("dialog", { name: /^Lift legal hold/ });
    await userEvent.click(within(d).getByLabelText("The case is closed"));
    await userEvent.type(
      within(d).getByLabelText(/^Authority for lifting/),
      "Court order",
    );
    await typeCode(d, "000000");
    await userEvent.click(
      within(d).getByRole("button", { name: "Request lift" }),
    );
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
  });
});

describe("approving a lift (two people)", () => {
  it("Riverside, as Tunde, shows Waiting for a different platform admin to approve and no Approve", async () => {
    install(TEAM_EMAILS.tunde);
    // A session name that matches someone else's changes nothing.
    await open("hold_rc", { ...TUNDE, name: "Ada Bakare" });
    expect(
      within(panel()).getByText(
        "Waiting for a different platform admin to approve",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByRole("button", { name: "Approve lift" }),
    ).toBeNull();
    expect(btn("Cancel request")).toBeEnabled();
  });

  it("Riverside, as Ada, shows the effect with 1240 records, then Approve lift with the code makes it 'Lifted · records released on …'", async () => {
    const spy = vi.spyOn(api, "approveLift");
    await open("hold_rc");
    const h = await api.getHold("hold_rc");
    const effect = `When this hold is lifted, records it alone was keeping become due for the daily clean-up. About 1240 records are already past their retention period and would be deleted in the clean-up after ${dateLabel(h.lift!.due_after)}.`;
    expect(within(panel()).getByText(effect)).toBeInTheDocument();
    expect(
      within(panel()).getByText(
        "The hold stays active until a different platform admin approves.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText(/^Requested by Tunde Okafor · /),
    ).toBeInTheDocument();
    await userEvent.click(btn("Approve lift"));
    const d = screen.getByRole("dialog", { name: /^Approve lifting/ });
    expect(within(d).getByText(effect)).toBeInTheDocument();
    const confirm = within(d).getByRole("button", { name: "Approve lift" });
    expect(confirm.className).toMatch(/bad|danger/);
    await typeCode(d);
    await userEvent.click(confirm);
    expect(
      await within(panel()).findByText(
        `Lifted · records released on ${dateLabel(new Date(clock + 7 * D).toISOString())}`,
      ),
    ).toBeInTheDocument();
    expect(spy.mock.calls[0]![1]).toEqual({ version: 2, mfa_code: MOCK_CODE });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(btn("Undo lift")).toBeEnabled();
  });

  it("an approval refused as same_person shows A different platform admin must approve this.", async () => {
    // Read as Ada, then signed out and back in as Tunde in the same tab.
    await open("hold_rc");
    await userEvent.click(btn("Approve lift"));
    const d = screen.getByRole("dialog", { name: /^Approve lifting/ });
    who = TEAM_EMAILS.tunde;
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve lift" }),
    );
    expect(
      await within(panel()).findByText(
        "A different platform admin must approve this.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Reloaded: the server now says the request is Tunde's own.
    expect(
      await within(panel()).findByText(
        "Waiting for a different platform admin to approve",
      ),
    ).toBeInTheDocument();
  });

  it("an approval refused as expired shows This request lapsed after 7 days. Make a new request. and reloads", async () => {
    await open("hold_rc");
    await userEvent.click(btn("Approve lift"));
    const d = screen.getByRole("dialog", { name: /^Approve lifting/ });
    // It lapses while the dialog is open.
    clock += 6 * D;
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve lift" }),
    );
    expect(
      await within(panel()).findByText(
        "This request lapsed after 7 days. Make a new request.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      await within(panel()).findByRole("button", { name: "Request lift" }),
    ).toBeEnabled();
    expect(
      within(panel()).queryByRole("button", { name: "Approve lift" }),
    ).toBeNull();
  });

  it("either admin can Cancel request", async () => {
    const spy = vi.spyOn(api, "cancelLift");
    await open("hold_rc");
    await userEvent.click(btn("Cancel request"));
    expect(
      await within(panel()).findByRole("button", { name: "Request lift" }),
    ).toBeEnabled();
    expect(spy.mock.calls[0]![1]).toEqual({ version: 2 });
  });

  it("the requester can Cancel request too", async () => {
    install(TEAM_EMAILS.tunde);
    await open("hold_rc", TUNDE);
    await userEvent.click(btn("Cancel request"));
    expect(
      await within(panel()).findByRole("button", { name: "Request lift" }),
    ).toBeEnabled();
  });

  it("a cancel that clashes shows Changed by someone else and reloads", async () => {
    await open("hold_rc");
    // Tunde cancels and asks again meanwhile: a new request.
    await api.cancelLift("hold_rc", { version: 2 }, { idempotencyKey: "c" });
    await userEvent.click(btn("Cancel request"));
    expect(
      await within(panel()).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    expect(
      await within(panel()).findByRole("button", { name: "Request lift" }),
    ).toBeEnabled();
  });
});

describe("after the lift", () => {
  // Preflight S8-14: the grace-period hold is Lakeside, not Westfield.
  it("Lakeside shows Undo lift; undo with the code puts the hold back", async () => {
    const spy = vi.spyOn(api, "undoLift");
    await open("hold_lc");
    const h = await api.getHold("hold_lc");
    expect(
      within(panel()).getByText(
        `Lifted · records released on ${dateLabel(h.lift!.released_on!)}`,
      ),
    ).toBeInTheDocument();
    await userEvent.click(btn("Undo lift"));
    const d = screen.getByRole("dialog", { name: "Put the hold back?" });
    expect(within(d).getByText("Its records stay kept.")).toBeInTheDocument();
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Undo lift" }));
    // Back to keeping records: Active, or Review due when its date is past
    // (Lakeside's is).
    expect(
      await within(panel()).findByRole("button", { name: "Request lift" }),
    ).toBeEnabled();
    expect((await api.getHold("hold_lc")).status).toMatch(
      /^(active|review_due)$/,
    );
    expect(spy.mock.calls[0]![1]).toEqual({ version: 3, mfa_code: MOCK_CODE });
  });

  it("Havana shows no lift controls", async () => {
    await open("hold_hh");
    expect(within(panel()).getByText(/^Lifted by Ada Bakare · /)).toBeVisible();
    expect(within(panel()).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("offline", () => {
  it("offline disables every action with the reason", async () => {
    net.online = false;
    for (const [id, names] of [
      ["hold_hv", ["Request lift"]],
      ["hold_rc", ["Approve lift", "Cancel request"]],
      ["hold_lc", ["Undo lift"]],
    ] as const) {
      const { unmount } = renderWithAuth(<Page id={id} />);
      await screen.findByRole("region", { name: "Lift" });
      for (const name of names) {
        const b = btn(name);
        expect(b).toBeDisabled();
        expect(b).toHaveAccessibleDescription(
          "You're offline. This needs a connection.",
        );
      }
      unmount();
    }
  });
});

describe("the code is never kept", () => {
  it("after a wrong code, the mutation cache holds no code", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithAuth(<Page id="hold_rc" />, { queryClient: qc });
    await screen.findByRole("region", { name: "Lift" });
    await userEvent.click(btn("Approve lift"));
    const d = screen.getByRole("dialog", { name: /^Approve lifting/ });
    await typeCode(d, "000000");
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve lift" }),
    );
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.stringify(
          qc
            .getMutationCache()
            .getAll()
            .map((m) => m.state.variables),
        ),
      ).not.toContain("000000"),
    );
  });
});
