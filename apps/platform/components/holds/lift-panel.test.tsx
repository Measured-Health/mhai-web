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
import { HOLD_HINT } from "@/lib/holds/labels";
import { REFERENCE_HINT } from "@/lib/holds/rules";
import { useHold } from "@/lib/queries/holds";
import { ADA, renderWithAuth } from "@/tests/render";
import { LIFT_EFFECT, LiftPanel } from "./lift-panel";

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
  it("Request lift needs a reason, a document reference for the authority and the code; there is no note", async () => {
    const spy = vi.spyOn(api, "requestLift");
    await open("hold_hv");
    await userEvent.click(btn("Request lift"));
    const d = screen.getByRole("dialog", { name: /^Lift legal hold/ });
    const confirm = within(d).getByRole("button", { name: "Request lift" });
    // Core keeps no free text on a lift: no note box, even for Other.
    expect(within(d).queryByLabelText(/^Note/)).toBeNull();
    await userEvent.click(confirm);
    expect(within(d).getByText("Choose a reason.")).toBeInTheDocument();
    await userEvent.click(within(d).getByLabelText("Other"));
    expect(within(d).queryByLabelText(/^Note/)).toBeNull();
    await userEvent.click(confirm);
    expect(
      within(d).getByText("Enter authority for lifting (document reference)."),
    ).toBeInTheDocument();
    const authority = within(d).getByLabelText(/^Authority for lifting/);
    await userEvent.type(authority, "Counsel's letter 20 Oct 2026");
    await userEvent.click(confirm);
    expect(
      within(d).getByText("Use a document reference, like CT-2026-0091."),
    ).toBeInTheDocument();
    await userEvent.clear(authority);
    await userEvent.type(authority, "CT-2026-0091");
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await typeCode(d);
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      within(panel()).getByText(
        "Waiting for a different platform admin to approve",
      ),
    ).toBeInTheDocument();
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "other",
      authority: "CT-2026-0091",
      mfa_code: MOCK_CODE,
    });
  });

  it("the authority box explains a document reference, and the no-names hint", async () => {
    await open("hold_ng");
    await userEvent.click(btn("Request lift"));
    const d = screen.getByRole("dialog", { name: /^Lift legal hold/ });
    const authority = within(d).getByLabelText(/^Authority for lifting/);
    expect(authority).toHaveAttribute("maxLength", "22");
    expect(authority).toHaveAccessibleDescription(
      `${REFERENCE_HINT} ${HOLD_HINT}`,
    );
  });

  it("a wrong code shows That code didn't work", async () => {
    await open("hold_hv");
    await userEvent.click(btn("Request lift"));
    const d = screen.getByRole("dialog", { name: /^Lift legal hold/ });
    await userEvent.click(within(d).getByLabelText("The case is closed"));
    await userEvent.type(
      within(d).getByLabelText(/^Authority for lifting/),
      "CO-2026-0007",
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

  it("Riverside, as Ada, says the lift lands at once; Approve lift with the code lifts it, with no undo", async () => {
    const spy = vi.spyOn(api, "approveLift");
    await open("hold_rc");
    expect(within(panel()).getByText(LIFT_EFFECT)).toBeInTheDocument();
    expect(within(panel()).getByText("CT-2026-0091")).toBeInTheDocument();
    expect(
      within(panel()).getByText(/^Requested by Tunde Okafor · /),
    ).toBeInTheDocument();
    await userEvent.click(btn("Approve lift"));
    const d = screen.getByRole("dialog", { name: /^Approve lifting/ });
    expect(within(d).getByText(LIFT_EFFECT)).toBeInTheDocument();
    const confirm = within(d).getByRole("button", { name: "Approve lift" });
    expect(confirm.className).toMatch(/bad|danger/);
    await typeCode(d);
    await userEvent.click(confirm);
    expect(
      await within(panel()).findByText(/^Lifted by Ada Bakare · /),
    ).toBeInTheDocument();
    expect(spy.mock.calls[0]![1]).toEqual({ version: 2, mfa_code: MOCK_CODE });
    expect(screen.queryByRole("dialog")).toBeNull();
    // No grace period, so nothing to undo.
    expect(within(panel()).queryAllByRole("button")).toHaveLength(0);
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
      await within(panel()).findByText("This request lapsed after 7 days."),
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
  it("a lifted hold shows who lifted it and no controls: no undo", async () => {
    for (const id of ["hold_lc", "hold_hh"]) {
      const { unmount } = renderWithAuth(<Page id={id} />);
      await screen.findByRole("region", { name: "Lift" });
      expect(
        within(panel()).getByText(/^Lifted by Ada Bakare · /),
      ).toBeVisible();
      expect(within(panel()).queryAllByRole("button")).toHaveLength(0);
      unmount();
    }
  });
});

describe("offline", () => {
  it("offline disables every action with the reason", async () => {
    net.online = false;
    for (const [id, names] of [
      ["hold_hv", ["Request lift"]],
      ["hold_rc", ["Approve lift", "Cancel request"]],
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
