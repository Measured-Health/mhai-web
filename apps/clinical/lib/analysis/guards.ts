// The small-group guards for Analysis (spec §4) live in the shared package.
// The server computes and hides every number; these check it did, so a reader
// can fail a view closed ("Couldn't load {view}").
export {
  guardedOk,
  isHiddenValue as hidden,
  isGuardedValue as isGuardedOut,
  isNum,
  isObj,
  numeratorLeaks,
  scrub,
  setGivesAway,
  shows,
  type GuardKind,
} from "@mhai/ui/guards";
