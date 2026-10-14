import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { QueryCreateIn } from "@/lib/api/contract";
import { useSession, type SessionItem } from "@/lib/session-store";

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

import Page from "@/app/(clinical)/page";
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
    await vi.waitFor(() =>
      expect(screen.getByLabelText(/^Age/)).toHaveValue(""),
    );
    expect(createQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_data: expect.objectContaining({ age: 3, sex: "female" }),
      }),
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

describe("Home after an idle sign-out", () => {
  afterEach(() => vi.useRealTimers());
  // Wall clock jumps 16 minutes; the idle check runs on the wake event.
  const idleOut = () =>
    act(() => {
      vi.setSystemTime(Date.now() + 16 * 60_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });
  const NOTICE = /signed out after 15 minutes of inactivity/;

  it("explains the sign-out until dismissed, and stores nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await mount(<Page />);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    idleOut();
    expect(push).toHaveBeenCalledWith("/");
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(
      screen.getByText(/Unsaved work was cleared to protect patient data/),
    ).toBeInTheDocument();
    // Persistent: still there well after a toast would have gone.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3500));
    });
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it("clears the notice when the next consultation is started", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await mount(<Page />);
    idleOut();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/c/q2"));
    await vi.waitFor(() =>
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument(),
    );
  });
});
