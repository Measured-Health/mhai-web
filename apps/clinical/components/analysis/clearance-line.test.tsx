import { screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "@/lib/api/analysis";
import { resetAudit } from "@/lib/api/mock-audit";
import { resetClearances } from "@/lib/api/mock-clearances";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import type { User } from "@/lib/auth/types";
import { screenAdminAs } from "@/tests/admin";
import { GRACE, KEMI, OBI, analysisAs, renderSignedIn } from "@/tests/named";

const holder = vi.hoisted(() => ({
  client: null as unknown as AnalysisClient,
}));
vi.mock("@/lib/api/analysis", () => ({
  getAnalysisClient: () => holder.client,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/analysis",
}));
import { AnalysisView } from "./analysis-view";
import { ClearanceLine } from "./clearance-line";

let qc: QueryClient;
beforeEach(() => {
  resetClearances();
  resetAudit();
  qc = new QueryClient();
});

function line(
  user: User,
  namedAccess: "off" | "letters_only" | "on" = "on",
  over: Partial<AnalysisClient> = {},
) {
  holder.client = {
    ...analysisAs(user, screenAdminAs(DEMO_EMAILS.director), namedAccess),
    ...over,
  };
  return renderSignedIn(
    <div data-testid="line">
      <ClearanceLine />
    </div>,
    user,
    qc,
  );
}

const UNTIL = /^Named access until \d{1,2} \w{3} \d{4} · letter on file/;

describe("ClearanceLine", () => {
  it("the Analysis page shows Named access until … · letter on file for Grace", async () => {
    holder.client = analysisAs(GRACE, screenAdminAs(DEMO_EMAILS.director));
    renderSignedIn(<AnalysisView today="2026-10-22" />, GRACE, qc);
    const text = await screen.findByText(UNTIL);
    expect(text.textContent).toMatch(
      /^Named access until \d{1,2} \w{3} \d{4} · letter on file$/,
    );
    // Grace's letter ends months away: no countdown, and a word with the icon.
    expect(text.querySelector("svg")).not.toBeNull();
  });

  it("adds ends in n days when the access ends within 30 days", async () => {
    // Kemi's letter ends in 12 days (the hospital's day; the viewer's zone may differ by one).
    line(KEMI);
    const text = await screen.findByText(UNTIL);
    expect(text.textContent).toMatch(/ · ends in 1[123] days$/);
  });

  it("says No named access for Dr. Obi, who has only a waiting letter", async () => {
    line(OBI);
    expect(await screen.findByText("No named access")).toBeVisible();
  });

  it("a named reply whose until has passed reads No named access", async () => {
    line(GRACE, "on", {
      getClearanceMe: async () => ({
        named: true,
        until: new Date(Date.now() - 60_000).toISOString(),
        clearance_id: "cl_act",
        version: 1,
        reason: null,
      }),
    });
    expect(await screen.findByText("No named access")).toBeVisible();
    expect(screen.queryByText(UNTIL)).toBeNull();
  });

  it("shows nothing below On, and asks nothing", async () => {
    for (const position of ["off", "letters_only"] as const) {
      const getMe = vi.fn();
      const view = line(GRACE, position, { getClearanceMe: getMe });
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.getByTestId("line")).toBeEmptyDOMElement();
      expect(getMe).not.toHaveBeenCalled();
      view.unmount();
      qc = new QueryClient();
    }
  });

  it("shows nothing to someone without named access", async () => {
    const getAccess = vi.fn();
    line({ ...KEMI, features: { analysis: true } }, "on", {
      getNamedAccess: getAccess,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("line")).toBeEmptyDOMElement();
    expect(getAccess).not.toHaveBeenCalled();
  });
});
