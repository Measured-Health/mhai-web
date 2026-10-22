import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import type { Role } from "@/lib/auth/types";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
const adminHolder = vi.hoisted(() => ({
  client: null as unknown as AdminClient,
}));
vi.mock("@/lib/api/admin", () => ({
  getAdminClient: () => adminHolder.client,
}));
const pathname = vi.hoisted(() => ({ value: "/c/q1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { Sidebar } from "./sidebar";

beforeEach(() => {
  holder.client = createMockClient();
  // The real clock: AdminNav reads invite expiry against Date.now().
  adminHolder.client = screenAdminAs(DEMO_EMAILS.director);
  pathname.value = "/c/q1";
});
afterEach(() => {
  vi.useRealTimers();
});

const items = [
  {
    id: "q1",
    title: "Chest pain, 54 M",
    urgency: "urgent" as const,
    createdAt: Date.now(),
    kind: "high" as const,
    confidenceLabel: "High confidence",
    query: {} as never,
  },
  {
    id: "q2",
    title: "Febrile child, 3 F",
    urgency: "routine" as const,
    createdAt: Date.now(),
    kind: "caution" as const,
    confidenceLabel: "Use with caution",
    flagged: true,
    query: {} as never,
  },
];

describe("Sidebar", () => {
  it("labels questions saved offline as waiting, or as couldn't send", () => {
    renderWithAuth(
      <Sidebar
        items={[
          { ...items[0], id: "local-1", kind: undefined, pending: "waiting" },
          { ...items[1], id: "local-2", kind: undefined, pending: "failed" },
        ]}
      />,
    );
    expect(screen.getByText(/Waiting to send ·/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't send ·/)).toBeInTheDocument();
  });

  it("lists session history with plain-language status and marks the current one", () => {
    renderWithAuth(<Sidebar items={items} />);
    expect(
      screen.getByRole("link", { name: /Chest pain, 54 M/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
    expect(screen.getByLabelText("Flagged")).toBeInTheDocument();
  });
  it("says 'Completed', not a confidence level, when the result screen showed none", () => {
    renderWithAuth(
      <Sidebar
        items={[
          { ...items[0], confidenceLabel: null },
          { ...items[1], confidenceLabel: null },
        ]}
      />,
    );
    expect(screen.queryByText(/High confidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use with caution/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Completed/)).toHaveLength(2);
  });
  it("keeps the review and failed labels, which are not confidence levels", () => {
    renderWithAuth(
      <Sidebar
        items={[
          { ...items[0], kind: "review", confidenceLabel: null },
          { ...items[1], kind: "failed", confidenceLabel: null },
        ]}
      />,
    );
    expect(screen.getByText(/Needs review/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't complete/)).toBeInTheDocument();
  });
  it("shows the new consultation action, session note and hospital", () => {
    renderWithAuth(<Sidebar items={[]} />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByText(/kept for this session only/)).toBeInTheDocument();
    expect(screen.getByText("Havana Hospital")).toBeInTheDocument();
  });
  it("links to Help from the footer", () => {
    renderWithAuth(<Sidebar items={[]} />);
    expect(screen.getByRole("link", { name: /Help/ })).toHaveAttribute(
      "href",
      "/help",
    );
  });
  it("keeps labels accessible in rail mode", () => {
    renderWithAuth(<Sidebar items={items} rail />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toBeVisible();
    expect(screen.getByText("New consultation")).toHaveClass("sr-only");
  });
  it("hides the account footer when nobody is signed in", () => {
    renderWithAuth(<Sidebar items={[]} />, null);
    expect(screen.queryByText("Havana Hospital")).not.toBeInTheDocument();
  });
  it("links to Review corrections with the waiting count", async () => {
    renderWithAuth(<Sidebar items={[]} />);
    const link = await screen.findByRole("link", {
      name: "Review corrections, 3 waiting",
    });
    expect(link).toHaveAttribute("href", "/review");
    expect(link).toHaveTextContent("Review corrections3");
    expect(link).not.toHaveAttribute("aria-current");
  });
  it("keeps the count in the tablet rail", async () => {
    renderWithAuth(<Sidebar items={[]} rail />);
    expect(
      await screen.findByRole("link", {
        name: "Review corrections, 3 waiting",
      }),
    ).toBeVisible();
    expect(screen.getByText("Review corrections")).toHaveClass("sr-only");
  });
  it("drops the count when nothing is waiting any more", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithAuth(<Sidebar items={[]} />);
    await screen.findByRole("link", { name: "Review corrections, 3 waiting" });
    const list = vi
      .spyOn(holder.client, "listPendingCorrections")
      .mockResolvedValue([]);
    // The next minute's poll finds the queue empty.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await waitFor(() => expect(list).toHaveBeenCalled());
    const link = await screen.findByRole("link", {
      name: "Review corrections",
    });
    expect(link).not.toHaveTextContent(/\d/);
  });
  it("hides the entry when reviewing isn't available (403)", async () => {
    const list = vi
      .spyOn(holder.client, "listPendingCorrections")
      .mockRejectedValue(new ApiError(403, "forbidden"));
    renderWithAuth(<Sidebar items={[]} />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /Review corrections/ }),
      ).toBeNull(),
    );
  });

  it("shows no hospital admin group to a clinician", () => {
    renderWithAuth(<Sidebar items={[]} />);
    expect(screen.queryByRole("region", { name: "Hospital admin" })).toBeNull();
  });

  it("shows a medical director both sides", () => {
    const list = vi.spyOn(adminHolder.client, "listStaff");
    renderWithAuth(<Sidebar items={items} />, {
      ...TEST_USER,
      roles: ["clinician", "hospital_admin"],
    });
    const group = screen.getByRole("region", { name: "Hospital admin" });
    expect(
      within(group)
        .getAllByRole("link")
        .map((l) => l.getAttribute("aria-label")),
    ).toEqual(["Staff", "Hospital settings", "Activity", "Usage"]);
    expect(within(group).getByRole("link", { name: "Staff" })).toHaveAttribute(
      "href",
      "/admin/staff",
    );
    expect(
      screen.getByRole("link", { name: "New consultation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chest pain, 54 M")).toBeInTheDocument();
    // On a clinical page the staff list isn't loaded just for a count (A14).
    expect(list).not.toHaveBeenCalled();
    expect(within(group).queryByText(/members/)).toBeNull();
  });

  it("counts staff and pending invites on the admin side, for screen readers too", async () => {
    pathname.value = "/admin/staff";
    renderWithAuth(<Sidebar items={[]} />, {
      ...TEST_USER,
      roles: ["clinician", "hospital_admin"],
    });
    const staff = screen.getByRole("link", { name: "Staff" });
    // One invite is pending; the expired one needs attention instead.
    await waitFor(() =>
      expect(staff).toHaveAccessibleDescription(
        "12 members · 1 invite pending",
      ),
    );
    expect(
      screen.getByRole("link", { name: "Usage" }),
    ).toHaveAccessibleDescription("Counts only");
  });

  it("shows an admin-only person the admin group and nothing clinical (R3)", () => {
    const pending = vi.spyOn(holder.client, "listPendingCorrections");
    renderWithAuth(<Sidebar items={items} />, {
      ...TEST_USER,
      roles: ["hospital_admin"],
    });
    expect(
      screen.getByRole("region", { name: "Hospital admin" }),
    ).toBeInTheDocument();
    for (const name of [
      /New consultation/,
      /Search consultations/,
      /Review corrections/,
      /^Help$/,
    ])
      expect(
        screen.queryByRole("link", { name }) ??
          screen.queryByRole("button", { name }),
      ).toBeNull();
    expect(screen.queryByText("Chest pain, 54 M")).toBeNull();
    expect(screen.queryByText(/kept for this session/)).toBeNull();
    expect(
      screen.getByText("Hospital admin", { selector: "p" }),
    ).toBeInTheDocument();
    // No clinical call: the review queue is never asked for.
    expect(pending).not.toHaveBeenCalled();
  });

  it("marks the current admin page, also on its sub-pages", () => {
    pathname.value = "/admin/activity/oversight";
    renderWithAuth(<Sidebar items={[]} />, {
      ...TEST_USER,
      roles: ["hospital_admin"],
    });
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Staff" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the admin group's labels for screen readers in the rail", () => {
    renderWithAuth(<Sidebar items={[]} rail />, {
      ...TEST_USER,
      roles: ["hospital_admin"],
    });
    expect(
      screen.getByRole("region", { name: "Hospital admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Hospital settings" }),
    ).toBeVisible();
  });

  describe("Analysis link", () => {
    const withAnalysis = (...roles: Role[]) => ({
      ...TEST_USER,
      roles,
      features: { analysis: true },
    });
    it("an analyst sees Analysis under Review", () => {
      renderWithAuth(
        <Sidebar items={[]} />,
        withAnalysis("clinician", "analyst"),
      );
      const links = screen.getAllByRole("link");
      const names = links.map(
        (l) => l.getAttribute("aria-label") ?? l.textContent,
      );
      const review = names.findIndex((n) => /Review corrections/.test(n ?? ""));
      const analysis = screen.getByRole("link", { name: "Analysis" });
      expect(analysis).toHaveAttribute("href", "/analysis");
      expect(links.indexOf(analysis)).toBe(review + 1);
      expect(
        screen.queryByRole("region", { name: "Hospital admin" }),
      ).toBeNull();
    });
    it("a hospital admin sees Analysis after Usage", () => {
      renderWithAuth(<Sidebar items={[]} />, withAnalysis("hospital_admin"));
      const group = screen.getByRole("region", { name: "Hospital admin" });
      expect(
        within(group)
          .getAllByRole("link")
          .map((l) => l.getAttribute("aria-label")),
      ).toEqual([
        "Staff",
        "Hospital settings",
        "Activity",
        "Usage",
        "Analysis",
      ]);
    });
    it("a director sees it once", () => {
      renderWithAuth(
        <Sidebar items={[]} />,
        withAnalysis("clinician", "hospital_admin"),
      );
      expect(screen.getAllByRole("link", { name: "Analysis" })).toHaveLength(1);
    });
    it("with the feature off nobody sees it (Review Focus 5)", () => {
      for (const roles of [
        ["clinician", "analyst"],
        ["hospital_admin"],
        ["clinician", "hospital_admin"],
      ] as Role[][]) {
        const { unmount } = renderWithAuth(<Sidebar items={[]} />, {
          ...TEST_USER,
          roles,
        });
        expect(screen.queryByRole("link", { name: "Analysis" })).toBeNull();
        unmount();
      }
    });
  });
});
