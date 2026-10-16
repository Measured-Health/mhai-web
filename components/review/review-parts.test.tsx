import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { T0, makeCorrection } from "@/tests/corrections";

const listReviewed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyReviews: listReviewed }),
}));
import { AllCaughtUp, RecentDecisions } from "./all-caught-up";
import { QueueList } from "./queue-list";
import { ReviewDetail } from "./review-detail";
import { UndoNotice } from "./undo-notice";

const H = 3_600_000;
const okafor = makeCorrection({ id: "o" });
const late = makeCorrection({
  id: "late",
  submitted_at: new Date(T0 - 5 * H).toISOString(),
});
late.original.diagnosis = "Febrile seizure, simple";

function detail(over: Partial<ComponentProps<typeof ReviewDetail>> = {}) {
  const props: ComponentProps<typeof ReviewDetail> = {
    item: { c: okafor, mine: false },
    now: T0,
    position: { index: 1, total: 3 },
    gone: false,
    online: true,
    busy: false,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onSkip: vi.fn(),
    onWithdraw: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...over,
  };
  render(<ReviewDetail {...props} />);
  return props;
}
afterEach(() => {
  vi.useRealTimers();
  listReviewed.mockReset();
});

describe("QueueList", () => {
  it("shows the age, label, specialty and who, and flags over 4 hours", async () => {
    const onSelect = vi.fn();
    render(
      <QueueList
        items={[
          { c: late, mine: true },
          { c: okafor, mine: false },
        ]}
        selectedId="o"
        now={T0}
        onSelect={onSelect}
      />,
    );
    const [first, second] = within(
      screen.getByRole("list", { name: "Waiting corrections" }),
    ).getAllByRole("button");
    expect(first).toHaveTextContent("Febrile seizure, simple");
    expect(first).toHaveTextContent("5 h");
    expect(first).toHaveTextContent("Over 4 h waiting");
    expect(first).toHaveTextContent("Your correction");
    expect(first).not.toHaveAttribute("aria-current");
    expect(second).toHaveTextContent("42 min");
    expect(second).toHaveTextContent("Use with caution");
    expect(second).toHaveTextContent("Infectious disease");
    expect(second).toHaveTextContent("· Dr. Okafor");
    expect(second).not.toHaveTextContent("Over 4 h");
    expect(second).toHaveAttribute("aria-current", "true");
    await userEvent.click(first!);
    expect(onSelect).toHaveBeenCalledWith({ c: late, mine: true });
  });

  it("clamps a long summary in the queue (Review Focus 5)", () => {
    const long = makeCorrection({ corrected_diagnosis: "z".repeat(3000) });
    render(
      <QueueList
        items={[{ c: long, mine: false }]}
        selectedId={null}
        now={T0}
        onSelect={() => {}}
      />,
    );
    const summary = screen.getByText("z".repeat(3000));
    expect(summary.className).toContain("line-clamp-2");
    expect(summary.className).toContain("[overflow-wrap:anywhere]");
  });
});

