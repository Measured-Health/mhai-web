import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalysisQuery,
  AnalysisStatus,
} from "@/lib/api/analysis-contract";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import type { AnalysisMode } from "@/lib/api/mock-analysis";
import { ApiError } from "@mhai/api-client/errors";
import { downloadCsv } from "@mhai/ui/csv";
import { ADA, AMARA, GrabAuth, auth, renderWithAuth } from "@/tests/render";
import { AppShell } from "../shell/app-shell";
import { AnalysisGate } from "./analysis-gate";

const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/api-client/network", async (orig) => {
  const real = await orig<typeof import("@mhai/api-client/network")>();
  return {
    ...real,
    useNetwork: () => ({ online: net.online, saveData: false, slow: false }),
  };
});
vi.mock("@mhai/ui/csv", async (orig) => ({
  ...(await orig<typeof import("@mhai/ui/csv")>()),
  downloadCsv: vi.fn(),
}));
const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/analysis",
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

let api: PlatformClient;
function install(analysis: AnalysisMode = "normal", email = ADA.email) {
  api = createMockPlatform({ delayMs: 0, me: () => email, analysis });
  __setPlatformClientForTests(api);
}
beforeEach(() => {
  net.online = true;
  nav.replace.mockClear();
  nav.push.mockClear();
  install();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
  vi.mocked(downloadCsv).mockClear();
  vi.restoreAllMocks();
});

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

function render(user = ADA, queryClient = newClient()) {
  renderWithAuth(
    <>
      <GrabAuth />
      <AnalysisGate />
    </>,
    { user, queryClient },
  );
  return queryClient;
}
/** Waits for the first view to read. */
async function loaded() {
  await screen.findByRole("heading", {
    level: 2,
    name: "Prevalence and trends",
  });
  await screen.findByText(/^Updated \d\d:\d\d$/);
}
const select = (name: string) =>
  screen.getByRole("combobox", { name }) as HTMLSelectElement;
const analysisQueries = (qc: QueryClient) =>
  qc.getQueryCache().findAll({ queryKey: ["analysis"] });
const viewQueries = (qc: QueryClient) =>
  qc.getQueryCache().findAll({ queryKey: ["analysis", "view"] });
const lastQuery = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.at(-1)![1] as AnalysisQuery;
const phone = () =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe("the Analysis gate", () => {
  it("an auditor opening /analysis goes to the access trail", async () => {
    install("normal", AMARA.email);
    const status = vi.spyOn(api, "getAnalysisStatus");
    render(AMARA);
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/activity?tab=analysis-access"),
    );
    expect(status).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Download CSV/ })).toBeNull();
  });

  it("off shows Analysis isn't available yet", async () => {
    install("off");
    const view = vi.spyOn(api, "getAnalysisView");
    render();
    expect(
      await screen.findByText("Analysis isn't available yet"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Analysis" }));
    expect(screen.queryByRole("button", { name: /Download CSV/ })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(view).not.toHaveBeenCalled();
  });

  it("a failed status also shows Analysis isn't available yet", async () => {
    vi.spyOn(api, "getAnalysisStatus").mockRejectedValue(
      new ApiError(503, "unavailable"),
    );
    render();
    expect(
      await screen.findByText("Analysis isn't available yet"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/hospitals included/)).toBeNull();
  });

  it("a 403 analysis_off mid-session swaps the page for Analysis isn't available yet, drops the analysis queries and hides the sidebar entry", async () => {
    const user = userEvent.setup();
    const qc = newClient();
    renderWithAuth(
      <AppShell>
        <AnalysisGate />
      </AppShell>,
      { queryClient: qc },
    );
    await loaded();
    const sidebar = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    expect(
      within(sidebar).getByRole("link", { name: /^Analysis/ }),
    ).toBeInTheDocument();
    expect(viewQueries(qc).length).toBeGreaterThan(0);

    // The switch goes off on the server while the page is open.
    const real = await api.getAnalysisStatus();
    vi.spyOn(api, "getAnalysisStatus").mockResolvedValue({
      ...real,
      aggregates_enabled: false,
      patient_views_enabled: false,
    } satisfies AnalysisStatus);
    vi.spyOn(api, "getAnalysisView").mockRejectedValue(
      new ApiError(403, "analysis_off"),
    );
    await user.selectOptions(select("Period"), "6m");

    expect(
      await screen.findByText("Analysis isn't available yet"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/hospitals included/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Download CSV/ })).toBeNull();
    await waitFor(() => {
      expect(viewQueries(qc)).toHaveLength(0);
      expect(
        qc.getQueryCache().findAll({ queryKey: ["analysis", "filters"] }),
      ).toHaveLength(0);
    });
    for (const nav of screen.getAllByRole("navigation", { name: "Platform" }))
      expect(within(nav).queryByRole("link", { name: /^Analysis/ })).toBeNull();
    // Usage is still there.
    expect(
      within(sidebar).getByRole("link", { name: "Usage" }),
    ).toBeInTheDocument();
  });

  it("sign-out removes the analysis queries", async () => {
    const qc = render();
    await loaded();
    expect(analysisQueries(qc).length).toBeGreaterThan(0);
    await act(() => auth.current.signOut("manual"));
    // Nothing read survives; a still-mounted page may hold an empty slot.
    expect(
      analysisQueries(qc).filter((q) => q.state.data !== undefined),
    ).toHaveLength(0);
    expect(viewQueries(qc)).toHaveLength(0);
  });
});

