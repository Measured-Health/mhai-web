import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import type { Job } from "@/lib/api/ops-contract";
import { createStepUp } from "@/lib/api/step-up";
import { AMARA, ADA, renderWithAuth } from "@/tests/render";
import { url } from "@/tests/search-params";
import { JobsView } from "./jobs-view";

const net = vi.hoisted(() => ({ online: true, desktop: true }));
vi.mock("@mhai/ui/hooks/use-media", () => ({
  useIsDesktop: () => net.desktop,
}));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));
vi.mock("next/navigation", async () => {
  const m = await import("@/tests/search-params");
  return {
    useRouter: () => m.router,
    usePathname: () => "/system/jobs",
    useSearchParams: m.useSearchParams,
  };
});

function install(over: Partial<PlatformClient> = {}) {
  const api = {
    ...createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      stepUp: createStepUp(),
    }),
    ...over,
  };
  __setPlatformClientForTests(api);
  return api;
}
beforeEach(() => {
  net.online = true;
  net.desktop = true;
  url.set("");
  install();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
});

const many = (n: number): Job[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `job_bulk_${i}`,
    type: "kb_search",
    hospital: null,
    created_at: "2026-10-21T10:00:00Z",
    failed_at: "2026-10-21T11:00:00Z",
    attempts: 1,
    kind: "timeout",
    status: "failed",
    cancelled_by: null,
    cancelled_at: null,
  }));

