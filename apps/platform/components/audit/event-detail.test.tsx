import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditDetail } from "@/lib/api/audit-contract";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { utc } from "@/lib/audit/words";
import { __resetReportedForTests, patientsKey } from "@/lib/queries/audit";
import { renderWithAuth } from "@/tests/render";
import { AuditView } from "./audit-view";
import { EventDetail } from "./event-detail";

vi.mock("next/navigation", () => ({
  usePathname: () => "/audit",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function setup(
  over: (m: PlatformClient) => Partial<PlatformClient> = () => ({}),
) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => TEAM_EMAILS.ada,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests({ ...m, ...over(m) } as PlatformClient);
  return m;
}

beforeEach(() => __resetReportedForTests());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const phone = () =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));

/** The seeded event whose action starts with `words`, opened from the list. */
async function openRow(words: RegExp) {
  const u = userEvent.setup();
  renderWithAuth(<AuditView />);
  const row = (await screen.findAllByRole("button", { name: words }))[0]!;
  await u.click(row);
  return { u, row };
}

const dialog = () => screen.findByRole("dialog");

describe("the event detail", () => {
  it("opening a row shows every field, the position and the fingerprint", async () => {
    let got!: AuditDetail;
    setup((c) => ({
      getAuditEvent: async (id) => (got = await c.getAuditEvent(id)),
    }));
    await openRow(/Opened a named patient list/);
    const d = await dialog();
    expect(
      within(d).getByRole("heading", { name: `Entry #${got.seq}` }),
    ).toBeInTheDocument();
    for (const term of [
      "When",
      "Who",
      "Hospital",
      "Action",
      "Outcome",
      "From where",
      "Flags",
      "Reason",
      "Links",
      "Entry",
    ])
      expect(within(d).getByText(term)).toBeInTheDocument();
    expect(within(d).getByText(`#${got.seq}`)).toBeInTheDocument();
    expect(within(d).getByText(got.hash)).toHaveClass("font-mono");
    expect(within(d).getByText("Audit")).toBeInTheDocument();
    expect(
      within(d).getAllByRole("button", { name: /^Copy / }).length,
    ).toBeGreaterThan(1);
  });

  it("When shows local time and UTC", async () => {
    let got!: AuditDetail;
    setup((c) => ({
      getAuditEvent: async (id) => (got = await c.getAuditEvent(id)),
    }));
    await openRow(/Opened a named patient list/);
    const d = await dialog();
    expect(await within(d).findByText(utc(got.at))).toBeInTheDocument();
    expect(d.querySelector("time")).toHaveAttribute("datetime", got.at);
  });

  it("a consultation shows specialty and confidence only", async () => {
    setup();
    await openRow(/^Asked a question/);
    const d = await dialog();
    expect(await within(d).findByText("Specialty")).toBeInTheDocument();
    expect(within(d).getByText("Confidence")).toBeInTheDocument();
    for (const t of ["Target", "Reason", "Note", "Patients"])
      expect(within(d).queryByText(t)).toBeNull();
  });

  it("pseudonyms are not shown until Show patient ids, which adds an audit_patients_viewed entry", async () => {
    const spy = vi.fn();
    const m = setup((c) => ({
      getAuditPatients: (id) => {
        spy(id);
        return c.getAuditPatients(id);
      },
    }));
    const { u } = await openRow(/Opened a named patient list · 3 patients/);
    const d = await dialog();
    expect(await within(d).findByText("Patients: 3")).toBeInTheDocument();
    expect(within(d).queryByText(/^p_ng_/)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    await u.click(within(d).getByRole("button", { name: "Show patient ids" }));
    const ids = await within(d).findAllByText(/^p_[a-z]+_/);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBeVisible();
    expect(within(d).getByText("Shown to you and recorded.")).toBeVisible();
    expect(spy).toHaveBeenCalledTimes(1);
    const log = await m.listAudit({ type: ["audit"] });
    expect(log.events.some((e) => e.kind === "audit_patients_viewed")).toBe(
      true,
    );
  });

  it("Hide patient ids removes them from the screen and the cache, and a reconnect does not fetch them again", async () => {
    const spy = vi.fn();
    setup((c) => ({
      getAuditPatients: (id) => {
        spy(id);
        return c.getAuditPatients(id);
      },
    }));
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const u = userEvent.setup();
    renderWithAuth(<AuditView />, { queryClient: qc });
    await u.click(
      await screen.findByRole("button", {
        name: /Opened a named patient list · 3 patients/,
      }),
    );
    const d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(/^p_[a-z]+_/);
    const id = spy.mock.calls[0]![0] as string;
    expect(
      qc.getQueryCache().find({ queryKey: patientsKey(id) }),
    ).toBeDefined();
    window.dispatchEvent(new Event("online"));
    expect(spy).toHaveBeenCalledTimes(1);
    await u.click(within(d).getByRole("button", { name: "Hide patient ids" }));
    expect(within(d).queryByText(/^p_[a-z]+_/)).toBeNull();
    expect(
      qc.getQueryCache().find({ queryKey: patientsKey(id) }),
    ).toBeUndefined();
    expect(
      within(d).getByRole("button", { name: "Show patient ids" }),
    ).toBeInTheDocument();
  });

  it("a named drill-down shows the letter and Open in Named access", async () => {
    const m = setup();
    const list = await m.listAudit({ type: ["named_access"] });
    const ev = list.events.find((e) => e.kind === "drilldown_named")!;
    const onOpenNamed = vi.fn();
    const u = userEvent.setup();
    renderWithAuth(
      <EventDetail id={ev.id} onClose={() => {}} onOpenNamed={onOpenNamed} />,
    );
    const d = await dialog();
    expect(await within(d).findByText("Clearance letter")).toBeVisible();
    expect(within(d).getByText(/Active/)).toBeVisible();
    expect(
      within(d).getByText(/^Valid \d+ \w+ \d{4} to \d+ \w+ \d{4}$/),
    ).toBeVisible();
    expect(within(d).getByText(/^Verified by Tunde Okafor$/)).toBeVisible();
    await u.click(
      within(d).getByRole("button", { name: "Open in Named access" }),
    );
    expect(onOpenNamed).toHaveBeenCalledWith({
      hospital: "h_northgate",
      clearance: "cl_northgate_2026",
    });
  });

  it("an after_break event shows the warning", async () => {
    setup((c) => ({
      getAuditEvent: async (id) => ({
        ...(await c.getAuditEvent(id)),
        after_break: true,
      }),
    }));
    await openRow(/^Asked a question/);
    const d = await dialog();
    expect(
      await within(d).findByText("After an integrity failure"),
    ).toBeVisible();
  });

  it("Copy copies the fingerprint", async () => {
    let got!: AuditDetail;
    setup((c) => ({
      getAuditEvent: async (id) => (got = await c.getAuditEvent(id)),
    }));
    const { u } = await openRow(/^Asked a question/);
    const d = await dialog();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    await u.click(
      await within(d).findByRole("button", { name: "Copy fingerprint" }),
    );
    expect(write).toHaveBeenCalledWith(got.hash);
    expect(await within(d).findByText("Copied")).toBeInTheDocument();
  });

  it("phone: the detail is a full page with Back, and focus returns to the row", async () => {
    phone();
    setup();
    const { u, row } = await openRow(/^Asked a question/);
    expect(screen.queryByRole("dialog")).toBeNull();
    const back = await screen.findByRole("button", { name: "Back" });
    expect(screen.getByRole("heading", { name: /^Entry #\d+$/ })).toBeVisible();
    expect(row).not.toBeVisible();
    await u.click(back);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("an undisplayable detail shows no raw field", async () => {
    setup((c) => ({
      getAuditEvent: async (id) => {
        const d = await c.getAuditEvent(id);
        return { ...d, kind: "made_up_kind", note: "A patient called Jo" };
      },
    }));
    await openRow(/^Asked a question/);
    const d = await dialog();
    expect(
      await within(d).findByText(
        /^This entry can't be displayed · ev_\d+ · #\d+$/,
      ),
    ).toBeVisible();
    expect(within(d).queryByText(/Jo/)).toBeNull();
    expect(within(d).queryByRole("term")).toBeNull();
    expect(within(d).queryByText("When")).toBeNull();
  });
});
