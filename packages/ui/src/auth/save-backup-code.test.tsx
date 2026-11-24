import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNewBackupCode,
  offerNewBackupCode,
  pendingBackupCode,
} from "@mhai/api-client/new-backup-code";
import {
  NewBackupCodeHost,
  SaveBackupCode,
  SAVE_WAIT_S,
} from "./save-backup-code";

const CODE = "ppppp-qqqqq";
const continueButton = () => screen.getByRole("button", { name: "Continue" });
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearNewBackupCode();
});

describe("SaveBackupCode", () => {
  it("shows the one code and waits 3 s, counting down, before Continue works", () => {
    const onContinue = vi.fn();
    render(<SaveBackupCode code={CODE} kind="new" onContinue={onContinue} />);
    expect(
      screen.getByRole("group", { name: "Your backup code" }),
    ).toHaveTextContent(CODE);
    expect(
      screen.getByText(/Your old backup code no longer works/),
    ).toBeInTheDocument();
    const go = continueButton();
    expect(go).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("You can continue in 3…")).toBeInTheDocument();
    fireEvent.click(go);
    expect(onContinue).not.toHaveBeenCalled();
    tick(1000);
    expect(screen.getByText("You can continue in 2…")).toBeInTheDocument();
    tick(1000);
    expect(screen.getByText("You can continue in 1…")).toBeInTheDocument();
    fireEvent.click(go);
    expect(onContinue).not.toHaveBeenCalled();
    tick(SAVE_WAIT_S * 1000 - 2000);
    expect(go).not.toHaveAttribute("aria-disabled");
    fireEvent.click(go);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("the count is read out from a live region", () => {
    render(<SaveBackupCode code={CODE} kind="setup" onContinue={vi.fn()} />);
    expect(screen.getByText("You can continue in 3…")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("still waits 3 s with reduced motion: only the blur is motion-only", () => {
    const onContinue = vi.fn();
    render(<SaveBackupCode code={CODE} kind="new" onContinue={onContinue} />);
    // The wait itself is a timer, never an animation.
    expect(continueButton().className).toContain("motion-safe:blur");
    expect(continueButton().className).not.toMatch(/(^|\s)blur/);
    tick(2999);
    fireEvent.click(continueButton());
    expect(onContinue).not.toHaveBeenCalled();
    tick(1);
    fireEvent.click(continueButton());
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("the lost-phone link forgets the code and goes to the account page", () => {
    const onContinue = vi.fn();
    const navigate = vi.fn();
    render(
      <SaveBackupCode
        code={CODE}
        kind="new"
        onContinue={onContinue}
        lostPhone={{ href: "/account#security", navigate }}
      />,
    );
    const link = screen.getByRole("link", {
      name: "Lost your phone? Move to a new authenticator app",
    });
    expect(link).toHaveAttribute("href", "/account#security");
    fireEvent.click(link);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/account#security");
  });
});

describe("CopyCodeButton", () => {
  it("copies the code, shows a tick for 2 s and says Copied", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const log = vi.spyOn(console, "log");
    render(<SaveBackupCode code={CODE} kind="setup" onContinue={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy backup code" }));
    });
    expect(writeText).toHaveBeenCalledWith(CODE);
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    tick(2000);
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(log).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("selects the code when there is no clipboard", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<SaveBackupCode code={CODE} kind="setup" onContinue={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy backup code" }));
    });
    expect(window.getSelection()?.toString()).toBe(CODE);
    expect(screen.getByRole("status")).not.toHaveTextContent("Copied");
    vi.unstubAllGlobals();
  });

  it("selects the code when copying is refused", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<SaveBackupCode code={CODE} kind="setup" onContinue={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy backup code" }));
    });
    expect(window.getSelection()?.toString()).toBe(CODE);
    vi.unstubAllGlobals();
  });
});

describe("NewBackupCodeHost", () => {
  it("shows a code offered by a reply and forgets it on Continue", () => {
    render(<NewBackupCodeHost />);
    expect(screen.queryByText(CODE)).toBeNull();
    act(() => offerNewBackupCode(CODE));
    expect(
      screen.getByRole("heading", { name: "Save your new backup code" }),
    ).toBeInTheDocument();
    expect(screen.getByText(CODE)).toBeInTheDocument();
    // Escape can't skip it.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText(CODE)).toBeInTheDocument();
    tick(SAVE_WAIT_S * 1000);
    fireEvent.click(continueButton());
    expect(pendingBackupCode()).toBeNull();
    expect(screen.queryByText(CODE)).toBeNull();
  });
});
