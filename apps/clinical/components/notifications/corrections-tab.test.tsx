import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "@mhai/ui/toast";

const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import CorrectionsPage from "@/app/(clinical)/(clinician)/notifications/corrections/page";
import {
  DecisionsProvider,
  useDecisions,
} from "../corrections/decisions-provider";

const reviewer = {
  display_name: "Dr. Bello",
  full_name: null,
  specialty: null,
  hospital: null,
};
const titled = (id: string, diagnosis: string) =>
  makeCorrection({
    id,
    original: { ...makeCorrection().original, diagnosis },
  });
const approved: CorrectionOut = {
  ...titled("c1", "Unstable angina"),
  status: "approved",
  decided_by: reviewer,
  decided_at: new Date(T0 - 3_600_000).toISOString(),
};
const rejected: CorrectionOut = {
  ...makeCorrection({ id: "c2" }),
  status: "rejected",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
  rejection: { reason_code: "unsafe", note: "Dose too high." },
};
const waiting = titled("c3", "Still waiting");
const withdrawn: CorrectionOut = {
  ...titled("c4", "Taken back"),
  status: "withdrawn",
};

function ui(children: ReactNode) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  seenCounts.length = 0;
  listMine
    .mockReset()
    .mockResolvedValue([approved, rejected, waiting, withdrawn]);
});
afterEach(() => onlineManager.setOnline(true));

const seenCounts: number[] = [];
function Probe() {
  seenCounts.push(useDecisions()!.unseen);
  return null;
}

describe("Notifications: Corrections", () => {
  it("lists decided corrections, newest decision first, with the reviewer's reason", async () => {
    ui(<CorrectionsPage />);
    const list = await screen.findByRole("list", {
      name: "Decisions on your corrections",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Rejected");
    expect(items[0]).toHaveTextContent("Dengue fever, likely");
    expect(items[0]).toHaveTextContent(
      "Reviewer's reason: “Unsafe: Dose too high.”",
    );
    expect(items[1]).toHaveTextContent("Approved");
    expect(items[1]).toHaveTextContent("Unstable angina");
    expect(within(list).queryByText("Still waiting")).toBeNull();
    expect(within(list).queryByText("Taken back")).toBeNull();
    expect(
      screen.getByRole("link", { name: /My feedback & corrections/ }),
    ).toHaveAttribute("href", "/my-feedback");
    expect(screen.getByRole("link", { name: "Corrections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("says when there are no decisions yet", async () => {
    listMine.mockResolvedValue([waiting]);
    ui(<CorrectionsPage />);
    expect(await screen.findByText(/No decisions yet/)).toBeVisible();
  });

  it("shows a loading state, then an error with retry, never the empty text, when the load fails", async () => {
    // A 4xx isn't retried, so the error shows at once.
    listMine.mockRejectedValueOnce(new ApiError(404, "not_found"));
    ui(<CorrectionsPage />);
    expect(screen.getByText("Loading decisions")).toBeInTheDocument();
    expect(screen.queryByText(/No decisions yet/)).toBeNull();
    expect(
      await screen.findByText("Couldn't load your decisions"),
    ).toBeVisible();
    expect(screen.queryByText(/No decisions yet/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    const list = await screen.findByRole("list", {
      name: "Decisions on your corrections",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks this session's decisions New and counts them as seen while you look (R1)", async () => {
    listMine.mockResolvedValueOnce([
      {
        ...rejected,
        status: "pending_review",
        rejection: null,
        decided_at: null,
        decided_by: null,
      },
    ]);
    const qc = ui(
      <DecisionsProvider>
        <Probe />
        <CorrectionsPage />
      </DecisionsProvider>,
    );
    await vi.waitFor(() =>
      expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
    );
    listMine.mockResolvedValueOnce([rejected, approved]);
    await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
    const list = await screen.findByRole("list", {
      name: "Decisions on your corrections",
    });
    expect(await within(list).findByText("New")).toBeVisible();
    expect(seenCounts).toContain(1);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Notifications/ }),
      ).toHaveAccessibleName("Notifications"),
    );
    expect(seenCounts.at(-1)).toBe(0);
  });

  it("sorts a decision with an unreadable time last", async () => {
    listMine.mockResolvedValue([
      { ...approved, decided_at: "not a date" },
      rejected,
    ]);
    ui(<CorrectionsPage />);
    const list = await screen.findByRole("list", {
      name: "Decisions on your corrections",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Rejected");
    expect(items[1]).toHaveTextContent("Approved");
  });

  it("says it is offline instead of loading forever", async () => {
    onlineManager.setOnline(false);
    ui(<CorrectionsPage />);
    expect(await screen.findByText(/You're offline/)).toBeVisible();
    expect(screen.queryByText("Loading decisions")).toBeNull();
    expect(screen.queryByText(/No decisions yet/)).toBeNull();
  });

  it("disables Try again while retrying", async () => {
    listMine.mockRejectedValueOnce(new ApiError(404, "not_found"));
    ui(<CorrectionsPage />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    listMine.mockReturnValueOnce(new Promise(() => {}));
    await userEvent.click(retry);
    expect(
      await screen.findByRole("button", { name: "Trying again…" }),
    ).toBeDisabled();
  });
});
