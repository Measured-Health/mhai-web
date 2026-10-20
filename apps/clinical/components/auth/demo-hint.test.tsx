import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { DemoHint } from "./demo-hint";

afterEach(() => vi.unstubAllEnvs());

describe("DemoHint", () => {
  it("offers the hospital admin, medical director and platform admin samples", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    const pick = vi.fn();
    render(<DemoHint onPick={pick} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: `Use Hospital admin (${DEMO_EMAILS.hospitalAdmin})`,
      }),
    );
    expect(pick).toHaveBeenCalledWith(DEMO_EMAILS.hospitalAdmin);
    expect(
      screen.getByRole("button", {
        name: `Use Medical director (${DEMO_EMAILS.director})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Use Platform admin (${DEMO_EMAILS.platformAdmin})`,
      }),
    ).toHaveTextContent("Shows the 403 page");
    expect(
      screen.getByRole("button", {
        name: `Use New hospital admin (${DEMO_EMAILS.newAdmin})`,
      }),
    ).toHaveTextContent("First sign-in steps");
  });

  it("shows nothing outside the demo", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const { container } = render(<DemoHint onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
