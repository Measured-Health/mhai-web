import { SAMPLE_ACCOUNTS } from "@/lib/auth/mock";

/** How testers reach each sign-in state in the demo. Mock mode only. */
export function DemoHint({ onPick }: { onPick(email: string): void }) {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") return null;
  return (
    <aside
      aria-label="Demo sign-in"
      className="mt-6 rounded-2xl border border-dashed border-lilac-2 bg-lilac/40 p-4 text-[12.5px] leading-relaxed text-ink-2"
    >
      <b className="block text-ink">Demo sign-in</b>
      <ul className="my-2 flex flex-col gap-1.5">
        {SAMPLE_ACCOUNTS.map(({ email, label, note }) => (
          <li key={email}>
            <button
              type="button"
              aria-label={`Use ${label} (${email})`}
              onClick={() => onPick(email)}
              className="flex min-h-11 w-full flex-col justify-center rounded-xl border border-lilac-2 bg-white/70 px-3 text-left hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom"
            >
              <b className="text-ink">{label}</b>
              <span className="text-ink-3">{note}</span>
            </button>
          </li>
        ))}
      </ul>
      Any password works except <code className="font-mono">wrong</code>. The
      two-step code is <code className="font-mono">123456</code>. Any other
      email is a hospital account and is turned away.
    </aside>
  );
}
