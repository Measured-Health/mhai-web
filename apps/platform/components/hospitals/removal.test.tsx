import { QueryClient } from "@tanstack/react-query";
import {
  act,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { BlockedError, type PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import type { User } from "@/lib/auth/types";
import { hospitalKey, useHospital } from "@/lib/queries/hospitals";
import { REMOVAL_POLL_MS, useApproveRemoval } from "@/lib/queries/removal";
import { ADA, AMARA, renderWithAuth, TestProviders } from "@/tests/render";
import { DangerZone } from "./danger-zone";
import { dateLabel } from "./format";
import { checkLines, RemovalPanel } from "./removal-panel";

const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/hospitals/h_southpoint",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TUNDE: User = {
  ...ADA,
  id: "tunde.okafor",
  email: TEAM_EMAILS.tunde,
  name: "Tunde Okafor",
};

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

/** As another person, straight to the API (the "other admin" in a test). */
async function as<T>(email: string, fn: () => Promise<T>) {
  const was = who;
  who = email;
  try {
    return await fn();
  } finally {
    who = was;
  }
}

const newQc = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The page's wiring: the hospital from the cache, both parts below it. */
function Page({ id }: { id: string }) {
  const q = useHospital(id);
  if (!q.data) return <p>Loading</p>;
  return (
    <>
      <DangerZone hospital={q.data} />
      <RemovalPanel hospital={q.data} />
    </>
  );
}

let lastQc: QueryClient;
const qcOf = () => lastQc;
async function open(id: string, user: User = ADA, queryClient = newQc()) {
  lastQc = queryClient;
  renderWithAuth(<Page id={id} />, { user, queryClient });
  await screen.findByRole("region", {
    name: /^(Danger zone|Removal)$/,
  });
  return queryClient;
}
const region = (name: string) => screen.getByRole("region", { name });
const panel = () => region("Removal");
const btn = (name: string) => screen.getByRole("button", { name });

async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

const BLOCKED = "Removal can't go ahead until the checks above are cleared.";
const GONE = "This was removed or no longer exists.";

describe("the danger zone", () => {
  it("request removal is disabled until deactivated", async () => {
    await open("h_eastbrook");
    const zone = region("Danger zone");
    const b = within(zone).getByRole("button", { name: "Request removal" });
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription("Deactivate the hospital first.");
    expect(
      within(zone).getByText("Deactivate the hospital first."),
    ).toBeVisible();
  });

  it("a deactivated hospital can be requested with a reason and a code", async () => {
    const spy = vi.spyOn(api, "requestRemoval");
    await open("h_westfield");
    await userEvent.click(btn("Request removal"));
    const d = screen.getByRole("dialog", {
      name: "Request removal of Westfield Clinic?",
    });
    expect(
      within(d).getByText(
        "Removal is permanent. After it's done only the audit trail remains.",
      ),
    ).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/Reason/), "Contract over.");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Request removal" }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "Contract over.",
      mfa_code: MOCK_CODE,
    });
    const p = await screen.findByRole("region", { name: "Removal" });
    expect(
      within(p).getByText(
        `Requested by Ada Bakare · ${dateLabel(new Date(clock).toISOString())} · Contract over.`,
      ),
    ).toBeInTheDocument();
    expect(within(p).getByText("All checks are clear")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("region", { name: "Danger zone" })).toBeNull();
  });
});

