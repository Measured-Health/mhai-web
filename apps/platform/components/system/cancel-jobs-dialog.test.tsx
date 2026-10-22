import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPlatformClient,
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import type { Job } from "@/lib/api/ops-contract";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, renderWithAuth } from "@/tests/render";
import { CancelJobsDialog } from "./cancel-jobs-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
afterEach(() => __resetPlatformClientForTests());

async function setup(ids: string[]) {
  const api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  const cancel = vi.spyOn(api, "cancelJobs");
  __setPlatformClientForTests(api);
  const all = (await api.listJobs({ status: "all" })).jobs;
  return {
    cancel,
    jobs: ids.map((id) => all.find((j) => j.id === id)!) as Job[],
  };
}

describe("CancelJobsDialog", () => {
  it("shows each chosen type's effect", async () => {
    const { jobs } = await setup([
      "job_question_old",
      "job_doc_unreadable",
      "job_triage_1",
    ]);
    renderWithAuth(<CancelJobsDialog jobs={jobs} onClose={() => {}} />);
    const d = screen.getByRole("dialog", { name: "Cancel 3 jobs?" });
    for (const t of [
      "The clinician will see 'Couldn't complete' and can ask again.",
      "The document won't be read; the clinician can upload it again.",
      "The work won't be done. Nothing is deleted.",
      "Cancelled jobs are kept as a record.",
    ])
      expect(within(d).getByText(t)).toBeInTheDocument();
    expect(within(d).queryByText(/records clean-up runs again/)).toBeNull();
  });

  it("the title says job for one", async () => {
    const { jobs } = await setup(["job_search_1"]);
    renderWithAuth(<CancelJobsDialog jobs={jobs} onClose={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: "Cancel 1 job?" }),
    ).toBeInTheDocument();
  });

  it("Keep is the safe button", async () => {
    const { jobs, cancel } = await setup(["job_search_1"]);
    const onClose = vi.fn();
    renderWithAuth(<CancelJobsDialog jobs={jobs} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onClose).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Cancel jobs" }),
    ).toBeInTheDocument();
  });

  it("it needs a reason and the code", async () => {
    const { jobs, cancel } = await setup(["job_search_1"]);
    renderWithAuth(<CancelJobsDialog jobs={jobs} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel jobs" }));
    expect(screen.getByText("Choose a reason.")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Other"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel jobs" }));
    expect(screen.getByText("Add a note.")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("No longer needed"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel jobs" }));
    expect(screen.getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("a wrong code shows That code didn't work, and no code stays in the cache", async () => {
    const { jobs, cancel } = await setup(["job_search_1"]);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    renderWithAuth(<CancelJobsDialog jobs={jobs} onClose={onClose} />, {
      queryClient: qc,
    });
    const leaked = () =>
      JSON.stringify(
        qc
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables),
      );
    await userEvent.click(screen.getByLabelText("No longer needed"));
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("000000");
    await userEvent.click(screen.getByRole("button", { name: "Cancel jobs" }));
    expect(
      await screen.findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(leaked()).not.toContain("000000");
    expect(leaked()).not.toContain("mfa_code");

    // The right code: it goes through, and again nothing is left behind.
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    await userEvent.click(screen.getByRole("button", { name: "Cancel jobs" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(cancel.mock.calls[1]![0]).toMatchObject({
      ids: ["job_search_1"],
      reason: "no_longer_needed",
      mfa_code: MOCK_CODE,
    });
    expect(
      (await screen.findAllByText("Cancelled 1 job"))[0],
    ).toBeInTheDocument();
    expect(leaked()).not.toContain(MOCK_CODE);
    expect(leaked()).not.toContain("mfa_code");
  });

  it("an Other note is sent with the cancel and kept out of Activity", async () => {
    const { jobs, cancel } = await setup(["job_search_1"]);
    const api = getPlatformClient();
    const NOTE = "Asked by the hospital to drop it";
    renderWithAuth(<CancelJobsDialog jobs={jobs} onClose={() => {}} />);
    await userEvent.click(screen.getByLabelText("Other"));
    await userEvent.type(screen.getByLabelText(/^Note/), NOTE);
    await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    await userEvent.click(screen.getByRole("button", { name: "Cancel jobs" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(cancel.mock.calls[0]![0]).toMatchObject({
      reason: "other",
      note: NOTE,
    });
    expect(
      (await screen.findAllByText("Cancelled 1 job"))[0],
    ).toBeInTheDocument();
    const { events } = await api.listActivity({});
    expect(events[0]).toMatchObject({
      action: "jobs_cancelled",
      detail: "Other",
    });
    expect(JSON.stringify(events)).not.toContain(NOTE);
  });
});
