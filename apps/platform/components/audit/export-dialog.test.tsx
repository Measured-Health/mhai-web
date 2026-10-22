import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportOut } from "@/lib/api/audit-contract";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import type { AuditMockOptions } from "@/lib/api/mock-audit";
import { MOCK_CODE, createStepUp } from "@/lib/api/step-up";
import { openAuditAt } from "@/lib/audit/nav";
import { __resetReportedForTests } from "@/lib/queries/audit";
import { ApiError } from "@mhai/api-client/errors";
import { AMARA, renderWithAuth } from "@/tests/render";
import { OFFLINE_NOTE } from "../states/offline-strip";
import { AuditView } from "./audit-view";
import { ExportReady, NOT_YOURS_WORDS, safeName } from "./export-ready";

vi.mock("next/navigation", () => ({
  usePathname: () => "/audit",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const GONE =
  "This file was already downloaded or has expired. Make a new export.";

function setup(audit?: AuditMockOptions, email: string = TEAM_EMAILS.ada) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => signedIn.email ?? email,
    stepUp: createStepUp(),
    audit,
  });
  __setPlatformClientForTests(m as PlatformClient);
  return m;
}

/** Switches who the mock thinks is signed in (null: the setup's own). */
const signedIn: { email: string | null } = { email: null };

const EXPORT_BODY = {
  kind: "events" as const,
  filters: {},
  reason: "legal_request" as const,
  mfa_code: MOCK_CODE,
};

/** What the browser was handed to save: its name and its bytes. */
function catchDownloads() {
  const saved: { name: string; blob: Blob }[] = [];
  const blobs: Blob[] = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (b: Blob) => {
      blobs.push(b);
      return `blob:${blobs.length}`;
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({
      name: this.download,
      blob: blobs[Number(this.href.split(":").pop()) - 1]!,
    });
  });
  return saved;
}

const text = async (b: Blob) =>
  new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()));

