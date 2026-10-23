import { act, screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayLabel } from "@mhai/ui/clearances";
import type { AdminClient } from "@/lib/api/admin";
import type { ClearanceClient } from "@/lib/api/clearances";
import { ApiError } from "@/lib/api/errors";
import { CHECK_MS, resetClearances } from "@/lib/api/mock-clearances";
import { renderAdmin } from "@/tests/admin-render";
import {
  dayAfter,
  fillUpload,
  sampleClients,
  uploadDialog,
} from "@/tests/clearances";

const holder = vi.hoisted(() => ({
  admin: null as unknown as AdminClient,
  clearances: null as unknown as ClearanceClient,
}));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.admin }));
vi.mock("@/lib/api/clearances", () => ({
  getClearanceClient: () => holder.clearances,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/named-access",
}));
import { NamedAccessView } from "./named-access-view";

let clock = Date.now();
const use = (over: Parameters<typeof sampleClients>[0] = {}) =>
  Object.assign(holder, sampleClients({ now: () => clock, ...over }));

beforeEach(() => {
  resetClearances();
  clock = Date.now();
  use();
  onlineManager.setOnline(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const today = async () => (await holder.clearances.listClearances()).today;
const table = () => screen.findByRole("table", { name: "Clearance letters" });
const rowFor = async (id: string) =>
  (await table()).querySelector<HTMLElement>(`tr[data-letter-id="${id}"]`)!;
const phone = () =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));

describe("NamedAccessView", () => {
  it("with the switch Off the page says Named access isn't available yet and nothing else", async () => {
    use({ namedAccess: "off" });
    const list = vi.spyOn(holder.clearances, "listClearances");
    renderAdmin(<NamedAccessView />);
    expect(
      await screen.findByText("Named access isn't available yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Named access", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload/ })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/named access;|has named access/)).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("the banner reads 2 people have named access; the earliest ends …", async () => {
    const t = await today();
    renderAdmin(<NamedAccessView />);
    expect(
      await screen.findByText(
        `2 people have named access; the earliest ends ${dayLabel(dayAfter(t, 12))}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload a letter" }),
    ).toBeEnabled();
  });

  it("every sample status shows its words and icon", async () => {
    const t = await today();
    renderAdmin(<NamedAccessView />);
    const want: [string, string, string][] = [
      ["cl_check", "Checking the file", "clock"],
      ["cl_bad", "Couldn't accept the file", "x"],
      ["cl_wait", "Waiting for Measured Health", "hourglass"],
      ["cl_act", `Active until ${dayLabel(dayAfter(t, 137))}`, "check"],
      ["cl_soon", "Ends in 12 days", "alert"],
      ["cl_rej", "Rejected", "ban"],
      ["cl_end", `Ended ${dayLabel(dayAfter(t, -60))}`, "calendar-x"],
      ["cl_rev", `Revoked ${dayLabel(dayAfter(t, -20))}`, "ban"],
    ];
    for (const [id, words, icon] of want) {
      const row = await rowFor(id);
      expect(row, id).toHaveTextContent(words);
      expect(row.querySelector(`[data-icon="${icon}"]`), id).not.toBeNull();
    }
  });

  it("lists newest first with the people, end date, uploader and verifier", async () => {
    renderAdmin(<NamedAccessView />);
    const t = await table();
    const ids = [...t.querySelectorAll("tr[data-letter-id]")].map((r) =>
      r.getAttribute("data-letter-id"),
    );
    expect(ids).toEqual([
      "cl_check",
      "cl_bad",
      "cl_wait",
      "cl_act",
      "cl_rej",
      "cl_rev",
      "cl_soon",
      "cl_end",
    ]);
    const wait = await rowFor("cl_wait");
    expect(wait).toHaveTextContent("Dr. Obi");
    expect(wait).toHaveTextContent("Tunde Okafor");
    expect(wait).toHaveTextContent(/Uploaded by Grace Nwosu · \d+ \w{3} \d{4}/);
    const act = await rowFor("cl_act");
    expect(act).toHaveTextContent(/Verified by Tunde Okafor · \d+ \w{3} \d{4}/);
    expect(
      within(act).getByRole("button", { name: /^Open the letter/ }),
    ).toBeInTheDocument();
  });

  it("a checking letter turns to Waiting for Measured Health without a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAdmin(<NamedAccessView />);
    expect(await rowFor("cl_check")).toHaveTextContent("Checking the file");
    clock += CHECK_MS;
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(async () =>
      expect(await rowFor("cl_check")).toHaveTextContent(
        "Waiting for Measured Health",
      ),
    );
  });

  it("offers Try again when named access can't load", async () => {
    vi.spyOn(holder.clearances, "getNamedAccess").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<NamedAccessView />);
    expect(
      await screen.findByText("Couldn't load named access"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await table();
  });

  it("says so, not a skeleton, when first opened offline", async () => {
    onlineManager.setOnline(false);
    renderAdmin(<NamedAccessView />);
    expect(
      await screen.findByText(
        "You're offline. Named access will load when you reconnect.",
      ),
    ).toBeInTheDocument();
    act(() => onlineManager.setOnline(true));
    await table();
  });

  it("offers Try again when the letters can't load", async () => {
    vi.spyOn(holder.clearances, "listClearances").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<NamedAccessView />);
    expect(
      await screen.findByText("Couldn't load the letters"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await table();
  });

  it("a successful upload adds a Checking the file row", async () => {
    const t = await today();
    renderAdmin(<NamedAccessView />);
    await table();
    await userEvent.click(
      screen.getByRole("button", { name: "Upload a letter" }),
    );
    const dialog = await uploadDialog();
    await fillUpload(dialog, t);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Upload" }),
    );
    // The pop-up's title and body: "Letter uploaded. It shows Checking the
    // file until it's ready."
    expect(await screen.findByText("Letter uploaded")).toBeInTheDocument();
    expect(
      screen.getByText("It shows Checking the file until it's ready."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Upload a letter" }),
      ).toBeNull(),
    );
    const row = await rowFor("cl_up1");
    expect(row).toHaveTextContent("Checking the file");
    expect(row).toHaveTextContent("Dr. Obi");
  });

  it("offline disables Upload", async () => {
    renderAdmin(<NamedAccessView />);
    const upload = await screen.findByRole("button", {
      name: "Upload a letter",
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(upload).toBeDisabled();
    const note = screen.getByText(
      "You're offline. Uploading a letter needs a connection.",
    );
    expect(upload.getAttribute("aria-describedby")).toBe(note.id);
  });

  it("at phone width the list is cards and Upload is a sheet", async () => {
    phone();
    renderAdmin(<NamedAccessView />);
    const cards = await screen.findByRole("list", {
      name: "Clearance letters",
    });
    expect(screen.queryByRole("table")).toBeNull();
    const wait = cards.querySelector<HTMLElement>(
      '[data-letter-id="cl_wait"]',
    )!;
    expect(wait).toHaveTextContent("Waiting for Measured Health");
    expect(wait.tagName).toBe("BUTTON");
    await userEvent.click(
      screen.getByRole("button", { name: "Upload a letter" }),
    );
    const sheet = await uploadDialog();
    expect(sheet.tagName).toBe("SECTION");
    expect(sheet).toHaveAttribute("aria-modal", "true");
  });
});
