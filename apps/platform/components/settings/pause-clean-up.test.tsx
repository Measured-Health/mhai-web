import { screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { dateLabel } from "@/lib/format";
import { healthKey } from "@/lib/queries/ops";
import { useSettings } from "@/lib/queries/settings";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import type { User } from "@/lib/auth/types";
import { HealthView } from "../system/health-view";
import { RetentionSection } from "./retention-section";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));

let api: PlatformClient;
beforeEach(() => {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => {
  net.online = true;
  __resetPlatformClientForTests();
});

function Page() {
  const q = useSettings();
  return q.data ? <RetentionSection settings={q.data} /> : <p>Loading</p>;
}
async function open(user: User = ADA) {
  renderWithAuth(<Page />, { user });
  return screen.findByRole("region", { name: "Records retention" });
}
async function typeCode(d: HTMLElement) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(MOCK_CODE);
}
const write = (paused: boolean, version: number) =>
  api.setCleanUpPaused(
    { paused, reason: "x", version, mfa_code: MOCK_CODE },
    { idempotencyKey: crypto.randomUUID() },
  );
const pauseNow = async () =>
  write(true, (await api.getSettings()).retention.version);
const LINE = /^Records clean-up paused by Ada Bakare since /;

describe("pausing the records clean-up", () => {
  it("pause needs a reason and the code; the line shows on Settings and Health", async () => {
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Pause clean-up" }),
    );
    const d = await screen.findByRole("dialog", { name: /Pause/ });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Pause clean-up" }),
    );
    // No reason yet: nothing was sent.
    expect((await api.getSettings()).retention.paused).toBe(false);
    await userEvent.type(
      within(d).getByLabelText(/^Reason/),
      "Audit in progress",
    );
    await userEvent.click(
      within(d).getByRole("button", { name: "Pause clean-up" }),
    );
    const line = await screen.findByText(LINE);
    const s = await api.getSettings();
    expect(line).toHaveTextContent(dateLabel(s.retention.paused_at!));
    expect(
      screen.getByRole("button", { name: "Resume clean-up" }),
    ).toBeInTheDocument();
    expect((await api.getHealth({ background: true })).clean_up.paused).toBe(
      true,
    );
  });

  it("the Health tab shows the same words", async () => {
    await pauseNow();
    renderWithAuth(<HealthView />, { user: ADA });
    expect(await screen.findByText(LINE)).toBeInTheDocument();
  });

  it("resume clears it", async () => {
    await pauseNow();
    await open();
    await screen.findByText(LINE);
    await userEvent.click(
      screen.getByRole("button", { name: "Resume clean-up" }),
    );
    const d = await screen.findByRole("dialog", { name: /Resume/ });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Done");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Resume clean-up" }),
    );
    await waitFor(() => expect(screen.queryByText(LINE)).toBeNull());
    expect(
      screen.getByRole("button", { name: "Pause clean-up" }),
    ).toBeInTheDocument();
    expect((await api.getSettings()).retention.paused).toBe(false);
  });

  it("an auditor sees the line and no button", async () => {
    await pauseNow();
    await open(AMARA);
    expect(await screen.findByText(LINE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clean-up$/ })).toBeNull();
  });

  it("offline disables the button with the reason", async () => {
    net.online = false;
    await open();
    expect(
      screen.getByRole("button", { name: "Pause clean-up" }),
    ).toBeDisabled();
  });

  it("a clash (409 conflict) says Changed by someone else, closes and reloads", async () => {
    await open();
    const reads = vi.spyOn(api, "getSettings");
    vi.spyOn(api, "setCleanUpPaused").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Pause clean-up" }),
    );
    const d = await screen.findByRole("dialog", { name: /Pause/ });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Audit");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Pause clean-up" }),
    );
    expect(
      await screen.findByText("Changed by someone else"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reads).toHaveBeenCalled();
  });

  it("sends the version the screen showed with the pause", async () => {
    await open();
    const seen = (await api.getSettings()).retention.version;
    const send = vi.spyOn(api, "setCleanUpPaused");
    await userEvent.click(
      screen.getByRole("button", { name: "Pause clean-up" }),
    );
    const d = await screen.findByRole("dialog", { name: /Pause/ });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Audit");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Pause clean-up" }),
    );
    await screen.findByText(LINE);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ paused: true, version: seen }),
      expect.anything(),
    );
  });

  it("a stale resume shows Changed by someone else and leaves the newer pause", async () => {
    await pauseNow();
    await open();
    await screen.findByText(LINE);
    // Meanwhile another admin resumes and pauses again.
    const v = (await api.getSettings()).retention.version;
    await write(false, v);
    await write(true, v + 1);
    await userEvent.click(
      screen.getByRole("button", { name: "Resume clean-up" }),
    );
    const d = await screen.findByRole("dialog", { name: /Resume/ });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Done");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Resume clean-up" }),
    );
    expect(
      await screen.findByText("Changed by someone else"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await api.getSettings()).retention.paused).toBe(true);
    expect(
      await screen.findByRole("button", { name: "Resume clean-up" }),
    ).toBeInTheDocument();
  });

  it("pausing makes Health look again (its reading is invalidated)", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderWithAuth(<Page />, { user: ADA, queryClient: qc });
    await screen.findByRole("button", { name: "Pause clean-up" });
    await userEvent.click(
      screen.getByRole("button", { name: "Pause clean-up" }),
    );
    const d = await screen.findByRole("dialog", { name: /Pause/ });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Audit");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Pause clean-up" }),
    );
    await screen.findByText(LINE);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: healthKey }),
    );
  });
});
