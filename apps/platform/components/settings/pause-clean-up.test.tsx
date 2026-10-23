import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { dateLabel } from "@/lib/format";
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
const pauseNow = () =>
  api.setCleanUpPaused(
    { paused: true, reason: "x", mfa_code: MOCK_CODE },
    { idempotencyKey: crypto.randomUUID() },
  );
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
});
