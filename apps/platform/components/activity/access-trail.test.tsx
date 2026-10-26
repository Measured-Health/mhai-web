import { QueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { AccessEntry } from "@/lib/api/analysis-contract";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { AMARA, renderWithAuth } from "@/tests/render";
import { ActivityView } from "./activity-view";

const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));
const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/activity",
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

let who: string = TEAM_EMAILS.ada;
function mock(over: Partial<PlatformClient> = {}) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests({ ...m, ...over } as PlatformClient);
  return m;
}
const qc = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const saved: { blobs: Blob[]; names: string[] } = { blobs: [], names: [] };
const original = [URL.createObjectURL, URL.revokeObjectURL] as const;
beforeEach(() => {
  who = TEAM_EMAILS.ada;
  net.online = true;
  nav.search = "tab=analysis-access";
  nav.replace.mockClear();
  saved.blobs = [];
  saved.names = [];
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    saved.blobs.push(b as Blob);
    return `blob:${saved.blobs.length}`;
  });
  URL.revokeObjectURL = vi.fn();
  const click = HTMLAnchorElement.prototype.click;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.names.push(this.download);
    void click;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  [URL.createObjectURL, URL.revokeObjectURL] = original;
  __resetPlatformClientForTests();
});

const items = () =>
  within(screen.getByRole("list", { name: "Analysis access" })).getAllByRole(
    "listitem",
  );
const E: AccessEntry = {
  id: "aa_1",
  at: "2026-10-20T10:00:00.000Z",
  actor: { id: "tm_ada", name: "Ada Bakare" },
  kind: "visit",
  scope: "all",
  hospital: null,
  view: "prevalence",
  period: "12m",
  filters: [],
  count: null,
  clearance_id: null,
  flagged: false,
};

describe("Activity: Analysis access", () => {
  it("an auditor sees the Analysis access tab and the three kinds", async () => {
    who = TEAM_EMAILS.amara;
    mock();
    renderWithAuth(<ActivityView />, { user: AMARA, queryClient: qc() });
    const tabs = screen.getByRole("tablist", { name: "Activity" });
    expect(
      within(tabs).getByRole("tab", { name: "Analysis access" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(tabs).getByRole("tab", { name: "Team actions" }),
    ).toHaveAttribute("aria-selected", "false");
    await screen.findByRole("list", { name: "Analysis access" });
    const text = items().map((li) => li.textContent);
    expect(text.some((t) => /looked at/.test(t ?? ""))).toBe(true);
    expect(text.some((t) => /downloaded .* as CSV/.test(t ?? ""))).toBe(true);
    expect(text.some((t) => /de-identified patient/.test(t ?? ""))).toBe(true);
    expect(
      screen.getByText(
        "Who looked at Analysis. Never the figures or patients.",
      ),
    ).toBeInTheDocument();
    const kind = screen.getByRole("combobox", { name: "Kind" });
    expect(
      within(kind)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All", "Visits", "Downloads", "Patient lists"]);
  });

  it("a patient list entry is flagged with a Security chip and cites its letter", async () => {
    mock();
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByRole("list", { name: "Analysis access" });
    const li = items().find((x) =>
      /de-identified patient/.test(x.textContent ?? ""),
    )!;
    expect(within(li).getByText("Security")).toBeInTheDocument();
    expect(li.querySelector("svg")).not.toBeNull();
    expect(li.textContent).toMatch(/· letter cl_act/);
    for (const other of items().filter((x) => x !== li))
      expect(within(other).queryByText("Security")).toBeNull();
  });

  it("a visit with flagged true fails the page closed", async () => {
    mock({
      listAnalysisAccess: () =>
        Promise.resolve({
          entries: [{ ...E, flagged: true }],
          next_cursor: null,
        }),
    });
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByText("Couldn't load Analysis access.");
    expect(screen.queryByRole("list", { name: "Analysis access" })).toBeNull();
    expect(screen.queryByText(/Ada Bakare looked/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("the kind filter narrows the list", async () => {
    const m = mock();
    const spy = vi.spyOn(m, "listAnalysisAccess");
    mock({ listAnalysisAccess: spy });
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByRole("list", { name: "Analysis access" });
    const before = items().length;
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Kind" }),
      "Downloads",
    );
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(items().length).toBeLessThan(before);
    expect(items()[0]!.textContent).toMatch(/downloaded .* as CSV/);
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "download" }),
    );
  });

  it("the hospital select narrows the trail too", async () => {
    const spy = vi.fn(() =>
      Promise.resolve({ entries: [], next_cursor: null }),
    );
    mock({ listAnalysisAccess: spy });
    nav.search = "tab=analysis-access&hospital=h_havana";
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ hospital: "h_havana" }),
      ),
    );
    await screen.findByText("No Analysis access yet.");
  });

  it("Load more brings the next page, newest first", async () => {
    const mk = (n: number): AccessEntry => ({ ...E, id: `aa_${n}` });
    const spy = vi.fn((q: { cursor?: string }) =>
      Promise.resolve(
        q.cursor
          ? { entries: [mk(3)], next_cursor: null }
          : { entries: [mk(1), mk(2)], next_cursor: "c2" },
      ),
    );
    mock({ listAnalysisAccess: spy });
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(2),
    );
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it.each([
    ["a platform admin", TEAM_EMAILS.ada],
    ["an auditor", TEAM_EMAILS.amara],
  ])("Export saves the file for %s", async (_n, email) => {
    who = email;
    mock();
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByRole("list", { name: "Analysis access" });
    await userEvent.click(
      screen.getByRole("button", { name: "Export for a legal request" }),
    );
    await waitFor(() => expect(saved.blobs).toHaveLength(1));
    expect(saved.blobs[0]).toBeInstanceOf(Blob);
    expect(saved.names[0]).toMatch(
      /^mhai-analysis-access-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });

  it("Export is off while offline, with the reason", async () => {
    mock();
    net.online = false;
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByRole("list", { name: "Analysis access" });
    expect(
      screen.getByRole("button", { name: "Export for a legal request" }),
    ).toBeDisabled();
    expect(screen.getAllByText(/You're offline/).length).toBeGreaterThan(0);
  });

  it("a failed export says so and saves nothing", async () => {
    mock({ exportAnalysisAccess: () => Promise.reject(new Error("no")) });
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByRole("list", { name: "Analysis access" });
    await userEvent.click(
      screen.getByRole("button", { name: "Export for a legal request" }),
    );
    await screen.findByText("Couldn't export. Try again.");
    expect(saved.blobs).toHaveLength(0);
  });

  it("choosing the tab puts only the tab in the URL, and keeps the hospital", async () => {
    mock();
    nav.search = "hospital=h_havana";
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await userEvent.click(screen.getByRole("tab", { name: "Analysis access" }));
    expect(nav.replace).toHaveBeenCalledWith(
      "/activity?tab=analysis-access&hospital=h_havana",
    );
  });

  it("Team actions is the default and shows no Analysis access", async () => {
    mock();
    nav.search = "";
    renderWithAuth(<ActivityView />, { queryClient: qc() });
    await screen.findByRole("list", { name: "Activity" });
    expect(screen.getByRole("tab", { name: "Team actions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("list", { name: "Analysis access" })).toBeNull();
  });
});
