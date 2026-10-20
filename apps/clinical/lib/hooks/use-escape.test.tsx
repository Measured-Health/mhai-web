import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useEscape } from "./use-escape";

function Probe({ active, fn }: { active: boolean; fn: () => void }) {
  useEscape(active, fn);
  return null;
}

describe("useEscape", () => {
  it("calls back on Escape only while active", async () => {
    const fn = vi.fn();
    const { rerender } = render(<Probe active={false} fn={fn} />);
    await userEvent.keyboard("{Escape}");
    expect(fn).not.toHaveBeenCalled();
    rerender(<Probe active fn={fn} />);
    await userEvent.keyboard("{Escape}");
    expect(fn).toHaveBeenCalledTimes(1);
    rerender(<Probe active={false} fn={fn} />);
    await userEvent.keyboard("{Escape}");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
