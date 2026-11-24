import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/lib/auth/auth-context";
import {
  MOCK_CODE,
  MOCK_NEW_TOTP_SECRET,
  REPLACE_MS,
  createMockAuthClient,
} from "@/lib/auth/mock";
import { SessionProvider } from "@/lib/session-store";
import { TEST_USER } from "@/tests/auth-wrapper";
import { MoveAppDialog, TOO_LONG } from "./move-app-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
}));

const DONE =
  "Your old app no longer works. Remembered devices have been signed out; your backup codes haven't changed.";

/** The Account page's part: the dialog closes by unmounting its content. */
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && <p>Closed</p>}
      <MoveAppDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

async function setup() {
  let t = 1_700_000_000_000;
  const client = createMockAuthClient({ now: () => t });
  await client.signIn("mfa.okafor@pilot-hospital.example", "pw");
  await client.verifyCode(MOCK_CODE, { backup: false, trustDevice: false });
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <AuthProvider
          client={client}
          initialUser={{ ...TEST_USER, mfaEnabled: true }}
        >
          <Harness />
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  /** Everything the query and mutation caches still hold. */
  const cached = () =>
    JSON.stringify([
      qc
        .getMutationCache()
        .getAll()
        .map((m) => [m.state.variables, m.state.data]),
      qc
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    ]);
  return {
    cached,
    later: (ms: number) => {
      t += ms;
    },
  };
}

const typeCode = async (code: string) => {
  await userEvent.click(screen.getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
};

/** The step-up, then the new app's QR code on screen. */
async function toScan() {
  expect(
    screen.getByText(/Your current app keeps working until you finish/),
  ).toBeInTheDocument();
  await typeCode(MOCK_CODE);
  expect(
    await screen.findByRole("img", {
      name: "QR code for your authenticator app",
    }),
  ).toBeInTheDocument();
}

/** The key as shown, in groups of four. */
const GROUPED = MOCK_NEW_TOTP_SECRET.match(/.{1,4}/g)!.join(" ");
const keyShown = () => screen.queryByText(GROUPED);

describe("Move to a new authenticator app", () => {
  it("step-up, QR code and key, then the new app's code: done, and nothing left behind", async () => {
    const { cached } = await setup();
    await toScan();
    await userEvent.click(
      screen.getByRole("button", { name: "Can't scan? Show key" }),
    );
    expect(keyShown()).toBeInTheDocument();
    // The step-up's code and the key never stay in the cache.
    await waitFor(() => expect(cached()).not.toContain(MOCK_NEW_TOTP_SECRET));
    expect(cached()).not.toContain("mfa_code");
    await typeCode(MOCK_CODE);
    expect(
      await screen.findByText("Your new app is set up."),
    ).toBeInTheDocument();
    expect(screen.getByText(DONE)).toBeInTheDocument();
    expect(keyShown()).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    await waitFor(() => expect(cached()).not.toContain(MOCK_CODE));
    expect(document.title).not.toContain(MOCK_NEW_TOTP_SECRET);
    expect(window.location.href).not.toContain(MOCK_NEW_TOTP_SECRET);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("a wrong current code is refused, cleared and focused", async () => {
    await setup();
    await typeCode("000000");
    expect(
      await screen.findByText("That code didn't work."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveFocus();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("a wrong code from the new app is refused; the QR code stays to try again", async () => {
    await setup();
    await toScan();
    await typeCode("000000");
    expect(
      await screen.findByText("That code didn't work."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(
      screen.getByRole("img", { name: "QR code for your authenticator app" }),
    ).toBeInTheDocument();
    await typeCode(MOCK_CODE);
    expect(await screen.findByText(DONE)).toBeInTheDocument();
  });

  it("after 15 minutes: That took too long. Start again, with the key gone", async () => {
    const { later, cached } = await setup();
    await toScan();
    await userEvent.click(
      screen.getByRole("button", { name: "Can't scan? Show key" }),
    );
    later(REPLACE_MS + 1);
    await typeCode(MOCK_CODE);
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(keyShown()).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    await waitFor(() => expect(cached()).not.toContain(MOCK_NEW_TOTP_SECRET));
    await userEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(
      screen.getByText(/Your current app keeps working until you finish/),
    ).toBeInTheDocument();
    await toScan();
  });

  it("Cancel on the QR code step clears the key", async () => {
    const { cached } = await setup();
    await toScan();
    await userEvent.click(
      screen.getByRole("button", { name: "Can't scan? Show key" }),
    );
    expect(keyShown()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(keyShown()).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.body.textContent).not.toContain(GROUPED);
    await waitFor(() => expect(cached()).not.toContain(MOCK_NEW_TOTP_SECRET));
  });
});
