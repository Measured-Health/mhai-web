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
import { dateLabel } from "@/lib/format";
import { useSettings } from "@/lib/queries/settings";
import { previewLine } from "@/lib/settings/rules";
import { AMARA, renderWithAuth } from "@/tests/render";
import type { User } from "@/lib/auth/types";
import { ADA } from "@/tests/render";
import { RetentionSection } from "./retention-section";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => net.online }));

let api: PlatformClient;
let who: string;
function install(email: string = ADA.email) {
  who = email;
  api = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => install());
afterEach(() => {
  net.online = true;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

/** As another person, straight to the API. */
async function as<T>(email: string, fn: () => Promise<T>) {
  const was = who;
  who = email;
  try {
    return await fn();
  } finally {
    who = was;
  }
}

function Page() {
  const q = useSettings();
  return q.data ? <RetentionSection settings={q.data} /> : <p>Loading</p>;
}
async function open(user: User = ADA) {
  renderWithAuth(<Page />, { user });
  return screen.findByRole("region", { name: "Records retention" });
}
const row = (name: string) =>
  screen.getByRole("row", { name: new RegExp(`^${name}`) });
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
/** Change → a period → Continue; returns the step-up dialog. */
async function choose(type: string, period: string, title: RegExp) {
  await userEvent.click(
    within(row(type)).getByRole("button", { name: /^Change/ }),
  );
  const d = screen.getByRole("dialog", { name: `How long to keep ${type}` });
  await userEvent.selectOptions(within(d).getByLabelText("Keep for"), period);
  await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
  return screen.findByRole("dialog", { name: title });
}

describe("records retention", () => {
  it("shows each type, its period, minimum, last and next clean-up, and kept for legal holds", async () => {
    await open();
    const s = await api.getSettings();
    const it0 = s.retention.items[0]!;
    const last = `${dateLabel(it0.last_run!.at)} · 312 deleted · 1840 kept for legal holds · finished`;
    const cells = (name: string) =>
      within(row(name))
        .getAllByRole("cell")
        .map((c) => c.textContent);
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(
      expect.arrayContaining([
        "What's kept",
        "How long",
        "Minimum",
        "Last clean-up",
        "Next",
      ]),
    );
    expect(cells("Questions and answers")).toEqual(
      expect.arrayContaining([
        "6 years",
        "1 year",
        last,
        dateLabel(it0.next_run_at!),
      ]),
    );
    expect(cells("Documents")).toEqual(
      expect.arrayContaining(["6 years", "1 year"]),
    );
    expect(cells("Waiting corrections")).toEqual(
      expect.arrayContaining(["1 year", "1 month"]),
    );
    expect(cells("Audit log")).toEqual(
      expect.arrayContaining(["6 years", "6 years"]),
    );
  });

  it("a clean-up that didn't finish says so", async () => {
    const m = createMockPlatform({
      delayMs: 0,
      me: () => who,
      stepUp: createStepUp(),
    });
    api = {
      ...m,
      getSettings: async () => {
        const s = await m.getSettings();
        s.retention.items[1]!.last_run!.ok = false;
        return s;
      },
    } as PlatformClient;
    __setPlatformClientForTests(api);
    await open();
    expect(within(row("Documents")).getByText(/didn't finish$/)).toBeVisible();
  });

  it("shows the not-yet-confirmed note", async () => {
    await open();
    expect(
      screen.getByText(
        "These periods are not yet confirmed by Measured Health's compliance lead.",
      ),
    ).toBeInTheDocument();
  });

  it("longer asks for a reason and the code, then applies", async () => {
    const spy = vi.spyOn(api, "setRetention");
    await open();
    const d = await choose(
      "Documents",
      "7 years",
      /^Keep Documents for 7 years/,
    );
    const confirm = within(d).getByRole("button", { name: "Keep for 7 years" });
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter a reason.")).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText(/^Reason/), "New policy");
    await userEvent.click(confirm);
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await typeCode(d);
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        within(row("Documents")).getAllByRole("cell")[0],
      ).toHaveTextContent("7 years"),
    );
    expect(spy.mock.calls[0]![0]).toBe("documents");
    expect(spy.mock.calls[0]![1]).toEqual({
      days: 2555,
      reason: "New policy",
      version: 1,
      mfa_code: MOCK_CODE,
    });
    // Who changed it, when, and where the history is.
    const s = await api.getSettings();
    const docs = s.retention.items.find((i) => i.type === "documents")!;
    expect(
      within(row("Documents")).getByText(
        `Changed by Ada Bakare · ${dateLabel(docs.changed_at!)}`,
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(
      within(row("Documents")).getByRole("link", { name: "History" }),
    ).toHaveAttribute("href", "/activity");
  });

  it("shorter shows the preview, then asks, and the row shows the waiting words", async () => {
    const preview = vi.spyOn(api, "previewRetention");
    const spy = vi.spyOn(api, "setRetention");
    await open();
    const d = await choose(
      "Questions and answers",
      "3 years",
      /^Shorten Questions and answers to 3 years/,
    );
    expect(preview).toHaveBeenCalledWith("records", 1095);
    expect(within(d).getByText(previewLine(1095, 12300))).toBeInTheDocument();
    const confirm = within(d).getByRole("button", { name: "Ask to shorten" });
    expect(confirm.className).toMatch(/bad|danger/);
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Policy review");
    await typeCode(d);
    await userEvent.click(confirm);
    // The result, as a pop-up.
    expect(
      (
        await screen.findAllByText(
          "Waiting for a different platform admin to approve",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy.mock.calls[0]![1]).toMatchObject({ days: 1095, version: 1 });
    await waitFor(() =>
      expect(
        within(row("Questions and answers")).getByText(
          "Change to 3 years waiting for a different platform admin",
        ),
      ).toBeInTheDocument(),
    );
    // Still the period in force, and no second Change while it waits.
    expect(
      within(row("Questions and answers")).getAllByRole("cell")[0],
    ).toHaveTextContent("6 years");
    expect(
      within(row("Questions and answers")).queryByRole("button", {
        name: /^Change/,
      }),
    ).toBeNull();
  });

  it("below-minimum periods aren't offered", async () => {
    await open();
    await userEvent.click(
      within(row("Audit log")).getByRole("button", { name: /^Change/ }),
    );
    let d = screen.getByRole("dialog", { name: "How long to keep Audit log" });
    expect(
      within(within(d).getByLabelText("Keep for"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["6 years", "7 years", "8 years", "9 years", "10 years"]);
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      within(row("Documents")).getByRole("button", { name: /^Change/ }),
    );
    d = screen.getByRole("dialog", { name: "How long to keep Documents" });
    const options = within(within(d).getByLabelText("Keep for"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options[0]).toBe("1 year");
    expect(options).not.toContain("11 months");
  });

  it("choosing the period already in force asks for a different one", async () => {
    const spy = vi.spyOn(api, "setRetention");
    await open();
    await userEvent.click(
      within(row("Documents")).getByRole("button", { name: /^Change/ }),
    );
    const d = screen.getByRole("dialog", {
      name: "How long to keep Documents",
    });
    expect(within(d).getByLabelText("Keep for")).toHaveDisplayValue("6 years");
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    expect(
      within(d).getByText("Choose a different period."),
    ).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("a stale version shows Changed by someone else and reloads", async () => {
    await open();
    const d = await choose(
      "Documents",
      "7 years",
      /^Keep Documents for 7 years/,
    );
    // Tunde changes it meanwhile.
    await as(TEAM_EMAILS.tunde, () =>
      api.setRetention(
        "documents",
        { days: 2920, reason: "Tunde's", version: 1, mfa_code: MOCK_CODE },
        { idempotencyKey: "t" },
      ),
    );
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Mine");
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Keep for 7 years" }),
    );
    expect(
      await screen.findByText("Changed by someone else"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(
        within(row("Documents")).getAllByRole("cell")[0],
      ).toHaveTextContent("8 years"),
    );
  });

  it("an auditor sees no Change", async () => {
    await open(AMARA);
    expect(
      screen.getByText(
        "These periods are not yet confirmed by Measured Health's compliance lead.",
      ),
    ).toBeInTheDocument();
    expect(row("Documents")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change/ })).toBeNull();
  });

  it("no code is asked for when the preview fails; Continue reads it again", async () => {
    const preview = vi
      .spyOn(api, "previewRetention")
      .mockRejectedValueOnce(new ApiError(503, "unavailable"));
    await open();
    await userEvent.click(
      within(row("Questions and answers")).getByRole("button", {
        name: /^Change/,
      }),
    );
    const d = screen.getByRole("dialog", {
      name: "How long to keep Questions and answers",
    });
    await userEvent.selectOptions(
      within(d).getByLabelText("Keep for"),
      "3 years",
    );
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Couldn't check what would be deleted."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Digit 1 of 6")).toBeNull();
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Digit 1 of 6")).toBeInTheDocument();
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it("offline disables Change with the reason", async () => {
    net.online = false;
    await open();
    expect(
      within(row("Documents")).getByRole("button", { name: /^Change/ }),
    ).toBeDisabled();
    expect(
      screen.getByText("You're offline. This needs a connection."),
    ).toBeInTheDocument();
  });

  it("a type this app doesn't know fails the section closed", async () => {
    const m = createMockPlatform({
      delayMs: 0,
      me: () => who,
      stepUp: createStepUp(),
    });
    api = {
      ...m,
      getSettings: async () => {
        const s = await m.getSettings();
        (s.retention.items[0] as { type: string }).type = "backups";
        return s;
      },
    } as PlatformClient;
    __setPlatformClientForTests(api);
    await open();
    expect(
      screen.getByText("Couldn't load records retention."),
    ).toBeInTheDocument();
    expect(screen.queryByText("backups")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
