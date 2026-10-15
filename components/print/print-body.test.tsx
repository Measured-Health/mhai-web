import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryCreateIn } from "@/lib/api/contract";
import { FIXTURES } from "@/lib/api/fixtures";
import { SessionProvider, useSession } from "@/lib/session-store";

vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ getResult: async () => FIXTURES.high }),
}));
import { PrintBody } from "./print-body";

function Seed() {
  const s = useSession();
  useEffect(() => {
    s.add({
      id: "q1",
      title: "t",
      urgency: "routine",
      createdAt: 1,
      query: {
        question: "q",
        urgency: "routine",
        patient_data: { age: 50, sex: "male", symptoms: ["x"] },
      } as unknown as QueryCreateIn,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <Seed />
        <Suspense fallback={null}>
          <PrintBody params={Promise.resolve({ id: "q1" })} />
        </Suspense>
      </SessionProvider>
    </QueryClientProvider>,
  );

const ui = async () => {
  let r!: ReturnType<typeof mount>;
  await act(async () => {
    r = mount();
  });
  return r;
};

const print = vi.fn();
beforeEach(() => {
  print.mockClear();
  window.print = print;
});
afterEach(() => vi.useRealTimers());

describe("PrintBody", () => {
  it("links back to the result in the same tab", async () => {
    await ui();
    const back = await screen.findByRole("link", { name: /Back to result/ });
    expect(back).toHaveAttribute("href", "/c/q1");
    expect(back).not.toHaveAttribute("target");
  });
  it("prints once after the delay", async () => {
    await ui();
    await screen.findByRole("link", { name: /Back to result/ });
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1), {
      timeout: 1000,
    });
  });
  it("clears the pending print timer on unmount", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const a = await ui();
    await screen.findByRole("link", { name: /Back to result/ });
    const before = clear.mock.calls.length;
    a.unmount();
    expect(clear.mock.calls.length).toBeGreaterThan(before);
    await new Promise((r) => setTimeout(r, 450));
    expect(print).not.toHaveBeenCalled();
  });
});
