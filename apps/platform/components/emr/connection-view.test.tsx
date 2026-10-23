import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { dateLabel } from "@/lib/format";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { ConnectionView } from "./connection-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/connections/emr_hv1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));

let api: ReturnType<typeof createMockPlatform>;
function install(email: string = ADA.email) {
  api = createMockPlatform({
    delayMs: 0,
    me: () => email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => {
  net.online = true;
  install();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const region = (name: string) => screen.getByRole("region", { name });
const statusLine = () =>
  screen.getByRole("status", { name: "Connection status" });
async function open(id: string, user = ADA, queryClient?: QueryClient) {
  renderWithAuth(<ConnectionView id={id} />, { user, queryClient });
  await screen.findByRole("region", { name: "Status" });
  await screen.findByRole("region", { name: "Settings" });
}
async function typeCode(d: HTMLElement, code: string) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

describe("a connection's page", () => {
  it("Havana's Main record reads Connected with its last update", async () => {
    await open("emr_hv1");
    expect(
      screen.getByRole("heading", { name: "Main record" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Havana Hospital" }),
    ).toHaveAttribute("href", "/hospitals/h_havana");
    const s = within(region("Status"));
    expect(s.getByText("Connected")).toBeInTheDocument();
    expect(s.getByText("Last update 2 min ago · 1,284 records")).toBeVisible();
    expect(s.getByText(/^Last test: Worked · /)).toBeVisible();
    expect(
      within(region("Problems in the last 24 hours")).getByText(
        "No problems in the last 24 hours.",
      ),
    ).toBeVisible();
    const set = within(region("Settings"));
    expect(set.getByText(/FHIR R4 server/)).toBeVisible();
    expect(set.getByText("https://records.havana.example/fhir")).toBeVisible();
    expect(set.getByText("mhai-havana")).toBeVisible();
  });

  it("Northgate shows Needs attention and the sign-in refused words x3", async () => {
    await open("emr_ng1");
    expect(
      within(region("Status")).getByText("Needs attention"),
    ).toBeInTheDocument();
    const p = within(region("Problems in the last 24 hours"));
    expect(
      p.getByText(
        /^The record system refused the sign-in\. Check the credentials\. ·/,
      ),
    ).toBeVisible();
    expect(p.getByText("×3")).toBeVisible();
  });

  it("credentials read Set with a date and never a value", async () => {
    await open("emr_hv1");
    const c = await api.getConnection("emr_hv1");
    const at = c.credentials[0]!.set_at!;
    const set = within(region("Settings"));
    expect(set.getByText(`Set · ${dateLabel(at)}`)).toBeVisible();
    expect(document.querySelector("input[type=password]")).toBeNull();
    expect(JSON.stringify(c)).not.toMatch(/SECRET|BEGIN/);
  });

  it("an unset credential reads Not set", async () => {
    await open("emr_wf1");
    expect(within(region("Settings")).getByText("Not set")).toBeVisible();
  });

  it("Switch on is disabled with Test the saved settings first. on Westfield", async () => {
    await open("emr_wf1");
    const s = within(region("Status"));
    expect(s.getByText("Not tested")).toBeInTheDocument();
    const on = s.getByRole("button", { name: "Switch on" });
    expect(on).toBeDisabled();
    expect(s.getByText("Test the saved settings first.")).toBeVisible();
    expect(on).toHaveAccessibleDescription(
      expect.stringContaining("Test the saved settings first."),
    );
  });

  it("Switch off asks for a code and then reads Switched off", async () => {
    const spy = vi.spyOn(api, "setConnectionEnabled");
    await open("emr_hv1");
    await userEvent.click(
      within(region("Status")).getByRole("button", { name: "Switch off" }),
    );
    const d = screen.getByRole("dialog", { name: "Switch off Main record?" });
    expect(
      within(d).getByText(
        "MHAI will stop reading records from this connection. Alerts from it stop until it is switched on again.",
      ),
    ).toBeVisible();
    await typeCode(d, MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Switch off" }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1]).toEqual({
      enabled: false,
      version: 3,
      mfa_code: MOCK_CODE,
    });
    await waitFor(() =>
      expect(
        within(region("Status")).getByText("Switched off"),
      ).toBeInTheDocument(),
    );
    await waitFor(() => expect(statusLine()).toHaveFocus());
    expect(
      within(region("Status")).getByRole("button", { name: "Switch on" }),
    ).toBeEnabled();
  });

  it("Switch on, once tested, asks for a code and reads Connected", async () => {
    await open("emr_rc1");
    const s = within(region("Status"));
    expect(s.getByText("Switched off")).toBeInTheDocument();
    await userEvent.click(s.getByRole("button", { name: "Switch on" }));
    const d = screen.getByRole("dialog", { name: "Switch on Nightly export?" });
    expect(
      within(d).getByText(
        "MHAI will start reading new records from this connection.",
      ),
    ).toBeVisible();
    await typeCode(d, MOCK_CODE);
    await userEvent.click(within(d).getByRole("button", { name: "Switch on" }));
    await waitFor(() =>
      expect(
        within(region("Status")).getByText("Connected"),
      ).toBeInTheDocument(),
    );
  });

  it("Test connection needs no code and toasts the result", async () => {
    const spy = vi.spyOn(api, "testConnection");
    await open("emr_wf1");
    await userEvent.click(
      within(region("Status")).getByRole("button", { name: "Test connection" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (
        await screen.findAllByText(
          "Test failed: The record system refused the sign-in. Check the credentials.",
        )
      )[0],
    ).toBeVisible();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toHaveLength(2);
    expect(
      within(region("Status")).getByText(
        "Didn't work: The record system refused the sign-in. Check the credentials.",
      ),
    ).toBeVisible();
    await waitFor(() => expect(statusLine()).toHaveFocus());
  });

  it("a passing test says Test passed.", async () => {
    await open("emr_hv1");
    await userEvent.click(
      within(region("Status")).getByRole("button", { name: "Test connection" }),
    );
    expect((await screen.findAllByText("Test passed."))[0]).toBeVisible();
  });

  it("an auditor sees no buttons", async () => {
    install(AMARA.email);
    await open("emr_hv1", AMARA);
    expect(within(region("Status")).getByText("Connected")).toBeInTheDocument();
    for (const name of ["Test connection", "Switch on", "Switch off", "Edit"])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("a 409 conflict says Changed by someone else and reloads", async () => {
    vi.spyOn(api, "setConnectionEnabled").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    const get = vi.spyOn(api, "getConnection");
    await open("emr_hv1");
    const before = get.mock.calls.length;
    await userEvent.click(
      within(region("Status")).getByRole("button", { name: "Switch off" }),
    );
    const d = screen.getByRole("dialog", { name: "Switch off Main record?" });
    await typeCode(d, MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Switch off" }),
    );
    expect(await screen.findByText("Changed by someone else")).toBeVisible();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a connection that is gone says so", async () => {
    renderWithAuth(<ConnectionView id="emr_nope" />);
    expect(
      await screen.findByText("This was removed or no longer exists."),
    ).toBeVisible();
  });

  it("offline disables every write with the offline words", async () => {
    net.online = false;
    await open("emr_hv1");
    for (const name of ["Test connection", "Switch off", "Edit"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(
      screen.getAllByText("You're offline. This needs a connection.").length,
    ).toBeGreaterThan(0);
  });
});
