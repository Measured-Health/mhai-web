import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { TEST_USER } from "@/tests/auth-wrapper";
import type { ClinicalResultOut, QueryCreateIn } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { FIXTURES } from "@/lib/api/fixtures";
import { useSession, type SessionItem } from "@/lib/session-store";

const push = vi.fn();
const replace = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/c/q1",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => notFound(),
}));
const createQuery = vi.fn(
  async (q: QueryCreateIn): Promise<{ query_id: string }> => {
    void q;
    return { query_id: "q2" };
  },
);
const sendFeedback = vi.fn(async () => ({ status: "recorded" }));
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ createQuery, sendFeedback }),
}));

type Status = {
  status?: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage: null;
  stalled: boolean;
  error: null;
};
const status = vi.fn((): Status => ({
  status: "processing",
  progress: 0.3,
  stage: null,
  stalled: false,
  error: null,
}));
const result = vi.fn((): { data?: ClinicalResultOut; isError: boolean } => ({
  data: undefined,
  isError: false,
}));
vi.mock("@/lib/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/queries")>()),
  useQueryStatus: () => status(),
  useResult: () => result(),
}));

import { AppShell } from "../shell/app-shell";
import { ConsultationView } from "./consultation-view";

const QUERY: QueryCreateIn = {
  clinical_question: "Central chest pain for 40 min. Likely diagnosis?",
  urgency: "urgent",
  patient_data: { age: 54, sex: "male", symptoms: ["Chest pain"] },
};
const ITEM: SessionItem = {
  id: "q1",
  title: "Chest pain, 54 M",
  urgency: "urgent",
  createdAt: 1,
  query: QUERY,
};

function Seeded({ children }: { children: ReactNode }) {
  const s = useSession();
  const { add } = s;
  useEffect(() => add(ITEM), [add]);
  const item = s.get("q1");
  return item ? (
    <>
      <output data-testid="item">
        {[item.title, item.kind, item.diagnosis ?? "-"].join("|")}
      </output>
      <output data-testid="label">{String(item.confidenceLabel)}</output>
      {children}
    </>
  ) : null;
}
class Boundary extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    return this.state.err ? <p>not found page</p> : this.props.children;
  }
}

const mountInShell = (id = "q1") =>
  render(
    <Providers auth={{ initialUser: TEST_USER }}>
      <AppShell>
        <Seeded>
          <ConsultationView id={id} />
        </Seeded>
      </AppShell>
    </Providers>,
  );
const mount = (id = "q1") =>
  render(
    <Providers auth={{ initialUser: TEST_USER }}>
      <Seeded>
        <ConsultationView id={id} />
      </Seeded>
    </Providers>,
  );

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  createQuery.mockClear();
  sendFeedback.mockClear();
  notFound.mockClear();
  status.mockReset().mockReturnValue({
    status: "processing",
    progress: 0.3,
    stage: null,
    stalled: false,
    error: null,
  });
  result.mockReset().mockReturnValue({ data: undefined, isError: false });
});
afterEach(() => vi.restoreAllMocks());

