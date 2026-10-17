import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
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
    expect(csv).not.toMatch(/question|patient|@/i);
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
