import type { PatientCardOut } from "@/lib/api/patients-contract";
import { SEX_LABEL } from "@/lib/admin/patient-words";

/** One side of a possible match: who, and what MHAI holds for them. */
export function PatientCard({
  label,
  p,
}: {
  /** "Patient A" or "Patient B". */
  label: string;
  p: PatientCardOut;
}) {
  return (
    <div className="min-w-0 flex-1 basis-[220px] rounded-xl border border-line bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-3">
        {label}
      </p>
      <p className="text-[15px] font-semibold [overflow-wrap:anywhere]">
        {p.full_name}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
        <dt className="text-ink-3">MRN</dt>
        <dd>{p.mrn ?? "No MRN"}</dd>
        <dt className="text-ink-3">Age</dt>
        <dd>{p.age === null ? "Not recorded" : p.age}</dd>
        <dt className="text-ink-3">Sex</dt>
        <dd>{SEX_LABEL[p.sex]}</dd>
        <dt className="text-ink-3">From</dt>
        <dd className="[overflow-wrap:anywhere]">
          {p.sources.length ? p.sources.join(", ") : "Not recorded"}
        </dd>
        <dt className="text-ink-3">Records</dt>
        <dd>{p.records}</dd>
      </dl>
    </div>
  );
}
