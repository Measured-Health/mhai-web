import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TwoPersonRequest } from "@/lib/api/contract";
import { TwoPersonActions, WAITING } from "./two-person";

const REQ: TwoPersonRequest = {
  id: "req_1",
  kind: "hold_lift",
  requested_by: { id: "tm_tunde", name: "Tunde Okafor" },
  requested_at: "2026-10-20T12:00:00.000Z",
  reason: "Case closed",
  requested_by_you: false,
  expires_at: "2026-10-27T12:00:00.000Z",
};

function show(
  over: Partial<Parameters<typeof TwoPersonActions>[0]> = {},
  request: Partial<TwoPersonRequest> = {},
) {
  const onApprove = vi.fn();
  const onCancel = vi.fn();
  render(
    <TwoPersonActions
      request={{ ...REQ, ...request }}
      canAct
      approveLabel="Approve lift"
      onApprove={onApprove}
      onCancel={onCancel}
      busy={false}
      {...over}
    />,
  );
  return { onApprove, onCancel };
}

describe("TwoPersonActions", () => {
  it("the requester sees Waiting for a different platform admin to approve and no Approve", () => {
    show({}, { requested_by_you: true });
    expect(WAITING).toBe("Waiting for a different platform admin to approve");
    expect(screen.getByText(WAITING)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve lift" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel request" }),
    ).toBeInTheDocument();
  });

  it("another admin sees Approve and Cancel request", async () => {
    const { onApprove, onCancel } = show();
    expect(screen.queryByText(WAITING)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approve lift" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel request" }),
    );
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("the server's requested_by_you decides, never the name", () => {
    // Someone else's request under the same name as the viewer's own.
    show({}, { requested_by: { id: "tm_other", name: "Ada Bakare" } });
    expect(
      screen.getByRole("button", { name: "Approve lift" }),
    ).toBeInTheDocument();
  });

  it("an auditor sees the request line only", () => {
    show({ canAct: false });
    expect(
      screen.getByText("Requested by Tunde Okafor · 20 Oct · lapses 27 Oct"),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(WAITING)).not.toBeInTheDocument();
  });

  it("the lapse date shows", () => {
    show({}, { expires_at: "2026-11-03T12:00:00.000Z" });
    expect(screen.getByText(/· lapses 3 Nov$/)).toBeInTheDocument();
  });

  it("busy or offline turns the buttons off", () => {
    show({
      busy: true,
      offlineProps: { disabled: true, title: "offline" },
    });
    expect(screen.getByRole("button", { name: "Approve lift" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Cancel request" }),
    ).toBeDisabled();
  });
});
