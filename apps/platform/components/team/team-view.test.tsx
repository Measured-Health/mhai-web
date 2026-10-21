import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("lists the five team members with role, status and two-step", async () => {
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
    expect(rows).toHaveLength(5);
    const ada = rowOf(table, "Ada Bakare");
    expect(within(ada).getByText("Platform admin")).toBeInTheDocument();
    expect(within(ada).getByText("Active")).toBeInTheDocument();
    expect(within(ada).getByText("On")).toBeInTheDocument();
    const kemi = rowOf(table, "Kemi Lawal");
    expect(within(kemi).getByText("Auditor")).toBeInTheDocument();
    expect(within(kemi).getByText("Invite pending")).toBeInTheDocument();
    expect(within(kemi).getByText("Off")).toBeInTheDocument();
    expect(within(rowOf(table, "Chidi Nwosu")).getByText("Off")).toBeVisible();
  });

  it("invite adds an Invite pending row", async () => {
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
    await userEvent.click(within(d).getByLabelText("Platform admin"));
    await userEvent.click(
      within(d).getByRole("button", { name: "Send invite" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const row = rowOf(await screen.findByRole("table"), "Ngozi Adeyemi");
    expect(within(row).getByText("Invite pending")).toBeInTheDocument();
    expect(within(row).getByText("Platform admin")).toBeInTheDocument();
    expect(
      screen.getAllByText("Invite sent to ngozi@measured-health.example")
        .length,
    ).toBeGreaterThan(0);
  });

  it("an email already on the team is refused in words", async () => {
    renderWithAuth(<TeamView />);
    await screen.findByRole("table");
    await userEvent.click(
      screen.getByRole("button", { name: "Invite team member" }),
    );
    const d = screen.getByRole("dialog", { name: "Invite a team member" });
    await userEvent.type(within(d).getByLabelText("Name"), "Again");
    await userEvent.type(
      within(d).getByLabelText("Email"),
      "amara.eze@measured-health.example",
    );
    await userEvent.click(
      within(d).getByRole("button", { name: "Send invite" }),
    );
    expect(
      await within(d).findByText("That email is already on the team."),
    ).toBeInTheDocument();
  });

  it("your own row has no Change role", async () => {
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    expect(
      within(rowOf(table, "Ada Bakare")).queryByRole("button", {
        name: /Change role/,
      }),
    ).toBeNull();
    expect(
      within(rowOf(table, "Ada Bakare")).getByText(
        "You can't change your own role.",
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf(table, "Tunde Okafor")).getByRole("button", {
        name: "Change role for Tunde Okafor",
      }),
    ).toBeInTheDocument();
  });

  it("changing a role updates the row", async () => {
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Amara Eze")).getByRole("button", {
        name: "Change role for Amara Eze",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Change role for Amara Eze" });
    expect(within(d).getByLabelText("Auditor")).toBeChecked();
    await userEvent.click(within(d).getByLabelText("Platform admin"));
    await userEvent.click(within(d).getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    // Someone else changes her role first.
    const list = await api.listTeam();
    const amara = list.members.find((m) => m.name === "Amara Eze")!;
    await api.changeRole(
      amara.id,
      { role: "platform_admin", version: 1 },
      { idempotencyKey: "k-other" },
    );
    await userEvent.click(within(d).getByLabelText("Platform admin"));
    await userEvent.click(within(d).getByRole("button", { name: "Save role" }));
    expect(
      await within(d).findByText("Changed by someone else"),
    ).toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        within(rowOf(screen.getByRole("table"), "Amara Eze")).getByText(
          "Platform admin",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("removing the last platform admin shows the last-admin message", async () => {
    const api = install();
    const { members } = await api.listTeam();
    for (const m of members.filter(
      (x) => x.role === "platform_admin" && !x.is_you,
    ))
      await api.removeMember(
        m.id,
        { mfa_code: "123456" },
        { idempotencyKey: `k-${m.id}` },
      );
    renderWithAuth(<TeamView />);
    const table = await screen.findByRole("table");
    await userEvent.click(
      within(rowOf(table, "Ada Bakare")).getByRole("button", {
        name: "Remove Ada Bakare",
      }),
    );
    const d = screen.getByRole("dialog", { name: "Remove Ada Bakare?" });
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
      5,
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
    expect(within(table).getAllByRole("row")).toHaveLength(6);
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
    expect(items).toHaveLength(5);
    const kemi = items.find((i) => within(i).queryByText("Kemi Lawal"))!;
    expect(within(kemi).getByText("Invite pending")).toBeInTheDocument();
    expect(
      within(kemi).getByRole("button", { name: "Remove Kemi Lawal" }),
    ).toBeInTheDocument();
  });
});