describe("the Analysis page", () => {
  it("opens on All hospitals, Last 12 months, Prevalence and trends", async () => {
    render();
    await loaded();
    expect(
      screen.getByRole("heading", { level: 1, name: "Analysis" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sample data").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "All hospitals" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "One hospital" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(select("Period").value).toBe("12m");
    const tabs = within(screen.getByRole("tablist", { name: "Views" }))
      .getAllByRole("tab")
      .map((t) => [t.textContent, t.getAttribute("aria-selected")]);
    expect(tabs).toEqual([
      ["Prevalence and trends", "true"],
      ["Who is affected", "false"],
      ["Co-occurring conditions", "false"],
      ["Findings and alerts", "false"],
      ["MHAI quality", "false"],
    ]);
    expect(screen.getByRole("button", { name: "Chart" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Table" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("another view opens from its tab and reads on its own", async () => {
    const user = userEvent.setup();
    const view = vi.spyOn(api, "getAnalysisView");
    render();
    await loaded();
    await user.click(screen.getByRole("tab", { name: "Who is affected" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Who is affected" }),
    ).toBeInTheDocument();
    expect(view.mock.calls.at(-1)![0]).toBe("affected");
  });

  it("a failed view says so with Try again, and no figures", async () => {
    const user = userEvent.setup();
    install({ failView: "prevalence" });
    render();
    expect(
      await screen.findByText("Couldn't load prevalence and trends"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Updated /)).toBeNull();
    const view = vi.spyOn(api, "getAnalysisView");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(view).toHaveBeenCalled());
    // Nothing to download from a failed view.
    expect(screen.getByRole("button", { name: /Download CSV/ })).toBeDisabled();
  });

  it("10 of 12 hospitals included lists Hilltop and Eastbrook with reasons", async () => {
    const user = userEvent.setup();
    render();
    await loaded();
    expect(screen.getByText("10 of 12 hospitals included")).toBeInTheDocument();
    const more = screen.getByRole("button", { name: "See which aren't" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Hospitals not included" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Hilltop Cottage Hospital: Not covered by its agreement",
      "Eastbrook Medical Centre: Not enough data yet",
    ]);
  });

  it("One hospital lists only included hospitals", async () => {
    const user = userEvent.setup();
    render();
    await loaded();
    expect(screen.queryByRole("combobox", { name: "Hospital" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "One hospital" }));
    const names = [...select("Hospital").options].map((o) => o.textContent);
    expect(names).toHaveLength(10);
    expect(names).toContain("Havana Hospital");
    expect(names).not.toContain("Hilltop Cottage Hospital");
    expect(names).not.toContain("Eastbrook Medical Centre");
  });

  it("across hospitals, no ward or source filter; the age bands are 20-year", async () => {
    const user = userEvent.setup();
    render();
    await loaded();
    expect(
      screen.queryByRole("combobox", { name: "Ward or clinic" }),
    ).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Source" })).toBeNull();
    const bands = [...select("Age band").options].map((o) => o.textContent);
    expect(bands).toEqual([
      "Any age",
      "0–19",
      "20–39",
      "40–59",
      "60–79",
      "80 and over",
    ]);
    // One hospital (Havana has two sources) gets Plan 6's bands, wards and source.
    await user.click(screen.getByRole("button", { name: "One hospital" }));
    await user.selectOptions(select("Hospital"), "Havana Hospital");
    await screen.findByRole("combobox", { name: "Source" });
    expect(screen.getByRole("combobox", { name: "Ward or clinic" }));
    expect([...select("Age band").options].map((o) => o.textContent)).toEqual([
      "Any age",
      "0–17",
      "18–39",
      "40–64",
      "65–79",
      "80 and over",
    ]);
  });

  it("a condition is searched by name or code and set from the list", async () => {
    const user = userEvent.setup();
    const view = vi.spyOn(api, "getAnalysisView");
    render();
    await loaded();
    const box = screen.getByRole("combobox", { name: "Condition" });
    await user.type(box, "d57");
    const options = within(
      screen.getByRole("listbox", { name: "Conditions" }),
    ).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Sickle cell disease · D57",
    ]);
    await user.click(options[0]!);
    await waitFor(() => expect(lastQuery(view).condition).toBe("d57"));
    expect(
      screen.getByRole("button", { name: "Remove Sickle cell disease · D57" }),
    ).toBeInTheDocument();
  });

  it("a 4th filter across hospitals is disabled with the limit text", async () => {
    const user = userEvent.setup();
    render();
    await loaded();
    await user.selectOptions(select("Age band"), "40-59");
    await user.selectOptions(select("Sex"), "female");
    await user.selectOptions(select("Setting"), "admitted");
    const limit =
      "Up to 3 filters at a time across all hospitals. Remove one to add another.";
    expect(screen.getByText(limit)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Condition" })).toBeDisabled();
    expect(select("Specialty")).toBeDisabled();
    // The set ones can still change or clear.
    expect(select("Sex")).toBeEnabled();
    await user.selectOptions(select("Sex"), "");
    expect(screen.queryByText(limit)).toBeNull();
    expect(select("Specialty")).toBeEnabled();
  });

  it("switching scope clears filters with the note (Review Focus 1)", async () => {
    const user = userEvent.setup();
    const view = vi.spyOn(api, "getAnalysisView");
    render();
    await loaded();
    await user.click(screen.getByRole("button", { name: "One hospital" }));
    await user.selectOptions(select("Hospital"), "Havana Hospital");
    await screen.findByRole("combobox", { name: "Source" });
    await user.selectOptions(select("Ward or clinic"), "ward4");
    await user.selectOptions(select("Source"), "Results system");
    await user.selectOptions(select("Age band"), "18-39");
    await user.selectOptions(select("Sex"), "female");
    await waitFor(() =>
      expect(lastQuery(view)).toMatchObject({
        scope: "hospital",
        hospital: "h_havana",
        location: "ward4",
        age_band: "18-39",
        sex: "female",
      }),
    );
    expect(lastQuery(view).source).not.toBeNull();
    view.mockClear();

    await user.click(screen.getByRole("button", { name: "All hospitals" }));
    expect(
      screen.getByText("Filters cleared for the new scope"),
    ).toBeInTheDocument();
    await loaded();
    // Every request after the switch: no ward, source, band, sex or hospital.
    for (const [, q] of view.mock.calls as [string, AnalysisQuery][])
      expect(q).toEqual({
        scope: "all",
        hospital: null,
        period: "12m",
        condition: null,
        age_band: null,
        sex: null,
        setting: null,
        specialty: null,
        location: null,
        source: null,
      });
    expect(view).toHaveBeenCalled();
    expect(select("Sex").value).toBe("");
    expect(select("Age band").value).toBe("");
    expect(
      screen.queryByRole("combobox", { name: "Ward or clinic" }),
    ).toBeNull();
    // The note goes with the next change.
    await user.selectOptions(select("Sex"), "male");
    expect(screen.queryByText("Filters cleared for the new scope")).toBeNull();
  });

  it("Clear filters empties every filter, keeping the period", async () => {
    const user = userEvent.setup();
    const view = vi.spyOn(api, "getAnalysisView");
    render();
    await loaded();
    await user.selectOptions(select("Period"), "6m");
    await user.selectOptions(select("Sex"), "female");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(lastQuery(view)).toMatchObject({ period: "6m", sex: null }),
    );
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeDisabled();
  });

  it("Download CSV records first, then saves", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const record = vi.spyOn(api, "recordDownload");
    record.mockImplementation(async () => {
      order.push("record");
    });
    vi.mocked(downloadCsv).mockImplementation(() => void order.push("save"));
    render();
    await loaded();
    await user.selectOptions(select("Sex"), "female");
    await screen.findByText(/^Updated /);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Download CSV/ }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /Download CSV/ }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["record", "save"]);
    const [body, opts] = record.mock.calls[0]!;
    expect(body.view).toBe("prevalence");
    expect(body.query).toMatchObject({ scope: "all", sex: "female" });
    expect(opts.idempotencyKey).toMatch(/\S/);
    const [name, csv] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(name).toBe("mhai-analysis-all-hospitals-prevalence-12m.csv");
    expect(csv).toContain("Prevalence and trends");
    expect(csv).toContain("Female");
    expect(csv).toContain("10 of 12 hospitals included");
    expect(csv).toContain("Sample data");
  });

  it("a failed record makes no file and says why (Review Focus 5)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "recordDownload").mockRejectedValue(
      new ApiError(422, "invalid"),
    );
    render();
    await loaded();
    await user.click(screen.getByRole("button", { name: /Download CSV/ }));
    expect(
      await screen.findByText(
        "Couldn't record the download, so it didn't start. Try again.",
      ),
    ).toBeInTheDocument();
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("offline disables the filters and Download CSV with the reason (Review Focus 5)", async () => {
    const user = userEvent.setup();
    const record = vi.spyOn(api, "recordDownload");
    render();
    await loaded();
    net.online = false;
    // Any re-render picks the network up; a tab switch is one.
    await user.click(screen.getByRole("button", { name: "Table" }));
    const download = screen.getByRole("button", { name: /Download CSV/ });
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute(
      "title",
      expect.stringMatching(/^You're offline/),
    );
    expect(screen.getAllByText(/^You're offline/).length).toBeGreaterThan(0);
    for (const name of ["Period", "Age band", "Sex", "Setting", "Specialty"])
      expect(select(name)).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Condition" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "One hospital" })).toBeDisabled();
    // The figures already loaded stay.
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
    await user.click(download);
    expect(record).not.toHaveBeenCalled();
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("nothing goes in the URL or storage", async () => {
    const user = userEvent.setup();
    const href = window.location.href;
    const title = document.title;
    localStorage.clear();
    sessionStorage.clear();
    render();
    await loaded();
    await user.selectOptions(select("Sex"), "female");
    await user.selectOptions(select("Period"), "3m");
    await user.click(screen.getByRole("tab", { name: "Who is affected" }));
    await user.click(screen.getByRole("button", { name: "One hospital" }));
    await user.selectOptions(select("Hospital"), "Havana Hospital");
    await screen.findByRole("combobox", { name: "Source" });
    expect(window.location.href).toBe(href);
    expect(document.title).toBe(title);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("at phone width the filters open in a sheet and the views are a select", async () => {
    const user = userEvent.setup();
    phone();
    const view = vi.spyOn(api, "getAnalysisView");
    render();
    await loaded();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(select("View").value).toBe("prevalence");
    // The filters wait behind a button.
    expect(screen.queryByRole("combobox", { name: "Sex" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filters (0)" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await user.selectOptions(
      within(sheet).getByRole("combobox", { name: "Sex" }),
      "female",
    );
    expect(
      screen.getByRole("button", { name: "Filters (1)" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(lastQuery(view).sex).toBe("female"));
    await user.selectOptions(select("View"), "findings");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Findings and alerts",
      }),
    ).toBeInTheDocument();
  });
});
