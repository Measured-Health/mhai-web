import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_BACKUP_CODES } from "@/lib/auth/mock";
import { ToastProvider } from "../ui/toast";
import { BackupCodes } from "./backup-codes";

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
