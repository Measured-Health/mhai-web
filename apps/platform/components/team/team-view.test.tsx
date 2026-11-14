import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { AMARA, ADA, renderWithAuth } from "@/tests/render";
import { TeamView } from "./team-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function install(email: string = ADA.email) {
  const api = createMockPlatform({
    delayMs: 0,
    me: () => email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
  return api;
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rowOf = (table: HTMLElement, name: string) =>
  within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name))!;

describe("the team page", () => {
  it("lists the six team members with role, status and two-step", async () => {
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    for (const h of [
      "Name",
      "Email",
      "Role",
      "Status",
      "Two-step",
      "Last sign-in",
    ])
      expect(
        within(table).getByRole("columnheader", { name: h }),
      ).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    const ada = rowOf(table, "Ada Bakare");
    expect(within(ada).getByText("Platform admin")).toBeInTheDocument();
    expect(within(ada).getByText("Active")).toBeInTheDocument();
    expect(within(ada).getByText("On")).toBeInTheDocument();
    // Core keeps no invites: every member is active (1.26.0).
    const kemi = rowOf(table, "Kemi Lawal");
    expect(within(kemi).getByText("Auditor")).toBeInTheDocument();
    expect(within(kemi).getByText("Active")).toBeInTheDocument();
    expect(within(table).queryByText("Invite pending")).toBeNull();
    expect(within(rowOf(table, "Chidi Nwosu")).getByText("Off")).toBeVisible();
  });

  it("invites aren't served yet: a calm Not available yet, and no row is added", async () => {
    renderWithAuth(<TeamView />);
    await screen.findByRole("table");
    await userEvent.click(
      screen.getByRole("button", { name: "Invite team member" }),
    );
    const d = screen.getByRole("dialog", { name: "Invite a team member" });
    await userEvent.click(
      within(d).getByRole("button", { name: "Send invite" }),
    );
    expect(within(d).getByText("Use 1 to 120 characters.")).toBeInTheDocument();
    await userEvent.type(within(d).getByLabelText("Name"), "Ngozi Adeyemi");
    await userEvent.type(
      within(d).getByLabelText("Email"),
      "ngozi@measured-health.example",
    );
    await userEvent.click(
      within(d).getByRole("button", { name: "Send invite" }),
    );
    const note = await within(d).findByText("Not available yet");
    expect(note.closest("[role=status]")).not.toBeNull();
    expect(within(d).queryByRole("alert")).toBeNull();
    expect(
      within(d).getByRole("button", { name: "Send invite" }),
    ).toBeDisabled();
    expect(screen.queryByText("Ngozi Adeyemi")).toBeNull();
  });

  it("your own row has no Change role and no Remove", async () => {
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    expect(
      within(rowOf(table, "Ada Bakare")).queryByRole("button", {
        name: /Change role/,
      }),
    ).toBeNull();
    expect(
      within(rowOf(table, "Ada Bakare")).queryByRole("button", {
        name: /Remove/,
      }),
    ).toBeNull();
    expect(
      within(rowOf(table, "Ada Bakare")).getByText(
        "You can't change your own role or remove yourself. Another platform admin can.",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(table, "Tunde Okafor")).getByRole("button", {
        name: "Change role for Tunde Okafor",
      }),
    ).toBeInTheDocument();
  });

  it("changing a role asks for the code (core 1.26.0), says their sessions end, and updates the row", async () => {
    const api = install();
    const spy = vi.spyOn(api, "changeRole");
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Amara Eze")).getByRole("button", {
        name: "Change role for Amara Eze",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Change role for Amara Eze" });
    expect(within(d).getByLabelText("Auditor")).toBeChecked();
    expect(
      within(d).getByText(
        "Their sessions end at once: they sign in again with the new role.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(d).getByLabelText("Platform admin"));
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: "Make Amara Eze a platform admin?",
    });
    await userEvent.click(
      within(s).getByRole("button", { name: "Change role" }),
    );
    expect(within(s).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.keyboard("123456");
    await userEvent.click(
      within(s).getByRole("button", { name: "Change role" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![1]).toEqual({
      role: "platform_admin",
      version: 1,
      mfa_code: "123456",
    });
    await waitFor(() =>
      expect(
        within(rowOf(screen.getByRole("table"), "Amara Eze")).getByText(
          "Platform admin",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("a role changed by someone else says so and reloads the team", async () => {
    const api = install();
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Amara Eze")).getByRole("button", {
        name: "Change role for Amara Eze",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Change role for Amara Eze" });
    await userEvent.click(within(d).getByLabelText("Platform admin"));
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: "Make Amara Eze a platform admin?",
    });
    // Someone else changes her role first.
    await api.changeRole(
      "tm_amara",
      { role: "platform_admin", version: 1, mfa_code: "123456" },
      { idempotencyKey: "k-other" },
    );
    await userEvent.keyboard("123456");
    await userEvent.click(
      within(s).getByRole("button", { name: "Change role" }),
    );
    expect(
      await within(s).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(rowOf(screen.getByRole("table"), "Amara Eze")).getByText(
          "Platform admin",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("own_role and last_admin are said in words, with what to do", async () => {
    const api = install();
    for (const [code, title, body] of [
      [
        "own_role",
        "You can't change your own role.",
        "Ask another platform admin to do it.",
      ],
      [
        "last_admin",
        "There must always be at least one platform admin.",
        "Make someone else a platform admin first.",
      ],
    ] as const) {
      vi.spyOn(api, "changeRole").mockRejectedValueOnce(
        new ApiError(409, code),
      );
      const { unmount } = renderWithAuth(<TeamView />);
      const table = await screen.findByRole("table");
      await userEvent.click(
        within(rowOf(table, "Tunde Okafor")).getByRole("button", {
          name: "Change role for Tunde Okafor",
        }),
      );
      const d = screen.getByRole("dialog", {
        name: "Change role for Tunde Okafor",
      });
      await userEvent.click(within(d).getByLabelText("Auditor"));
      await userEvent.click(
        within(d).getByRole("button", { name: "Continue" }),
      );
      const s = await screen.findByRole("dialog", {
        name: "Make Tunde Okafor an auditor?",
      });
      await userEvent.keyboard("123456");
      await userEvent.click(
        within(s).getByRole("button", { name: "Change role" }),
      );
      expect(await within(s).findByText(title)).toBeInTheDocument();
      expect(within(s).getByText(body)).toBeInTheDocument();
      unmount();
    }
  });

  it("after a wrong code, the mutation cache holds no code", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithAuth(<TeamView />, { queryClient: qc });
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Amara Eze")).getByRole("button", {
        name: "Change role for Amara Eze",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Change role for Amara Eze" });
    await userEvent.click(within(d).getByLabelText("Platform admin"));
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: "Make Amara Eze a platform admin?",
    });
    await userEvent.keyboard("000000");
    await userEvent.click(
      within(s).getByRole("button", { name: "Change role" }),
    );
    expect(
      await within(s).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.stringify(
          qc
            .getMutationCache()
            .getAll()
            .map((m) => m.state.variables),
        ),
      ).not.toContain("000000"),
    );
  });

  it("removing the last platform admin shows the last-admin message", async () => {
    const api = install();
    // The server says Tunde is the last admin (e.g. the others went meanwhile).
    vi.spyOn(api, "removeMember").mockRejectedValue(
      new ApiError(409, "last_admin"),
    );
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Tunde Okafor")).getByRole("button", {
        name: "Remove Tunde Okafor",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Remove Tunde Okafor?" });
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    expect(
      await within(d).findByText(
        "There must always be at least one platform admin.",
      ),
    ).toBeInTheDocument();
  });

  it("remove needs a code and the row disappears", async () => {
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Tunde Okafor")).getByRole("button", {
        name: "Remove Tunde Okafor",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Remove Tunde Okafor?" });
    expect(
      within(d).getByText("Tunde Okafor loses platform access at once."),
    ).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    expect(within(d).getByText("Enter your 6-digit code.")).toBeInTheDocument();
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.queryByText("Tunde Okafor")).toBeNull());
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      6,
    );
  });

  it("a wrong code keeps the dialog open with the reason", async () => {
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Tunde Okafor")).getByRole("button", {
        name: "Remove Tunde Okafor",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Remove Tunde Okafor?" });
    await userEvent.keyboard("000000");
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Tunde Okafor")).toBeInTheDocument();
  });

  it("an auditor sees no Invite, Change role or Remove", async () => {
    install(AMARA.email);
    renderWithAuth(<TeamView />, { user: AMARA });
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(
      screen.queryByRole("button", { name: "Invite team member" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Change role/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(
      within(table).queryByRole("columnheader", { name: "Actions" }),
    ).toBeNull();
  });

  it("offline turns the actions off and says why", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    const invite = screen.getByRole("button", { name: "Invite team member" });
    expect(invite).toBeDisabled();
    expect(invite).toHaveAccessibleDescription(
      "You're offline. This needs a connection.",
    );
    expect(
      within(rowOf(table, "Tunde Okafor")).getByRole("button", {
        name: "Remove Tunde Okafor",
      }),
    ).toBeDisabled();
  });

  it("phone width renders cards", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderWithAuth(<TeamView />);
    const list = await screen.findByRole("list", { name: "Team" });
    expect(screen.queryByRole("table")).toBeNull();
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    const kemi = items.find((i) => within(i).queryByText("Kemi Lawal"))!;
    expect(within(kemi).getByText("Active")).toBeInTheDocument();
    expect(
      within(kemi).getByRole("button", { name: "Remove Kemi Lawal" }),
    ).toBeInTheDocument();
  });
});
