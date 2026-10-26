// The Analysis access trail (spec §9, backend §14.12): who looked at
// Analysis, never the figures or the patients. The browser reads each page
// strictly and fails the whole page closed on anything the server shouldn't
// have sent: a `flagged` that isn't exactly a patient list, a `count` or
// `clearance_id` on another kind, a filter key it doesn't know, a label over
// 80 characters, an id that isn't opaque, or any patient field.
import { isCount, isId, isObj, isTime } from "@mhai/ui/guards";
import type {
  AccessEntry,
  AccessKind,
  AnalysisPeriod,
  FilterKey,
  ScopeKind,
  ViewId,
} from "../api/analysis-contract";
import { VIEW_TITLE, periodLabel } from "./labels";
import type { ViewState } from "./read";

export type AccessPage = { entries: AccessEntry[]; next_cursor: string | null };

const FAILED = { status: "failed" } as const;
const LABEL_MAX = 80;
const KINDS: readonly AccessKind[] = ["visit", "download", "patient_list"];
const SCOPES: readonly ScopeKind[] = ["all", "hospital"];
const VIEWS: readonly ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
const PERIODS: readonly AnalysisPeriod[] = ["3m", "6m", "12m"];
const FILTER_KEYS: readonly FilterKey[] = [
  "condition",
  "age_band",
  "sex",
  "setting",
  "specialty",
  "location",
  "source",
];
const PATIENT_KEYS = new Set([
  "pid",
  "mrn",
  "dob",
  "date_of_birth",
  "address",
  "patient_name",
]);
const ENTRY_KEYS = [
  "id",
  "at",
  "actor",
  "kind",
  "scope",
  "hospital",
  "view",
  "period",
  "filters",
  "count",
  "clearance_id",
  "flagged",
];

class Bad extends Error {}
function need(ok: boolean, why: string): asserts ok {
  if (!ok) throw new Bad(why);
}
const isStr = (v: unknown): v is string => typeof v === "string";

function exact(v: unknown, keys: readonly string[], what: string) {
  need(isObj(v), `${what}: not an object`);
  for (const k of keys) need(Object.hasOwn(v, k), `${what}: no key ${k}`);
  for (const k of Object.keys(v))
    need(keys.includes(k), `${what}: unexpected key ${k}`);
  return v;
}

function noPatient(v: unknown): void {
  if (Array.isArray(v)) v.forEach(noPatient);
  else if (isObj(v))
    for (const [k, x] of Object.entries(v)) {
      need(!PATIENT_KEYS.has(k), `a patient field ${k}`);
      noPatient(x);
    }
}

function person(v: unknown, what: string) {
  const p = exact(v, ["id", "name"], what);
  need(isId(p.id), `${what}: id isn't opaque`);
  need(isStr(p.name) && p.name.trim() !== "", `${what}: no name`);
  return { id: p.id, name: p.name };
}

function entryOk(raw: unknown): AccessEntry {
  noPatient(raw);
  const e = exact(raw, ENTRY_KEYS, "entry");
  need(isId(e.id), "id isn't opaque");
  need(isTime(e.at), "at isn't a time");
  person(e.actor, "actor");
  need(KINDS.includes(e.kind as AccessKind), "unknown kind");
  need(SCOPES.includes(e.scope as ScopeKind), "unknown scope");
  need(VIEWS.includes(e.view as ViewId), "unknown view");
  need(PERIODS.includes(e.period as AnalysisPeriod), "unknown period");
  if (e.scope === "all") need(e.hospital === null, "hospital on all scope");
  else person(e.hospital, "hospital");
  need(Array.isArray(e.filters), "filters aren't a list");
  for (const f of e.filters) {
    const x = exact(f, ["key", "label"], "filter");
    need(FILTER_KEYS.includes(x.key as FilterKey), "unknown filter key");
    need(
      isStr(x.label) && x.label.trim() !== "" && x.label.length <= LABEL_MAX,
      "filter label",
    );
  }
  // `flagged` is exactly a patient list; count and letter belong to it alone.
  need(typeof e.flagged === "boolean", "flagged isn't yes or no");
  need(e.flagged === (e.kind === "patient_list"), "flagged is wrong");
  if (e.kind === "patient_list") {
    need(e.scope === "hospital", "a patient list across hospitals");
    need(isCount(e.count), "a patient list with no count");
    need(isId(e.clearance_id), "a patient list with no letter");
  } else {
    need(e.count === null, "a count on another kind");
    need(e.clearance_id === null, "a letter on another kind");
  }
  return JSON.parse(JSON.stringify(e)) as AccessEntry;
}

/** One page of the trail, or "failed": nothing of a bad page is shown. */
export function readAccessPage(raw: unknown): ViewState<AccessPage> {
  try {
    const p = exact(raw, ["entries", "next_cursor"], "page");
    need(Array.isArray(p.entries), "entries aren't a list");
    need(p.next_cursor === null || isStr(p.next_cursor), "cursor");
    return {
      status: "ok",
      data: {
        entries: p.entries.map(entryOk),
        next_cursor: p.next_cursor,
      },
    };
  } catch {
    return FAILED;
  }
}

/** The line after the person's name is built here whole, for the screen. */
export function accessLine(e: AccessEntry): string {
  const where =
    e.scope === "all" ? "All hospitals" : (e.hospital?.name ?? "One hospital");
  const view = VIEW_TITLE[e.view];
  if (e.kind === "patient_list") {
    const n = e.count ?? 0;
    return `${e.actor.name} opened ${n} de-identified ${n === 1 ? "patient" : "patients"} at ${where} · ${view} · letter ${e.clearance_id}`;
  }
  const parts = [where, periodLabel(e.period)];
  if (e.filters.length > 0)
    parts.push(e.filters.map((f) => f.label).join(", "));
  const what =
    e.kind === "download" ? `downloaded ${view} as CSV` : `looked at ${view}`;
  return `${e.actor.name} ${what} · ${parts.join(" · ")}`;
}
