import { BadgeCheck, ShieldCheck, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Logo, PartnerLine } from "@mhai/ui/brand";

export { AuthHeading } from "@mhai/ui/auth/auth-heading";

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

/** Sign-in screens: the brand panel (desktop) and the form column (design v3, account 1). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-[calc(100dvh-var(--demo-h,0px))] bg-white lg:h-[calc(100dvh-var(--demo-h,0px))] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:overflow-hidden">
      <section
        aria-label="About MHAI"
        className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-[radial-gradient(520px_380px_at_90%_0%,#15999e40,transparent_65%),radial-gradient(520px_420px_at_0%_100%,#a8499e30,transparent_65%),linear-gradient(160deg,#f7f2f9,#e8f5f5)] p-10 print:hidden lg:flex"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(#4603510d_1px,transparent_1px),linear-gradient(90deg,#4603510d_1px,transparent_1px)] bg-[size:30px_30px] [mask-image:radial-gradient(ellipse_at_30%_40%,#000_20%,transparent_75%)]"
        />
        <svg
          aria-hidden
          viewBox="0 0 900 80"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-[62%] h-[70px] w-full opacity-35"
        >
          <path
            d="M0 40h300l20-26 26 52 22-66 26 76 18-36h488"
            className="fill-none stroke-mint stroke-2 [stroke-dasharray:900] motion-safe:animate-[ecg-draw_4s_linear_infinite]"
          />
        </svg>
        <Logo className="relative h-[52px] w-auto self-start" />
        <div className="relative">
          <h2 className="mb-3.5 max-w-[520px] font-display text-[58px] font-black leading-[.92] tracking-[-.01em]">
            Better, quicker answers at the bedside.
          </h2>
          <p className="max-w-[440px] text-base leading-relaxed text-ink-2">
            Evidence-checked clinical decision support for every clinic,
            including the most resource-limited.
          </p>
        </div>
        <div className="relative flex max-w-[440px] flex-col gap-2.5">
          <ul className="flex flex-col gap-2.5">
            {TRUST.map(({ Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-3 rounded-[14px] border border-white bg-white/70 px-3.5 py-3 text-[13.5px] backdrop-blur-md"
              >
                <span className="grid size-[30px] flex-none place-items-center rounded-[10px] bg-ok-wash text-ok">
                  <Icon aria-hidden className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-3.5">
            <PartnerLine />
          </div>
        </div>
      </section>
      <div className="flex flex-col items-center px-5 py-10 lg:overflow-y-auto lg:p-10">
        <div className="my-auto flex w-full flex-col items-center">
          <Logo className="mb-8 h-10 w-auto print:hidden lg:hidden" />
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
