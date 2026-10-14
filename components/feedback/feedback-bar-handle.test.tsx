import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { SessionProvider, useSession } from "@/lib/session-store";
import { ToastProvider } from "../ui/toast";

let release: () => void = () => {};
const send = vi.fn(
  () =>
    new Promise<{ status: string }>((res) => {
      release = () => res({ status: "recorded" });
    }),
);
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ sendFeedback: send }),
}));
import { FeedbackBar, type FeedbackBarHandle } from "./feedback-bar";

function Seed() {
  const s = useSession();
  const { add } = s;
  useEffect(
    () =>
      add({
        id: "q1",
        title: "t",
        urgency: "routine",
        createdAt: 1,
        query: {} as never,
      }),
    [add],
  );
  return <output data-testid="fb">{s.get("q1")?.feedback ?? "none"}</output>;
}
function mount(r = FIXTURES.high) {
  const h = createRef<FeedbackBarHandle>();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <ToastProvider>
          <Seed />
          <FeedbackBar ref={h} queryId="q1" view={toResultView(r)} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return h;
}

beforeEach(() => {
  send.mockClear();
});

describe("FeedbackBar handle", () => {
  it("agree() sends once even when called twice in the same tick or while pending", async () => {
    const h = mount();
    await act(async () => {
      h.current?.agree();
      h.current?.agree();
    });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await act(async () => h.current?.agree());
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => release());
    expect(await screen.findByText(/your agreement was recorded/)).toBeTruthy();
  });

  it("agree() does nothing once agreed", async () => {
    const h = mount();
    await act(async () => h.current?.agree());
    await waitFor(() => expect(send).toHaveBeenCalled());
    await act(async () => release());
    await screen.findByText(/your agreement was recorded/);
    await act(async () => h.current?.agree());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("correct() opens the form only when idle", async () => {
    const h = mount();
    act(() => h.current?.correct());
    expect(screen.getByText(/A second clinician reviews/)).toBeTruthy();
    expect(h.current?.isCorrecting()).toBe(true);
    await act(async () => h.current?.agree());
    expect(send).not.toHaveBeenCalled();
  });

  it("correct() does nothing after agreeing", async () => {
    const h = mount();
    await act(async () => h.current?.agree());
    await waitFor(() => expect(send).toHaveBeenCalled());
    await act(async () => release());
    await screen.findByText(/your agreement was recorded/);
    act(() => h.current?.correct());
    expect(h.current?.isCorrecting()).toBe(false);
    expect(screen.queryByText(/A second clinician reviews/)).toBeNull();
  });

  it("agree() on a review result stores feedback 'reviewed'", async () => {
    const h = mount(FIXTURES.review);
    await act(async () => h.current?.agree());
    await waitFor(() => expect(send).toHaveBeenCalled());
    await act(async () => release());
    await screen.findByText(/your agreement was recorded/);
    expect(screen.getByTestId("fb")).toHaveTextContent("reviewed");
  });
});
