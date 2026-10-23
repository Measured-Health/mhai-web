import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import type { IntegrityStatus, VerifyRun } from "@/lib/api/audit-contract";
import { SECURITY_CONTACT, seedAudit } from "@/lib/api/audit-fixtures";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import type { AuditMockOptions } from "@/lib/api/mock-audit";
import { createStepUp } from "@/lib/api/step-up";
import { formatWhen } from "@/lib/activity-labels";
import { coverageLine, runSentence } from "@/lib/audit/integrity";
import { takeAuditTab } from "@/lib/audit/nav";
import { dateLabel } from "@/lib/format";
import { __resetReportedForTests } from "@/lib/queries/audit";
import { AMARA, renderWithAuth } from "@/tests/render";
import { AppShell } from "../shell/app-shell";
import { TopBar } from "../shell/top-bar";
import { OFFLINE_NOTE } from "../states/offline-strip";
import { AuditView } from "./audit-view";
import { IntegrityTab } from "./integrity-tab";

const env = vi.hoisted(() => ({
  path: "/audit",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => env.path,
  useRouter: () => ({ push: env.push, replace: env.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

/** 10:00 UTC: the day's 06:00 check has run (tests run in UTC). */
const NOW = Date.parse("2026-10-22T10:00:00Z");
const H = 3_600_000;
const MIN = 60_000;

function setup(
  audit?: AuditMockOptions,
  over: (m: PlatformClient) => Partial<PlatformClient> = () => ({}),
  me: string = TEAM_EMAILS.ada,
) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => me,
    stepUp: createStepUp(),
    audit,
  });
  __setPlatformClientForTests({ ...m, ...over(m) } as PlatformClient);
  return m;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  env.path = "/audit";
  env.push.mockClear();
  __resetReportedForTests();
  takeAuditTab();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const block = () => screen.findByRole("status", { name: "Integrity status" });
async function openIntegrity() {
  await userEvent.click(await screen.findByRole("tab", { name: "Integrity" }));
  return block();
}
/** Waits out a mock check (1.5 s) and the 2 s poll. */
const settle = async () => {
  await tick(2_100);
  await tick(2_100);
};
const history = () => screen.findByRole("list", { name: "History" });
const banner = () =>
  screen.findByText(/^The audit log failed its integrity check on /);

const status = (over: Partial<IntegrityStatus>): IntegrityStatus => ({
  latest: null,
  running: null,
  open_failure: null,
  security_contact: SECURITY_CONTACT,
  oldest_kept_at: "2021-01-03T12:00:00Z",
  ...over,
});

describe("the Integrity tab", () => {
  it("intact mode: Intact with the full sentence and coverage; the header reads Intact · checked 06:01 today (the 06:00 daily check)", async () => {
    setup();
    renderWithAuth(<AuditView />);
    // The sample's daily check starts at 06:00 UTC and takes a minute.
    expect(
      await screen.findByRole("button", {
        name: "Integrity: Intact · checked 06:01 today",
      }),
    ).toBeInTheDocument();
    const b = await openIntegrity();
    const run = seedAudit(NOW).runs[0]!;
    expect(await within(b).findByText("Intact")).toBeVisible();
    const sentence = runSentence(run, NOW);
    expect(sentence).toMatch(
      /^No changes found\. Checked [\d,]+ entries, from the checkpoint of .+ to entry [\d,]+ \(22 Oct 2026 06:00 UTC\)\.$/,
    );
    expect(within(b).getByText(sentence)).toBeVisible();
    expect(within(b).getByText(coverageLine(run)!)).toBeVisible();
    expect(
      within(b).getByText(
        `Checked ${formatWhen(run.finished_at!)} · by the daily schedule`,
      ),
    ).toBeVisible();
    expect(b).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("list", { name: "What to do now" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stale mode: the header reads Not checked since …, in warning style", async () => {
    setup({ integrity: "stale" });
    renderWithAuth(<AuditView />);
    const line = await screen.findByRole("button", {
      name: /^Integrity: Not checked since \d{1,2} [A-Z][a-z]{2} \d{4}$/,
    });
    expect(line).toHaveClass("bg-warn-wash", "text-warn-deep");
    expect(line.querySelector("svg")).not.toBeNull();
    const b = await openIntegrity();
    expect(await within(b).findByText("Couldn't check")).toBeVisible();
    expect(
      within(b).getByText(/^Not checked since \d{1,2} [A-Z][a-z]{2} \d{4}\.$/),
    ).toBeVisible();
    expect(within(b).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(within(b).queryByText(/Intact/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Intact/ })).toBeNull();
  });

  it("a page left open goes stale at 26 h 1 min without a reload (fake clock)", async () => {
    // A second short of 26 h when the page opens (the clock moves on).
    const finished = NOW - 26 * H + 1_000;
    const run = {
      ...seedAudit(NOW).runs[0]!,
      started_at: new Date(finished - MIN).toISOString(),
      finished_at: new Date(finished).toISOString(),
      to_at: new Date(finished - MIN).toISOString(),
    };
    setup(undefined, () => ({
      getIntegrityStatus: async () => status({ latest: run }),
    }));
    renderWithAuth(<AuditView />);
    // Just under 26 h old still reads checked.
    expect(
      await screen.findByRole("button", {
        name: "Integrity: Intact · checked 21 Oct, 08:00",
      }),
    ).toBeInTheDocument();
    const b = await openIntegrity();
    expect(await within(b).findByText("Intact")).toBeVisible();
    await tick(60_000);
    expect(
      await screen.findByRole("button", {
        name: "Integrity: Not checked since 21 Oct 2026",
      }),
    ).toBeInTheDocument();
    expect(within(b).getByText("Couldn't check")).toBeVisible();
    expect(within(b).getByText("Not checked since 21 Oct 2026.")).toBeVisible();
    expect(within(b).queryByText("Intact")).toBeNull();
  });

  it("unproven mode: Run check now ends in Couldn't check, never Intact", async () => {
    setup({ integrity: "unproven" });
    renderWithAuth(<AuditView />);
    const b = await openIntegrity();
    await userEvent.click(
      await screen.findByRole("button", { name: "Run check now" }),
    );
    expect(await within(b).findByText("Checking…")).toBeVisible();
    await settle();
    expect(await within(b).findByText("Couldn't check")).toBeVisible();
    expect(
      within(b).getByText(
        "The check didn't finish, so the log's integrity is unknown. The reply wasn't what was expected.",
      ),
    ).toBeVisible();
    expect(within(b).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(within(b).queryByText("Intact")).toBeNull();
    expect(
      await screen.findByRole("button", {
        name: "Integrity: Couldn't check · 10:00 today",
      }),
    ).toBeInTheDocument();
  });

  it("error mode: Couldn't check with 'It timed out.' and Try again", async () => {
    setup({ integrity: "error" });
    renderWithAuth(<AuditView />);
    const b = await openIntegrity();
    await userEvent.click(
      await screen.findByRole("button", { name: "Run check now" }),
    );
    await settle();
    expect(await within(b).findByText("Couldn't check")).toBeVisible();
    expect(within(b).getByText(/It timed out\.$/)).toBeVisible();
    // Try again starts another check.
    await userEvent.click(within(b).getByRole("button", { name: "Try again" }));
    expect(await within(b).findByText("Checking…")).toBeVisible();
  });

  it("Run check now shows Checking… with progress, then the result, announced", async () => {
    setup();
    renderWithAuth(<AuditView />);
    const b = await openIntegrity();
    await within(b).findByText("Intact");
    await userEvent.click(
      screen.getByRole("button", { name: "Run check now" }),
    );
    expect(await within(b).findByText("Checking…")).toBeVisible();
    expect(
      within(b).getByText(
        /^Checking… [\d,]+ entries checked so far, from the checkpoint of \d{1,2} [A-Z][a-z]{2} \d{4}\.$/,
      ),
    ).toBeVisible();
    expect(within(b).getByText(/^Started .+ · by Ada Bakare$/)).toBeVisible();
    await settle();
    expect(await within(b).findByText("Intact")).toBeVisible();
    expect(within(b).getByText(/^No changes found\./)).toBeVisible();
    expect(within(b).getByText(/^Checked .+ · by Ada Bakare$/)).toBeVisible();
    expect(b).toHaveAttribute("aria-live", "polite");
    const first = within(await history()).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("Intact");
    expect(first).toHaveTextContent("Ada Bakare");
  });

  it("a second Run check now while running shows the same run", async () => {
    const ids: string[] = [];
    setup(undefined, (m) => ({
      startCheck: async (o) => {
        const r = await m.startCheck(o);
        ids.push(r.run_id);
        return r;
      },
    }));
    renderWithAuth(<AuditView />);
    const b = await openIntegrity();
    const run = await screen.findByRole("button", { name: "Run check now" });
    await userEvent.click(run);
    expect(await within(b).findByText("Checking…")).toBeVisible();
    await userEvent.click(run);
    await tick(100);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    expect(within(b).getByText("Checking…")).toBeVisible();
    const items = within(await history()).getAllByRole("listitem");
    expect(
      items.filter((li) => /Checking…/.test(li.textContent!)),
    ).toHaveLength(1);
  });

  it("broken mode: the banner shows on every tab and on Hospitals, with the steps and the first entry", async () => {
    setup({ integrity: "broken" });
    const seed = seedAudit(NOW, "broken");
    const failed = seed.runs[0]!;
    const date = dateLabel(failed.finished_at!);
    const { unmount } = renderWithAuth(<AuditView />);
    // Events.
    const onEvents = await banner();
    expect(onEvents.closest("[role=alert]")).toHaveTextContent(
      `The audit log failed its integrity check on ${date}. See Integrity.`,
    );
    expect(
      await screen.findByRole("button", {
        name: `Integrity: Broken · failed ${date}`,
      }),
    ).toBeInTheDocument();
    // See Integrity switches the tab.
    await userEvent.click(
      screen.getByRole("button", { name: "See Integrity" }),
    );
    expect(screen.getByRole("tab", { name: "Integrity" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await banner()).toBeVisible();
    const b = await block();
    expect(await within(b).findByText("Broken")).toBeVisible();
    // The six steps.
    const steps = within(
      screen.getByRole("list", { name: "What to do now" }),
    ).getAllByRole("listitem");
    expect(steps).toHaveLength(6);
    expect(steps[0]).toHaveTextContent(
      "Don't treat later entries as evidence until the failure is explained.",
    );
    expect(steps[1]).toHaveTextContent(`#${seed.firstBrokenSeq}`);
    expect(
      within(steps[1]!).getByRole("button", {
        name: "Copy first broken entry",
      }),
    ).toBeVisible();
    expect(
      within(steps[1]!).getByRole("button", { name: "Open entry" }),
    ).toBeVisible();
    expect(steps[2]).toHaveTextContent("Run the check again");
    expect(
      within(steps[3]!).getByRole("link", { name: SECURITY_CONTACT.email }),
    ).toHaveAttribute("href", `mailto:${SECURITY_CONTACT.email}`);
    expect(steps[3]).toHaveTextContent(SECURITY_CONTACT.name);
    expect(steps[4]).toHaveTextContent("Export the entries around the break");
    expect(steps[5]).toHaveTextContent("Record the outcome");
    unmount();

    // Hospitals: the shell's banner links to the Integrity tab.
    env.path = "/hospitals";
    renderWithAuth(
      <AppShell>
        <TopBar title="Hospitals" />
      </AppShell>,
    );
    const onHome = await banner();
    expect(onHome.closest("[role=alert]")).toHaveTextContent(
      `The audit log failed its integrity check on ${date}. See Integrity.`,
    );
    const link = screen.getByRole("link", { name: "See Integrity" });
    expect(link).toHaveAttribute("href", "/audit");
    fireEvent.click(link);
    expect(takeAuditTab()).toEqual({ tab: "integrity" });
  });

  it("Copy copies the first broken entry's position", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup({ integrity: "broken" });
    const seed = seedAudit(NOW, "broken");
    renderWithAuth(<AuditView />);
    await openIntegrity();
    await userEvent.click(
      await screen.findByRole("button", { name: "Copy first broken entry" }),
    );
    expect(writeText).toHaveBeenCalledWith(String(seed.firstBrokenSeq));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("Open entry opens #{seq}", async () => {
    let listAudit!: ReturnType<typeof vi.fn<PlatformClient["listAudit"]>>;
    setup({ integrity: "broken" }, (m) => {
      listAudit = vi.fn(m.listAudit);
      return { listAudit };
    });
    const seed = seedAudit(NOW, "broken");
    const entry = seed.events.find((e) => e.seq === seed.firstBrokenSeq)!;
    renderWithAuth(<AuditView />);
    await openIntegrity();
    const open = await screen.findByRole("button", { name: "Open entry" });
    const before = listAudit.mock.calls.length;
    await userEvent.click(open);
    expect(
      await screen.findByRole("heading", { name: `Entry #${entry.seq}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Events", selected: true }),
    ).toBeInTheDocument();
    await tick(50);
    // One read only: the exact id search, which is recorded as a search.
    expect(listAudit.mock.calls.slice(before)).toEqual([
      [{ q: entry.id }, undefined],
    ]);
  });

  it("Open entry makes no list read but the id search", async () => {
    let listAudit!: ReturnType<typeof vi.fn<PlatformClient["listAudit"]>>;
    setup({ integrity: "broken" }, (m) => {
      listAudit = vi.fn(m.listAudit);
      return { listAudit };
    });
    const seed = seedAudit(NOW, "broken");
    const entry = seed.events.find((e) => e.seq === seed.firstBrokenSeq)!;
    env.path = "/audit";
    renderWithAuth(<AuditView />);
    await openIntegrity();
    await userEvent.click(
      await screen.findByRole("button", { name: "Open entry" }),
    );
    await screen.findByRole("heading", { name: `Entry #${entry.seq}` });
    await tick(50);
    // No read narrowed to a moment the person never chose.
    expect(
      listAudit.mock.calls.filter(
        ([f]) => f.from !== undefined && f.q === undefined,
      ),
    ).toHaveLength(1); // the Events tab's own first read
    expect(listAudit.mock.calls.at(-1)).toEqual([{ q: entry.id }, undefined]);
  });

  it("only the auditor sees the outcome note; saving it adds the line and keeps the Broken run in history", async () => {
    setup({ integrity: "broken" });
    const { unmount } = renderWithAuth(<AuditView />);
    await openIntegrity();
    await screen.findByRole("list", { name: "What to do now" });
    expect(screen.queryByRole("textbox", { name: "Outcome note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save outcome" })).toBeNull();
    unmount();

    setup({ integrity: "broken" }, undefined, TEAM_EMAILS.amara);
    renderWithAuth(<AuditView />, { user: AMARA });
    await openIntegrity();
    const note = await screen.findByRole("textbox", { name: "Outcome note" });
    const save = screen.getByRole("button", { name: "Save outcome" });
    expect(save).toBeDisabled();
    // The note stops at 1000 characters.
    await userEvent.click(note);
    await userEvent.paste("x".repeat(1001));
    expect(screen.getByText("1000 / 1000")).toBeInTheDocument();
    await userEvent.clear(note);
    await userEvent.type(note, "Disk fault; restored.");
    expect(screen.getByText("21 / 1000")).toBeInTheDocument();
    await userEvent.click(save);
    expect(
      await screen.findByText("Outcome recorded by Amara Eze · 22 Oct 2026"),
    ).toBeVisible();
    expect(screen.getByText("Disk fault; restored.")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Outcome note" })).toBeNull();
    const first = within(await history()).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("Broken");
    expect(first).toHaveTextContent("Outcome recorded");
  });

  it("the outcome note: a stale version says Changed by someone else, and Reload", async () => {
    let reads = 0;
    setup(
      { integrity: "broken" },
      (m) => ({
        addOutcome: async () => {
          throw new ApiError(409, "conflict");
        },
        getIntegrityStatus: () => {
          reads++;
          return m.getIntegrityStatus();
        },
      }),
      TEAM_EMAILS.amara,
    );
    renderWithAuth(<AuditView />, { user: AMARA });
    await openIntegrity();
    await userEvent.type(
      await screen.findByRole("textbox", { name: "Outcome note" }),
      "Done.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(await screen.findByText("Changed by someone else")).toBeVisible();
    const before = reads;
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await tick(50);
    expect(reads).toBeGreaterThan(before);
    expect(screen.queryByText("Changed by someone else")).toBeNull();
  });

  it("a later Intact doesn't remove the Broken row, and the banner stays while open_failure is set", async () => {
    const broken = seedAudit(NOW - 2 * H, "broken").runs[0]!;
    const intact: VerifyRun = {
      ...seedAudit(NOW).runs[0]!,
      id: "run_later",
      started_at: new Date(NOW - 30 * MIN).toISOString(),
      finished_at: new Date(NOW - 29 * MIN).toISOString(),
      to_at: new Date(NOW - 30 * MIN).toISOString(),
    };
    let open: VerifyRun | null = broken;
    setup(undefined, () => ({
      getIntegrityStatus: async () =>
        status({ latest: intact, open_failure: open }),
      listRuns: async () => ({ runs: [intact, broken], next_cursor: null }),
    }));
    renderWithAuth(<AuditView />);
    await openIntegrity();
    expect(await banner()).toBeVisible();
    const items = within(await history()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Intact");
    expect(items[1]).toHaveTextContent("Broken");
    expect(items[1]).toHaveTextContent("Daily schedule");
    // The server clears the failure: the banner goes at the next read.
    open = null;
    await tick(61_000);
    expect(
      screen.queryByText(/^The audit log failed its integrity check on /),
    ).toBeNull();
    expect(
      within(await history()).getAllByRole("listitem")[1],
    ).toHaveTextContent("Broken");
  });

  it("offline disables Run check now with the reason", async () => {
    setup();
    renderWithAuth(<AuditView />);
    await openIntegrity();
    const run = await screen.findByRole("button", { name: "Run check now" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription(OFFLINE_NOTE);
    vi.restoreAllMocks();
    act(() => void window.dispatchEvent(new Event("online")));
  });

  it("Export the entries around the break asks for Security investigation, in whole days from the day before the break through today", async () => {
    setup({ integrity: "broken" });
    const seed = seedAudit(NOW, "broken");
    const at = seed.runs[0]!.first_broken_at!;
    const onExport = vi.fn();
    renderWithAuth(<IntegrityTab onOpenEntry={() => {}} onExport={onExport} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Export the entries around the break",
      }),
    );
    expect(onExport).toHaveBeenCalledWith({
      reason: "security_investigation",
      // Tests run in UTC, so the local day is the ISO date.
      filters: {
        from: new Date(Date.parse(at) - 24 * H).toISOString().slice(0, 10),
        to: "2026-10-22",
      },
    });
  });
});
