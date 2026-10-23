// The Clearances page's wording (Plan 11b). The status words are the shared
// ones in `@mhai/ui/clearances`; the clinical app has its own copy of this
// logic, as the apps share nothing else.
import {
  activeWords,
  daysBetween,
  endedWords,
  ENDING_SOON_DAYS,
  revokedWords,
  STATUS_LABEL,
} from "@mhai/ui/clearances";
import type { Clearance, NamedPosition } from "@/lib/api/clearances-contract";
import type { VerifyBlock } from "./queue";

export type StatusIcon =
  "clock" | "x" | "hourglass" | "check" | "alert" | "ban" | "calendar-x";

/**
 * A letter's status as words and an icon, never colour alone. `today` is the
 * hospital's day from the server. An "active" letter whose end date has
 * passed reads as ended: fail toward no access.
 */
export function statusText(
  c: Clearance,
  today: string,
): { icon: StatusIcon; words: string } {
  try {
    return line(c, today);
  } catch {
    // A malformed date fails closed: no access, no date.
    return {
      icon:
        c.status === "revoked" || c.status === "rejected"
          ? "ban"
          : "calendar-x",
      words: STATUS_LABEL[c.status === "active" ? "ended" : c.status],
    };
  }
}

function line(
  c: Clearance,
  today: string,
): { icon: StatusIcon; words: string } {
  switch (c.status) {
    case "checking":
      return { icon: "clock", words: STATUS_LABEL.checking };
    case "refused":
      return { icon: "x", words: STATUS_LABEL.refused };
    case "waiting":
      return { icon: "hourglass", words: STATUS_LABEL.waiting };
    case "rejected":
      return { icon: "ban", words: STATUS_LABEL.rejected };
    case "revoked":
      return {
        icon: "ban",
        words: c.revocation
          ? revokedWords(c.revocation.day)
          : STATUS_LABEL.revoked,
      };
    case "ended":
      return { icon: "calendar-x", words: endedWords(c.end_date) };
    case "active": {
      const left = daysBetween(today, c.end_date);
      if (left < 0)
        return { icon: "calendar-x", words: endedWords(c.end_date) };
      return {
        icon: left <= ENDING_SOON_DAYS ? "alert" : "check",
        words: activeWords(c.end_date, today),
      };
    }
  }
}

/** What the verifier checks against the letter (spec §6.3). */
export const CHECKLIST: readonly string[] = [
  "The letter is on hospital letterhead and signed by the stated person",
  "It names the same people as entered",
  "Its end date matches, and is no more than 12 months away",
  "It authorises viewing patient names for analysis",
];

/** Shown in place of Verify and Reject. */
export const BLOCK_TEXT: Record<VerifyBlock, string> = {
  auditor: "Auditors can read letters but not change them",
  covers_you: "You can't verify a letter that covers you",
  same_side: "You can't verify letters from a hospital you're linked to",
  not_ready: "Still checking the file",
  done: "This letter has been dealt with",
};

/** `n` is everyone the letter names, staff and platform admins together. */
export function verifiedToast(c: Clearance, effective: NamedPosition): string {
  if (effective !== "on")
    return "Verified. Names stay hidden until named access is switched on";
  const n = c.covered.length + c.covered_platform.length;
  return `Verified. ${n} ${n === 1 ? "person" : "people"} can now see names`;
}