describe("the failed jobs tab", () => {
  it("opens on Failed, newest first, with Platform for platform work", async () => {
    renderWithAuth(<JobsView />);
    const table = await screen.findByRole("table");
    for (const h of [
      "What",
      "Hospital",
      "Failed",
      "First tried",
      "Attempts",
      "Why",
      "Reference",
      "Status",
    ])
      expect(
        within(table).getByRole("columnheader", { name: h }),
      ).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(8);
    // job_search_1 failed most recently; job_question_old least recently.
    expect(rows[0]).toHaveTextContent("Search guidelines");
    expect(rows[7]).toHaveTextContent("Answer a question");
    const purge = within(table).getByRole("row", { name: /Records clean-up/ });
    expect(within(purge).getByText("Platform")).toBeInTheDocument();
    expect(within(table).queryByText("Retried")).toBeNull();
  });

  it("never shows a message, subject or user", async () => {
    renderWithAuth(<JobsView />);
    const table = await screen.findByRole("table");
    expect(table.textContent).not.toMatch(
      /run_query|ingest_document|submit_feedback|@|subject|message|user/i,
    );
  });

  it("Copy copies the reference", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    await userEvent.click(
      screen.getByRole("button", { name: "Copy reference job_search_1" }),
    );
    expect(writeText).toHaveBeenCalledWith("job_search_1");
    expect(
      (await screen.findAllByText("Reference copied"))[0],
    ).toBeInTheDocument();
  });

  it("the filters narrow and sit in the URL", async () => {
    const { rerender } = renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("What"), "run_query");
    expect(url.search).toBe("what=run_query");
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(1),
    );
    await userEvent.selectOptions(screen.getByLabelText("Status"), "all");
    expect(url.search).toBe("what=run_query&status=all");
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(2),
    );
    await userEvent.selectOptions(screen.getByLabelText("Status"), "");
    await userEvent.selectOptions(screen.getByLabelText("What"), "");
    await userEvent.selectOptions(
      screen.getByLabelText("Why"),
      "Unreadable document",
    );
    expect(url.search).toBe("why=unreadable");
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(1),
    );
    expect(screen.getByRole("table")).toHaveTextContent("Read a document");
    void rerender;
  });

  it("the Hospital filter narrows and sits in the URL", async () => {
    renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    const picker = screen.getByLabelText("Hospital");
    await waitFor(() => expect(picker).toBeEnabled());
    await userEvent.selectOptions(picker, "Northgate General Hospital");
    expect(url.search).toBe("hospital=h_northgate");
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(2),
    );
    for (const row of screen.getAllByRole("row").slice(1))
      expect(row).toHaveTextContent("Northgate General Hospital");
  });

  it("the Hospital picker says when the hospitals couldn't load", async () => {
    install({ listHospitals: () => Promise.reject(new Error("down")) });
    renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    expect(
      await screen.findByText("Couldn't load hospitals"),
    ).toBeInTheDocument();
    // The jobs themselves still show.
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(8);
  });

  it("on a phone the jobs are cards with 44 px controls", async () => {
    net.desktop = false;
    renderWithAuth(<JobsView />);
    const cards = await screen.findByRole("list", { name: "Jobs" });
    expect(screen.queryByRole("table")).toBeNull();
    expect(within(cards).getAllByRole("listitem")).toHaveLength(8);
    const box = within(cards).getByRole("checkbox", {
      name: "Choose Search guidelines job_search_1",
    });
    expect(box.closest("label")).toHaveClass("size-11");
    expect(
      within(cards).getByRole("button", {
        name: "Copy reference job_search_1",
      }),
    ).toHaveClass("min-h-11");
    // The same words as the table, and still no subject or user.
    expect(cards).toHaveTextContent("Answer a question");
    expect(cards).toHaveTextContent("Northgate General Hospital");
    expect(cards.textContent).not.toMatch(/run_query|@/);
  });

  it("Select all shown stops at 50", async () => {
    const jobs = many(60);
    install({ listJobs: async () => ({ jobs, next_cursor: null }) });
    renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    await userEvent.click(
      screen.getByRole("button", { name: "Select all shown" }),
    );
    expect(screen.getByText("50 chosen")).toBeInTheDocument();
    expect(screen.getByText("Choose up to 50 at a time.")).toBeInTheDocument();
    // A 51st by hand is refused too.
    const boxes = screen.getAllByRole("checkbox");
    const unchecked = boxes.find((b) => !(b as HTMLInputElement).checked)!;
    await userEvent.click(unchecked);
    expect(screen.getByText("50 chosen")).toBeInTheDocument();
    expect(unchecked).not.toBeChecked();
  });

  it("an auditor sees no checkboxes or actions", async () => {
    renderWithAuth(<JobsView />, { user: AMARA });
    await screen.findByRole("table");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Select all shown" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel jobs" })).toBeNull();
  });

  it("only Failed rows have a checkbox, and Cancelled reads who and when", async () => {
    renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "all");
    await waitFor(() =>
      expect(screen.getAllByRole("row").length).toBeGreaterThan(9),
    );
    const rows = screen.getAllByRole("row").slice(1);
    const failedRows = rows.filter((r) => within(r).queryByText("Failed"));
    expect(screen.getAllByRole("checkbox")).toHaveLength(failedRows.length);
    expect(
      screen.getAllByText(/^Cancelled by .+ · \d+ \w{3} \d{4}$/).length,
    ).toBeGreaterThan(0);
  });

  it("No failed jobs", async () => {
    install({ listJobs: async () => ({ jobs: [], next_cursor: null }) });
    renderWithAuth(<JobsView />);
    expect(await screen.findByText("No failed jobs")).toBeInTheDocument();
  });

  it("Couldn't load failed jobs with Try again", async () => {
    let fail = true;
    const real = createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      stepUp: createStepUp(),
    });
    install({
      listJobs: (q) =>
        fail ? Promise.reject(new Error("down")) : real.listJobs(q),
    });
    renderWithAuth(<JobsView />);
    expect(
      await screen.findByText("Couldn't load failed jobs."),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("offline disables Retry and Cancel jobs with the reason", async () => {
    net.online = false;
    renderWithAuth(<JobsView />);
    await screen.findByRole("table");
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    const reason = "You're offline. This needs a connection.";
    for (const name of ["Retry", "Cancel jobs"]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(reason);
    }
  });
});
