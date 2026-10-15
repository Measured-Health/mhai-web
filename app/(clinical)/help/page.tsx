import { BookOpen, PenLine, ShieldCheck } from "lucide-react";
import { MenuButton } from "@/components/shell/menu-button";
import { TopBar } from "@/components/shell/top-bar";
import { Logo, PartnerLine } from "@/components/ui/brand";
import { ConfidencePill } from "@/components/ui/confidence-pill";

const CARDS = [
  {
    icon: PenLine,
    title: "Ask a good question",
    body: "Age, sex, vitals, duration and history give the best answers.",
  },
  {
    icon: BookOpen,
    title: "Read the confidence",
    body: "High, Use with caution, or Needs review: what each means and what to do.",
  },
  {
    icon: ShieldCheck,
    title: "Check the evidence",
    body: "Claims are matched to guideline sources where possible. Unmatched ones are marked for you to check.",
  },
];

export const metadata = { title: "Help & guide" };

export default function Help() {
  return (
    <>
      <TopBar title="Help & guide" leading={<MenuButton />} />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[860px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Help &amp; guide
          </p>
          <h2 className="font-display text-[44px] font-black leading-none">
            How to use MHAI
          </h2>
          <div className="my-5 grid gap-3 sm:grid-cols-3">
            {CARDS.map((c) => (
              <section key={c.title} className="card-v3 p-4">
                <span
                  aria-hidden
                  className="grid size-9 place-items-center rounded-[11px] bg-mint-wash text-mint-deep"
                >
                  <c.icon className="size-4" />
                </span>
                <h3 className="mb-1 mt-2 text-[15px] font-semibold">
                  {c.title}
                </h3>
                <p className="text-[13px] leading-normal text-ink-3">
                  {c.body}
                </p>
              </section>
            ))}
          </div>
          <section
            aria-labelledby="about-mhai"
            className="card-v3 mb-3.5 flex flex-wrap items-center gap-4 p-4"
          >
            <Logo className="h-10 w-auto" />
            <span
              aria-hidden
              className="font-display text-3xl font-black text-ink-3"
            >
              ×
            </span>
            <PartnerLine />
            <p className="min-w-60 flex-1 text-[13.5px] leading-normal text-ink-2">
              <b id="about-mhai" className="text-ink">
                About MHAI.
              </b>{" "}
              Built by Measured Health in partnership with BHAI at the
              University of Chicago, our research partner in healthcare AI for
              diagnostic support and clinical decision-making.{" "}
              <span className="text-ink-3">
                (BHAI is shown as text until the official logo arrives.)
              </span>
            </p>
          </section>
          <section className="card-v3 p-5">
            <h3 className="mb-2 font-semibold">What the labels mean</h3>
            <dl className="grid grid-cols-[180px_1fr] text-[13.5px] max-sm:grid-cols-1">
              <dt className="border-t border-line py-2.5">
                <ConfidencePill label="High confidence" bars={4} />
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Claims match the guidelines. Still apply your clinical
                judgement.
              </dd>
              <dt className="border-t border-line py-2.5">
                <ConfidencePill label="Use with caution" bars={2} />
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Some parts weren&apos;t verified. Check the amber-tagged lines
                before acting.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold text-bad-deep">
                Needs review
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                The system couldn&apos;t stand behind this answer, or its checks
                ran in a reduced mode. Don&apos;t act on it without review.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold">
                Evidence-backed claims
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                How many statements were matched to a source.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold">
                Evidence match
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                The share of checked claims that the cited guidelines support.
                Shown only when the claims were checked.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold">
                Answer stability
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Whether the system gives the same answer when asked again.
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
