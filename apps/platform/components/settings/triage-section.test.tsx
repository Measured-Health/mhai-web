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
import { useSettings } from "@/lib/queries/settings";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { PendingRequests } from "./pending-requests";
import { TriageSection } from "./triage-section";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));

const SIGNOFF = "Clinical sign-off (who approved it and their reference)";
let api: PlatformClient;
let who: string;
let ready: "ready" | "not_ready";
function install(email: string = ADA.email) {
  who = email;
  api = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
    triage: () => ready,
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => {
  ready = "ready";
  install();
});
afterEach(() => {
  net.online = true;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

async function as<T>(email: string, fn: () => Promise<T>) {
  const was = who;
  who = email;
  try {
    return await fn();
  } finally {
    who = was;
  }
}
function Page() {
  const q = useSettings();
  return q.data ? (
    <>
      <PendingRequests settings={q.data} />
      <TriageSection settings={q.data} />
    </>
  ) : (
    <p>Loading</p>
  );
}
async function open(user: User = ADA) {
  renderWithAuth(<Page />, { user });
  return screen.findByRole("region", { name: "Triage" });
}
const region = () => screen.getByRole("region", { name: "Triage" });
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
/** Tunde asks to switch triage on. */
const tundeAsks = () =>
  as(TEAM_EMAILS.tunde, () =>
    api.setTriage(
      {
        enabled: true,
        reason: "Validated",
        clinical_signoff: "Dr Ifeoma Nwosu, memo 12",
        version: 1,
        mfa_code: MOCK_CODE,
      },
      { idempotencyKey: "tr1" },
    ),
  );
/** Triage on, through two admins. */
async function switchedOn() {
  await tundeAsks();
  const s = await api.getSettings();
  await api.approveRequest(
    s.pending[0]!.id,
    { version: s.pending[0]!.version, mfa_code: MOCK_CODE },
    { idempotencyKey: "tr2" },
  );
}

describe("the triage gate", () => {
  it("off and ready offers Ask to switch on, which needs a reason, the sign-off and the code, then shows the pending request", async () => {
    const spy = vi.spyOn(api, "setTriage");
    await open();
    expect(within(region()).getByText("Triage: Off")).toBeInTheDocument();
    expect(within(region()).getByText("Ready to switch on")).toBeVisible();
    await userEvent.click(
      within(region()).getByRole("button", { name: "Ask to switch on" }),
    );
    const d = await screen.findByRole("dialog", {
      name: "Ask to switch triage on?",
    });
    const confirm = within(d).getByRole("button", { name: "Ask to switch on" });
    // Nothing yet: a reason, then the sign-off, then the code.
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter a reason.")).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Validated");
    await userEvent.click(confirm);
    expect(
      within(d).getByText(
        "Enter clinical sign-off (who approved it and their reference).",
      ),
    ).toBeInTheDocument();
    const field = within(d).getByLabelText(
      new RegExp(`^${SIGNOFF.replace(/[()]/g, "\\$&")}`),
    );
    expect(field).toHaveAttribute("maxlength", "200");
    await userEvent.type(field, "Dr Nwosu, memo 12");
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await typeCode(d);
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![0]).toEqual({
      enabled: true,
      reason: "Validated",
      clinical_signoff: "Dr Nwosu, memo 12",
      version: 1,
      mfa_code: MOCK_CODE,
    });
    // The request is pending: no second ask, and it is waiting.
    expect(
      await within(region()).findByText(
        "Waiting for a different platform admin to approve",
      ),
    ).toBeInTheDocument();
    expect(
      within(region()).queryByRole("button", { name: "Ask to switch on" }),
    ).toBeNull();
    expect(within(region()).getByText("Triage: Off")).toBeInTheDocument();
  });

  it("not ready shows Not ready: the validation report is missing and no switch-on", async () => {
    ready = "not_ready";
    await open();
    expect(within(region()).getByText("Triage: Off")).toBeInTheDocument();
    expect(
      within(region()).getByText("Not ready: the validation report is missing"),
    ).toBeVisible();
    expect(within(region()).queryAllByRole("button")).toHaveLength(0);
  });

  it("on offers Switch off, at once", async () => {
    await switchedOn();
    const spy = vi.spyOn(api, "setTriage");
    await open();
    expect(within(region()).getByText("Triage: On")).toBeInTheDocument();
    expect(within(region()).queryByText(/Ready to switch on/)).toBeNull();
    await userEvent.click(
      within(region()).getByRole("button", { name: "Switch off" }),
    );
    const d = await screen.findByRole("dialog", {
      name: "Switch triage off?",
    });
    // A reason and the code only: no sign-off.
    expect(within(d).queryByLabelText(/Clinical sign-off/)).toBeNull();
    await userEvent.type(
      within(d).getByLabelText(/^Reason/),
      "Paused for review",
    );
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Switch off" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![0]).toEqual({
      enabled: false,
      reason: "Paused for review",
      version: 3,
      mfa_code: MOCK_CODE,
    });
    expect(
      await within(region()).findByText("Triage: Off"),
    ).toBeInTheDocument();
    // At once: nothing waiting for anyone.
    expect(within(region()).queryByText(/Waiting for a different/)).toBeNull();
  });

  it("an approval refused as not_ready shows No longer ready to switch on.", async () => {
    await tundeAsks();
    await open();
    // Readiness is lost between the request and the approval.
    ready = "not_ready";
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    const d = await screen.findByRole("dialog", { name: /^Approve/ });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve change" }),
    );
    expect(
      await screen.findByText("No longer ready to switch on."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await api.getSettings()).triage.enabled).toBe(false);
  });

  it("asking when it is no longer ready shows No longer ready to switch on.", async () => {
    await open();
    ready = "not_ready";
    await userEvent.click(
      within(region()).getByRole("button", { name: "Ask to switch on" }),
    );
    const d = await screen.findByRole("dialog", {
      name: "Ask to switch triage on?",
    });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Validated");
    await userEvent.type(
      within(d).getByLabelText(/^Clinical sign-off/),
      "Dr N",
    );
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Ask to switch on" }),
    );
    expect(
      await within(region()).findByText("No longer ready to switch on."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an auditor sees the state only", async () => {
    await open(AMARA);
    expect(within(region()).getByText("Triage: Off")).toBeInTheDocument();
    expect(within(region()).getByText("Ready to switch on")).toBeVisible();
    expect(within(region()).queryAllByRole("button")).toHaveLength(0);
  });

  it("offline disables the button with the reason", async () => {
    net.online = false;
    await open();
    expect(
      within(region()).getByRole("button", { name: "Ask to switch on" }),
    ).toBeDisabled();
    expect(
      screen.getByText("You're offline. This needs a connection."),
    ).toBeInTheDocument();
  });

  it("a reason this app doesn't know fails the section closed", async () => {
    const m = api;
    api = {
      ...m,
      getSettings: async () => {
        const s = await m.getSettings();
        s.triage.ready = false;
        (s.triage as { not_ready_reason: string }).not_ready_reason =
          "gpu_missing";
        return s;
      },
    } as PlatformClient;
    __setPlatformClientForTests(api);
    renderWithAuth(<Page />, { user: ADA });
    expect(
      await screen.findByText("Couldn't load triage."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/gpu_missing/)).toBeNull();
  });
});
