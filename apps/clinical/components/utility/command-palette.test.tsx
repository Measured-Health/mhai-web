import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { TEST_USER } from "@/tests/auth-wrapper";
import { AppShell, useShell } from "../shell/app-shell";
import { useSession, type SessionItem } from "@/lib/session-store";
import { CommandPalette, searchItems } from "./command-palette";

const it1: SessionItem = {
  id: "1",
  title: "Febrile child, 3 F",
  urgency: "urgent",
  createdAt: 0,
  kind: "caution",
  confidenceLabel: "Use with caution",
  query: {
    patient_data: { age: 3, sex: "female", symptoms: ["Fever", "Rash"] },
    clinical_question: "x",
    urgency: "urgent",
  },
};
const it2: SessionItem = {
  ...it1,
  id: "2",
  title: "Post-op fever, day 2",
  kind: "high",
  confidenceLabel: "High confidence",
};
const it3: SessionItem = {
  ...it1,
  id: "3",
  title: "Chest pain, 54 M",
  kind: "high",
  confidenceLabel: "High confidence",
  query: {
    ...it1.query,
    patient_data: { ...it1.query.patient_data, symptoms: ["Chest pain"] },
  },
};

describe("searchItems", () => {
  it("matches title and symptoms case-insensitively", () => {
    expect(searchItems([it1, it2, it3], "FEV").map((i) => i.id)).toEqual([
      "1",
      "2",
    ]);
  });
  it("matches the plain-language result label", () => {
    expect(searchItems([it1, it3], "caution").map((i) => i.id)).toEqual(["1"]);
  });
  it("matches the diagnosis as well as the title", () => {
    const d = { ...it3, diagnosis: "Acute coronary syndrome" };
    expect(searchItems([it1, d], "coronary").map((i) => i.id)).toEqual(["3"]);
    expect(searchItems([it1, d], "chest").map((i) => i.id)).toEqual(["3"]);
  });
  it("matches 'Completed', not a confidence level, when none was shown", () => {
    const none = { ...it3, confidenceLabel: null };
    expect(searchItems([none], "high")).toEqual([]);
    expect(searchItems([none], "completed").map((i) => i.id)).toEqual(["3"]);
  });
  it("returns everything for an empty query", () => {
    expect(searchItems([it1, it2], "  ")).toHaveLength(2);
  });
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
}));

function Seed({
  guard,
  children,
}: {
  guard?: (h: string) => boolean;
  children?: React.ReactNode;
}) {
  const { add } = useSession();
  const { setNavigationGuard, openSearch } = useShell();
  useEffect(() => {
    add(it1);
  }, [add]);
  useEffect(() => {
    setNavigationGuard(guard ?? null);
  }, [guard, setNavigationGuard]);
  return (
    <>
      <button onClick={openSearch}>trigger</button>
      {children}
    </>
  );
}
const ui = (guard?: (h: string) => boolean) => (
  <Providers auth={{ initialUser: TEST_USER }}>
    <AppShell>
      <Seed guard={guard} />
    </AppShell>
  </Providers>
);

describe("CommandPalette", () => {
  beforeEach(() => push.mockClear());

  it("opens on mod+k, finds by search, opens the item with Enter", async () => {
    render(ui());
    await userEvent.keyboard("{Control>}k{/Control}");
    const box = await screen.findByRole("combobox");
    await userEvent.type(box, "fev{Enter}");
    expect(push).toHaveBeenCalledWith("/c/1");
  });

  it("is blocked by the navigation guard", async () => {
    const guard = vi.fn(() => false);
    render(ui(guard));
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await screen.findByRole("combobox"), "fev{Enter}");
    expect(guard).toHaveBeenCalledWith("/c/1");
    expect(push).not.toHaveBeenCalled();
  });

  it("N is blocked by the guard too", async () => {
    const guard = vi.fn(() => false);
    render(ui(guard));
    await userEvent.keyboard("n");
    expect(guard).toHaveBeenCalledWith("/");
    expect(push).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger when closed with Escape", async () => {
    render(ui());
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("starts empty each time it opens", async () => {
    render(ui());
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.type(await screen.findByRole("combobox"), "zzz");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox")).toHaveValue("");
  });

  it("renders nothing when closed", () => {
    render(
      <Providers auth={{ initialUser: TEST_USER }}>
        <CommandPalette open={false} onClose={() => {}} />
      </Providers>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("shortcuts dialog", () => {
  it("opens on ?", async () => {
    render(ui());
    await userEvent.keyboard("?");
    expect(
      await screen.findByRole("heading", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
  });
});

describe("mobile drawer", () => {
  it("closes when search opens", async () => {
    function Open() {
      const { openDrawer, openSearch } = useShell();
      return (
        <>
          <button onClick={openDrawer}>drawer</button>
          <button onClick={openSearch}>search</button>
        </>
      );
    }
    render(
      <Providers auth={{ initialUser: TEST_USER }}>
        <AppShell>
          <Open />
        </AppShell>
      </Providers>,
    );
    await userEvent.click(screen.getByRole("button", { name: "drawer" }));
    const menu = screen.getByRole("dialog", { name: "Menu" });
    expect(menu.parentElement).not.toHaveAttribute("inert");
    await userEvent.click(screen.getByRole("button", { name: "search" }));
    expect(menu.parentElement).toHaveAttribute("inert");
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("labels a row 'Completed' when the result showed no confidence", async () => {
    function SeedNone() {
      const { add } = useSession();
      useEffect(() => add({ ...it3, confidenceLabel: null }), [add]);
      return null;
    }
    render(
      <Providers auth={{ initialUser: TEST_USER }}>
        <AppShell>
          <SeedNone />
        </AppShell>
      </Providers>,
    );
    await userEvent.keyboard("{Control>}k{/Control}");
    const row = await screen.findByRole("option", { name: /Chest pain/ });
    expect(row).toHaveTextContent("Completed");
    expect(row).not.toHaveTextContent("High confidence");
  });
});
