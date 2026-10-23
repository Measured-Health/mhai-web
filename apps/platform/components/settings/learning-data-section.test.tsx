import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { RESET_MS } from "@/lib/api/settings-contract";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import type { User } from "@/lib/auth/types";
import { useSettings } from "@/lib/queries/settings";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { LearningDataSection } from "./learning-data-section";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));

let api: PlatformClient;
let clock: number;
function install(resetFails = false) {
  clock = Date.now();
  api = createMockPlatform({
    delayMs: 0,
    now: () => clock,
    me: () => ADA.email,
    stepUp: createStepUp(),
    resetFails,
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => install());
afterEach(() => {
  net.online = true;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

function Page() {
  const q = useSettings();
  // The page looks again every 5 s while a reset runs; this does it now.
  return q.data ? (
    <>
      <LearningDataSection settings={q.data} />
      <button onClick={() => void q.refetch()}>Look again</button>
    </>
  ) : (
    <p>Loading</p>
  );
}
const TITLE = "Clear unapproved learning data";
async function open(user: User = ADA) {
  renderWithAuth(<Page />, { user });
  return screen.findByRole("region", { name: TITLE });
}
const region = () => screen.getByRole("region", { name: TITLE });
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
async function clear(reason = "Training data") {
  await userEvent.click(
    within(region()).getByRole("button", { name: "Clear" }),
  );
  const d = await screen.findByRole("dialog", { name: "Clear 37 items?" });
  await userEvent.type(within(d).getByLabelText(/^Reason/), reason);
  await typeCode(d);
  await userEvent.click(
    within(d).getByRole("button", { name: "Clear 37 items" }),
  );
}

describe("clearing unapproved learning data", () => {
  it("shows the count and the last reset", async () => {
    await open();
    expect(within(region()).getByText("37 items waiting")).toBeInTheDocument();
    expect(
      within(region()).getByText(
        /^Cleared by Tunde Okafor · \d+ \w+ \d{4} · 112 items · Test run data from a training session$/,
      ),
    ).toBeInTheDocument();
  });

  it("the dialog states the count and that it can't be undone; Cancel is the safe button", async () => {
    await open();
    await userEvent.click(
      within(region()).getByRole("button", { name: "Clear" }),
    );
    const d = await screen.findByRole("dialog", { name: "Clear 37 items?" });
    expect(
      within(d).getByText(
        "This clears 37 items of unapproved feedback. Approved corrections and guidelines are not touched. This can't be undone.",
      ),
    ).toBeInTheDocument();
    const confirm = within(d).getByRole("button", { name: "Clear 37 items" });
    expect(confirm.className).toMatch(/bad|danger/);
    const cancel = within(d).getByRole("button", { name: "Cancel" });
    expect(cancel.className).not.toMatch(/bad|danger/);
    const spy = vi.spyOn(api, "resetFeedbackBuffer");
    await userEvent.click(cancel);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("it needs a reason and the code", async () => {
    const spy = vi.spyOn(api, "resetFeedbackBuffer");
    await open();
    await userEvent.click(
      within(region()).getByRole("button", { name: "Clear" }),
    );
    const d = await screen.findByRole("dialog", { name: "Clear 37 items?" });
    const confirm = within(d).getByRole("button", { name: "Clear 37 items" });
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter a reason.")).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Training data");
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    // A wrong code is refused with its words.
    await typeCode(d, "000000");
    await userEvent.click(confirm);
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
  });

  it("shows Clearing… then Cleared 37 items", async () => {
    const spy = vi.spyOn(api, "resetFeedbackBuffer");
    await open();
    await clear();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![0]).toEqual({
      reason: "Training data",
      mfa_code: MOCK_CODE,
    });
    expect(await within(region()).findByText("Clearing…")).toBeInTheDocument();
    expect(
      within(region()).queryByRole("button", { name: "Clear" }),
    ).toBeNull();
    // The reset finishes; the page looks again by itself.
    clock += RESET_MS;
    await userEvent.click(screen.getByRole("button", { name: "Look again" }));
    expect(
      await within(region()).findByText(/^Cleared 37 items · \d\d:\d\d$/),
    ).toBeInTheDocument();
    expect(within(region()).getByText("0 items waiting")).toBeInTheDocument();
    expect(within(region()).queryByText("Clearing…")).toBeNull();
  });

  it("a failed reset links to Failed jobs", async () => {
    install(true);
    await open();
    await clear();
    await within(region()).findByText("Clearing…");
    clock += RESET_MS;
    await userEvent.click(screen.getByRole("button", { name: "Look again" }));
    expect(
      await within(region()).findByText(/^Couldn't clear/),
    ).toBeInTheDocument();
    const link = within(region()).getByRole("link", {
      name: "View in Failed jobs",
    });
    expect(link).toHaveAttribute("href", "/system/jobs");
    // The item count is unchanged and Clear is offered again.
    expect(within(region()).getByText("37 items waiting")).toBeInTheDocument();
    expect(
      within(region()).getByRole("button", { name: "Clear" }),
    ).toBeEnabled();
    // The job is really in System's list.
    const failed = await api.listJobs({ status: "failed" });
    expect(failed.jobs.some((j) => j.type === "feedback_buffer_reset")).toBe(
      true,
    );
  });

  it("the failed line goes once System has cancelled the job", async () => {
    install(true);
    await open();
    await clear();
    await within(region()).findByText("Clearing…");
    clock += RESET_MS;
    await userEvent.click(screen.getByRole("button", { name: "Look again" }));
    await within(region()).findByText(/^Couldn't clear/);
    const { jobs } = await api.listJobs({ status: "failed" });
    const job = jobs.find((j) => j.type === "feedback_buffer_reset")!;
    await api.cancelJobs(
      { ids: [job.id], reason: "no_longer_needed", mfa_code: MOCK_CODE },
      { idempotencyKey: "c1" },
    );
    await userEvent.click(screen.getByRole("button", { name: "Look again" }));
    await waitFor(() =>
      expect(within(region()).queryByText(/^Couldn't clear/)).toBeNull(),
    );
    expect(
      within(region()).queryByRole("link", { name: "View in Failed jobs" }),
    ).toBeNull();
    // The last outcome is the earlier clear.
    expect(within(region()).getByText(/· 112 items ·/)).toBeInTheDocument();
  });

  it("says 1 item for one, and offers no Clear for none", async () => {
    for (const n of [1, 0]) {
      const m = api;
      api = {
        ...m,
        getSettings: async () => {
          const s = await m.getSettings();
          s.feedback_buffer.waiting = n;
          return s;
        },
      } as PlatformClient;
      __setPlatformClientForTests(api);
      const { unmount } = renderWithAuth(<Page />, { user: ADA });
      await screen.findByRole("region", { name: TITLE });
      expect(
        within(region()).getByText(
          `${n} ${n === 1 ? "item" : "items"} waiting`,
        ),
      ).toBeInTheDocument();
      if (n === 1) {
        await userEvent.click(
          within(region()).getByRole("button", { name: "Clear" }),
        );
        expect(
          await screen.findByRole("dialog", { name: "Clear 1 item?" }),
        ).toBeInTheDocument();
      } else
        expect(
          within(region()).queryByRole("button", { name: "Clear" }),
        ).toBeNull();
      unmount();
      api = m;
    }
  });

  it("offline disables Clear with the reason", async () => {
    net.online = false;
    await open();
    expect(
      within(region()).getByRole("button", { name: "Clear" }),
    ).toBeDisabled();
    expect(
      screen.getByText("You're offline. This needs a connection."),
    ).toBeInTheDocument();
  });

  it("an auditor sees the count and the last reset only", async () => {
    await open(AMARA);
    expect(within(region()).getByText("37 items waiting")).toBeInTheDocument();
    expect(within(region()).queryAllByRole("button")).toHaveLength(0);
  });

  it("a count this app can't read fails the section closed", async () => {
    const m = api;
    api = {
      ...m,
      getSettings: async () => {
        const s = await m.getSettings();
        (s.feedback_buffer as { waiting: unknown }).waiting = "many";
        return s;
      },
    } as PlatformClient;
    __setPlatformClientForTests(api);
    renderWithAuth(<Page />, { user: ADA });
    expect(
      await screen.findByText("Couldn't load the learning data."),
    ).toBeInTheDocument();
  });

  it("a clash (409 conflict) says Changed by someone else, closes and reloads", async () => {
    await open();
    const reads = vi.spyOn(api, "getSettings");
    vi.spyOn(api, "resetFeedbackBuffer").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    await clear();
    expect(
      await within(region()).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reads).toHaveBeenCalled();
  });
});
