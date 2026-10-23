import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayLabel } from "@mhai/ui/clearances";
import type { AdminClient } from "@/lib/api/admin";
import type { ClearanceClient } from "@/lib/api/clearances";
import { resetClearances } from "@/lib/api/mock-clearances";
import { MOCK_CODE } from "@/lib/auth/mock";
import { instantLabel } from "@/lib/clearances/status";
import { renderAdmin } from "@/tests/admin-render";
import { dayAfter, pdf, sampleClients, uploadDialog } from "@/tests/clearances";

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

let t = "";
let made: string[];
let revoked: string[];
const original = [URL.createObjectURL, URL.revokeObjectURL] as const;

beforeEach(async () => {
  onlineManager.setOnline(true);
  resetClearances();
  Object.assign(holder, sampleClients());
  t = (await holder.clearances.listClearances()).today;
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
  [URL.createObjectURL, URL.revokeObjectURL] = original;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const table = () => screen.findByRole("table", { name: "Clearance letters" });
const rowFor = async (id: string) =>
  (await table()).querySelector<HTMLElement>(`tr[data-letter-id="${id}"]`)!;

/** Opens the page and a letter's details from its row. */
async function openLetter(id: string) {
  renderAdmin(<NamedAccessView />);
  const row = await rowFor(id);
  await userEvent.click(
    within(row).getByRole("button", { name: /^Open the letter/ }),
  );
  const panel = await screen.findByRole("dialog", { name: "Clearance letter" });
  // Ready once the letter has loaded.
  await within(panel).findByText("Signed by");
  return panel;
}

async function typeCode(d: HTMLElement, code: string = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

const revokeDialog = () =>
  screen.findByRole("dialog", { name: "Revoke this letter?" });
const narrowDialog = () =>
  screen.findByRole("dialog", { name: "Remove people from this letter?" });

describe("LetterDetail", () => {
  it("the detail shows what was entered and the history", async () => {
    const panel = await openLetter("cl_act");
    const p = within(panel);
    expect(
      p.getByText(`Active until ${dayLabel(dayAfter(t, 137))}`),
    ).toBeInTheDocument();
    expect(p.getByText("Dr. Funmi Ade")).toBeInTheDocument();
    expect(p.getByText("Chief Medical Director")).toBeInTheDocument();
    expect(p.getByText(dayLabel(dayAfter(t, -30)))).toBeInTheDocument();
    expect(p.getByText(dayLabel(dayAfter(t, 137)))).toBeInTheDocument();
    expect(
      within(p.getByRole("list", { name: "People covered" })).getByText(
        "Grace Nwosu",
      ),
    ).toBeInTheDocument();
    // No Measured Health staff on this letter.
    expect(p.queryByRole("list", { name: "Measured Health staff" })).toBeNull();
    const c = await holder.clearances.getClearance("cl_act");
    const items = within(p.getByRole("list", { name: "History" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual([
      `${instantLabel(c.history[0]!.at)} · Uploaded · Grace Nwosu`,
      `${instantLabel(c.history[1]!.at)} · Ready to check`,
      `${instantLabel(c.history[2]!.at)} · Verified · Tunde Okafor`,
    ]);
    // An active letter: View, Revoke and Renew; one person, so no Remove.
    expect(p.getByRole("button", { name: "View letter" })).toBeEnabled();
    expect(p.getByRole("button", { name: "Revoke" })).toBeEnabled();
    expect(p.getByRole("button", { name: "Renew" })).toBeEnabled();
    expect(p.queryByRole("button", { name: "Remove a person" })).toBeNull();
  });

  it("View letter opens the viewer on page 1 of 3; closing it revokes the image", async () => {
    const page = vi.spyOn(holder.clearances, "getClearancePage");
    const panel = await openLetter("cl_wait");
    await userEvent.click(
      within(panel).getByRole("button", { name: "View letter" }),
    );
    const viewer = await screen.findByRole("dialog", { name: "The letter" });
    const img = await within(viewer).findByAltText("Page 1 of 3");
    expect(img).toHaveAttribute("src", "blob:test/1");
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith("cl_wait", 1);
    await userEvent.click(
      within(viewer).getByRole("button", { name: "Close" }),
    );
    expect(revoked).toContain("blob:test/1");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "The letter" })).toBeNull(),
    );
    // The detail is still open under it.
    expect(
      screen.getByRole("dialog", { name: "Clearance letter" }),
    ).toBeInTheDocument();
  });

  it("a checking letter has no View letter", async () => {
    const panel = await openLetter("cl_check");
    const p = within(panel);
    expect(p.getByText("Checking the file")).toBeInTheDocument();
    expect(p.queryByRole("button", { name: "View letter" })).toBeNull();
    // Not yet waiting or active: nothing to revoke, narrow or renew.
    expect(p.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(p.queryByRole("button", { name: "Renew" })).toBeNull();
  });

  it("only waiting and active letters can be revoked; ended and revoked ones renewed", async () => {
    const panel = await openLetter("cl_rev");
    const p = within(panel);
    expect(
      p.getByText(`Revoked ${dayLabel(dayAfter(t, -20))}`),
    ).toBeInTheDocument();
    expect(p.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(p.queryByRole("button", { name: "Remove a person" })).toBeNull();
    expect(p.getByRole("button", { name: "Renew" })).toBeEnabled();
    expect(p.getByRole("button", { name: "View letter" })).toBeEnabled();
  });

  it("any hospital admin can revoke with a reason and code, and the row turns Revoked {date}", async () => {
    const revoke = vi.spyOn(holder.clearances, "revokeClearance");
    // Grace uploaded cl_act; Dr. Obi, another hospital admin, revokes it.
    const panel = await openLetter("cl_act");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Revoke" }),
    );
    const d = await revokeDialog();
    expect(
      within(d).getByText("Named access under this letter ends at once."),
    ).toBeInTheDocument();
    const confirm = within(d).getByRole("button", { name: "Revoke letter" });
    expect(confirm).toBeDisabled();
    await userEvent.click(
      within(d).getByRole("radio", { name: "Person left or changed role" }),
    );
    expect(confirm).toBeDisabled();
    await typeCode(d);
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith(
        "cl_act",
        {
          reason: "person_left",
          version: 1,
          mfaCode: MOCK_CODE,
        },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Letter revoked")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Revoke this letter?" }),
      ).toBeNull(),
    );
    const words = `Revoked ${dayLabel(t)}`;
    await waitFor(async () =>
      expect(await rowFor("cl_act")).toHaveTextContent(words),
    );
    expect(within(panel).getByText(words)).toBeInTheDocument();
    expect(within(panel).getByText(/By Dr\. Obi/)).toBeInTheDocument();
  });

  it("Other needs a note", async () => {
    const revoke = vi.spyOn(holder.clearances, "revokeClearance");
    const panel = await openLetter("cl_act");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Revoke" }),
    );
    const d = await revokeDialog();
    await userEvent.click(within(d).getByRole("radio", { name: "Other" }));
    await typeCode(d);
    const confirm = within(d).getByRole("button", { name: "Revoke letter" });
    expect(confirm).toBeDisabled();
    const note = within(d).getByLabelText(/^Note/);
    expect(note).toHaveAccessibleDescription(/Needed for Other/);
    expect(note).toHaveAttribute("maxLength", "500");
    await userEvent.type(note, "Signed by the wrong office");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith(
        "cl_act",
        expect.objectContaining({
          reason: "other",
          note: "Signed by the wrong office",
        }),
        expect.anything(),
      ),
    );
  });

  it("a wrong code keeps the revoke open, says so and clears the code", async () => {
    const panel = await openLetter("cl_act");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Revoke" }),
    );
    const d = await revokeDialog();
    await userEvent.click(
      within(d).getByRole("radio", { name: "No longer needed" }),
    );
    await typeCode(d, "000000");
    await userEvent.click(
      within(d).getByRole("button", { name: "Revoke letter" }),
    );
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(within(d).getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(
      within(d).getByRole("button", { name: "Revoke letter" }),
    ).toBeDisabled();
    expect(await rowFor("cl_act")).toHaveTextContent("Active until");
  });

  it("narrow removes one of two people", async () => {
    // cl_wait covers two: Dr. Obi and Tunde Okafor from Measured Health.
    const c = await holder.clearances.getClearance("cl_wait");
    expect(c.covered.length + c.covered_platform.length).toBe(2);
    const narrow = vi.spyOn(holder.clearances, "narrowClearance");
    const panel = await openLetter("cl_wait");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Remove a person" }),
    );
    const d = await narrowDialog();
    await userEvent.click(within(d).getByRole("checkbox", { name: "Dr. Obi" }));
    await userEvent.click(
      within(d).getByRole("radio", { name: "No longer needed" }),
    );
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(narrow).toHaveBeenCalledWith(
        "cl_wait",
        {
          remove: ["s-obi"],
          reason: "no_longer_needed",
          version: c.version,
          mfaCode: MOCK_CODE,
        },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(
      await screen.findByText("Removed from the letter"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(
          within(panel).getByRole("list", { name: "People covered" }),
        ).queryByText("Dr. Obi"),
      ).toBeNull(),
    );
    // One person left: nothing more to remove.
    expect(
      within(panel).queryByRole("button", { name: "Remove a person" }),
    ).toBeNull();
  });

  it("cl_wait lists Tunde Okafor under Measured Health staff, and narrow can remove him", async () => {
    const narrow = vi.spyOn(holder.clearances, "narrowClearance");
    const panel = await openLetter("cl_wait");
    const staff = within(panel).getByRole("list", {
      name: "Measured Health staff",
    });
    expect(within(staff).getByText("Tunde Okafor")).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Remove a person" }),
    );
    const d = await narrowDialog();
    await userEvent.click(
      within(d).getByRole("checkbox", {
        name: "Tunde Okafor (Measured Health)",
      }),
    );
    await userEvent.click(
      within(d).getByRole("radio", { name: "Uploaded in error" }),
    );
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(narrow).toHaveBeenCalledWith(
        "cl_wait",
        expect.objectContaining({ remove: ["pa_tunde"] }),
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(
        within(panel).queryByRole("list", { name: "Measured Health staff" }),
      ).toBeNull(),
    );
  });

  it("checking everyone shows revoke instead", async () => {
    const narrow = vi.spyOn(holder.clearances, "narrowClearance");
    const panel = await openLetter("cl_wait");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Remove a person" }),
    );
    const d = await narrowDialog();
    await userEvent.click(within(d).getByRole("checkbox", { name: "Dr. Obi" }));
    await userEvent.click(
      within(d).getByRole("checkbox", {
        name: "Tunde Okafor (Measured Health)",
      }),
    );
    await userEvent.click(
      within(d).getByRole("radio", { name: "No longer needed" }),
    );
    await typeCode(d);
    expect(
      within(d).getByText("To remove everyone, revoke the letter"),
    ).toBeInTheDocument();
    const remove = within(d).getByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();
    fireEvent.submit(remove.closest("form")!);
    expect(narrow).not.toHaveBeenCalled();
    await userEvent.click(
      within(d).getByRole("button", { name: "Revoke the letter instead" }),
    );
    const r = await revokeDialog();
    // No code carries over from one dialog to the next.
    expect(within(r).getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(
      screen.queryByRole("dialog", { name: "Remove people from this letter?" }),
    ).toBeNull();
  });

  it("a stale narrow shows Changed by someone else and reloads", async () => {
    const panel = await openLetter("cl_wait");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Remove a person" }),
    );
    const d = await narrowDialog();
    // Another hospital admin removes Tunde Okafor first.
    await holder.clearances.narrowClearance(
      "cl_wait",
      {
        remove: ["pa_tunde"],
        reason: "person_left",
        version: 1,
        mfaCode: MOCK_CODE,
      },
      { idempotencyKey: "k-other" },
    );
    const get = vi.spyOn(holder.clearances, "getClearance");
    await userEvent.click(within(d).getByRole("checkbox", { name: "Dr. Obi" }));
    await userEvent.click(
      within(d).getByRole("radio", { name: "No longer needed" }),
    );
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    expect(
      await within(d).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    // The code is gone after the answer, and the letter is loaded again.
    expect(within(d).getByLabelText("Digit 1 of 6")).toHaveValue("");
    await waitFor(() => expect(get).toHaveBeenCalledWith("cl_wait"));
    await waitFor(() =>
      expect(
        within(d).queryByRole("checkbox", {
          name: "Tunde Okafor (Measured Health)",
        }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(
        within(panel).queryByRole("list", { name: "Measured Health staff" }),
      ).toBeNull(),
    );
  });

  it("a revoke after someone else's change shows Changed by someone else", async () => {
    const panel = await openLetter("cl_wait");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Revoke" }),
    );
    const d = await revokeDialog();
    await holder.clearances.narrowClearance(
      "cl_wait",
      {
        remove: ["pa_tunde"],
        reason: "person_left",
        version: 1,
        mfaCode: MOCK_CODE,
      },
      { idempotencyKey: "k-other" },
    );
    await userEvent.click(
      within(d).getByRole("radio", { name: "No longer needed" }),
    );
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Revoke letter" }),
    );
    expect(
      await within(d).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    expect(await rowFor("cl_wait")).toHaveTextContent(
      "Waiting for Measured Health",
    );
  });

  it("Renew opens Upload with the same people and signer", async () => {
    const panel = await openLetter("cl_act");
    await userEvent.click(within(panel).getByRole("button", { name: "Renew" }));
    const d = await uploadDialog();
    expect(within(d).getByLabelText("Signed by")).toHaveValue("Dr. Funmi Ade");
    expect(within(d).getByLabelText("Job title")).toHaveValue(
      "Chief Medical Director",
    );
    expect(
      await within(d).findByRole("checkbox", { name: "Grace Nwosu" }),
    ).toBeChecked();
    expect(
      within(d).getByRole("checkbox", { name: "Dr. Ngozi Obi" }),
    ).not.toBeChecked();
  });

  it("Renew says who can't be covered any more and names the Measured Health staff to add again", async () => {
    // cl_wait covers Dr. Obi and Tunde Okafor; revoke it so it can be renewed.
    await holder.clearances.revokeClearance(
      "cl_wait",
      { reason: "no_longer_needed", mfaCode: MOCK_CODE },
      { idempotencyKey: "k-r" },
    );
    // Dr. Obi loses the hospital admin role.
    const obi = (await holder.admin.listStaff()).find((s) => s.id === "s-obi")!;
    vi.spyOn(holder.admin, "listStaff").mockResolvedValue([
      ...(await holder.admin.listStaff()).filter((s) => s.id !== "s-obi"),
      { ...obi, roles: ["clinician"] },
    ]);
    const panel = await openLetter("cl_wait");
    await userEvent.click(within(panel).getByRole("button", { name: "Renew" }));
    const d = await uploadDialog();
    expect(
      await within(d).findByText(
        "Dr. Ngozi Obi can't be covered any more and was left off.",
      ),
    ).toBeInTheDocument();
    expect(
      within(d).getByText(
        "The old letter also named Tunde Okafor from Measured Health. Add their email again if this letter names them.",
      ),
    ).toBeInTheDocument();
  });

  it("the old letter stays Active after renewing", async () => {
    const upload = vi.spyOn(holder.clearances, "uploadClearance");
    const panel = await openLetter("cl_act");
    await userEvent.click(within(panel).getByRole("button", { name: "Renew" }));
    const d = await uploadDialog();
    const w = within(d);
    await w.findByRole("checkbox", { name: "Grace Nwosu" });
    await userEvent.upload(w.getByLabelText("The letter"), pdf());
    await w.findByText(/^letter\.pdf · /);
    fireEvent.change(w.getByLabelText("Letter date"), {
      target: { value: dayAfter(t, -1) },
    });
    fireEvent.change(w.getByLabelText("End date"), {
      target: { value: dayAfter(t, 300) },
    });
    await userEvent.click(
      w.getByRole("checkbox", {
        name: "This letter is signed by hospital leadership and names these people.",
      }),
    );
    await typeCode(d);
    await userEvent.click(w.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          renews: "cl_act",
          covered: ["s-nwosu"],
          signed_by: "Dr. Funmi Ade",
        }),
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Letter uploaded")).toBeInTheDocument();
    expect(await rowFor("cl_up1")).toHaveTextContent("Checking the file");
    expect(await rowFor("cl_act")).toHaveTextContent(
      `Active until ${dayLabel(dayAfter(t, 137))}`,
    );
  });

  it("offline disables View letter, Revoke, Remove and Renew, with the reason", async () => {
    const cases: [string, string[]][] = [
      ["cl_wait", ["View letter", "Revoke", "Remove a person"]],
      ["cl_act", ["View letter", "Revoke", "Renew"]],
    ];
    for (const [id, names] of cases) {
      cleanup();
      act(() => onlineManager.setOnline(true));
      const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      const panel = await openLetter(id);
      online.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      const note = within(panel).getByText(
        "You're offline. Viewing and changing a letter need a connection.",
      );
      for (const name of names) {
        const b = within(panel).getByRole("button", { name });
        expect(b, `${id} ${name}`).toBeDisabled();
        expect(b.getAttribute("aria-describedby"), name).toBe(note.id);
      }
    }
  });

  it("at phone width the detail is a sheet and Renew opens as a full-width dialog, not a sheet on a sheet", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderAdmin(<NamedAccessView />);
    const cards = await screen.findByRole("list", {
      name: "Clearance letters",
    });
    await userEvent.click(
      cards.querySelector<HTMLElement>('[data-letter-id="cl_act"]')!,
    );
    const panel = await screen.findByRole("dialog", {
      name: "Clearance letter",
    });
    expect(panel.tagName).toBe("SECTION");
    await within(panel).findByText("Signed by");
    await userEvent.click(within(panel).getByRole("button", { name: "Renew" }));
    const d = await uploadDialog();
    expect(d.tagName).toBe("DIALOG");
    expect(d.className).toMatch(/max-md:w-full/);
  });

  it("closing the detail forgets the letter; it is never in the URL", async () => {
    const before = window.location.href;
    const panel = await openLetter("cl_act");
    expect(window.location.href).toBe(before);
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Clearance letter" }),
      ).toBeNull(),
    );
  });
});