beforeEach(() => {
  __resetReportedForTests();
  signedIn.email = null;
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Opens Export CSV once the events (and their count) have loaded. */
async function openExport() {
  await screen.findByRole("table", { name: "Audit log events" });
  await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
  return screen.getByRole("dialog", { name: "Export the audit log" });
}

async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

/** Legal request, the code, Make export: the ready step. */
async function makeExport(reference?: string) {
  const d = await openExport();
  await userEvent.click(within(d).getByLabelText("Legal request"));
  if (reference)
    await userEvent.type(
      within(d).getByLabelText("Reference (optional)"),
      reference,
    );
  await typeCode(d);
  await userEvent.click(within(d).getByRole("button", { name: "Make export" }));
  return screen.findByRole("dialog", { name: /^Export exp_\w+ is ready$/ });
}

describe("Export CSV", () => {
  it("Export CSV needs a reason and a code", async () => {
    const m = setup();
    const create = vi.spyOn(m, "createExport");
    renderWithAuth(<AuditView />);
    const d = await openExport();
    // What will be exported, in words.
    expect(d).toHaveTextContent(
      /All hospitals · .+\d[\d,]* events? will be exported\./,
    );
    expect(d).toHaveTextContent(
      "The file is recorded with an export id and a checksum, and can be downloaded once within 15 minutes.",
    );
    for (const r of [
      "Legal request",
      "Hospital request",
      "Regulator request",
      "Internal review",
      "Security investigation",
      "Other",
    ])
      expect(within(d).getByLabelText(r)).not.toBeChecked();
    await userEvent.click(
      within(d).getByRole("button", { name: "Make export" }),
    );
    expect(within(d).getByText("Choose a reason.")).toBeInTheDocument();
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("Other needs a note, and the note stops at 200", async () => {
    const m = setup();
    const create = vi.spyOn(m, "createExport");
    renderWithAuth(<AuditView />);
    const d = await openExport();
    await userEvent.click(within(d).getByLabelText("Other"));
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Make export" }),
    );
    expect(within(d).getByText("Add a note.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    const note = within(d).getByLabelText("Note (required)");
    expect(note).toHaveAttribute("maxLength", "200");
    await userEvent.type(note, "Board review");
    await userEvent.click(
      within(d).getByRole("button", { name: "Make export" }),
    );
    await screen.findByRole("dialog", { name: /is ready$/ });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "other", note: "Board review" }),
      expect.anything(),
    );
  });

  it("the reference stops at 60, and is sent as the reference", async () => {
    const m = setup();
    const create = vi.spyOn(m, "createExport");
    renderWithAuth(<AuditView />);
    const d = await openExport();
    expect(within(d).getByLabelText("Reference (optional)")).toHaveAttribute(
      "maxLength",
      "60",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await makeExport("CASE-17");
    const body = create.mock.calls[0]![0];
    expect(body).toMatchObject({
      kind: "events",
      reason: "legal_request",
      reference: "CASE-17",
      mfa_code: MOCK_CODE,
    });
    expect(body).not.toHaveProperty("extra");
  });

  it("a wrong code says so and clears it", async () => {
    setup();
    renderWithAuth(<AuditView />);
    const d = await openExport();
    await userEvent.click(within(d).getByLabelText("Legal request"));
    await typeCode(d, "000000");
    await userEvent.click(
      within(d).getByRole("button", { name: "Make export" }),
    );
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(d).getByLabelText("Digit 1 of 6")).toHaveValue(""),
    );
    expect(screen.queryByRole("dialog", { name: /is ready$/ })).toBeNull();
  });

  it("matchCount 62,310 shows the narrowing message, with no file and no ready step", async () => {
    const m = setup({ matchCount: 62_310 });
    const before = (await m.listExports()).exports.length;
    renderWithAuth(<AuditView />);
    const d = await openExport();
    expect(d).toHaveTextContent("More than 10,000 events will be exported.");
    await userEvent.click(within(d).getByLabelText("Legal request"));
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Make export" }),
    );
    const msg = await screen.findByText(
      "62,310 entries match. Exports stop at 50,000 rows. Narrow the dates or filters.",
    );
    // The code step has closed: no code boxes are left anywhere.
    expect(screen.queryByLabelText("Digit 1 of 6")).toBeNull();
    expect(screen.queryByRole("button", { name: "Make export" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: /is ready$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download file" })).toBeNull();
    expect((await m.listExports()).exports).toHaveLength(before);
    const box = msg.closest("dialog")!;
    await userEvent.click(within(box).getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/entries match/)).toBeNull();
    // Opening again starts at the code step, empty.
    const again = await openExport();
    expect(within(again).getByLabelText("Legal request")).not.toBeChecked();
    expect(within(again).getByLabelText("Digit 1 of 6")).toHaveValue("");
  });

  it("success shows the export id, the checksum and the rows; the toast says ready", async () => {
    const m = setup();
    renderWithAuth(<AuditView />);
    const ready = await makeExport();
    const rec = (await m.listExports()).exports[0]!;
    expect(ready).toHaveAccessibleName(`Export ${rec.id} is ready`);
    const rows =
      rec.rows === 1 ? "1 row" : `${rec.rows.toLocaleString("en-GB")} rows`;
    expect(ready).toHaveTextContent(rows);
    expect(ready).not.toHaveTextContent("Capped by the server");
    expect(within(ready).getByText("Checksum (SHA-256)")).toBeInTheDocument();
    expect(within(ready).getByText(rec.checksum)).toHaveClass("font-mono");
    expect(
      within(ready).getByRole("button", { name: "Copy checksum" }),
    ).toBeInTheDocument();
    const t = new Date(rec.expires_at);
    const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    expect(ready).toHaveTextContent(`Download by ${hhmm}`);
    // The toast (and its live-region copy).
    expect(
      await screen.findAllByText(`Export ${rec.id} ready · ${rows}`),
    ).not.toHaveLength(0);
  });

  it("Download file saves audit-events-{id}-…Z.csv, and the file's first line says Demo", async () => {
    const saved = catchDownloads();
    const m = setup();
    renderWithAuth(<AuditView />);
    const ready = await makeExport();
    const id = (await m.listExports()).exports[0]!.id;
    const btn = within(ready).getByRole("button", { name: "Download file" });
    await userEvent.click(btn);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(btn).toBeDisabled();
    expect(saved[0]!.name).toMatch(
      new RegExp(`^audit-events-${id}-\\d{8}-\\d{4}Z\\.csv$`),
    );
    const body = (await text(saved[0]!.blob)).replace(/^﻿/, "");
    expect(body.split("\r\n")[0]).toMatch(/^Demo,/);
    expect((await m.listExports()).exports[0]!.downloaded_at).not.toBeNull();
  });

  it("a second download is refused with the gone words", async () => {
    const saved = catchDownloads();
    const m = setup();
    const out = await m.createExport(
      {
        kind: "events",
        filters: {},
        reason: "legal_request",
        mfa_code: MOCK_CODE,
      },
      { idempotencyKey: "k1" },
    );
    await m.downloadExport(out.export_id);
    renderWithAuth(<ExportReady out={out} kind="events" onClose={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Download file" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(GONE);
    expect(saved).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "Download file" }),
    ).toBeDisabled();
  });

  it("the Exports tab lists the new export with its id, checksum, reason and filters in words", async () => {
    const m = setup();
    renderWithAuth(<AuditView />);
    const ready = await makeExport("CASE-17");
    const rec = (await m.listExports()).exports[0]!;
    await userEvent.click(within(ready).getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("tab", { name: "Exports" }));
    const table = await screen.findByRole("table", { name: "Audit exports" });
    const row = within(table).getByText(rec.id).closest("tr")!;
    expect(row).toHaveTextContent("Ada Bakare");
    expect(row).toHaveTextContent("Events");
    expect(row).toHaveTextContent("Legal request");
    expect(row).toHaveTextContent("CASE-17");
    expect(row).toHaveTextContent(/All hospitals · .+/);
    expect(row).toHaveTextContent(rec.checksum.slice(0, 12));
    expect(row).not.toHaveTextContent(rec.checksum);
    expect(
      within(row).getByRole("button", { name: "Copy checksum" }),
    ).toBeInTheDocument();
    // Closed before downloading: the file is never shown again.
    expect(row).toHaveTextContent("Not downloaded");
    expect(within(row).queryByRole("button", { name: /Download/ })).toBeNull();
    // The sample's past exports: one downloaded, and none still waiting.
    expect(table).toHaveTextContent(/Expired|\d{4}, \d{2}:\d{2}/);
  });

  it("a capped export shows Capped in the toast and the tab", async () => {
    setup({ exportCap: 5 });
    renderWithAuth(<AuditView />);
    const ready = await makeExport();
    expect(ready).toHaveTextContent("5 rows");
    expect(ready).toHaveTextContent("Capped by the server");
    expect(
      await screen.findAllByText(/^Export exp_\w+ ready · 5 rows · capped$/),
    ).not.toHaveLength(0);
    await userEvent.click(within(ready).getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("tab", { name: "Exports" }));
    const table = await screen.findByRole("table", { name: "Audit exports" });
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent(/5\s*capped/);
  });

  it("offline disables Export CSV with the reason", async () => {
    setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    const btn = screen.getByRole("button", { name: "Export CSV" });
    expect(btn).toBeEnabled();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(OFFLINE_NOTE);
    vi.restoreAllMocks();
    act(() => void window.dispatchEvent(new Event("online")));
    expect(btn).toBeEnabled();
  });

  it("dates that can't be used disable Export CSV", async () => {
    setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Dates" }),
      "Custom",
    );
    const to = screen.getByLabelText("To");
    fireEvent.change(to, { target: { value: "2999-01-01" } });
    fireEvent.blur(to);
    expect(
      await screen.findByText("The To date can't be in the future."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled(),
    );
  });

  it("an auditor can export", async () => {
    const saved = catchDownloads();
    const m = setup(undefined, TEAM_EMAILS.amara);
    renderWithAuth(<AuditView />, { user: AMARA });
    const ready = await makeExport();
    await userEvent.click(
      within(ready).getByRole("button", { name: "Download file" }),
    );
    await waitFor(() => expect(saved).toHaveLength(1));
    expect((await m.listExports()).exports[0]!.by.name).toBe("Amara Eze");
  });
});

describe("safeName", () => {
  it("keeps a safe name, else falls back by kind", () => {
    const ok = "audit-events-exp_1-20261022-0600Z.csv";
    expect(safeName(ok, "exp_1", "events")).toBe(ok);
    expect(safeName("../etc/passwd", "exp_1", "events")).toBe(
      "audit-exp_1.csv",
    );
    expect(safeName("a b.zip", "exp_2", "named_access")).toBe(
      "audit-exp_2.zip",
    );
    expect(safeName("x".repeat(121), "exp_3", "events")).toBe(
      "audit-exp_3.csv",
    );
    // The extension follows the kind: a zip is never named .csv.
    expect(safeName("x.csv", "exp_4", "named_access")).toBe("audit-exp_4.zip");
    expect(safeName("x.zip", "exp_5", "events")).toBe("audit-exp_5.csv");
    expect(safeName("report.html", "exp_6", "events")).toBe("audit-exp_6.csv");
    expect(safeName("..", "exp_7", "events")).toBe("audit-exp_7.csv");
    expect(safeName(".csv", "exp_8", "events")).toBe("audit-exp_8.csv");
    expect(safeName("-x.csv", "exp_9", "events")).toBe("audit-exp_9.csv");
    const zip = "audit-named-access-exp_1-20261022-0600Z.zip";
    expect(safeName(zip, "exp_1", "named_access")).toBe(zip);
  });
});

describe("ExportReady", () => {
  it("a reply without a usable export id or checksum makes no file", async () => {
    const saved = catchDownloads();
    setup();
    const out = {
      export_id: "exp 1",
      rows: 3,
      capped: false,
      checksum: "abc",
      expires_at: "2026-10-22T10:00:00.000Z",
      file_name: "audit.csv",
    } as ExportOut;
    renderWithAuth(<ExportReady out={out} kind="events" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The reply wasn't what was expected.",
    );
    expect(screen.queryByRole("button", { name: "Download file" })).toBeNull();
    expect(saved).toHaveLength(0);
  });
});

describe("fix round 1", () => {
  it("a download that never reached the server (or a server fault) may be tried again", async () => {
    const saved = catchDownloads();
    const m = setup();
    const out = await m.createExport(EXPORT_BODY, { idempotencyKey: "k1" });
    const real = m.downloadExport.bind(m);
    vi.spyOn(m, "downloadExport")
      .mockRejectedValueOnce(new ApiError(0, "network"))
      .mockRejectedValueOnce(new ApiError(503, "unavailable"))
      .mockImplementation(real);
    renderWithAuth(<ExportReady out={out} kind="events" onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: "Download file" });
    await userEvent.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach the service. Try again.",
    );
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    await waitFor(() => expect(btn).toBeEnabled());
    await userEvent.click(btn);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(btn).toBeDisabled();
  });

  it("a download refused because someone else made it says so, and stays spent", async () => {
    const m = setup();
    const out = await m.createExport(EXPORT_BODY, { idempotencyKey: "k1" });
    signedIn.email = TEAM_EMAILS.tunde;
    renderWithAuth(<ExportReady out={out} kind="events" onClose={() => {}} />);
    const btn = screen.getByRole("button", { name: "Download file" });
    await userEvent.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_YOURS_WORDS);
    expect(btn).toBeDisabled();
  });

  it("while the file is on its way, the ready step can't be closed", async () => {
    const saved = catchDownloads();
    const m = setup();
    let release!: () => void;
    const real = m.downloadExport.bind(m);
    vi.spyOn(m, "downloadExport").mockImplementation(
      (id) =>
        new Promise<Blob>((res, rej) => {
          release = () => void real(id).then(res, rej);
        }),
    );
    renderWithAuth(<AuditView />);
    const ready = await makeExport();
    await userEvent.click(
      within(ready).getByRole("button", { name: "Download file" }),
    );
    const close = within(ready).getByRole("button", { name: "Close" });
    expect(close).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(ready).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /is ready$/ })).toBe(ready);
    act(() => release());
    await waitFor(() => expect(saved).toHaveLength(1));
    await waitFor(() => expect(close).toBeEnabled());
    await userEvent.click(close);
    expect(screen.queryByRole("dialog", { name: /is ready$/ })).toBeNull();
  });

  it("no list is read off the Events tab: opened on Exports, the audit list is never fetched", async () => {
    const m = setup();
    const list = vi.spyOn(m, "listAudit");
    openAuditAt("exports");
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit exports" });
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const d = screen.getByRole("dialog", { name: "Export the audit log" });
    // No count is known, so none is claimed.
    expect(d).not.toHaveTextContent("will be exported");
    expect(list).not.toHaveBeenCalled();
  });

  it("the Exports tab shows the note of an Other export", async () => {
    const m = setup();
    await m.createExport(
      { ...EXPORT_BODY, reason: "other", note: "Board review of access" },
      { idempotencyKey: "k1" },
    );
    openAuditAt("exports");
    renderWithAuth(<AuditView />);
    const table = await screen.findByRole("table", { name: "Audit exports" });
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("Other");
    expect(row).toHaveTextContent("Board review of access");
  });

  it("Integrity's export around the break opens Export with Security investigation and whole days", async () => {
    const m = setup({ integrity: "broken" });
    const create = vi.spyOn(m, "createExport");
    openAuditAt("integrity");
    renderWithAuth(<AuditView />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Export the entries around the break",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Export the audit log" });
    expect(within(d).getByLabelText("Security investigation")).toBeChecked();
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Make export" }),
    );
    await screen.findByRole("dialog", { name: /is ready$/ });
    const body = create.mock.calls[0]![0];
    expect(body.reason).toBe("security_investigation");
    const { from, to } = body.filters as { from: string; to: string };
    // Local midnights: [the day before the break, tomorrow).
    for (const t of [from, to]) {
      const x = new Date(t);
      expect([x.getHours(), x.getMinutes(), x.getSeconds()]).toEqual([0, 0, 0]);
    }
    expect(Date.parse(to)).toBeGreaterThan(Date.now());
    expect(Date.parse(to) - Date.now()).toBeLessThanOrEqual(25 * 3_600_000);
    expect(Date.parse(from)).toBeLessThan(Date.parse(to));
  });
});
