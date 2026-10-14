/* eslint-disable @next/next/no-img-element */
import type { QueryCreateIn } from "@/lib/api/contract";
import type { ResultView } from "@/lib/result-view";
import { SOURCE_STATUS_TEXT, toExportModel } from "../feedback/export-model";
import type { parseBody } from "../result/parse-body";

export function PrintSheet({
  view,
  parsed,
  query,
  agreedAt,
  feedback,
  printedAt,
}: {
  view: ResultView;
  parsed: ReturnType<typeof parseBody>;
  query: QueryCreateIn;
  /** Epoch ms of the clinician's agreement; the footer line shows only when set. */
  agreedAt?: number;
  /** "reviewed" labels the footer "Clinician reviewed"; "correct" shows no footer line. */
  feedback?: "agree" | "correct" | "reviewed";
  printedAt: string;
}) {
  const m = toExportModel(view, parsed);
  const demo = process.env.NEXT_PUBLIC_USE_MOCK === "true";
  return (
    <article className="mx-auto min-h-[297mm] w-[210mm] bg-white p-[14mm] text-[12.5px] leading-relaxed text-black print:p-0">
      <header className="flex items-center justify-between border-b-2 border-black pb-3">
        <img src="/brand/logo.png" alt="Measured Health" className="h-9" />
        <p className="text-right text-[11px] text-neutral-600">
          Clinical decision support summary
          <br />
          <span className="font-mono">Printed {printedAt}</span>
        </p>
      </header>
      {demo && (
        <p className="mt-2 text-center text-[11px] font-semibold text-neutral-700">
          Demo · sample data, not for clinical use
        </p>
      )}
      {m.banner && (
        <div className="mt-3 border-2 border-black p-2">
          <p className="font-bold">{m.banner.title}</p>
          <p>{m.banner.body}</p>
        </div>
      )}
      {m.notice && (
        <p className="mt-2 border border-black p-2 text-[11.5px]">
          <b>{m.notice.title}.</b> {m.notice.body}
        </p>
      )}
      <dl className="my-4 flex gap-6 text-xs">
        <div>
          <dt className="font-bold">Patient</dt>
          <dd>
            {query.patient_data.age} · {query.patient_data.sex}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Priority</dt>
          <dd className="capitalize">{query.urgency}</dd>
        </div>
      </dl>
      <p className="text-[11px] uppercase tracking-widest text-neutral-600">
        {m.eyebrow ?? "Assessment"}
      </p>
      <h1 className="font-display text-[34px] font-black leading-none">
        {m.title}{" "}
        {m.icd10 && (
          <span className="font-mono text-sm font-normal">
            ICD-10 {m.icd10}
          </span>
        )}
      </h1>
      {m.confidence && (
        <p className="mt-2 inline-block rounded-md border-[1.5px] border-black px-2.5 py-0.5 font-semibold uppercase">
          {"▮".repeat(m.confidence.bars)}
          {"▯".repeat(5 - m.confidence.bars)} {m.confidence.label}
        </p>
      )}
      {m.summary && <p className="mt-3">{m.summary}</p>}
      <ol className="my-3 list-decimal pl-5">
        {m.steps.map((s) => (
          <li key={s.n}>
            {s.text}
            {s.ref && <sup> [{s.ref}]</sup>}
          </li>
        ))}
      </ol>
      <p className="text-[11px] uppercase tracking-widest text-neutral-600">
        Sources
      </p>
      <ul className="text-[11.5px]">
        {m.sources.map((s) => (
          <li key={s.n}>
            [{s.n}] {s.title} · {SOURCE_STATUS_TEXT[s.status]}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px]">
        Safety checks: patient data protected ✓
        {m.safety.consistentReasoning && " · consistent reasoning ✓"} ·{" "}
        {m.safety.verified} of {m.safety.total} claims verified
      </p>
      <footer className="mt-10 border-t border-neutral-300 pt-2.5 text-[10.5px] text-neutral-600">
        {m.disclaimer}
        <br />
        {agreedAt !== undefined && feedback !== "correct" && (
          <>
            {feedback === "reviewed"
              ? "Clinician reviewed"
              : "Clinician agreed"}{" "}
            · {new Date(agreedAt).toLocaleString()}
            <br />
          </>
        )}
        MHAI by Measured Health, in partnership with BHAI (University of
        Chicago)
      </footer>
    </article>
  );
}
