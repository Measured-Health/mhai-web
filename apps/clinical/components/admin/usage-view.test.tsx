import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { mockAdminAs, mockAdminWith, screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/usage",
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/csv", async (original) => ({
  ...(await original<typeof import("@/lib/admin/csv")>()),
  downloadCsv: download,
}));
import { UsageView } from "./usage-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  download.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const tile = (label: string) => screen.getByText(label).closest("div")!;

describe("UsageView", () => {
  it("shows this month's counts", async () => {
    renderAdmin(<UsageView />);
    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(tile("Consultations")).toHaveTextContent("1,284");
    expect(tile("Active clinicians")).toHaveTextContent("39");
    expect(tile("Agreed with result")).toHaveTextContent("82%");
    expect(tile("Median review time")).toHaveTextContent("3.1 h");
    const mix = screen.getByRole("region", { name: "Result confidence" });
    expect(
      within(mix)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "High confidence62%",
      "Use with caution27%",
      "Needs review8%",
      "Couldn't complete3%",
    ]);
    const by = screen.getByRole("region", { name: "By specialty" });
    expect(within(by).getAllByRole("listitem")[0]).toHaveTextContent(
      "Internal Medicine412",
    );
    expect(
      screen.getByText(
        "Counts only. No patient details or question text are shown here.",
      ),
    ).toBeInTheDocument();
  });

  it("switches the period", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "last_month",
    );
    expect(await screen.findByText("1,102")).toBeInTheDocument();
  });

  it("hides a measure the API doesn't send, and says when there's nothing yet", async () => {
    const u = await holder.client.getUsage("this_month");
    vi.spyOn(holder.client, "getUsage").mockResolvedValue({
      ...u,
      consultations: 0,
      agreement_rate: null,
      median_review_hours: null,
      confidence: { high: 0, caution: 0, review: 0, failed: 0 },
      by_specialty: [],
    });
    renderAdmin(<UsageView />);
    expect(
      await screen.findByText("No consultations in this period."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Agreed with result")).toBeNull();
    expect(screen.queryByText("Median review time")).toBeNull();
  });

  it("exports the counts as CSV, built in memory", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/^havana-hospital-usage-\d{4}-\d{2}-\d{2}\.csv$/),
      expect.stringContaining("Consultations,1284"),
    );
    expect(await screen.findByText("Usage exported")).toBeInTheDocument();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("can't export before the numbers load", async () => {
    vi.spyOn(holder.client, "getUsage").mockReturnValue(new Promise(() => {}));
    renderAdmin(<UsageView />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled(),
    );
    expect(
      screen.getByRole("button", { name: "Export CSV" }),
    ).toHaveAccessibleDescription("Loading…");
  });

  it("exports only the counts shown", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = download.mock.calls[0][1] as string;
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("Measure,Value");
    for (const l of lines.slice(1))
      expect(l).toMatch(/^[^,]+,("[^"]*"|[^,]*)$/);
    expect(csv).toContain("Result: High confidence");
    expect(csv).toContain("Specialty: Internal Medicine,412");
    expect(csv).not.toMatch(/question|@/i);
    // Two legitimate labels contain "patient"; nothing else may.
    expect(
      csv
        .replaceAll("Wrong patient", "")
        .replaceAll("Outpatient · Cardiology clinic", ""),
    ).not.toMatch(/patient/i);
    expect(csv).not.toMatch(/\bMRN\b|\bbed\b/i);
  });

  it("says two-step, never 2-step", async () => {
    const { container } = renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    expect(container.textContent).not.toMatch(/2-step/i);
  });

  it("offers Try again when usage can't load", async () => {
    vi.spyOn(holder.client, "getUsage").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<UsageView />);
    expect(await screen.findByText("You can't do this")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1,284")).toBeInTheDocument();
  });

  it("keeps the numbers when a refresh fails", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    vi.spyOn(holder.client, "getUsage").mockRejectedValue(
      new ApiError(500, "boom"),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "last_month",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "this_month",
    );
    expect(await screen.findByText("1,284")).toBeInTheDocument();
  });

  it("says so, not a skeleton, when first opened offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    onlineManager.setOnline(false);
    try {
      renderAdmin(<UsageView />);
      expect(
        await screen.findByText(
          "You're offline. Usage will load when you reconnect.",
        ),
      ).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("gives the period picker a 44px target", async () => {
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    expect(screen.getByLabelText("Period").className).toContain("min-h-11");
  });
});

