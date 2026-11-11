// Reading `GET /platform/guardrails/periods` (backend spec §9, F20), failing
// closed: anything the contract doesn't allow (an extra key, a period that
// isn't the one asked for, a shown 1–4, a share over a hidden count, a set
// that gives a hidden member away) is 502 `bad_gateway`, so a screen says
// it couldn't load rather than show a guess.
import { ApiError } from "@mhai/api-client/errors";
import {
  guardedOk,
  hasOnlyKeys,
  isId,
  isObj,
  isTime,
  numeratorLeaks,
  setGivesAway,
  shows,
  type Obj,
} from "@mhai/ui/guards";
import {
  PERIODS,
  type GuardrailPeriodsOut,
  type GuardrailRates,
  type Guarded,
  type Period,
} from "../api/analytics-contract";
import { isPeriodStart, periodEnd } from "./periods";

const COUNTS = ["answers", "pass", "regenerate", "escalate", "degraded"];
const SHARES = ["pass_share", "regenerate_share", "escalate_share"];
const RATE_KEYS = [...COUNTS, ...SHARES];
const PARTS = ["pass", "regenerate", "escalate"] as const;

const exactly = (o: Obj, keys: readonly string[]) =>
  hasOnlyKeys(o, keys) && keys.every((k) => Object.hasOwn(o, k));

function ratesOk(r: Obj, keys: readonly string[]): boolean {
  if (!exactly(r, keys)) return false;
  if (
    !COUNTS.every(
      (k) =>
        isObj(r[k]) &&
        exactly(r[k] as Obj, ["value", "suppressed"]) &&
        guardedOk(r[k], "count"),
    )
  )
    return false;
  if (
    !SHARES.every(
      (k) =>
        isObj(r[k]) &&
        exactly(r[k] as Obj, ["value", "suppressed"]) &&
        guardedOk(r[k], "share", true),
    )
  )
    return false;
  const g = r as unknown as GuardrailRates;
  const answers: Guarded = g.answers;
  // The three decisions add up to the answers.
  if (
    setGivesAway(
      answers,
      PARTS.map((k) => g[k]),
    )
  )
    return false;
  // Degraded is within the answers: hidden with them, never 1–4 apart.
  if (answers.suppressed && shows(g.degraded) && g.degraded.value! > 0)
    return false;
  if (
    shows(answers) &&
    shows(g.degraded) &&
    answers.value! - g.degraded.value! > 0 &&
    answers.value! - g.degraded.value! < 5
  )
    return false;
  // A share over a hidden count is hidden; a shown share can't give its count away.
  return PARTS.every((k) => {
    const share = g[`${k}_share`];
    if ((answers.suppressed || g[k].suppressed) && shows(share)) return false;
    return !numeratorLeaks(answers, share);
  });
}

export function readGuardrailPeriods(
  v: unknown,
  asked: Period,
): GuardrailPeriodsOut {
  const bad = (): never => {
    throw new ApiError(502, "bad_gateway");
  };
  if (!isObj(v)) return bad();
  if (!exactly(v, ["period", "from", "to", "updated_at", "all", "hospitals"]))
    bad();
  if (!PERIODS.includes(v.period as Period) || v.period !== asked) bad();
  if (!isPeriodStart(asked, v.from) || typeof v.to !== "string") bad();
  if (
    Date.parse(v.to as string) !==
    periodEnd(asked, Date.parse(v.from as string))
  )
    bad();
  if (!isTime(v.updated_at)) bad();
  if (!isObj(v.all) || !ratesOk(v.all, RATE_KEYS)) bad();
  if (!Array.isArray(v.hospitals)) return bad();
  const seen = new Set<string>();
  for (const h of v.hospitals as unknown[]) {
    if (!isObj(h) || !ratesOk(h, ["hospital", ...RATE_KEYS])) bad();
    const p = (h as Obj).hospital;
    if (
      !isObj(p) ||
      !exactly(p, ["id", "name"]) ||
      !isId(p.id) ||
      typeof p.name !== "string" ||
      p.name.trim() === "" ||
      seen.has(p.id as string)
    )
      bad();
    seen.add((p as Obj).id as string);
  }
  return v as unknown as GuardrailPeriodsOut;
}
