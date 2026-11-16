import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_DEMO_ACCOUNTS,
  LIVE_DEMO_PASSWORD,
  LIVE_DEMO_WRONG_PASSWORD,
} from "@/lib/auth/live-demo";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { DemoHint, MOCK_DEMO_PASSWORD } from "./demo-hint";

afterEach(() => vi.unstubAllEnvs());

describe("DemoHint", () => {
  it("offers the hospital admin, medical director and platform admin samples", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    const pick = vi.fn();
    render(<DemoHint onPick={pick} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: `Use Hospital admin (${DEMO_EMAILS.hospitalAdmin})`,
      }),
    );
    expect(pick).toHaveBeenCalledWith(
      DEMO_EMAILS.hospitalAdmin,
      MOCK_DEMO_PASSWORD,
    );
    expect(
      screen.getByRole("button", {
        name: `Use Medical director (${DEMO_EMAILS.director})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Use Platform admin (${DEMO_EMAILS.platformAdmin})`,
      }),
    ).toHaveTextContent("Shows the 403 page");
    expect(
      screen.getByRole("button", {
        name: `Use New hospital admin (${DEMO_EMAILS.newAdmin})`,
      }),
    ).toHaveTextContent("First sign-in steps");
    expect(screen.getByText(/Any email and password works/)).toBeVisible();
  });

  it("shows nothing outside the demo", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "false");
    const { container } = render(<DemoHint onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing in a live build without the demo flag", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO", "");
    const { container } = render(<DemoHint onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  describe("live demo", () => {
    const live = () => {
      vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
      vi.stubEnv("NEXT_PUBLIC_DEMO", "true");
      const pick = vi.fn();
      render(<DemoHint onPick={pick} />);
      return pick;
    };

    it("lists every seeded account and fills the published demo password", async () => {
      const pick = live();
      for (const a of LIVE_DEMO_ACCOUNTS)
        expect(
          screen.getByRole("button", { name: `Use ${a.label} (${a.email})` }),
        ).toHaveTextContent(a.note);
      await userEvent.click(
        screen.getByRole("button", {
          name: "Use Clinician (a.reyes@demo-hospital.example)",
        }),
      );
      expect(pick).toHaveBeenCalledWith(
        "a.reyes@demo-hospital.example",
        LIVE_DEMO_PASSWORD,
      );
    });

    it("says the accounts are shared and the password is published", () => {
      live();
      expect(screen.getByText(/Shared demo accounts/)).toBeVisible();
      expect(screen.getByText(/published on purpose/)).toBeVisible();
      expect(screen.getByText(/never type patient details/)).toBeVisible();
      expect(screen.queryByText(/Any email and password works/)).toBeNull();
    });

    it("fills a wrong password for the locked account", async () => {
      const pick = live();
      await userEvent.click(
        screen.getByRole("button", {
          name: "Use Locked account (locked.eze@demo-hospital.example)",
        }),
      );
      expect(pick).toHaveBeenCalledWith(
        "locked.eze@demo-hospital.example",
        LIVE_DEMO_WRONG_PASSWORD,
      );
      expect(
        screen.getByRole("button", { name: /Use Locked account/ }),
      ).toHaveTextContent("Every try fails; the fifth locks it");
    });
  });
});
