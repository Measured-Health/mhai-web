import { BadgeCheck, ShieldCheck, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Logo, PartnerLine } from "../ui/brand";

const TRUST = [
  { Icon: ShieldCheck, text: "Patient details are masked before any analysis" },
  {
    Icon: BadgeCheck,
    text: "Every claim is checked against clinical guidelines",
  },
  {
    Icon: Target,
    text: "You stay in control: the final decision is always yours",
  },
];

/** Sign-in screens: the brand panel (desktop) and the form column. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[calc(100dvh-var(--demo-h,0px))] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section
        aria-label="About MHAI"
        className="hidden flex-col justify-between gap-10 bg-gradient-to-br from-bloom to-[#2a0f33] p-12 text-white print:hidden lg:flex"
      >
        <Logo className="h-11 w-auto self-start brightness-0 invert" />
        <div>
          <h2 className="max-w-[480px] font-display text-[52px] font-black leading-[.95]">
            Better, quicker answers at the bedside.
          </h2>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-white/80">
            Evidence-checked clinical decision support for every clinic,
            including the most resource-limited.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-[14px]">
            {TRUST.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-white/15">
                  <Icon aria-hidden className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="self-start rounded-2xl bg-white/95 px-4 py-2.5">
          <PartnerLine />
        </div>
      </section>
      <div className="flex flex-col items-center justify-center px-5 py-10">
        <Logo className="mb-8 h-10 w-auto print:hidden lg:hidden" />
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </main>
  );
}

export function AuthHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-[40px] font-black leading-none">
        {title}
      </h1>
      {sub && <p className="mt-2 text-[14.5px] text-ink-2">{sub}</p>}
    </header>
  );
}
