import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { QueryCreateIn } from "@/lib/api/contract";
import { useSession, type SessionItem } from "@/lib/session-store";
import { TEST_USER } from "@/tests/auth-wrapper";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => search,
}));
const createQuery = vi.fn(async () => ({ query_id: "q2" }));
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({
    createQuery,
    getReadiness: async () => ({ ok: true, degraded_services: [] }),
  }),
}));

import Page from "@/app/(clinical)/(clinician)/page";
import { AppShell } from "@/components/shell/app-shell";

const QUERY: QueryCreateIn = {
  clinical_question: "Central chest pain for 40 min. Likely diagnosis?",
  urgency: "urgent",
  specialty: "Emergency",
  patient_data: {
    age: 54,
    sex: "male",
    symptoms: ["Chest pain"],
    medical_history: "Smoker",
  },
};
const ITEM: SessionItem = {
  id: "q1",
  title: "Chest pain, 54 M",
  urgency: "urgent",
  createdAt: 1,
  kind: "failed",
  query: QUERY,
};
function Seeded({ children }: { children: ReactNode }) {
  const s = useSession();
  const { add } = s;
  useEffect(() => add(ITEM), [add]);
  return s.get("q1") ? children : null;
}

const mount = async (node: ReactNode) => {
  await act(async () => {
    render(<Providers>{node}</Providers>);
  });
};

beforeEach(() => {
  search = new URLSearchParams();
  push.mockClear();
  createQuery.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("Home", () => {
  it("welcomes a first visit and fills the form from an example, then submits", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await mount(<Page />);
    expect(
      screen.getByRole("heading", { name: "Ask your first clinical question" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(screen.getByLabelText(/^Age/)).toHaveValue("3");
    expect(screen.getByText("Draft · not submitted")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    // Next keeps the page mounted, so the form must be fresh for next time.
    await vi.waitFor(
      () => expect(screen.getByLabelText(/^Age/)).toHaveValue(""),
      { timeout: 5000 }, // a transition; slow under a parallel full run
    );
    expect(createQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_data: expect.objectContaining({ age: 3, sex: "female" }),
      }),
      { idempotencyKey: expect.any(String) },
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("goes straight to the form once the session has history", async () => {
    await mount(
      <Seeded>
        <Page />
      </Seeded>,
    );
    expect(
      screen.getByRole("heading", {
        name: "What's going on with your patient?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue("");
  });

  it("pre-fills the form from ?edit=<id> after a failed query", async () => {
    search = new URLSearchParams("edit=q1");
    await mount(
      <Seeded>
        <Page />
      </Seeded>,
    );
    expect(screen.getByLabelText(/^Age/)).toHaveValue("54");
    expect(screen.getByLabelText(/^Clinical question/)).toHaveValue(
      QUERY.clinical_question,
    );
    expect(screen.getByLabelText(/^Specialty area/)).toHaveValue("Emergency");
    expect(screen.getByLabelText(/^Medical history/)).toHaveValue("Smoker");
    expect(screen.getByRole("radio", { name: "Male" })).toBeChecked();
  });

  it("offline, Analyse saves the question and shows Waiting to send in place", async () => {
    await new Promise<void>((r) => {
      const req = indexedDB.deleteDatabase("mhai-outbox");
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const pushState = vi.spyOn(window.history, "pushState");
    const tree = () => (
      <Providers auth={{ initialUser: TEST_USER }}>
        <Seeded>
          <Page />
        </Seeded>
      </Providers>
    );
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(tree());
    });
    search = new URLSearchParams("edit=q1");
    view.rerender(tree());
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(pushState).toHaveBeenCalled());
    expect(createQuery).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    const url = String(pushState.mock.calls[0]![2]);
    expect(url).toMatch(/^\/\?waiting=local-/);
    search = new URLSearchParams(url.slice(2));
    view.rerender(tree());
    expect(
      await screen.findByRole("heading", { name: "Waiting to send" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/saved securely on this device/)).toBeVisible();
  });

  it("asks before New consultation mid-draft, and Discard gives a clean form", async () => {
    await mount(
      <Seeded>
        <AppShell>
          <Page />
        </AppShell>
      </Seeded>,
    );
    await userEvent.type(screen.getByLabelText(/^Age/), "54");
    await userEvent.click(
      screen.getAllByRole("link", { name: /New consultation/ })[0],
    );
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveValue("54");
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(push).toHaveBeenCalledWith("/");
    expect(screen.getByLabelText(/^Age/)).toHaveValue("");
    expect(screen.queryByText("Draft · not submitted")).not.toBeInTheDocument();
  });
});
