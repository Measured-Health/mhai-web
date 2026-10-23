import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { shiftDay } from "@/lib/api/clearances-fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import type { User } from "@/lib/auth/types";
import { CHECKLIST } from "@/lib/clearances/labels";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { safeDay } from "./clearance-queue";
import { ClearancesView } from "./clearances-view";

const env = vi.hoisted(() => ({ online: true, desktop: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => env.online }));
vi.mock("@mhai/ui/hooks/use-media", () => ({
  useIsDesktop: () => env.desktop,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clearances",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TUNDE: User = {
  ...ADA,
  id: "tunde.okafor",
  email: TEAM_EMAILS.tunde,
  name: "Tunde Okafor",
};
const BOLA: User = {
  ...ADA,
  id: "bola.hassan",
  email: TEAM_EMAILS.bola,
  name: "Bola Hassan",
};

const SAME_SIDE = "You can't verify letters from a hospital you're linked to";
const COVERS_YOU = "You can't verify a letter that covers you";
const OFFLINE = "You're offline. This needs a connection.";

let api: PlatformClient;
let qc: QueryClient;
/** The mock's clock; the real one unless a test sets it. */
let clock: (() => number) | undefined;
let made: string[];
let revoked: string[];
const original = [URL.createObjectURL, URL.revokeObjectURL] as const;

function install(
  user: User = ADA,
  clearances?: "normal" | "unavailable" | "off",
) {
  api = createMockPlatform({
    delayMs: 0,
    me: () => user.email,
    stepUp: createStepUp(),
    clearances,
    ...(clock ? { now: clock } : {}),
  });
  __setPlatformClientForTests(api);
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  made = [];
  revoked = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${made.length + 1}`;
    made.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});
afterEach(() => {
  clock = undefined;
  env.online = true;
  env.desktop = true;
  [URL.createObjectURL, URL.revokeObjectURL] = original;
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

async function open(
  user: User = ADA,
  clearances?: "normal" | "unavailable" | "off",
) {
  install(user, clearances);
  renderWithAuth(<ClearancesView />, { user, queryClient: qc });
  if (clearances === "off") return;
  await screen.findByRole("list", { name: "Letters" });
}
const rows = () =>
  within(screen.getByRole("list", { name: "Letters" })).getAllByRole("button");
const row = (hospital: string) =>
  rows().find((b) => b.textContent?.includes(hospital))!;
const tab = (name: string) => screen.getByRole("tab", { name });
const detail = () => screen.getByRole("region", { name: "Clearance letter" });
async function pick(hospital: string, tabName?: string) {
  if (tabName) {
    await userEvent.click(tab(tabName));
    await waitFor(() => expect(row(hospital)).toBeDefined());
  }
  await userEvent.click(row(hospital));
  await within(detail()).findByText("What to check");
}
/** The letter's heading and status, where the focus goes after acting. */
const top = () =>
  within(detail()).getByRole("heading", { level: 2 }).parentElement!;
/** Mutations still holding the two-step code: there must be none. */
const holding = (code: string) =>
  qc
    .getMutationCache()
    .getAll()
    .filter((m) => JSON.stringify(m.state.variables ?? {}).includes(code));
const btn = (name: string) => within(detail()).getByRole("button", { name });
const noBtn = (name: string) =>
  expect(within(detail()).queryByRole("button", { name })).toBeNull();
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
async function verifyWithCode() {
  await userEvent.click(btn("Verify"));
  const d = screen.getByRole("dialog", { name: /^Verify/ });
  await typeCode(d);
  await userEvent.click(within(d).getByRole("button", { name: "Verify" }));
  return d;
}

describe("the queue", () => {
  it("opens on To verify, oldest first", async () => {
    await open();
    expect(tab("To verify")).toHaveAttribute("aria-selected", "true");
    const list = rows();
    expect(list).toHaveLength(2);
    // cl_wait was ready just under 3 days ago, cl_north just under 1.
    expect(list[0]).toHaveTextContent("Havana Hospital");
    expect(list[0]).toHaveTextContent("2 people");
    expect(list[0]).toHaveTextContent(
      /Uploaded by Grace Nwosu · \d+ \w{3} \d{4}/,
    );
    expect(list[0]).toHaveTextContent("Waiting 2 days");
    expect(list[1]).toHaveTextContent("Northgate General Hospital");
    expect(list[1]).toHaveTextContent("1 person");
    expect(list[1]).toHaveTextContent("Waiting 23 hours");
  });

  it("Ending soon lists Riverside's letter", async () => {
    await open();
    await userEvent.click(tab("Ending soon"));
    await waitFor(() =>
      expect(row("Riverside Children's Hospital")).toBeDefined(),
    );
    expect(row("Riverside Children's Hospital")).toHaveTextContent(
      "Ends in 20 days",
    );
    expect(tab("Ending soon")).toHaveAttribute("aria-selected", "true");
  });

  it("a letter's status counts to its hospital's day, not the viewer's: at 23:30 UTC Lagos is a day ahead", async () => {
    // Tests run in UTC: the viewer's day is 22 Oct, Riverside's (Lagos) 23 Oct.
    clock = () => Date.parse("2026-10-22T23:30:00Z");
    await open();
    await userEvent.click(tab("Ending soon"));
    await waitFor(() =>
      expect(row("Riverside Children's Hospital")).toBeDefined(),
    );
    // cl_river ends 20 days after its hospital's day (21 after the viewer's).
    expect(row("Riverside Children's Hospital")).toHaveTextContent(
      "Ends in 20 days",
    );
    await userEvent.click(row("Riverside Children's Hospital"));
    await within(detail()).findByText("What to check");
    expect(within(detail()).getByText("Ends in 20 days")).toBeVisible();
  });

  it("Couldn't load letters with Try again", async () => {
    install();
    const spy = vi
      .spyOn(api, "listClearances")
      .mockRejectedValueOnce(new ApiError(503, "unavailable"));
    renderWithAuth(<ClearancesView />);
    expect(
      await screen.findByText(/^Couldn't load letters/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("list", { name: "Letters" });
    expect(rows()).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("an empty tab says No letters", async () => {
    install();
    vi.spyOn(api, "listClearances").mockResolvedValue({
      clearances: [],
      next_cursor: null,
    });
    renderWithAuth(<ClearancesView />);
    expect(await screen.findByText("No letters waiting")).toBeInTheDocument();
    await userEvent.click(tab("Active"));
    expect(await screen.findByText("No letters")).toBeInTheDocument();
  });

  it("global Off shows Named access isn't available yet instead of the queue", async () => {
    await open(ADA, "off");
    expect(
      await screen.findByText("Named access isn't available yet"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("list", { name: "Letters" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Clearances" }),
    ).toBeInTheDocument();
  });
});

describe("the switch panel", () => {
  it("the named-access switch sits at the top, above the queue", async () => {
    await open();
    const panel = screen.getByRole("region", { name: "Named access" });
    const queue = screen.getByRole("list", { name: "Letters" });
    expect(
      panel.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("with global Off, the panel shows Off and Turn up beside the empty page", async () => {
    await open(ADA, "off");
    await screen.findByText("Named access isn't available yet");
    const panel = screen.getByRole("region", { name: "Named access" });
    const every = within(panel).getByRole("group", { name: "Every hospital" });
    expect(every.querySelector("[data-position='off']")).not.toBeNull();
    expect(
      within(every).getByRole("button", { name: "Turn up" }),
    ).toBeInTheDocument();
    // No hospital can go above global: none offers Turn up.
    expect(
      within(panel).getAllByRole("button", { name: "Turn up" }),
    ).toHaveLength(1);
  });
});

describe("the detail", () => {
  it("the detail shows what was entered beside the checklist", async () => {
    await open();
    expect(
      screen.getByText("Choose a letter to see what was entered"),
    ).toBeInTheDocument();
    await pick("Havana Hospital");
    const d = detail();
    expect(row("Havana Hospital")).toHaveAttribute("aria-current", "true");
    expect(within(d).getByText("Dr. Funmi Ade")).toBeInTheDocument();
    expect(within(d).getByText("Chief Medical Director")).toBeInTheDocument();
    expect(within(d).getByText("Waiting for Measured Health")).toBeVisible();
    const people = within(d).getByRole("list", { name: "People covered" });
    expect(within(people).getByText("Dr. Obi")).toBeInTheDocument();
    const staff = within(d).getByRole("list", {
      name: "Measured Health staff",
    });
    expect(within(staff).getByText("Tunde Okafor")).toBeInTheDocument();
    const checklist = within(d).getByRole("list", { name: "What to check" });
    expect(
      within(checklist)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(CHECKLIST);
    const history = within(d).getByRole("list", { name: "History" });
    expect(history).toHaveTextContent(/Uploaded · Grace Nwosu/);
    // The selected letter is never in the URL.
    expect(window.location.href).not.toContain("cl_wait");
  });

  it("View letter shows page 1 of 3 in an image and no download or print", async () => {
    await open();
    await pick("Havana Hospital");
    const page = vi.spyOn(api, "getClearancePage");
    await userEvent.click(btn("View letter"));
    const viewer = screen.getByRole("dialog");
    const img = await within(viewer).findByAltText("Page 1 of 3");
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "blob:test/1");
    expect(page).toHaveBeenCalledWith("cl_wait", 1);
    expect(page).toHaveBeenCalledTimes(1);
    expect(
      within(viewer).queryByRole("button", { name: /download|print/i }),
    ).toBeNull();
    expect(
      within(viewer).queryByRole("link", { name: /download|print|open/i }),
    ).toBeNull();
  });

  it("closing the viewer revokes the page image", async () => {
    await open();
    await pick("Havana Hospital");
    await userEvent.click(btn("View letter"));
    const viewer = screen.getByRole("dialog");
    await within(viewer).findByAltText("Page 1 of 3");
    expect(viewer).toHaveClass("print:hidden");
    await userEvent.click(
      within(viewer).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(screen.queryByAltText(/^Page/)).toBeNull());
    expect(revoked).toContain("blob:test/1");
    expect(btn("View letter")).toHaveFocus();
  });

  it("the auditor sees the letter and the viewer but no Verify, Reject or Revoke", async () => {
    await open(AMARA);
    await pick("Havana Hospital");
    for (const name of ["Verify", "Reject", "Revoke"]) noBtn(name);
    expect(within(detail()).queryByText(SAME_SIDE)).toBeNull();
    await userEvent.click(btn("View letter"));
    expect(
      await within(screen.getByRole("dialog")).findByAltText("Page 1 of 3"),
    ).toBeInTheDocument();
  });

  it("a checking letter can't be verified yet", async () => {
    await open();
    await pick("Havana Hospital", "All");
    // The newest Havana letter in All is cl_check, still being checked.
    expect(
      within(detail()).getByText(
        "Can't verify while the file is being checked",
      ),
    ).toBeInTheDocument();
    noBtn("Verify");
    noBtn("Reject");
  });
});

describe("verify and reject", () => {
  it("Ada verifies Northgate with a code; Northgate is Off, so the toast reads Verified. Names stay hidden until named access is switched on", async () => {
    await open();
    const spy = vi.spyOn(api, "verifyClearance");
    await pick("Northgate General Hospital");
    await userEvent.click(btn("Verify"));
    const d = screen.getByRole("dialog", { name: /^Verify/ });
    expect(
      within(d).getByText(
        "Names unlock for these people at once if named access is On",
      ),
    ).toBeInTheDocument();
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Verify" }));
    // The toast (shown and read out).
    expect(
      await screen.findAllByText(
        "Verified. Names stay hidden until named access is switched on",
      ),
    ).not.toHaveLength(0);
    expect(spy).toHaveBeenCalledWith(
      "cl_north",
      { version: 1, mfa_code: MOCK_CODE },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      await within(detail()).findByText(/^Active until/),
    ).toBeInTheDocument();
    noBtn("Verify");
    // The Verify button has gone: the focus stays in the letter.
    await waitFor(() => expect(top()).toHaveFocus());
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("a refusal whose reload takes the buttons away keeps the focus in the letter, and says it once", async () => {
    await open();
    await pick("Havana Hospital");
    vi.spyOn(api, "verifyClearance").mockRejectedValueOnce(
      new ApiError(409, "same_side"),
    );
    // The server now says this admin is linked to Havana.
    const real = api.getClearance.bind(api);
    vi.spyOn(api, "getClearance").mockImplementation(async (id) => ({
      ...(await real(id)),
      verifiable_by_you: false,
    }));
    await verifyWithCode();
    await waitFor(() => noBtn("Verify"));
    expect(within(detail()).getAllByText(SAME_SIDE)).toHaveLength(1);
    await waitFor(() => expect(top()).toHaveFocus());
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("a letter removed meanwhile says so, with nothing to act on", async () => {
    await open();
    await pick("Northgate General Hospital");
    vi.spyOn(api, "verifyClearance").mockRejectedValueOnce(
      new ApiError(404, "not_found"),
    );
    vi.spyOn(api, "getClearance").mockRejectedValue(
      new ApiError(404, "not_found"),
    );
    await verifyWithCode();
    expect(
      await within(detail()).findByText(
        "This was removed or no longer exists.",
      ),
    ).toBeInTheDocument();
    noBtn("Verify");
    noBtn("View letter");
  });

  it("a wrong code on Reject stays in the dialog, and the code is let go", async () => {
    await open();
    await pick("Northgate General Hospital");
    await userEvent.click(btn("Reject"));
    const d = screen.getByRole("dialog", { name: /^Reject/ });
    await userEvent.click(within(d).getByLabelText("Can't read it"));
    await typeCode(d, "000000");
    await userEvent.click(within(d).getByRole("button", { name: "Reject" }));
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /^Reject/ })).toBeVisible();
    expect(holding("000000")).toEqual([]);
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(btn("Reject")).toHaveFocus();
  });

  it("Bola sees You can't verify letters from a hospital you're linked to on Havana, and no buttons", async () => {
    await open(BOLA);
    await pick("Havana Hospital");
    expect(within(detail()).getByText(SAME_SIDE)).toBeInTheDocument();
    for (const name of ["Verify", "Reject", "Revoke"]) noBtn(name);
  });

  it("a forced same_side reply shows the same words", async () => {
    await open();
    vi.spyOn(api, "verifyClearance").mockRejectedValueOnce(
      new ApiError(409, "same_side"),
    );
    await pick("Havana Hospital");
    await verifyWithCode();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(detail()).getByText(SAME_SIDE)).toBeInTheDocument();
  });

  it("Tunde sees You can't verify a letter that covers you on cl_wait, and no buttons; a forced same_person reply shows the same words", async () => {
    await open(TUNDE);
    await pick("Havana Hospital");
    expect(within(detail()).getByText(COVERS_YOU)).toBeInTheDocument();
    for (const name of ["Verify", "Reject", "Revoke"]) noBtn(name);
    cleanup();

    await open(ADA);
    vi.spyOn(api, "verifyClearance").mockRejectedValueOnce(
      new ApiError(409, "same_person"),
    );
    await pick("Havana Hospital");
    await verifyWithCode();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(detail()).getByText(COVERS_YOU)).toBeInTheDocument();
  });

  it("reject with Other needs a note", async () => {
    await open();
    const spy = vi.spyOn(api, "rejectClearance");
    await pick("Northgate General Hospital");
    await userEvent.click(btn("Reject"));
    const d = screen.getByRole("dialog", { name: /^Reject/ });
    expect(
      within(d).getByText("The reason is shown to the hospital"),
    ).toBeInTheDocument();
    await userEvent.click(within(d).getByLabelText("Other"));
    await typeCode(d);
    const confirm = within(d).getByRole("button", { name: "Reject" });
    await userEvent.click(confirm);
    expect(within(d).getByText("Add a note.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.type(
      within(d).getByLabelText(/^Note/),
      "The letter is unsigned",
    );
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![0]).toBe("cl_north");
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "other",
      note: "The letter is unsigned",
      version: 1,
      mfa_code: MOCK_CODE,
    });
    expect(await within(detail()).findByText("Rejected")).toBeInTheDocument();
    await waitFor(() => expect(top()).toHaveFocus());
  });

  it("a stale verify shows Changed by someone else", async () => {
    await open();
    vi.spyOn(api, "verifyClearance").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    await pick("Northgate General Hospital");
    const get = vi.spyOn(api, "getClearance");
    await verifyWithCode();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      within(detail()).getByText("Changed by someone else"),
    ).toBeInTheDocument();
    // It reloads the letter.
    await waitFor(() => expect(get).toHaveBeenCalledWith("cl_north"));
  });
});

describe("revoke", () => {
  it("revoke an active letter", async () => {
    await open();
    const spy = vi.spyOn(api, "revokeClearance");
    await pick("Riverside Children's Hospital", "Active");
    noBtn("Verify");
    await userEvent.click(btn("Revoke"));
    const d = screen.getByRole("dialog", { name: /^Revoke/ });
    await userEvent.click(within(d).getByLabelText("Security concern"));
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![0]).toBe("cl_river");
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "security_concern",
      version: 1,
      mfa_code: MOCK_CODE,
    });
    expect(await screen.findAllByText("Letter revoked")).not.toHaveLength(0);
    expect(
      await within(detail()).findByText(/^Revoked \d+ \w{3} \d{4}$/),
    ).toBeInTheDocument();
    noBtn("Revoke");
    await waitFor(() => expect(top()).toHaveFocus());
    expect(holding(MOCK_CODE)).toEqual([]);
  });

  it("an active letter past its end by the server's today has no Revoke", async () => {
    await open();
    const real = api.getClearance.bind(api);
    vi.spyOn(api, "getClearance").mockImplementation(async (id) => {
      const c = await real(id);
      return { ...c, today: shiftDay(c.end_date, 1) };
    });
    await pick("Riverside Children's Hospital", "Active");
    const c = await real("cl_river");
    expect(
      within(detail()).getByText(`Ended ${safeDay(c.end_date)}`),
    ).toBeVisible();
    noBtn("Revoke");
  });

  it("an ended letter has no Revoke", async () => {
    await open();
    await userEvent.click(tab("All"));
    await waitFor(() => expect(rows().length).toBeGreaterThan(5));
    const ended = rows().find((b) => b.textContent?.includes("Ended"))!;
    await userEvent.click(ended);
    await within(detail()).findByText("What to check");
    noBtn("Revoke");
  });
});

describe("offline", () => {
  it("offline disables Verify, Reject, Revoke and View letter", async () => {
    env.online = false;
    await open();
    await pick("Northgate General Hospital");
    for (const name of ["Verify", "Reject", "Revoke", "View letter"]) {
      const b = btn(name);
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(OFFLINE);
    }
    expect(within(detail()).getAllByText(OFFLINE)[0]).toBeVisible();
  });
});

describe("on a phone", () => {
  it("phone: queue, then detail with Back", async () => {
    env.desktop = false;
    await open();
    expect(
      screen.queryByRole("region", { name: "Clearance letter" }),
    ).toBeNull();
    expect(
      screen.queryByText("Choose a letter to see what was entered"),
    ).toBeNull();
    await userEvent.click(row("Northgate General Hospital"));
    await within(detail()).findByText("What to check");
    expect(screen.queryByRole("list", { name: "Letters" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.queryByRole("region", { name: "Clearance letter" }),
    ).toBeNull();
    await screen.findByRole("list", { name: "Letters" });
    await waitFor(() =>
      expect(row("Northgate General Hospital")).toHaveFocus(),
    );
  });
});
