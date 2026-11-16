import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { totp } from "@mhai/api-client/totp";
import { LIVE_DEMO_TOTP_SECRET } from "@/lib/auth/live-demo";
import { DemoCode } from "./demo-code";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("DemoCode", () => {
  it("is absent in the mock demo and outside the demo", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "true");
    expect(render(<DemoCode />).container).toBeEmptyDOMElement();
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "false");
    expect(render(<DemoCode />).container).toBeEmptyDOMElement();
  });

  it("shows the current code from the demo secret and moves to the next step", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "true");
    let t = 1_700_000_020_000; // 10 s into a step
    const now = () => t;
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    render(<DemoCode now={now} />);
    const first = await totp(LIVE_DEMO_TOTP_SECRET, t);
    expect(await screen.findByText(first)).toBeInTheDocument();
    const box = screen.getByLabelText("Demo two-step code");
    expect(box).toHaveTextContent(/new code in 20 s/);
    expect(box).toHaveTextContent(/A code someone else has just used/);
    t += 30_000;
    const next = await totp(LIVE_DEMO_TOTP_SECRET, t);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    vi.useRealTimers();
    expect(await screen.findByText(next)).toBeInTheDocument();
  });
});