describe("the removal panel", () => {
  it("request shows the checks and a blocked approve for the legal-hold hospital", async () => {
    await open("h_harbour");
    const p = panel();
    const h = await api.getHospital("h_harbour");
    expect(
      within(p).getByText(
        `Requested by Tunde Okafor · ${dateLabel(h.removal!.requested_at)} · The hospital closed in June.`,
      ),
    ).toBeInTheDocument();
    expect(within(p).getByText("1 legal hold is active")).toBeInTheDocument();
    expect(
      within(p).getByText("A data export is required · done"),
    ).toBeInTheDocument();
    expect(within(p).queryByText("All checks are clear")).toBeNull();
    const approve = within(p).getByRole("button", { name: "Approve removal" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(
      `${BLOCKED} Legal holds are managed in a later release.`,
    );
    expect(within(p).getByText(BLOCKED)).toBeVisible();
    expect(
      within(p).getByText("Legal holds are managed in a later release."),
    ).toBeVisible();
    expect(
      within(p).getByRole("button", { name: "Cancel request" }),
    ).toBeEnabled();
  });

  it("writes the checks in plain words with plurals and dates", () => {
    const checks = {
      legal_holds: 2,
      retention_until: "2031-03-03",
      export_required: true,
      export_done: false,
    };
    expect(
      checkLines(checks, ["legal_hold", "retention", "export_required"]),
    ).toEqual([
      { text: "2 legal holds are active", blocks: true },
      { text: "Records must be kept until 3 Mar 2031", blocks: true },
      { text: "A data export is required · not done yet", blocks: true },
    ]);
    expect(
      checkLines(
        {
          legal_holds: 0,
          retention_until: null,
          export_required: false,
          export_done: false,
        },
        ["legal_hold", "retention"],
      ),
    ).toEqual([
      { text: "A legal hold is active", blocks: true },
      { text: "Records are still inside their retention period", blocks: true },
    ]);
    expect(
      checkLines(
        {
          legal_holds: 0,
          retention_until: null,
          export_required: false,
          export_done: false,
        },
        [],
      ),
    ).toEqual([{ text: "All checks are clear", blocks: false }]);
  });

  it("the requester sees 'Waiting for a different platform admin to approve'", async () => {
    // The server says who asked (requested_by_you), not the session's name.
    install(TEAM_EMAILS.tunde);
    await open("h_southpoint", { ...TUNDE, name: "T. Okafor" });
    const p = panel();
    expect(
      within(p).getByText("Waiting for a different platform admin to approve"),
    ).toBeInTheDocument();
    expect(
      within(p).queryByRole("button", { name: "Approve removal" }),
    ).toBeNull();
    expect(
      within(p).getByRole("button", { name: "Cancel request" }),
    ).toBeEnabled();
  });

  it("another admin with the requester's name still sees Approve", async () => {
    // Ada signed in, with the same name as Tunde who asked.
    await open("h_southpoint", { ...ADA, name: "Tunde Okafor" });
    const p = panel();
    expect(
      within(p).getByRole("button", { name: "Approve removal" }),
    ).toBeEnabled();
    expect(
      within(p).queryByText(
        "Waiting for a different platform admin to approve",
      ),
    ).toBeNull();
  });

  it("Ada approves Southpoint (requested by Tunde) with a code; it shows Removal scheduled", async () => {
    const spy = vi.spyOn(api, "approveRemoval");
    await open("h_southpoint");
    expect(
      within(panel()).getByText("All checks are clear"),
    ).toBeInTheDocument();
    await userEvent.click(btn("Approve removal"));
    const d = screen.getByRole("dialog", {
      name: "Approve removal of Southpoint Hospital?",
    });
    expect(within(d).queryByLabelText(/Reason/)).toBeNull();
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve removal" }),
    );
    expect(
      await within(panel()).findByText(
        `Removal scheduled · approved by Ada Bakare · ${dateLabel(new Date(clock).toISOString())}`,
      ),
    ).toBeInTheDocument();
    expect(spy.mock.calls[0]![1]).toEqual({ mfa_code: MOCK_CODE });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(panel()).queryByRole("button", { name: "Approve removal" }),
    ).toBeNull();
  });

  it("a minute later the page shows Removed and no actions", async () => {
    await as(TEAM_EMAILS.ada, () =>
      api.approveRemoval(
        "h_southpoint",
        { mfa_code: MOCK_CODE },
        {
          idempotencyKey: "a",
        },
      ),
    );
    const qc = await open("h_southpoint");
    expect(
      within(panel()).getByText(/^Removal scheduled · approved by Ada Bakare/),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByRole("button", { name: "Cancel request" }),
    ).toBeEnabled();
    clock += 60_000;
    await act(() =>
      qc.refetchQueries({ queryKey: hospitalKey("h_southpoint") }),
    );
    expect(
      await within(panel()).findByText(
        "Removed. Only the audit trail remains.",
      ),
    ).toBeInTheDocument();
    const h = await api.getHospital("h_southpoint");
    expect(
      within(panel()).getByText(
        `Approved by Ada Bakare · ${dateLabel(h.removal!.approved_at!)}`,
      ),
    ).toBeInTheDocument();
    expect(within(panel()).queryByText(/Removal scheduled/)).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByRole("region", { name: "Danger zone" })).toBeNull();
  });

  it("while scheduled the page re-reads the hospital every 15 seconds until Removed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await api.approveRemoval(
        "h_southpoint",
        { mfa_code: MOCK_CODE },
        { idempotencyKey: "a" },
      );
      const reads = vi.spyOn(api, "getHospital");
      await open("h_southpoint");
      await within(panel()).findByText(/^Removal scheduled/);
      const before = reads.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(REMOVAL_POLL_MS));
      expect(reads.mock.calls.length).toBeGreaterThan(before);
      expect(within(panel()).getByText(/^Removal scheduled/)).toBeVisible();
      clock += 60_000;
      await act(() => vi.advanceTimersByTimeAsync(REMOVAL_POLL_MS));
      expect(
        await within(panel()).findByText(
          "Removed. Only the audit trail remains.",
        ),
      ).toBeInTheDocument();
      // Removed: no more reading.
      const after = reads.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(4 * REMOVAL_POLL_MS));
      expect(reads.mock.calls.length).toBe(after);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a requested removal is not polled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const reads = vi.spyOn(api, "getHospital");
      await open("h_harbour");
      const before = reads.mock.calls.length;
      await act(() => vi.advanceTimersByTimeAsync(4 * REMOVAL_POLL_MS));
      expect(reads.mock.calls.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancelling an approved removal asks first; Keep keeps it", async () => {
    await api.approveRemoval(
      "h_southpoint",
      { mfa_code: MOCK_CODE },
      { idempotencyKey: "a" },
    );
    const spy = vi.spyOn(api, "cancelRemoval");
    await open("h_southpoint");
    await userEvent.click(btn("Cancel request"));
    const d = screen.getByRole("dialog", {
      name: "Cancel the removal of Southpoint Hospital?",
    });
    expect(
      within(d).getByText("It will need a new request and approval."),
    ).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Keep" })).toHaveFocus();
    await userEvent.click(within(d).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(btn("Cancel request"));
    await userEvent.click(
      within(
        screen.getByRole("dialog", {
          name: "Cancel the removal of Southpoint Hospital?",
        }),
      ).getByRole("button", { name: "Cancel removal" }),
    );
    expect(
      await screen.findByRole("region", { name: "Danger zone" }),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await api.getHospital("h_southpoint")).status).toBe("deactivated");
  });

  it("approve after the other admin cancelled shows 'This was removed or no longer exists.' and refreshes", async () => {
    await open("h_southpoint");
    await as(TEAM_EMAILS.tunde, () =>
      api.cancelRemoval("h_southpoint", { idempotencyKey: "c" }),
    );
    await userEvent.click(btn("Approve removal"));
    const d = screen.getByRole("dialog", {
      name: "Approve removal of Southpoint Hospital?",
    });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve removal" }),
    );
    expect((await screen.findAllByText(GONE))[0]).toBeVisible();
    // Refreshed: back to Deactivated, so the danger zone is back.
    const zone = await screen.findByRole("region", { name: "Danger zone" });
    expect(
      within(zone).getByRole("button", { name: "Request removal" }),
    ).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Removal" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancel after the other admin cancelled says so and refreshes", async () => {
    await open("h_harbour");
    await as(TEAM_EMAILS.tunde, () =>
      api.cancelRemoval("h_harbour", { idempotencyKey: "c" }),
    );
    await userEvent.click(btn("Cancel request"));
    expect((await screen.findAllByText(GONE))[0]).toBeVisible();
    expect(
      await screen.findByRole("region", { name: "Danger zone" }),
    ).toBeInTheDocument();
  });

  it("409 blocked from the server shows the plain-words checks", async () => {
    vi.spyOn(api, "approveRemoval").mockRejectedValue(
      new BlockedError(["legal_hold", "retention"]),
    );
    await open("h_southpoint");
    // After the refusal the server's re-read names what blocks.
    const read = api.getHospital.bind(api);
    const reads = vi
      .spyOn(api, "getHospital")
      .mockImplementation(async (id) => {
        const h = await read(id);
        h.removal!.checks.legal_holds = 1;
        h.removal!.checks.retention_until = "2031-03-03";
        h.removal!.blocking = ["legal_hold", "retention"];
        return h;
      });
    await userEvent.click(btn("Approve removal"));
    const d = screen.getByRole("dialog", {
      name: "Approve removal of Southpoint Hospital?",
    });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve removal" }),
    );
    const alert = await within(panel()).findByRole("alert");
    expect(alert).toHaveTextContent("Removal can't go ahead yet.");
    const p = panel();
    expect(within(p).getByText("1 legal hold is active")).toBeVisible();
    expect(
      within(p).getByText("Records must be kept until 3 Mar 2031"),
    ).toBeVisible();
    expect(btn("Approve removal")).toBeDisabled();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Once a refresh says the checks are clear, the refusal goes too.
    reads.mockRestore();
    await act(() => qcOf().refetchQueries());
    await waitFor(() => expect(within(p).queryByRole("alert")).toBeNull());
    expect(within(p).getByText("All checks are clear")).toBeVisible();
    expect(btn("Approve removal")).toBeEnabled();
  });

  it("cancel returns the hospital to Deactivated", async () => {
    await open("h_harbour");
    await userEvent.click(btn("Cancel request"));
    const zone = await screen.findByRole("region", { name: "Danger zone" });
    expect(
      within(zone).getByRole("button", { name: "Request removal" }),
    ).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Removal" })).toBeNull();
    expect(screen.getAllByText("Removal request cancelled")[0]).toBeVisible();
    expect((await api.getHospital("h_harbour")).status).toBe("deactivated");
  });

  it("an auditor sees the panel but no actions", async () => {
    install(AMARA.email);
    const view = await (async () => {
      renderWithAuth(<Page id="h_harbour" />, { user: AMARA });
      return screen.findByRole("region", { name: "Removal" });
    })();
    expect(
      within(view).getByText("1 legal hold is active"),
    ).toBeInTheDocument();
    expect(
      within(view).getByText(/^Requested by Tunde Okafor/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("an auditor sees the danger zone without Request removal", async () => {
    install(AMARA.email);
    renderWithAuth(<Page id="h_westfield" />, { user: AMARA });
    await screen.findByRole("region", { name: "Danger zone" });
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("offline disables every action with the reason", async () => {
    net.online = false;
    await open("h_southpoint");
    for (const name of ["Approve removal", "Cancel request"]) {
      const b = btn(name);
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(
        "You're offline. This needs a connection.",
      );
    }
    expect(
      within(panel()).getByText("You're offline. This needs a connection."),
    ).toBeVisible();
  });

  it("offline disables Request removal with the reason", async () => {
    net.online = false;
    await open("h_westfield");
    const b = btn("Request removal");
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription(
      "You're offline. This needs a connection.",
    );
  });
});

describe("the removal hooks", () => {
  it("approve puts the reply in the hospital's cache and forgets the code", async () => {
    const qc = newQc();
    await qc.fetchQuery({
      queryKey: hospitalKey("h_southpoint"),
      queryFn: () => api.getHospital("h_southpoint"),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestProviders queryClient={qc}>{children}</TestProviders>
    );
    const { result } = renderHook(() => useApproveRemoval("h_southpoint"), {
      wrapper,
    });
    await act(() => result.current.mutateAsync({ mfa_code: MOCK_CODE }));
    expect(
      qc.getQueryData<{ status: string }>(hospitalKey("h_southpoint"))?.status,
    ).toBe("removal_scheduled");
    act(() => result.current.reset());
    await waitFor(() =>
      expect(
        qc
          .getMutationCache()
          .getAll()
          .filter((m) =>
            JSON.stringify(m.state.variables ?? {}).includes(MOCK_CODE),
          ),
      ).toEqual([]),
    );
  });
});
