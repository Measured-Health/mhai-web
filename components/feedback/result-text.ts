import type { ResultView } from "@/lib/result-view";
import type { parseBody } from "../result/parse-body";
import { SOURCE_STATUS_TEXT, toExportModel } from "./export-model";

export function resultAsText(
  view: ResultView,
  parsed: ReturnType<typeof parseBody>,
): string {
  const m = toExportModel(view, parsed);
  const out: string[] = [];
  if (m.banner) out.push(m.banner.title, m.banner.body, "");
  out.push(m.icd10 ? `${m.title} (ICD-10 ${m.icd10})` : m.title);
  if (m.confidence) out.push(m.confidence.label);
  if (m.summary) out.push("", m.summary);
  if (m.steps.length) {
    out.push("", "Recommended next steps:");
    for (const s of m.steps)
      out.push(`${s.n}. ${s.text}${s.ref ? ` [${s.ref}]` : ""}`);
  }
  if (m.sources.length)
    out.push(
      "",
      "Sources:",
      ...m.sources.map(
        (s) =>
          `[${s.n}] ${s.title}${s.status === "verified" ? "" : ` (${SOURCE_STATUS_TEXT[s.status]})`}`,
      ),
    );
  out.push(
    "",
    `Safety checks: patient data protected${m.safety.consistentReasoning ? ", consistent reasoning" : ""}, ${m.safety.verified} of ${m.safety.total} claims verified`,
    "",
    m.disclaimer,
  );
  return out.join("\n");
}
