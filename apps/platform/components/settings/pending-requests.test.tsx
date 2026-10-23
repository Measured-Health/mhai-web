import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import type { User } from "@/lib/auth/types";
import { useSettings } from "@/lib/queries/settings";
import { previewLine } from "@/lib/settings/rules";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { PendingRequests } from "./pending-requests";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const TUNDE: User = {
  ...ADA,
  id: "tunde.okafor",
  email: TEAM_EMAILS.tunde,
  name: "Tunde Okafor",
};
const D = 24 * 3_600_000;
const WAITING = "Waiting for a different platform admin to approve";

let api: PlatformClient;
let who: string;
let clock: number;
function install(email: string = ADA.email) {
  who = email;
  clock = Date.now();
  api = createMockPlatform({
    delayMs: 0,
    now: () => clock,
    me: () => who,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

async function as<T>(email: string, fn: () => Promise<T>) {
  const was = who;
  who = email;
  try {
    return await fn();
  } finally {
    who = was;
  }
}
/** Tunde asks to shorten Questions and answers to 3 years. */
const tundeShortens = () =>
  as(TEAM_EMAILS.tunde, () =>
    api.setRetention(
      "records",
      { days: 1095, reason: "Policy review", version: 1, mfa_code: MOCK_CODE },
      { idempotencyKey: "t1" },
    ),
  );

function Page() {
  const q = useSettings();
  return q.data ? <PendingRequests settings={q.data} /> : <p>Loading</p>;
}
async function open(user: User = ADA) {
  renderWithAuth(<Page />, { user });
  return screen.findByRole("region", { name: "Changes waiting for approval" });
}
const region = () =>
  screen.getByRole("region", { name: "Changes waiting for approval" });
const btn = (name: string) => within(region()).getByRole("button", { name });
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

describe("changes waiting for approval", () => {
  it("none waiting says so", async () => {
    await open();
    expect(
      within(region()).getByText("No changes waiting for approval."),
    ).toBeInTheDocument();
  });

  it("the requester sees Waiting for a different platform admin to approve", async () => {
    install(TEAM_EMAILS.tunde);
    await tundeShortens();
    // A session name that matches someone else's changes nothing.
    await open({ ...TUNDE, name: "Ada Bakare" });
    expect(
      within(region()).getByText("Questions and answers to 3 years"),
    ).toBeInTheDocument();
    expect(within(region()).getByText(WAITING)).toBeInTheDocument();
    expect(
      within(region()).queryByRole("button", { name: "Approve" }),
    ).toBeNull();
    expect(btn("Cancel request")).toBeEnabled();
  });

  it("an approval refused as same_person shows A different platform admin must approve this.", async () => {
    await tundeShortens();
    // Read as Ada, then signed out and back in as Tunde in the same tab.
    await open();
    who = TEAM_EMAILS.tunde;
    await userEvent.click(btn("Approve"));
    const d = await screen.findByRole("dialog", { name: /^Approve/ });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve change" }),
    );
    expect(
      await within(region()).findByText(
        "A different platform admin must approve this.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("another admin's Approve shows a freshly fetched preview", async () => {
    await tundeShortens();
    const preview = vi.spyOn(api, "previewRetention");
    const approve = vi.spyOn(api, "approveRequest");
    await open();
    expect(
      within(region()).getByText(/^Requested by Tunde Okafor · /),
    ).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
    await userEvent.click(btn("Approve"));
    const d = await screen.findByRole("dialog", { name: /^Approve/ });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith("records", 1095);
    expect(within(d).getByText(previewLine(1095, 12300))).toBeInTheDocument();
    // Closing and approving again asks again.
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await userEvent.click(btn("Approve"));
    const d2 = await screen.findByRole("dialog", { name: /^Approve/ });
    expect(preview).toHaveBeenCalledTimes(2);
    const confirm = within(d2).getByRole("button", { name: "Approve change" });
    expect(confirm.className).toMatch(/bad|danger/);
    await typeCode(d2);
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      await within(region()).findByText("No changes waiting for approval."),
    ).toBeInTheDocument();
    const s = await api.getSettings();
    expect(s.retention.items.find((i) => i.type === "records")!.days).toBe(
      1095,
    );
    expect(approve.mock.calls[0]![1]).toEqual({
      version: 2,
      mfa_code: MOCK_CODE,
    });
  });

  it("no code is asked for when the preview fails", async () => {
    await tundeShortens();
    const approve = vi.spyOn(api, "approveRequest");
    vi.spyOn(api, "previewRetention").mockRejectedValueOnce(
      new ApiError(503, "unavailable"),
    );
    await open();
    await userEvent.click(btn("Approve"));
    expect(
      await within(region()).findByText(
        "Couldn't check what would be deleted. Try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Digit 1 of 6")).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  it("triage Approve shows the clinical sign-off", async () => {
    await as(TEAM_EMAILS.tunde, () =>
      api.setTriage(
        {
          enabled: true,
          reason: "Validated",
          clinical_signoff: "Dr Ifeoma Nwosu, CMO memo 12",
          version: 1,
          mfa_code: MOCK_CODE,
        },
        { idempotencyKey: "t2" },
      ),
    );
    const preview = vi.spyOn(api, "previewRetention");
    await open();
    expect(within(region()).getByText("Triage on")).toBeInTheDocument();
    await userEvent.click(btn("Approve"));
    const d = await screen.findByRole("dialog", { name: /^Approve/ });
    expect(
      within(d).getByText("Clinical sign-off: Dr Ifeoma Nwosu, CMO memo 12"),
    ).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });

  it("expired shows This request lapsed after 7 days. Make a new request. and reloads", async () => {
    await tundeShortens();
    await open();
    await userEvent.click(btn("Approve"));
    const d = await screen.findByRole("dialog", { name: /^Approve/ });
    // It lapses while the dialog is open.
    clock += 8 * D;
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Approve change" }),
    );
    expect(
      await within(region()).findByText(
        "This request lapsed after 7 days. Make a new request.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      await within(region()).findByText("No changes waiting for approval."),
    ).toBeInTheDocument();
    const s = await api.getSettings();
    expect(s.retention.items.find((i) => i.type === "records")!.days).toBe(
      2190,
    );
  });

  it("either admin can cancel", async () => {
    await tundeShortens();
    const cancel = vi.spyOn(api, "cancelRequest");
    await open();
    await userEvent.click(btn("Cancel request"));
    expect(
      await within(region()).findByText("No changes waiting for approval."),
    ).toBeInTheDocument();
    // No step-up: only the version Ada saw.
    expect(cancel.mock.calls[0]![1]).toEqual({ version: 2 });
  });

  it("the requester can cancel their own", async () => {
    install(TEAM_EMAILS.tunde);
    await tundeShortens();
    await open(TUNDE);
    await userEvent.click(btn("Cancel request"));
    expect(
      await within(region()).findByText("No changes waiting for approval."),
    ).toBeInTheDocument();
  });

  it("an auditor sees the request, not the buttons", async () => {
    await tundeShortens();
    await open(AMARA);
    expect(
      within(region()).getByText("Questions and answers to 3 years"),
    ).toBeInTheDocument();
    expect(within(region()).queryAllByRole("button")).toHaveLength(0);
  });

  it("a request this app doesn't know fails the section closed", async () => {
    await tundeShortens();
    const m = api;
    api = {
      ...m,
      getSettings: async () => {
        const s = await m.getSettings();
        (s.pending[0] as { kind: string }).kind = "pause_all";
        return s;
      },
    } as PlatformClient;
    __setPlatformClientForTests(api);
    await open();
    expect(
      within(region()).getByText(
        "Couldn't load the changes waiting for approval.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pause_all/)).toBeNull();
  });
});