describe("UsageView: patient alerts", () => {
  beforeEach(() => {
    holder.client = mockAdminAs(DEMO_EMAILS.director);
  });

  it("exports the alert numbers with the small-group rule", async () => {
    renderAdmin(<UsageView />);
    await screen.findByRole("region", { name: "Patient alerts" });
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = download.mock.calls[0][1] as string;
    expect(csv).toContain("Alerts: total,128\r\n");
    expect(csv).toContain("Alerts: dismissed as Other,Fewer than 5\r\n");
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("shows the Patient alerts group below the numbers", async () => {
    renderAdmin(<UsageView />);
    const group = await screen.findByRole("region", { name: "Patient alerts" });
    expect(
      within(group).getByRole("region", { name: "What changed" }),
    ).toHaveTextContent("Critical within 15 min: 71%, down from 88%");
    const bySpecialty = screen.getByRole("region", { name: "By specialty" });
    expect(
      bySpecialty.compareDocumentPosition(group) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("follows the period picker", async () => {
    renderAdmin(<UsageView />);
    await screen.findByRole("region", { name: "Patient alerts" });
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "last_90_days",
    );
    expect(
      await screen.findByText("Not enough data to compare"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Most alerts in the week of 3 Oct: 45"),
    ).toBeInTheDocument();
  });

  it("shows no alerts group when alerts aren't switched on (Review Focus 5)", async () => {
    holder.client = mockAdminWith("off");
    renderAdmin(<UsageView />);
    await screen.findByText("1,284");
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(screen.queryByText(/patient alerts/i)).toBeNull();
  });

  it("offers Try again, not zeros, when alerts couldn't load (Review Focus 1)", async () => {
    const good = await mockAdminAs(DEMO_EMAILS.director).getUsage("this_month");
    holder.client = mockAdminWith("unavailable");
    renderAdmin(<UsageView />);
    const group = await screen.findByRole("region", { name: "Patient alerts" });
    expect(
      within(group).getByText("Couldn't load patient alerts"),
    ).toBeInTheDocument();
    expect(within(group).queryByText("Nothing unusual this period")).toBeNull();
    // The rest of Usage is unaffected.
    expect(screen.getByText("1,284")).toBeInTheDocument();
    vi.spyOn(holder.client, "getUsage").mockResolvedValue(good);
    await userEvent.click(
      within(group).getByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByText("Critical within 15 min: 71%, down from 88%"),
    ).toBeInTheDocument();
  });

  it("shows no alerts group when Usage itself fails", async () => {
    vi.spyOn(holder.client, "getUsage").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<UsageView />);
    expect(await screen.findByText("You can't do this")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(screen.queryByText("Nothing unusual this period")).toBeNull();
  });

  it("drops the alerts group, not just its banner, when a refresh fails (F18)", async () => {
    renderAdmin(<UsageView />);
    await screen.findByRole("region", { name: "Patient alerts" });
    vi.spyOn(holder.client, "getUsage").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "last_month",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Period"),
      "this_month",
    );
    // A 403 isn't retried, so the refresh fails at once. The page keeps its
    // numbers under the error banner; old alert numbers (or a stale
    // "Nothing unusual") don't stay with them.
    await waitFor(() => {
      expect(screen.getByText("You can't do this")).toBeInTheDocument();
      expect(screen.getByText("1,284")).toBeInTheDocument();
    });
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(screen.getByText("1,284")).toBeInTheDocument();
  });

  async function failRefresh() {
    await screen.findByText("1,284");
    vi.spyOn(holder.client, "getUsage").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    for (const p of ["last_month", "this_month"])
      await userEvent.selectOptions(screen.getByLabelText("Period"), p);
    await screen.findByText("You can't do this");
  }

  it("exports no stale alert numbers when a refresh fails (G2)", async () => {
    renderAdmin(<UsageView />);
    await screen.findByRole("region", { name: "Patient alerts" });
    await failRefresh();
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = download.mock.calls[0][1] as string;
    // The screen hides the alerts; the file says they couldn't load.
    expect(csv).toContain("Alerts,Couldn't load\r\n");
    expect(csv).not.toContain("Alerts: ");
    expect(csv).toContain("Consultations,1284");
  });

  it("still leaves switched-off alerts out of the file when a refresh fails (G2)", async () => {
    holder.client = mockAdminWith("off");
    renderAdmin(<UsageView />);
    await failRefresh();
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = download.mock.calls[0][1] as string;
    expect(csv).not.toMatch(/^Alerts/m);
  });
});
