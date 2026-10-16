import { AlignLeft, HelpCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { QueryCreateIn, Sex, Urgency } from "@/lib/api/contract";
import type { FormValues } from "@/lib/form-schema";
import { EXAMPLES } from "../states/first-visit";

const H3 =
  "mb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3";

/** Right column at lg and up, like the evidence panel (design v3 1–2). */
function SidePanel({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={label}
      className="hidden overflow-auto border-l border-line bg-white/95 p-5 lg:block"
    >
      <div className="flex flex-col gap-[18px]">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span className="grid size-[30px] place-items-center rounded-[9px] bg-mint-wash text-mint-deep">
            <Icon aria-hidden className="size-4" />
          </span>
          {label}
        </h2>
        {children}
      </div>
    </aside>
  );
}

const STEPS = [
  "Describe the patient and ask a clear clinical question.",
  "Personal details are masked, then guidelines are searched.",
  "Every claim is checked against the sources before you see it.",
  "You get a confidence level and the exact sources used.",
];

/** New consultation: how it works, a good question, and examples to try. */
export function HowItWorksPanel({
  onExample,
}: {
  onExample(v: FormValues): void;
}) {
  return (
    <SidePanel label="How it works" Icon={HelpCircle}>
      <ol className="flex flex-col gap-3 text-[13px] text-ink-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-2.5">
            <span className="grid size-[22px] flex-none place-items-center rounded-full bg-mint-wash text-[11.5px] font-semibold text-mint-deep">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <p className="rounded-2xl bg-lilac px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <b className="text-bloom">A good question</b>
        <br />
        &ldquo;54 M, chest pain 40 min radiating to left arm, BP 150/95, HR 104,
        smoker. Likely diagnosis and immediate management?&rdquo;
      </p>
      <div>
        <h3 className={H3}>Try an example</h3>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button
              key={e.title}
              type="button"
              onClick={() => onExample(e.v)}
              className="min-h-9 rounded-full border border-line bg-white px-3 text-[12.5px] text-ink-2 hover:border-mint hover:text-mint-deep"
            >
              {e.title}
            </button>
          ))}
        </div>
      </div>
    </SidePanel>
  );
}

const SEX: Record<Sex, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Unknown",
};
const URGENCY: Record<Urgency, string> = {
  routine: "Routine",
  urgent: "Urgent",
  emergency: "Emergency",
};

/** Analysing: the question as sent, to check while waiting. */
export function YourQuestionPanel({ query }: { query: QueryCreateIn }) {
  const p = query.patient_data;
  return (
    <SidePanel label="Your question" Icon={AlignLeft}>
      <div className="rounded-2xl border border-line bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-2">
        <p className="font-mono text-[12px] text-ink-3">
          {p.age} · {SEX[p.sex]} · {URGENCY[query.urgency]}
        </p>
        {p.symptoms.length > 0 && <p>{p.symptoms.join(", ")}</p>}
        <p className="mt-3 line-clamp-4">{query.clinical_question}</p>
      </div>
      <p className="text-[12.5px] text-ink-3">
        Evidence and safety details appear here when the analysis finishes.
      </p>
    </SidePanel>
  );
}
