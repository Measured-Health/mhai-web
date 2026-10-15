import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { SessionProvider, useSession } from "@/lib/session-store";
import { ToastProvider } from "../ui/toast";

const send = vi.fn(async (f: { action: string }) =>
  f.action === "correct"
    ? { status: "pending_review" }
    : { status: "recorded" },
);
// FeedbackBar guards a correction draft through the shell's navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ sendFeedback: send }),
}));
import { FeedbackBar } from "./feedback-bar";

function Probe() {
  const s = useSession();
  return (
    <>
      <output data-testid="agreed">{s.get("q1")?.agreedAt ?? "none"}</output>
      <output data-testid="feedback">{s.get("q1")?.feedback ?? "none"}</output>
    </>
  );
}
function Seed() {
  const s = useSession();
  if (!s.get("q1"))
    s.add({
      id: "q1",
      title: "t",
      urgency: "routine",
      createdAt: 1,
      query: {} as never,
    });
  return null;
}

function Host({ r }: { r: typeof FIXTURES.high }) {
  const [on, setOn] = useState(true);
  return (
    <>
      <button onClick={() => setOn((o) => !o)}>toggle</button>
      {on && <FeedbackBar queryId="q1" view={toResultView(r)} />}
    </>
  );
}
const ui = (r = FIXTURES.high) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <ToastProvider>
          <Seed />
          <Probe />
          <FeedbackBar queryId="q1" view={toResultView(r)} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  send.mockClear();
});

describe("FeedbackBar", () => {
  it("records agreement once, then disables both actions", async () => {
    ui();
    expect(screen.getByTestId("agreed")).toHaveTextContent("none");
    await userEvent.click(screen.getByRole("button", { name: /I agree/ }));
    expect(send).toHaveBeenCalledWith({ query_id: "q1", action: "validate" });
    expect(
      await screen.findByText(/your agreement was recorded/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agreed/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Suggest correction/ }),
    ).toBeDisabled();
    expect(screen.getByTestId("agreed")).not.toHaveTextContent("none");
  });
  it("requires a reason for a correction and explains the second review", async () => {
    ui(FIXTURES.caution);
    await userEvent.click(
      screen.getByRole("button", { name: /Suggest correction/ }),
    );
    expect(
      screen.getByText(/A second clinician reviews every correction/),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText(/What should the diagnosis/),
      "Warning signs",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Submit correction" }),
    );
    expect(screen.getByText(/Tell us why/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Why\?/), "WHO 2024");
    await userEvent.click(
      screen.getByRole("button", { name: "Submit correction" }),
    );
    expect(send).toHaveBeenLastCalledWith({
      query_id: "q1",
      action: "correct",
      corrected_diagnosis: "Warning signs",
      reason: "WHO 2024",
    });
    expect(await screen.findByText(/sent for review/)).toBeInTheDocument();
    expect(screen.getByTestId("agreed")).toHaveTextContent("none");
  });
  it("labels agreement as 'Mark as reviewed' on a needs-review result", () => {
    ui(FIXTURES.review);
    expect(
      screen.getByRole("button", { name: /Mark as reviewed/ }),
    ).toBeInTheDocument();
  });
  it("'Mark as reviewed' (the button) records a 'reviewed' sign-off", async () => {
    ui(FIXTURES.review);
    await userEvent.click(
      screen.getByRole("button", { name: /Mark as reviewed/ }),
    );
    expect(send).toHaveBeenCalledWith({ query_id: "q1", action: "validate" });
    await screen.findByText(/your agreement was recorded/);
    expect(screen.getByTestId("feedback")).toHaveTextContent("reviewed");
    expect(screen.getByTestId("agreed")).not.toHaveTextContent("none");
  });
  it("stays disabled after the bar remounts (print round trip)", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <ToastProvider>
            <Seed />
            <Host r={FIXTURES.high} />
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /I agree/ }));
    await screen.findByText(/your agreement was recorded/);
    await userEvent.click(screen.getByText("toggle"));
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByRole("button", { name: /Agreed/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Suggest correction/ }),
    ).toBeDisabled();
  });
  it("stays disabled after a correction and a remount", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider>
          <ToastProvider>
            <Seed />
            <Host r={FIXTURES.caution} />
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Suggest correction/ }),
    );
    await userEvent.type(
      screen.getByLabelText(/What should the diagnosis/),
      "Abc",
    );
    await userEvent.type(screen.getByLabelText(/Why\?/), "Because");
    await userEvent.click(
      screen.getByRole("button", { name: "Submit correction" }),
    );
    await screen.findByText(/sent for review/);
    await userEvent.click(screen.getByText("toggle"));
    await userEvent.click(screen.getByText("toggle"));
    expect(screen.getByRole("button", { name: /I agree/ })).toBeDisabled();
  });
  it("shows an error banner and stays retryable when feedback fails", async () => {
    send.mockRejectedValueOnce(new Error("network"));
    ui();
    await userEvent.click(screen.getByRole("button", { name: /I agree/ }));
    expect(
      await screen.findByText(/Couldn't send your feedback/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/agreement was recorded/)).toBeNull();
    expect(screen.getByTestId("agreed")).toHaveTextContent("none");
    expect(screen.getByRole("button", { name: /I agree/ })).toBeEnabled();
  });
});
