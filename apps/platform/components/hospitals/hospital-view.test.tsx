import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { ApiError } from "@mhai/api-client/errors";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { AMARA, ADA, renderWithAuth } from "@/tests/render";
import { dateLabel } from "./format";
import { HospitalView } from "./hospital-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hospitals/h_eastbrook",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
function install(email: string = ADA.email) {
  api = createMockPlatform({
    delayMs: 0,
    me: () => email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
  return api;
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const newQc = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

async function open(id = "h_eastbrook", user = ADA, queryClient?: QueryClient) {
  renderWithAuth(<HospitalView id={id} />, { user, queryClient });
  return screen.findByRole("region", { name: "Details" });
}
const region = (name: string) => screen.getByRole("region", { name });
const stepUp = (title: string) => screen.getByRole("dialog", { name: title });
const digits = (d: HTMLElement) =>
  within(d).getAllByLabelText(/^Digit \d of 6$/);

async function typeCode(d: HTMLElement, code: string) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

const DEACTIVATE = "Deactivate Eastbrook Medical Centre?";

async function startDeactivate() {
  await open();
  await userEvent.click(
    within(region("Status")).getByRole("button", { name: "Deactivate" }),
  );
  return stepUp(DEACTIVATE);
}

describe("the hospital page", () => {
  it("shows details, status, first admin and recent actions", async () => {
    const details = await open();
    expect(
      screen.getByRole("heading", { name: "Eastbrook Medical Centre" }),
    ).toBeInTheDocument();
    expect(within(details).getByText("EMC")).toBeInTheDocument();
    expect(within(details).getByText("NG")).toBeInTheDocument();
    expect(within(details).getByText("Africa/Lagos")).toBeInTheDocument();
    expect(within(details).getByText("eastbrook.example")).toBeInTheDocument();
    expect(
      within(region("Status")).getByText("Set-up incomplete"),
    ).toBeInTheDocument();
    const admin = region("First hospital admin");
    expect(within(admin).getByText("Chiamaka Obi")).toBeInTheDocument();
    expect(
      within(admin).getByText("chiamaka.obi@eastbrook.example"),
    ).toBeInTheDocument();
    expect(within(admin).getByText("Expired")).toBeInTheDocument();
    const h = await api.getHospital("h_eastbrook");
    expect(
      within(admin).getByText(
        `Expired ${dateLabel(h.first_admin!.expires_at)}`,
      ),
    ).toBeInTheDocument();
    const recent = region("Recent actions");
    expect(
      await within(recent).findByText(
        /invited chiamaka\.obi@eastbrook\.example as first hospital admin/,
      ),
    ).toBeInTheDocument();
    expect(within(recent).getByText(/added the hospital/)).toBeInTheDocument();
    expect(
      within(recent).getByRole("link", { name: "See all" }),
    ).toHaveAttribute("href", "/activity?hospital=h_eastbrook");
  });

  it("recent actions shows at most the latest 5", async () => {
    for (let i = 0; i < 4; i++)
      await api.resendInvite("h_eastbrook", "inv_eastbrook1", {
        idempotencyKey: `k${i}`,
      });
    await open();
    const recent = region("Recent actions");
    await within(recent).findAllByText(/resent the invite/);
    expect(within(recent).getAllByRole("listitem")).toHaveLength(5);
  });

  it("edit then save sends the version and shows the saved values", async () => {
    const spy = vi.spyOn(api, "updateHospital");
    const details = await open();
    await userEvent.click(
      within(details).getByRole("button", { name: "Edit" }),
    );
    const name = within(details).getByLabelText("Name");
    expect(name).toHaveFocus();
    await userEvent.clear(name);
    await userEvent.type(name, "Eastbrook Medical Centre North");
    await userEvent.click(
      within(details).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1]).toMatchObject({
      name: "Eastbrook Medical Centre North",
      version: 1,
    });
    expect(
      await within(details).findByText("Eastbrook Medical Centre North"),
    ).toBeInTheDocument();
    expect(within(details).queryByRole("textbox")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Eastbrook Medical Centre North" }),
    ).toBeInTheDocument();
  });

  it("a stale save shows Changed by someone else and reloads without overwriting", async () => {
    const details = await open();
    await userEvent.click(
      within(details).getByRole("button", { name: "Edit" }),
    );
    // Someone else saves first.
    await api.updateHospital(
      "h_eastbrook",
      { name: "Eastbrook Hospital", version: 1 },
      { idempotencyKey: "other" },
    );
    const name = within(details).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "My Local Name");
    await userEvent.click(
      within(details).getByRole("button", { name: "Save" }),
    );
    const alert = await within(details).findByRole("alert");
    expect(alert).toHaveTextContent("Changed by someone else");
    await userEvent.click(
      within(details).getByRole("button", { name: "Reload" }),
    );
    expect(
      await within(details).findByText("Eastbrook Hospital"),
    ).toBeInTheDocument();
    expect(within(details).queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("My Local Name")).toBeNull();
    expect((await api.getHospital("h_eastbrook")).name).toBe(
      "Eastbrook Hospital",
    );
    // Editing again starts from the latest, not the discarded edits.
    await userEvent.click(
      within(details).getByRole("button", { name: "Edit" }),
    );
    expect(within(details).getByLabelText("Name")).toHaveValue(
      "Eastbrook Hospital",
    );
  });

  it("a hospital that no longer exists says so and links back", async () => {
    renderWithAuth(<HospitalView id="h_nowhere" />);
    expect(
      await screen.findByText("This was removed or no longer exists."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Hospitals" }),
    ).toHaveAttribute("href", "/hospitals");
  });

  it("deactivate needs a reason and a code; Other needs a note", async () => {
    const spy = vi.spyOn(api, "deactivate");
    const d = await startDeactivate();
    expect(
      within(d).getByText(
        "All staff are signed out at once and can't sign in. Pending invites stop working. No data is deleted.",
      ),
    ).toBeInTheDocument();
    for (const r of [
      "Contract ended",
      "Security concern",
      "At the hospital's request",
      "Other",
    ])
      expect(within(d).getByRole("radio", { name: r })).toBeInTheDocument();
    // Focus starts on the first field.
    expect(
      within(d).getByRole("radio", { name: "Contract ended" }),
    ).toHaveFocus();
    const confirm = within(d).getByRole("button", { name: "Deactivate" });
    await userEvent.click(confirm);
    expect(within(d).getByText("Choose a reason.")).toBeInTheDocument();
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("radio", { name: "Other" }));
    await typeCode(d, MOCK_CODE);
    await userEvent.click(confirm);
    expect(within(d).getByText("Add a note.")).toBeInTheDocument();
    expect(within(d).getByLabelText(/Note/)).toHaveFocus();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.type(
      within(d).getByLabelText(/Note/),
      "Moved to a new provider",
    );
    await userEvent.click(confirm);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "other",
      note: "Moved to a new provider",
      mfa_code: MOCK_CODE,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a wrong code clears and refocuses; locked shows the 15-minute message", async () => {
    const d = await startDeactivate();
    await userEvent.click(
      within(d).getByRole("radio", { name: "Contract ended" }),
    );
    const confirm = within(d).getByRole("button", { name: "Deactivate" });
    await typeCode(d, "000000");
    await userEvent.click(confirm);
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    await waitFor(() => expect(digits(d)[0]).toHaveFocus());
    for (const box of digits(d)) expect(box).toHaveValue("");
    // Five wrong codes lock it: even the right code is refused for now.
    for (let i = 0; i < 4; i++) {
      await typeCode(d, "000000");
      await userEvent.click(confirm);
      await waitFor(() => expect(digits(d)[0]).toHaveValue(""));
    }
    await typeCode(d, MOCK_CODE);
    await userEvent.click(confirm);
    expect(
      await within(d).findByText(
        "Too many wrong codes. Try again in 15 minutes.",
      ),
    ).toBeInTheDocument();
    expect((await api.getHospital("h_eastbrook")).status).toBe(
      "setup_incomplete",
    );
  });

  it("a deactivation someone else already made closes the dialog, says so and shows the latest", async () => {
    const d = await startDeactivate();
    // Someone else deactivates it first; this request then clashes.
    await api.deactivate(
      "h_eastbrook",
      { reason: "security_concern", mfa_code: MOCK_CODE },
      { idempotencyKey: "other" },
    );
    vi.spyOn(api, "deactivate").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    await userEvent.click(
      within(d).getByRole("radio", { name: "Contract ended" }),
    );
    await typeCode(d, MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Deactivate" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: DEACTIVATE })).toBeNull(),
    );
    expect(
      await screen.findByText("Changed by someone else"),
    ).toBeInTheDocument();
    const status = region("Status");
    expect(
      await within(status).findByText(/^Deactivated by .* · Security concern$/),
    ).toBeInTheDocument();
    expect(
      within(status).getByRole("button", { name: "Reactivate" }),
    ).toBeInTheDocument();
  });

  it("after deactivating, the page shows Deactivated by Ada Bakare · date · Contract ended", async () => {
    const d = await startDeactivate();
    await userEvent.click(
      within(d).getByRole("radio", { name: "Contract ended" }),
    );
    await typeCode(d, MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Deactivate" }),
    );
    const status = region("Status");
    const today = dateLabel(new Date().toISOString());
    expect(
      await within(status).findByText(
        `Deactivated by Ada Bakare · ${today} · Contract ended`,
      ),
    ).toBeInTheDocument();
    expect(within(status).getByText("Deactivated")).toBeInTheDocument();
    expect(
      within(status).getByRole("button", { name: "Reactivate" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Hospital deactivated")).toBeInTheDocument();
    expect(
      await within(region("Recent actions")).findByText(
        /deactivated the hospital/,
      ),
    ).toBeInTheDocument();
  });

  it("reactivate returns it to Active", async () => {
    const spy = vi.spyOn(api, "reactivate");
    await open("h_westfield");
    const status = region("Status");
    expect(
      within(status).getByText(/^Deactivated by Tunde Okafor · /),
    ).toBeInTheDocument();
    await userEvent.click(
      within(status).getByRole("button", { name: "Reactivate" }),
    );
    const d = stepUp("Reactivate Westfield Clinic?");
    expect(
      within(d).getByText(
        "Staff can sign in again. Old sessions are not revived.",
      ),
    ).toBeInTheDocument();
    const reason = within(d).getByLabelText(/Reason/);
    expect(reason).toHaveFocus();
    await userEvent.type(reason, "New contract signed");
    await typeCode(d, MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Reactivate" }),
    );
    expect(await within(status).findByText("Active")).toBeInTheDocument();
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "New contract signed",
      mfa_code: MOCK_CODE,
    });
    expect(within(status).queryByText(/^Deactivated by/)).toBeNull();
    expect(
      within(status).getByRole("button", { name: "Deactivate" }),
    ).toBeInTheDocument();
  });

  it("resend shows a toast and a new expiry", async () => {
    await open();
    const admin = region("First hospital admin");
    const before = (await api.getHospital("h_eastbrook")).first_admin!
      .expires_at;
    expect(
      within(admin).getByText(`Expired ${dateLabel(before)}`),
    ).toBeInTheDocument();
    await userEvent.click(
      within(admin).getByRole("button", { name: "Resend" }),
    );
    const after = (await api.getHospital("h_eastbrook")).first_admin!
      .expires_at;
    expect(dateLabel(after)).not.toBe(dateLabel(before));
    expect(
      await within(admin).findByText(`Expires ${dateLabel(after)}`),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        `Invite sent again to chiamaka.obi@eastbrook.example`,
      ),
    ).toBeInTheDocument();
  });

  it("invite sends the first admin when there is none", async () => {
    const real = api.getHospital.bind(api);
    let invited = false;
    vi.spyOn(api, "getHospital").mockImplementation(async (id) => {
      const h = await real(id);
      return invited ? h : { ...h, first_admin: null };
    });
    const spy = vi
      .spyOn(api, "inviteAdmin")
      .mockImplementation(async (id, body) => {
        invited = true;
        const h = await real(id);
        return {
          ...h,
          first_admin: { ...h.first_admin!, ...body, status: "pending" },
        };
      });
    await open();
    const admin = region("First hospital admin");
    expect(within(admin).getByText("No first admin yet.")).toBeInTheDocument();
    await userEvent.click(
      within(admin).getByRole("button", { name: "Invite" }),
    );
    await userEvent.type(within(admin).getByLabelText("Name"), "Ngozi Ade");
    await userEvent.type(
      within(admin).getByLabelText("Email"),
      "ngozi@eastbrook.example",
    );
    await userEvent.click(
      within(admin).getByRole("button", { name: "Send invite" }),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![1]).toEqual({
      name: "Ngozi Ade",
      email: "ngozi@eastbrook.example",
    });
    expect(await within(admin).findByText("Ngozi Ade")).toBeInTheDocument();
    expect(within(admin).getByText("Pending")).toBeInTheDocument();
  });

  it("an auditor sees no Edit, Deactivate, Reactivate, Resend or Request removal", async () => {
    for (const id of ["h_eastbrook", "h_westfield"]) {
      install(AMARA.email);
      const view = renderWithAuth(<HospitalView id={id} />, { user: AMARA });
      await screen.findByRole("region", { name: "Details" });
      await within(region("Recent actions")).findAllByRole("listitem");
      expect(
        within(region("First hospital admin")).getByText(/@/),
      ).toBeInTheDocument();
      for (const name of [
        "Edit",
        "Deactivate",
        "Reactivate",
        "Resend",
        "Request removal",
        "Invite",
      ])
        expect(screen.queryByRole("button", { name })).toBeNull();
      view.unmount();
    }
  });

  it("the step-up code is not kept in the query cache after success", async () => {
    const qc = newQc();
    let seen!: ReturnType<typeof useQueryClient>;
    function Probe() {
      seen = useQueryClient();
      return null;
    }
    renderWithAuth(
      <>
        <Probe />
        <HospitalView id="h_eastbrook" />
      </>,
      { queryClient: qc },
    );
    await screen.findByRole("region", { name: "Details" });
    await userEvent.click(
      within(region("Status")).getByRole("button", { name: "Deactivate" }),
    );
    const d = stepUp(DEACTIVATE);
    await userEvent.click(
      within(d).getByRole("radio", { name: "Contract ended" }),
    );
    await typeCode(d, MOCK_CODE);
    await userEvent.click(
      within(d).getByRole("button", { name: "Deactivate" }),
    );
    await within(region("Status")).findByText(/^Deactivated by Ada Bakare/);
    expect(seen).toBe(qc);
    const withCode = () =>
      qc
        .getMutationCache()
        .getAll()
        .filter((m) =>
          JSON.stringify(m.state.variables ?? {}).includes(MOCK_CODE),
        );
    await waitFor(() => expect(withCode()).toEqual([]));
    expect(
      JSON.stringify(
        qc
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(MOCK_CODE);
  });

  it("at phone width the step-up opens as a sheet", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const d = await startDeactivate();
    expect(d.tagName).toBe("SECTION");
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(
      within(d).getByRole("radio", { name: "Contract ended" }),
    ).toHaveFocus();
    // The step-up is only the sheet: no <dialog> (open or closed) carries
    // its title. Other sections may keep their own closed dialogs.
    expect(
      screen.getAllByRole("dialog", { name: DEACTIVATE, hidden: true }),
    ).toEqual([d]);
    for (const el of document.querySelectorAll("dialog"))
      expect(el.textContent).not.toContain(DEACTIVATE);
  });
});
