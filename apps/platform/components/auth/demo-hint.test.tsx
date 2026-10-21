import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_ACCOUNTS } from "@/lib/auth/mock";
import { DemoHint } from "./demo-hint";

afterEach(() => vi.unstubAllEnvs());

describe("DemoHint", () => {
  it("lists the sample accounts and the code in mock mode", async () => {
    const onPick = vi.fn();
    render(<DemoHint onPick={onPick} />);
    const hint = screen.getByRole("complementary", { name: "Demo sign-in" });
    expect(hint).toHaveTextContent("123456");
    expect(SAMPLE_ACCOUNTS.map((a) => a.label)).toEqual([
      "Ada Bakare",
      "Tunde Okafor",
      "Amara Eze",
      "New platform admin",
    ]);
    for (const a of SAMPLE_ACCOUNTS)
      expect(
        screen.getByRole("button", { name: `Use ${a.label} (${a.email})` }),
      ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: new RegExp(SAMPLE_ACCOUNTS[0].email),
      }),
    );
    expect(onPick).toHaveBeenCalledWith(SAMPLE_ACCOUNTS[0].email);
  });

  it("is hidden outside mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const { container } = render(<DemoHint onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
