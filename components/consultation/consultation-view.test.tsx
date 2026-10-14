import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { ClinicalResultOut, QueryCreateIn } from "@/lib/api/contract";
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
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ createQuery }),
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

const mount = (id = "q1") =>
  render(
    <Providers>
      <Seeded>
        <ConsultationView id={id} />
      </Seeded>
    </Providers>,
  );

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  createQuery.mockClear();
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
    expect(createQuery).toHaveBeenCalledWith(QUERY);
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

  it("shows the 404 page for an unknown or ended consultation", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Providers>
        <Boundary>
          <ConsultationView id="nope" />
        </Boundary>
      </Providers>,
    );
    expect(notFound).toHaveBeenCalled();
    expect(screen.getByText("not found page")).toBeInTheDocument();
  });

  it("tells the clinician when Try again fails, and keeps both actions", async () => {
    createQuery.mockRejectedValueOnce(new Error("offline"));
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
});
