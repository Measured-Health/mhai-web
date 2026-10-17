import { act, screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/activity/oversight",
}));
import { OversightView } from "./oversight-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

const table = () =>
  screen.findByRole("table", { name: "Corrections waiting for review" });
const rowFor = async (ref: string) =>
  (await within(await table()).findByText(new RegExp(`#${ref}`))).closest(
    "tr",
  )!;
const phone = () =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));

describe("OversightView", () => {
  it("shows what's waiting with specialty, age and eligible reviewers, oldest first", async () => {
    renderAdmin(<OversightView />);
    const t = await table();
    const refs = within(t)
      .getAllByText(/^#C-\d+/)
      .map((n) => n.textContent!.slice(0, 6));
    expect(refs).toEqual(["#C-118", "#C-117", "#C-116"]);
    const c118 = await rowFor("C-118");
    expect(c118).toHaveTextContent("suggested by Dr. Reyes");
    expect(c118).toHaveTextContent("Paediatrics");
    expect(c118).toHaveTextContent("5 h");
    expect(c118).toHaveTextContent("Over 4 h");
    const count = (r: HTMLElement) => within(r).getAllByRole("cell")[3];
    expect(count(c118).textContent).toMatch(/^1\s*Short$/);
    expect(count(await rowFor("C-117"))).not.toHaveTextContent("Short");
    expect(count(await rowFor("C-117")).textContent).toMatch(/^\d+$/);
    expect(
      screen.getByText("Waiting", { selector: "span" }).closest("div"),
    ).toHaveTextContent("3");
    expect(
      screen.getByText("Overdue (over 4 h)").closest("div"),
    ).toHaveTextContent("1");
  });

  it("never shows clinical content, even if the data carried it", async () => {
    const real = await holder.client.getOversight();
    vi.spyOn(holder.client, "getOversight").mockResolvedValue({
      ...real,
      items: real.items.map((i) => ({
        ...i,
        corrected_diagnosis: "Cerebral malaria",
        question_text: "Child with fever and seizures",
        summary: "Likely sepsis",
      })) as typeof real.items,
    });
    renderAdmin(<OversightView />);
    await table();
    const text = document.body.textContent!;
    expect(text).not.toMatch(/malaria|seizures|sepsis/i);
    expect(text).not.toMatch(/diagnosis|symptom|question/i);
  });

  it("flags specialties short of reviewers and points to Staff", async () => {
    renderAdmin(<OversightView />);
    const by = await screen.findByRole("region", {
      name: "Reviewers by specialty",
    });
    const paeds = within(by).getByText("Paediatrics").closest("li")!;
    expect(paeds).toHaveTextContent("1");
    expect(paeds).toHaveTextContent("Short");
    expect(
      within(by).getAllByRole("link", {
        name: "Consider adding a reviewer in Staff",
      })[0],
    ).toHaveAttribute("href", "/admin/staff");
  });

  it("reminds the reviewers", async () => {
    const remind = vi.spyOn(holder.client, "remindReviewers");
    renderAdmin(<OversightView />);
    const row = await rowFor("C-117");
    await userEvent.click(
      within(row).getByRole("button", { name: "Remind reviewers about C-117" }),
    );
    expect(remind).toHaveBeenCalledWith("c-117", {
      idempotencyKey: expect.any(String),
    });
    expect(await screen.findByText("Reviewers reminded")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await rowFor("C-117")).toHaveTextContent("Reminded"),
    );
  });

  it("assigns a reviewer from the eligible list", async () => {
    renderAdmin(<OversightView />);
    const row = await rowFor("C-118");
    await userEvent.click(
      within(row).getByRole("button", { name: "Assign a reviewer to C-118" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Assign a reviewer",
    });
    expect(within(dialog).getAllByRole("button")[0]).toHaveTextContent(
      "Cancel",
    );
    await userEvent.click(
      await within(dialog).findByRole("radio", { name: /Dr. Udo/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Assign" }),
    );
    expect(await screen.findByText("Reviewer assigned")).toBeInTheDocument();
    await waitFor(async () =>
      expect(await rowFor("C-118")).toHaveTextContent("Assigned to Dr. Udo"),
    );
  });

  it("drops a correction decided meanwhile, with a notice", async () => {
    vi.spyOn(holder.client, "remindReviewers").mockRejectedValueOnce(
      new ApiError(409, "already_decided"),
    );
    renderAdmin(<OversightView />);
    const row = await rowFor("C-116");
    await userEvent.click(
      within(row).getByRole("button", { name: "Remind reviewers about C-116" }),
    );
    expect(
      await screen.findByText("This correction has already been decided"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole("table")).queryByText(/#C-116/),
      ).toBeNull(),
    );
    expect(within(screen.getByRole("table")).getByText(/#C-117/)).toBeTruthy();
    expect(
      screen.getByText("Waiting", { selector: "span" }).closest("div"),
    ).toHaveTextContent("2");
  });

  it("never offers approve or reject; a clinician admin is pointed to Review corrections", async () => {
    renderAdmin(<OversightView />);
    await table();
    expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Review corrections" }),
    ).toHaveAttribute("href", "/review");
  });

  it("tells an admin who isn't a clinician that only clinicians decide", async () => {
    holder.client = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
    renderAdmin(<OversightView />, HOSPITAL_ADMIN);
    await table();
    expect(
      screen.getByText(/Only clinicians can approve or reject corrections\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review corrections" }),
    ).toBeNull();
  });

  it("can't remind or assign offline, and says why", async () => {
    renderAdmin(<OversightView />);
    const row = await rowFor("C-118");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const note = screen.getByText(
      "You're offline. Reminders and assignments need a connection.",
    );
    for (const b of within(row).getAllByRole("button")) {
      expect(b).toBeDisabled();
      expect(b.getAttribute("aria-describedby")).toBe(note.id);
    }
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows cards on a phone, each with its own 44 px buttons", async () => {
    phone();
    renderAdmin(<OversightView />);
    const list = await screen.findByRole("list", {
      name: "Corrections waiting for review",
    });
    expect(screen.queryByRole("table")).toBeNull();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const card = items[0];
    expect(card).toHaveTextContent("#C-118");
    expect(card).toHaveTextContent("suggested by Dr. Reyes");
    expect(card).toHaveTextContent("Paediatrics");
    expect(card).toHaveTextContent("Over 4 h");
    expect(card).toHaveTextContent("Short");
    const remind = within(card).getByRole("button", {
      name: /Remind reviewers about C-118/,
    });
    const assign = within(card).getByRole("button", {
      name: /Assign a reviewer to C-118/,
    });
    expect(remind.getAttribute("aria-label")).toMatch(/Paediatrics/);
    expect(assign.getAttribute("aria-label")).toMatch(/Paediatrics/);
    expect(remind.className).toMatch(/min-h-11/);
    expect(assign.className).toMatch(/min-h-11/);
    await userEvent.click(remind);
    expect(await screen.findByText("Reviewers reminded")).toBeInTheDocument();
  });

  it("says two-step, never 2-step", async () => {
    const { container } = renderAdmin(<OversightView />);
    await table();
    expect(container.textContent).not.toMatch(/2-step/i);
  });

  it("says so, not a skeleton, when first opened offline", async () => {
    onlineManager.setOnline(false);
    renderAdmin(<OversightView />);
    expect(
      await screen.findByText(
        "You're offline. Review oversight will load when you reconnect.",
      ),
    ).toBeInTheDocument();
  });

  it("offers Try again on a first load that fails", async () => {
    vi.spyOn(holder.client, "getOversight").mockRejectedValue(
      new ApiError(500, "boom"),
    );
    renderAdmin(<OversightView />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Try again");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the list when a refresh fails, with the banner above it", async () => {
    const spy = vi.spyOn(holder.client, "getOversight");
    renderAdmin(<OversightView />);
    await table();
    spy.mockRejectedValue(new ApiError(403, "forbidden"));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(await rowFor("C-118")).toBeInTheDocument();
  });
});