describe("ConsultationView", () => {
  it("shows Waiting to send for a question saved offline, without polling", async () => {
    const LOCAL: SessionItem = { ...ITEM, id: "local-1", pending: "waiting" };
    function SeedLocal({ children }: { children: ReactNode }) {
      const { add, get } = useSession();
      useEffect(() => add(LOCAL), [add]);
      return get("local-1") ? children : null;
    }
    status.mockClear();
    render(
      <Providers auth={{ initialUser: TEST_USER }}>
        <SeedLocal>
          <ConsultationView id="local-1" />
        </SeedLocal>
      </Providers>,
    );
    expect(
      await screen.findByRole("heading", { name: "Waiting to send" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Analysing your question" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Edit question/ }),
    );
    expect(push).toHaveBeenCalledWith("/?edit=local-1");
  });

  it("shows the analysing view while the query runs", async () => {
    mount();
    expect(
      await screen.findByRole("heading", { name: "Analysing your question" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: ITEM.title })).toBeVisible();
  });

  it("shows Couldn't complete when the query fails, keeps the inputs, and Edit question goes to the pre-filled form", async () => {
    status.mockReturnValue({
      status: "failed",
      progress: 0.5,
      stage: null,
      stalled: false,
      error: null,
    });
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "We couldn't complete this one",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/didn't respond in time/)).toBeInTheDocument();
    expect(screen.getByTestId("item")).toHaveTextContent("|failed|");
    await userEvent.click(
      screen.getByRole("button", { name: /Edit question/ }),
    );
    expect(push).toHaveBeenCalledWith("/?edit=q1");
  });

  it("shows Couldn't complete when the query stalls", async () => {
    status.mockReturnValue({
      status: "processing",
      progress: 0.3,
      stage: null,
      stalled: true,
      error: null,
    });
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "We couldn't complete this one",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/taking much longer than usual/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Edit question/ }),
    );
    expect(push).toHaveBeenCalledWith("/?edit=q1");
  });

  it("Try again resubmits the same inputs and opens the new consultation", async () => {
    status.mockReturnValue({
      status: "failed",
      progress: 0.5,
      stage: null,
      stalled: false,
      error: null,
    });
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: /Try again/ }),
    );
    expect(createQuery).toHaveBeenCalledWith(QUERY, {
      idempotencyKey: expect.any(String),
    });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/c/q2"));
  });

  it("shows the result and records its kind, title and diagnosis in the session", async () => {
    status.mockReturnValue({
      status: "completed",
      progress: 1,
      stage: null,
      stalled: false,
      error: null,
    });
    result.mockReturnValue({ data: FIXTURES.high, isError: false });
    mount();
    const dx = FIXTURES.high.diagnosis!;
    const card = (
      await screen.findByRole("heading", { name: dx, level: 2 })
    ).closest("article")!;
    expect(within(card).getByRole("button", { name: /I agree/ })).toBeVisible();
    expect(screen.getByTestId("item")).toHaveTextContent(`${dx}|high|${dx}`);
    expect(
      screen.getByRole("button", { name: /Evidence panel/ }),
    ).toHaveAttribute("aria-pressed", "true");
    // The evidence text is in the side panel and in the (closed) sheet.
    expect(
      within(
        screen.getByRole("complementary", { name: "Evidence and safety" }),
      ).getAllByText(/Sources used/i).length,
    ).toBeGreaterThan(0);
  });

  it("records the confidence label the screen showed, or null when it showed none", async () => {
    status.mockReturnValue({
      status: "completed",
      progress: 1,
      stage: null,
      stalled: false,
      error: null,
    });
    result.mockReturnValue({ data: FIXTURES.high, isError: false });
    const a = mount();
    await vi.waitFor(() =>
      expect(screen.getByTestId("label")).toHaveTextContent("High confidence"),
    );
    a.unmount();
    result.mockReturnValue({
      data: { ...FIXTURES.high, trust_score: null },
      isError: false,
    });
    mount();
    await vi.waitFor(() =>
      expect(screen.getByTestId("item")).toHaveTextContent("|high|"),
    );
    expect(screen.getByTestId("label")).toHaveTextContent("null");
  });

  it("shows the 404 page for an unknown or ended consultation", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Providers auth={{ initialUser: TEST_USER }}>
        <Boundary>
          <ConsultationView id="nope" />
        </Boundary>
      </Providers>,
    );
    expect(notFound).toHaveBeenCalled();
    expect(screen.getByText("not found page")).toBeInTheDocument();
  });

  it("tells the clinician when Try again fails, and keeps both actions", async () => {
    createQuery.mockRejectedValueOnce(new ApiError(422, "validation_failed"));
    status.mockReturnValue({
      status: "failed",
      progress: 0.5,
      stage: null,
      stalled: false,
      error: null,
    });
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: /Try again/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn't send it again/,
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Edit question/ })).toBeEnabled();
  });

  it("shows the review banner and no confidence level for a needs-review result", async () => {
    status.mockReturnValue({
      status: "completed",
      progress: 1,
      stage: null,
      stalled: false,
      error: null,
    });
    result.mockReturnValue({
      data: { ...FIXTURES.high, degraded: true },
      isError: false,
    });
    mount();
    const card = (
      await screen.findByRole("heading", {
        name: FIXTURES.high.diagnosis!,
        level: 2,
      })
    ).closest("div.mx-auto")! as HTMLElement;
    expect(
      within(card).getByText(
        "This result needs clinician review before any clinical action is taken",
      ),
    ).toBeInTheDocument();
    expect(
      within(card).queryByRole("status", { name: /confidence/i }),
    ).not.toBeInTheDocument();
    expect(within(card).getByText(/Possible assessment/)).toBeInTheDocument();
    expect(screen.getByTestId("item")).toHaveTextContent("|review|");
  });

  describe("keyboard shortcuts", () => {
    const writeText = vi.fn(async () => {});
    beforeEach(() => {
      writeText.mockClear();
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
    });
    const keys = async () => {
      await userEvent.keyboard("a");
      await userEvent.keyboard("c");
      await userEvent.keyboard("e");
      await userEvent.keyboard("{Shift>}c{/Shift}");
      await userEvent.keyboard("{Control>}p{/Control}");
    };

    it("do nothing while analysing", async () => {
      mount();
      await screen.findByRole("heading", { name: "Analysing your question" });
      await keys();
      expect(sendFeedback).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    describe("on a result", () => {
      beforeEach(() => {
        status.mockReturnValue({
          status: "completed",
          progress: 1,
          stage: null,
          stalled: false,
          error: null,
        });
        result.mockReturnValue({ data: FIXTURES.high, isError: false });
      });
      const ready = () =>
        screen.findByRole("button", { name: /Evidence panel/ });

      it("e toggles the evidence panel", async () => {
        mount();
        const btn = await ready();
        expect(btn).toHaveAttribute("aria-pressed", "true");
        await userEvent.keyboard("e");
        expect(btn).toHaveAttribute("aria-pressed", "false");
      });
      it("a agrees", async () => {
        mount();
        await ready();
        await userEvent.keyboard("a");
        expect(sendFeedback).toHaveBeenCalledTimes(1);
        expect(
          await screen.findByText(/your agreement was recorded/),
        ).toBeInTheDocument();
      });
      it("a does nothing on a needs-review result; Mark as reviewed needs the button", async () => {
        result.mockReturnValue({ data: FIXTURES.review, isError: false });
        mount();
        await ready();
        await userEvent.keyboard("a");
        expect(sendFeedback).not.toHaveBeenCalled();
        expect(
          screen.queryByText(/your agreement was recorded/),
        ).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole("button", { name: /Mark as reviewed/ }),
        );
        expect(sendFeedback).toHaveBeenCalledTimes(1);
      });
      it("c opens the correction form", async () => {
        mount();
        await ready();
        await userEvent.keyboard("c");
        expect(
          screen.getByText(/A second clinician reviews every correction/),
        ).toBeInTheDocument();
      });
      it("shift+c copies the result", async () => {
        mount();
        await ready();
        await userEvent.keyboard("{Shift>}c{/Shift}");
        expect(writeText).toHaveBeenCalledTimes(1);
      });
      it("mod+p goes to the print page through the navigation guard", async () => {
        mount();
        await ready();
        await userEvent.keyboard("{Control>}p{/Control}");
        expect(push).toHaveBeenCalledWith("/print/q1");
      });
      it("mod+p with an open but empty correction form just goes to print", async () => {
        mountInShell();
        await ready();
        await userEvent.keyboard("c");
        await userEvent.keyboard("{Control>}p{/Control}");
        expect(push).toHaveBeenCalledWith("/print/q1");
      });
    });
  });

  describe("a correction being typed", () => {
    beforeEach(() => {
      status.mockReturnValue({
        status: "completed",
        progress: 1,
        stage: null,
        stalled: false,
        error: null,
      });
      result.mockReturnValue({ data: FIXTURES.high, isError: false });
    });
    const DIALOG = { name: "Discard this draft?" };
    const typeCorrection = async () => {
      mountInShell();
      await screen.findByRole("button", { name: /Evidence panel/ });
      await userEvent.click(
        screen.getByRole("button", { name: /Suggest correction/ }),
      );
      await userEvent.type(
        screen.getByLabelText(/What should the diagnosis/),
        "Pericarditis",
      );
    };
    const expectKept = async () => {
      expect(screen.getByRole("dialog", DIALOG)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole("button", { name: "Keep editing" }),
      );
      expect(screen.getByLabelText(/What should the diagnosis/)).toHaveValue(
        "Pericarditis",
      );
    };

    it("asks before the Export menu's Print link discards it", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      await typeCorrection();
      await userEvent.click(
        screen.getByRole("button", { name: "More export options" }),
      );
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Print or save as PDF/ }),
      );
      await expectKept();
      expect(setItem).not.toHaveBeenCalled();
    });

    it("asks before a sidebar link discards it", async () => {
      await typeCorrection();
      await userEvent.click(
        screen.getAllByRole("link", { name: /New consultation/ })[0],
      );
      await expectKept();
    });

    it("asks before the N shortcut and mod+p discard it; Discard then leaves", async () => {
      await typeCorrection();
      (document.activeElement as HTMLElement).blur();
      await userEvent.keyboard("n");
      await expectKept();
      await userEvent.keyboard("{Control>}p{/Control}");
      expect(screen.getByRole("dialog", DIALOG)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Discard" }));
      expect(push).toHaveBeenCalledWith("/print/q1");
    });

    it("asks before a command palette row discards it", async () => {
      await typeCorrection();
      await userEvent.keyboard("{Control>}k{/Control}");
      const search = await screen.findByRole("combobox");
      await userEvent.type(search, "New consultation{Enter}");
      expect(screen.getByRole("dialog", DIALOG)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });
});