describe("ReviewDetail", () => {
  it("says who suggested it and offers Approve, Reject and Skip with shortcuts", async () => {
    const p = detail();
    expect(
      screen.getByRole("heading", { name: "Dengue fever, likely" }),
    ).toBeVisible();
    expect(screen.getByText("Correction · submitted 42 min ago")).toBeVisible();
    expect(screen.getByText("Original: Use with caution")).toBeVisible();
    expect(screen.getByText("Dr. Chidi Okafor")).toBeVisible();
    expect(
      screen.getByText(/suggested this · Paediatrics · Havana Hospital/),
    ).toBeVisible();
    const approve = screen.getByRole("button", { name: "Approve correction" });
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(approve).toHaveAttribute("aria-keyshortcuts", "A");
    expect(reject).toHaveAttribute("aria-keyshortcuts", "R");
    await userEvent.click(approve);
    await userEvent.click(reject);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(p.onApprove).toHaveBeenCalledTimes(1);
    expect(p.onReject).toHaveBeenCalledTimes(1);
    expect(p.onSkip).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/You are the second reviewer/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Decision" })).toContainElement(
      approve,
    );
  });

  it("disables deciding your own correction, says why, and offers withdraw", async () => {
    const p = detail({ item: { c: late, mine: true } });
    const approve = screen.getByRole("button", { name: "Approve correction" });
    expect(approve).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(
      /You can't review your own correction/,
    );
    expect(screen.getByText(/It's been waiting 5 hours/)).toBeVisible();
    expect(screen.getByText("You suggested this")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    expect(p.onWithdraw).toHaveBeenCalled();
  });

  it("disables decisions offline and says why (Review Focus 3)", () => {
    detail({ online: false });
    expect(screen.getByText("You're offline")).toBeVisible();
    const approve = screen.getByRole("button", { name: "Approve correction" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(/Decisions need a connection/);
  });

  it("cannot be approved again while busy (already in the undo window)", () => {
    detail({ busy: true });
    expect(
      screen.getByRole("button", { name: "Approve correction" }),
    ).toBeDisabled();
  });

  it("keeps showing a correction decided elsewhere, with a way on (Review Focus 1)", async () => {
    const p = detail({ gone: true });
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Dengue fever, likely" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve correction" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Next correction" }),
    );
    expect(p.onNext).toHaveBeenCalled();
  });

  it("goes back on a phone and opens the consultation", async () => {
    const p = detail();
    expect(screen.getByText("1 of 3 · 42 min ago")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Back to the queue" }),
    );
    expect(p.onBack).toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Open consultation" }),
    );
    expect(
      screen.getByRole("dialog", { name: "The consultation" }),
    ).toHaveTextContent("Fever 3 days and rash, dengue area. Admit?");
  });
});

describe("UndoNotice", () => {
  it("counts down in text, keeps a steady name, and undoes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onUndo = vi.fn();
    render(
      <UndoNotice
        pending={{ item: okafor, key: "k", endsAt: Date.now() + 10_000 }}
        onUndo={onUndo}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Correction approved");
    expect(status).toHaveTextContent(
      "Dengue fever, likely. Dr. Okafor will be told",
    );
    const undo = screen.getByRole("button", { name: "Undo approval" });
    expect(undo).toHaveTextContent("Undo (10 s)");
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(undo).toHaveTextContent("Undo (7 s)");
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(undo);
    expect(onUndo).toHaveBeenCalled();
  });

  it("offers Next correction only when asked, and keeps Undo's name", async () => {
    const pending = { item: okafor, key: "k", endsAt: T0 + 10_000 };
    const { unmount } = render(
      <UndoNotice pending={pending} onUndo={() => {}} />,
    );
    expect(
      screen.queryByRole("button", { name: "Next correction" }),
    ).toBeNull();
    unmount();
    const onNext = vi.fn();
    render(<UndoNotice pending={pending} onUndo={() => {}} onNext={onNext} />);
    expect(
      screen.getByRole("button", { name: "Undo approval" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Next correction" }),
    );
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("All caught up", () => {
  it("rewards an empty queue with your recent decisions", async () => {
    listReviewed.mockResolvedValue([
      {
        ...okafor,
        status: "approved",
        decided_at: new Date(T0 - 60_000).toISOString(),
      },
      {
        ...late,
        status: "rejected",
        decided_at: new Date(T0 - 2 * H).toISOString(),
      },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AllCaughtUp now={T0} />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "All caught up" }),
    ).toBeVisible();
    const list = await screen.findByRole("list", {
      name: "Your recent decisions",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Approved");
    expect(rows[0]).toHaveTextContent("Dengue fever, likely");
    expect(rows[0]).toHaveTextContent("1 min ago");
    expect(rows[1]).toHaveTextContent("Rejected");
    expect(rows[1]).toHaveTextContent("Febrile seizure, simple");
  });

  it("says so when you haven't decided any yet", () => {
    render(<RecentDecisions items={[]} now={T0} />);
    expect(
      screen.getByText("You haven't decided any corrections yet."),
    ).toBeVisible();
  });
});
