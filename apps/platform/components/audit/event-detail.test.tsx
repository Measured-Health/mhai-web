import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { OFFLINE_NOTE } from "../states/offline-strip";
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
import { __resetReportedForTests } from "@/lib/queries/audit";
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
  act(() => void window.dispatchEvent(new Event("online")));
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

/** The list's first "3 patients" row opened, on a given query client. */
async function openRowWith(qc: QueryClient) {
  const u = userEvent.setup();
  const r = renderWithAuth(<AuditView />, { queryClient: qc });
  await u.click((await screen.findAllByRole("button", { name: THREE }))[0]!);
  return { u, unmount: r.unmount };
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
    expect(
      within(d).getByText("Specialty").nextElementSibling?.textContent,
    ).toMatch(/^[A-Z][a-z ]+$/);
    expect(within(d).getByText(/^(High|Medium|Low)$/)).toBeVisible();
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
    expect(within(d).queryByText(/^P-[0-9A-F]{6}$/)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    await u.click(within(d).getByRole("button", { name: "Show patient ids" }));
    const ids = await within(d).findAllByText(/^P-[0-9A-F]{6}$/);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBeVisible();
    expect(within(d).getByText("Shown to you and recorded.")).toBeVisible();
    expect(spy).toHaveBeenCalledTimes(1);
    const log = await m.listAudit({ type: ["audit"] });
    expect(log.events.some((e) => e.kind === "audit_patients_viewed")).toBe(
      true,
    );
  });

  it("a pseudonym search reads 'a patient id', with the id only behind Show patient ids", async () => {
    const m = setup();
    const named = (await m.listAudit({ type: ["named_access"] })).events.find(
      (e) => e.kind === "drilldown_named",
    )!;
    const [p] = (await m.getAuditPatients(named.id)).pseudonyms;
    await m.listAudit({ q: p! });
    const { u } = await openRow(/^Searched the audit log by patient id/);
    const d = await dialog();
    expect(await within(d).findByText("a patient id")).toBeVisible();
    expect(within(d).getByText("Patients: 1")).toBeVisible();
    expect(screen.queryByText(p!)).toBeNull();
    await u.click(within(d).getByRole("button", { name: "Show patient ids" }));
    expect(await within(d).findByText(p!)).toBeVisible();
    expect(within(d).getByText("Shown to you and recorded.")).toBeVisible();
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

  it("phone: opening moves focus to the page heading", async () => {
    phone();
    setup();
    await openRow(/^Asked a question/);
    const h = await screen.findByRole("heading", { name: /^Entry #\d+$/ });
    await waitFor(() => expect(h).toHaveFocus());
  });

  it("desktop: Esc and Close return focus to the row", async () => {
    setup();
    const { u, row } = await openRow(/^Asked a question/);
    await dialog();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(row).toHaveFocus());
    await u.click(row);
    const d = await dialog();
    await u.click(within(d).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(row).toHaveFocus());
  });

  it("a row that is gone sends focus to the Events region", async () => {
    setup();
    const { u } = await openRow(/^Asked a question/);
    await dialog();
    document.querySelectorAll("[data-row-id]").forEach((n) => n.remove());
    await u.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Events" })).toHaveFocus(),
    );
  });
});

const IDS = /^P-[0-9A-F]{6}$/;
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
const viewed = async (m: PlatformClient) =>
  (await m.listAudit({ type: ["audit"] })).events.filter(
    (e) => e.kind === "audit_patients_viewed",
  ).length;

function patientSpy() {
  const spy = vi.fn();
  const m = setup((c) => ({
    getAuditPatients: (id) => {
      spy(id);
      return c.getAuditPatients(id);
    },
  }));
  return { m, spy };
}
const THREE = /Opened a named patient list · 3 patients/;
const qcOf = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
const noIdsCached = (qc: QueryClient) =>
  expect(
    qc
      .getQueryCache()
      .findAll()
      .some(
        (q) => JSON.stringify(q.state.data)?.match(/P-[0-9A-F]{6}/) != null,
      ),
  ).toBe(false);

