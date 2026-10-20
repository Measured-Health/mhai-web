import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../ui/toast";
import { DemoRibbon } from "./demo-ribbon";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

const ui = () => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
  return render(
    <ToastProvider>
      <DemoRibbon />
    </ToastProvider>,
  );
};
const MESSAGE = "The banner is easy to miss on mobile.";

async function openAndType(text = MESSAGE) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Give feedback/ }));
  await user.type(screen.getByLabelText("Your feedback"), text);
  return user;
}

describe("DemoRibbon", () => {
  it("labels the build as sample data", () => {
    ui();
    expect(
      screen.getByText(/sample data, not for clinical use/),
    ).toBeInTheDocument();
  });

  it("is absent outside mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const { container } = render(<DemoRibbon />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends the message, masked page and screen size, then thanks", async () => {
    window.history.pushState({}, "", "/c/abc123?q=secret");
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    ui();
    const user = await openAndType();
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText("Thanks, the team has it");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/feedback");
    const sent = JSON.parse(String(init.body));
    expect(sent.message).toBe(MESSAGE);
    expect(sent.page).toBe("/c/[id]");
    expect(JSON.stringify(sent)).not.toMatch(/abc123|secret/);
  });

  it("explains a too-short message without sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    ui();
    const user = await openAndType("too short");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 10/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers email when sending isn't available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "unavailable" }, { status: 503 }),
      ),
    );
    ui();
    const user = await openAndType();
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    const link = await screen.findByRole("link", { name: /Email the team/ });
    expect(link.getAttribute("href")).toMatch(
      /^mailto:info\.measuredhealth@gmail\.com/,
    );
  });

  it("says when there have been too many messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "rate_limited" }, { status: 429 }),
      ),
    );
    ui();
    const user = await openAndType();
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /try again in a few minutes/,
      ),
    );
  });
});
