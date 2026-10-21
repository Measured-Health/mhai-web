import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../toast";
import { BackupCodes } from "./backup-codes";

// The clinical mock's demo backup codes (packages never import from an app).
const MOCK_BACKUP_CODES = [
  "4F7K-92QX",
  "M8TD-31LP",
  "Z2HV-7R6C",
  "Q9WE-5N4B",
  "K3YU-8J2D",
  "P6RA-1T9M",
  "B5NC-4X7H",
  "W1GZ-6E3V",
  "D8LS-2K5Q",
  "H7MF-9P1Y",
];

afterEach(() => vi.restoreAllMocks());
const mount = (onFinish = vi.fn()) =>
  render(
    <ToastProvider>
      <BackupCodes codes={MOCK_BACKUP_CODES} onFinish={onFinish} />
    </ToastProvider>,
  );

describe("BackupCodes", () => {
  it("shows every code and finishes only once saved", async () => {
    const onFinish = vi.fn();
    mount(onFinish);
    for (const c of MOCK_BACKUP_CODES)
      expect(screen.getByText(c)).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Finish setup" });
    expect(finish).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText("I've saved these codes somewhere safe"),
    );
    await userEvent.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("says Copied only when the clipboard write worked", async () => {
    const user = userEvent.setup();
    mount();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(
      new Error("denied"),
    );
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
    expect(screen.queryByText("Copied")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });

  it("downloads the codes as a text file", async () => {
    const create = vi.fn(() => "blob:codes");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:codes");
  });
});