describe("patient ids are recorded once and never kept", () => {
  it("reconnecting, focus, visibility and invalidation while shown do not request them again", async () => {
    const { spy } = patientSpy();
    const qc = qcOf();
    const { u } = await openRowWith(qc);
    const d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(IDS);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await qc.invalidateQueries();
    await qc.invalidateQueries({ queryKey: ["audit"] });
    await qc.refetchQueries();
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(within(d).getAllByText(IDS)).toHaveLength(3);
    noIdsCached(qc);
  });

  it("Hide forgets them; Show again is a second request", async () => {
    const { m, spy } = patientSpy();
    const qc = qcOf();
    const { u } = await openRowWith(qc);
    const d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(IDS);
    await u.click(within(d).getByRole("button", { name: "Hide patient ids" }));
    expect(within(d).queryByText(IDS)).toBeNull();
    expect(
      within(d).getByRole("button", { name: "Show patient ids" }),
    ).toBeVisible();
    noIdsCached(qc);
    await u.click(within(d).getByRole("button", { name: "Show patient ids" }));
    await within(d).findAllByText(IDS);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await viewed(m)).toBe(2);
  });

  it("closing and reopening shows no ids and asks for none", async () => {
    const { spy } = patientSpy();
    const { u, row } = await openRow(THREE);
    let d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(IDS);
    await u.keyboard("{Escape}");
    await u.click(row);
    d = await dialog();
    expect(await within(d).findByText("Patients: 3")).toBeVisible();
    expect(within(d).queryByText(IDS)).toBeNull();
    expect(
      within(d).getByRole("button", { name: "Show patient ids" }),
    ).toBeVisible();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("unmounting and mounting again on the same client shows no ids", async () => {
    const { spy } = patientSpy();
    const qc = qcOf();
    const first = await openRowWith(qc);
    const d = await dialog();
    await first.u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(IDS);
    first.unmount();
    noIdsCached(qc);
    const second = await openRowWith(qc);
    const d2 = await dialog();
    expect(await within(d2).findByText("Patients: 3")).toBeVisible();
    expect(within(d2).queryByText(IDS)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it("StrictMode: one request and one audit_patients_viewed entry", async () => {
    const { m, spy } = patientSpy();
    const u = userEvent.setup();
    renderWithAuth(
      <StrictMode>
        <AuditView />
      </StrictMode>,
    );
    await u.click((await screen.findAllByRole("button", { name: THREE }))[0]!);
    const d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(IDS);
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await viewed(m)).toBe(1);
  });

  it("a failed request offers Try again, which is a second, deliberate request", async () => {
    const spy = vi.fn();
    setup((c) => ({
      getAuditPatients: (id) => {
        spy(id);
        return spy.mock.calls.length === 1
          ? Promise.reject(new Error("x"))
          : c.getAuditPatients(id);
      },
    }));
    const { u } = await openRow(THREE);
    const d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await u.click(await within(d).findByRole("button", { name: "Try again" }));
    await within(d).findAllByText(IDS);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("Show patient ids is off while offline, with the reason", async () => {
    const { spy } = patientSpy();
    await openRow(THREE);
    const d = await dialog();
    const b = await within(d).findByRole("button", {
      name: "Show patient ids",
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription(OFFLINE_NOTE);
    expect(spy).not.toHaveBeenCalled();
  });

  it("nothing is stored or put in the URL, and no id is logged", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const logs = (["log", "info", "warn", "error"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    patientSpy();
    const { u } = await openRow(THREE);
    const d = await dialog();
    await u.click(
      await within(d).findByRole("button", { name: "Show patient ids" }),
    );
    await within(d).findAllByText(IDS);
    await u.click(within(d).getByRole("button", { name: "Hide patient ids" }));
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(location.search).toBe("");
    for (const l of logs)
      expect(JSON.stringify(l.mock.calls)).not.toMatch(/P-[0-9A-F]{6}/);
  });
});

describe("what the detail will not show", () => {
  const override = (patch: (d: AuditDetail) => object) =>
    setup((c) => ({
      getAuditEvent: async (id) =>
        ({ ...patch(await c.getAuditEvent(id)) }) as AuditDetail,
    }));
  const cantShow = async (secret: RegExp) => {
    await openRow(/^Asked a question/);
    const d = await dialog();
    expect(await within(d).findByText(/can't be displayed/)).toBeVisible();
    expect(within(d).queryByText(secret)).toBeNull();
  };

  it("a name on a kind that takes none makes the entry undisplayable", async () => {
    override((d) => ({
      ...d,
      kind: "signed_out",
      type: "sign_in",
      target: { kind: "session", id: "s_1", name: "Jo Patient" },
    }));
    await cantShow(/Jo Patient/);
  });

  it("a note on a hold kind makes the entry undisplayable", async () => {
    override((d) => ({
      ...d,
      kind: "hold_placed",
      type: "retention",
      note: "Jo Patient was involved",
    }));
    await cantShow(/Jo Patient/);
  });

  it("a patient target never shows its pseudonym in Target", async () => {
    override((d) => ({
      ...d,
      kind: "drilldown_deidentified",
      type: "analysis",
      target: { kind: "patient" },
      facts: { patient_count: 2 },
      patients: { count: 2 },
      letter: null,
      reason: null,
      refs: { clearance_id: null, export_id: null, request_id: null },
    }));
    await openRow(/^Asked a question/);
    const d = await dialog();
    expect(await within(d).findByText("Patients: 2")).toBeVisible();
    expect(
      within(d).getByText("Patients (ids shown on request)"),
    ).toBeVisible();
    expect(screen.queryByText(/^P-[A-Z0-9]{4,12}$/)).toBeNull();
  });

  it("a pseudonym anywhere in the entry makes it undisplayable", async () => {
    override((d) => ({
      ...d,
      kind: "drilldown_deidentified",
      type: "analysis",
      target: { kind: "patient", pseudonym: "P-SECRET1" } as never,
      facts: { patient_count: 2 },
      patients: { count: 2 },
      letter: null,
      reason: null,
      refs: { clearance_id: null, export_id: null, request_id: null },
    }));
    await cantShow(/P-SECRET1/);
  });
});
