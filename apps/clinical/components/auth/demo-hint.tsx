import { isLiveDemoBuild, isMockBuild } from "@/lib/demo";
import { LIVE_DEMO_ACCOUNTS, LIVE_DEMO_PASSWORD } from "@/lib/auth/live-demo";
import { SAMPLE_ACCOUNTS } from "@/lib/auth/mock";

/** What the mock demo fills as the password: any password works there. */
export const MOCK_DEMO_PASSWORD = "demo-password";

type OnPick = (email: string, password: string) => void;

const box =
  "mt-6 rounded-2xl border border-dashed border-lilac-2 bg-lilac/40 p-4 text-[12.5px] leading-relaxed text-ink-2";

function Accounts({
  accounts,
  onPick,
}: {
  accounts: readonly { email: string; label: string; note: string }[];
  onPick(email: string): void;
}) {
  return (
    <ul className="my-2 flex flex-col gap-1.5">
      {accounts.map(({ email, label, note }) => (
        <li key={email}>
          <button
            type="button"
            aria-label={`Use ${label} (${email})`}
            onClick={() => onPick(email)}
            className="flex min-h-11 w-full flex-col justify-center rounded-xl border border-lilac-2 bg-white/70 px-3 text-left hover:bg-white"
          >
            <b className="text-ink">{label}</b>
            <span className="text-ink-3">{note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * How testers reach each sign-in state in the demo: the sample accounts in
 * mock mode, the seeded demo accounts in the live demo
 * (NEXT_PUBLIC_DEMO=true). Nothing in any other build.
 */
export function DemoHint({ onPick }: { onPick: OnPick }) {
  if (isMockBuild())
    return (
      <aside aria-label="Demo sign-in" className={box}>
        <b className="block text-ink">Demo sign-in</b>
        <Accounts
          accounts={SAMPLE_ACCOUNTS}
          onPick={(e) => onPick(e, MOCK_DEMO_PASSWORD)}
        />
        Any email and password works. The two-step code is{" "}
        <code className="font-mono">123456</code>. To see an error, use the
        password <code className="font-mono">wrong</code>.
      </aside>
    );
  if (!isLiveDemoBuild()) return null;
  return (
    <aside aria-label="Demo sign-in" className={box}>
      <b className="block text-ink">Demo sign-in</b>
      <p className="mt-1">
        Shared demo accounts in a synthetic hospital. The demo password is{" "}
        <code className="font-mono">{LIVE_DEMO_PASSWORD}</code>: it is published
        on purpose and opens only this demo. Everyone using an account sees its
        questions, so never type patient details.
      </p>
      <Accounts
        accounts={LIVE_DEMO_ACCOUNTS}
        onPick={(e) => {
          const a = LIVE_DEMO_ACCOUNTS.find((x) => x.email === e);
          if (a) onPick(a.email, a.password);
        }}
      />
      Two-step accounts show the demo code on the next page.
      <p className="mt-2">
        The demo resets every few hours: questions, corrections, passwords and
        two-step go back to how they started, and everyone is signed out.
      </p>
    </aside>
  );
}
