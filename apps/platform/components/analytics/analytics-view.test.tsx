import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsMode } from "@/lib/api/analytics-fixtures";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { downloadCsv } from "@mhai/ui/csv";
import { AnalyticsView } from "./analytics-view";

const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));
vi.mock("@mhai/ui/csv", async (orig) => ({
  ...(await orig<typeof import("@mhai/ui/csv")>()),
  downloadCsv: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TUNDE = "tunde.okafor@measured-health.example";
let api: PlatformClient;
let who: string;
function install(analytics: AnalyticsMode = "normal", email = ADA.email) {
  who = email;
  api = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
    analytics,
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => {
  net.online = true;
  install();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
  vi.mocked(downloadCsv).mockClear();
});

const NGH_ACK = /Critical alerts acknowledged 2× slower/;
const region = (name: string | RegExp) => screen.getByRole("region", { name });
const changes = () =>
  within(region("What changed")).getByRole("list", { name: "Changes" });
const rows = () => within(changes()).getAllByRole("button");
const detail = () => screen.getByRole("region", { name: NGH_ACK });

async function open(user = ADA) {
  renderWithAuth(<AnalyticsView />, { user });
  await within(region("What changed")).findByRole("list", { name: "Changes" });
}

describe("the Analytics page", () => {
  it("opens on What changed with the most serious first and selected", async () => {
    await open();
    expect(
      screen.getByRole("heading", { level: 1, name: "Analytics" }),
    ).toBeInTheDocument();
    expect(
      within(region("What changed")).getByText(/^Updated \d{2}:\d{2}$/),
    ).toBeInTheDocument();
    const r = rows();
    expect(r).toHaveLength(5);
    expect(r[0]).toHaveAccessibleName(NGH_ACK);
    expect(r[0]).toHaveAttribute("aria-current", "true");
    for (const other of r.slice(1))
      expect(other).not.toHaveAttribute("aria-current");
    expect(
      await screen.findByRole("heading", { level: 2, name: NGH_ACK }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveValue("30d");
  });

  it("Show all reveals the rest", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /Riverside/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show all (6)" }));
    expect(rows()).toHaveLength(6);
    // Followed up, so it sits last.
    expect(rows()[5]).toHaveAccessibleName(/Riverside Children's Hospital/);
    expect(rows()[5]).toHaveAccessibleName(/Followed up by Tunde Okafor · /);
    expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
  });

  it("the detail shows the chart, the size line and the hospital admins", async () => {
    await open();
    const d = detail();
    expect(
      await within(d).findByRole("region", {
        name: "Critical median time to acknowledge: Northgate General Hospital",
      }),
    ).toBeInTheDocument();
    expect(
      within(d).getByText("Median of the other hospitals"),
    ).toBeInTheDocument();
    expect(
      within(d).getByText(
        /^214 staff · ([\d,]+|Fewer than 5) questions this period$/,
      ),
    ).toBeInTheDocument();
    const admins = await within(d).findByRole("region", {
      name: "Hospital admin",
    });
    expect(within(admins).getByText("Ifeoma Nnaji")).toBeInTheDocument();
    expect(
      within(admins).getByText("emeka.udoh@northgate.example"),
    ).toBeInTheDocument();
    expect(
      within(d).getByRole("link", { name: "Open hospital" }),
    ).toHaveAttribute("href", "/hospitals/h_northgate");
  });

  it("Copy email copies", async () => {
    const user = userEvent.setup();
    await open();
    const admins = await within(detail()).findByRole("region", {
      name: "Hospital admin",
    });
    await user.click(
      within(admins).getByRole("button", { name: "Copy email: Emeka Udoh" }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      "emeka.udoh@northgate.example",
    );
    expect(await screen.findByText("Email copied")).toBeInTheDocument();
  });

  it("a platform admin marks followed up with a note, and it shows 'Followed up by Ada Bakare · …'", async () => {
    const send = vi.spyOn(api, "followUp");
    await open();
    const d = detail();
    await userEvent.type(
      within(d).getByLabelText("Note (optional)"),
      "Rang the ward.",
    );
    expect(within(d).getByText("14 / 500 characters")).toBeInTheDocument();
    await userEvent.click(
      within(d).getByRole("button", { name: "Mark followed up" }),
    );
    expect(
      await within(d).findByText(
        /^Followed up by Ada Bakare · \d{1,2} [A-Z][a-z]{2}$/,
      ),
    ).toBeInTheDocument();
    expect(within(d).getByText("Rang the ward.")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(
      "chg_ngh_critical_ack",
      { note: "Rang the ward.", version: 1 },
      { idempotencyKey: expect.any(String) },
    );
    // Still selected, now below the four rows not yet followed up.
    const current = within(changes()).getByRole("button", { current: true });
    expect(current).toHaveAccessibleName(NGH_ACK);
    expect(rows()[4]).toBe(current);
    // Its author can edit the note; any platform admin can undo.
    expect(
      within(d).getByRole("button", { name: "Edit note" }),
    ).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Undo" }));
    expect(
      await within(d).findByText("Not followed up yet."),
    ).toBeInTheDocument();
  });

  it("a 501-character note is refused", async () => {
    const send = vi.spyOn(api, "followUp");
    await open();
    const d = detail();
    const note = within(d).getByLabelText("Note (optional)");
    await userEvent.click(note);
    await userEvent.paste("x".repeat(501));
    expect(within(d).getByText("501 / 500 characters")).toBeInTheDocument();
    await userEvent.click(
      within(d).getByRole("button", { name: "Mark followed up" }),
    );
    expect(within(d).getByRole("alert")).toHaveTextContent(
      "A note can be 500 characters at most.",
    );
    expect(note).toHaveAttribute("aria-invalid", "true");
    expect(send).not.toHaveBeenCalled();
    expect(within(d).getByText("Not followed up yet.")).toBeInTheDocument();
  });

  it("a stale follow-up shows Changed by someone else and reloads", async () => {
    await open();
    const d = detail();
    // Tunde follows it up first, from another browser.
    who = TUNDE;
    await api.followUp(
      "chg_ngh_critical_ack",
      { version: 1 },
      { idempotencyKey: "tunde-1" },
    );
    who = ADA.email;
    await userEvent.click(
      within(d).getByRole("button", { name: "Mark followed up" }),
    );
    expect(
      await within(d).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    // Reloaded: Tunde's follow-up shows, never overwritten by Ada.
    expect(
      await within(d).findByText(/^Followed up by Tunde Okafor · /),
    ).toBeInTheDocument();
    expect(
      within(d).queryByRole("button", { name: "Mark followed up" }),
    ).toBeNull();
    expect(within(d).queryByRole("button", { name: "Edit note" })).toBeNull();
    expect(within(d).getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("an auditor sees the follow-up line and no controls", async () => {
    install("normal", AMARA.email);
    await open(AMARA);
    await userEvent.click(screen.getByRole("button", { name: "Show all (6)" }));
    await userEvent.click(rows()[5]!);
    const d = screen.getByRole("region", {
      name: /Riverside Children's Hospital: questions down/,
    });
    expect(
      within(d).getByText(/^Followed up by Tunde Okafor · /),
    ).toBeInTheDocument();
    expect(
      within(d).getByText(/two wards changed their rota/),
    ).toBeInTheDocument();
    for (const name of ["Mark followed up", "Undo", "Edit note"])
      expect(within(d).queryByRole("button", { name })).toBeNull();
    expect(within(d).queryByLabelText("Note (optional)")).toBeNull();
    // Northgate: not followed up, and still no controls.
    await userEvent.click(rows()[0]!);
    expect(
      within(detail()).getByText("Not followed up yet."),
    ).toBeInTheDocument();
    expect(
      within(detail()).queryByRole("button", { name: "Mark followed up" }),
    ).toBeNull();
  });

  it("the guard fixture shows Couldn't load what changed, never Nothing unusual", async () => {
    install("guard");
    renderWithAuth(<AnalyticsView />);
    const area = region("What changed");
    expect(
      await within(area).findByText("Couldn't load what changed."),
    ).toBeInTheDocument();
    expect(
      within(area).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing unusual this period")).toBeNull();
    expect(screen.queryByRole("list", { name: "Changes" })).toBeNull();
    // No detail either: the only area heading is What changed.
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["What changed"]);
  });

  it("every area unavailable still renders the header and each Couldn't load", async () => {
    install("unavailable");
    renderWithAuth(<AnalyticsView />);
    expect(
      await screen.findByText("Couldn't load what changed."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Period" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    expect(screen.queryByText("Nothing unusual this period")).toBeNull();
    expect(screen.queryByText(/^0$/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(vi.mocked(downloadCsv).mock.calls[0]![1]).toContain("Couldn't load");
  });

  it("Download CSV builds the file for the chosen period", async () => {
    await open();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Period" }),
      "Last 90 days",
    );
    const csvButton = screen.getByRole("button", { name: "Download CSV" });
    await waitFor(() => expect(csvButton).toBeEnabled());
    await userEvent.click(csvButton);
    expect(downloadCsv).toHaveBeenCalledOnce();
    const [name, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(name).toMatch(/^analytics-last-90-days-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv).toContain("Last 90 days");
    expect(csv).toContain("What changed");
    expect(csv).not.toContain("Last 30 days");
  });

  it("offline disables follow-up and CSV with the reason", async () => {
    net.online = false;
    await open();
    const reason = "You're offline. This needs a connection.";
    const csv = screen.getByRole("button", { name: "Download CSV" });
    expect(csv).toBeDisabled();
    expect(csv).toHaveAccessibleDescription(reason);
    const d = detail();
    const mark = within(d).getByRole("button", { name: "Mark followed up" });
    expect(mark).toBeDisabled();
    expect(mark).toHaveAccessibleDescription(reason);
    expect(within(d).getByLabelText("Note (optional)")).toBeDisabled();
  });

  it("at phone width the list then detail with Back", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    await open();
    // The list alone.
    expect(
      screen.queryByRole("heading", { level: 2, name: NGH_ACK }),
    ).toBeNull();
    const row = rows()[0]!;
    await userEvent.click(row);
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: NGH_ACK,
    });
    expect(heading).toHaveFocus();
    expect(screen.queryByRole("region", { name: "What changed" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(region("What changed")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: NGH_ACK }),
    ).toBeNull();
    expect(rows()[0]).toHaveFocus();
  });
});
