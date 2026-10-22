import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import type { Job } from "@/lib/api/ops-contract";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, renderWithAuth } from "@/tests/render";
import { RetryDialog } from "./retry-dialog";

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
  const retry = vi.spyOn(api, "retryJobs");
  __setPlatformClientForTests(api);
  const all = (await api.listJobs({ status: "all" })).jobs;
  const jobs = ids.map((id) => all.find((j) => j.id === id)!) as Job[];
  return { api, retry, jobs };
}

describe("RetryDialog", () => {
  it("with the old Northgate question it warns and focuses Don't retry", async () => {
    const { jobs } = await setup(["job_question_old", "job_search_1"]);
    renderWithAuth(<RetryDialog jobs={jobs} onClose={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: "Retry 2 jobs?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /1 of these questions was asked more than a day ago\. The clinicians may have asked again or no longer need the answer\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Don't retry" })).toHaveFocus();
  });

  it("without an old question there is no warning and Retry has the focus", async () => {
    const { jobs } = await setup(["job_search_1"]);
    renderWithAuth(<RetryDialog jobs={jobs} onClose={() => {}} />);
    expect(screen.queryByText(/more than a day ago/)).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
  });

  it("the title and the warning use singular and plural", async () => {
    const { jobs } = await setup(["job_question_old"]);
    const { unmount } = renderWithAuth(
      <RetryDialog jobs={jobs} onClose={() => {}} />,
    );
    expect(
      screen.getByRole("dialog", { name: "Retry 1 job?" }),
    ).toBeInTheDocument();
    unmount();
    const two = await setup(["job_question_old", "job_question_done"]);
    renderWithAuth(<RetryDialog jobs={two.jobs} onClose={() => {}} />);
    expect(
      screen.getByRole("dialog", { name: "Retry 2 jobs?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2 of these questions were asked/),
    ).toBeInTheDocument();
  });

  it("Don't retry sends nothing", async () => {
    const { jobs, retry } = await setup(["job_question_old"]);
    const onClose = vi.fn();
    renderWithAuth(<RetryDialog jobs={jobs} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Don't retry" }));
    expect(onClose).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it("retry asks for no code", async () => {
    const { jobs, retry } = await setup(["job_search_1"]);
    const onClose = vi.fn();
    renderWithAuth(<RetryDialog jobs={jobs} onClose={onClose} />);
    expect(screen.queryByLabelText(/Digit 1 of 6/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0]![0]).toEqual({ ids: ["job_search_1"] });
    expect(
      (await screen.findAllByText("Retried 1 job"))[0],
    ).toBeInTheDocument();
  });

  it("a partly skipped result says Retried 2 jobs · 1 were already retried or finished and refetches", async () => {
    const { api, jobs } = await setup(["job_search_1", "job_feedback_1"]);
    // One of the three changed meanwhile: it is already done.
    await api.retryJobs({ ids: ["job_correction_1"] }, { idempotencyKey: "x" });
    const stale = [
      ...jobs,
      (await api.listJobs({ status: "all" })).jobs.find(
        (j) => j.id === "job_correction_1",
      )!,
    ];
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const refetch = vi.spyOn(qc, "invalidateQueries");
    const onDone = vi.fn();
    renderWithAuth(
      <RetryDialog jobs={stale} onClose={() => {}} onDone={onDone} />,
      { queryClient: qc },
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      (
        await screen.findAllByText(
          "Retried 2 jobs · 1 was already retried or finished",
        )
      )[0],
    ).toBeInTheDocument();
    expect(onDone).toHaveBeenCalled();
    const roots = refetch.mock.calls.map(
      (c) => (c[0] as { queryKey: string[] }).queryKey[0],
    );
    expect(roots).toContain("ops");
    expect(roots).toContain("activity");
  });
});
