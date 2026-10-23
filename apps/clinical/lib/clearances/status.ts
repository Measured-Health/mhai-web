import {
  activeWords,
  daysBetween,
  endedWords,
  ENDING_SOON_DAYS,
  REFUSED_TEXT,
  REJECT_LABEL,
  REVOKE_LABEL,
  revokedWords,
  STATUS_LABEL,
} from "@mhai/ui/clearances";
import type { ClearanceOut } from "../api/clearances-contract";

export type StatusIcon =
  "clock" | "x" | "hourglass" | "check" | "alert" | "ban" | "calendar-x";

export type StatusLine = {
  icon: StatusIcon;
  words: string;
  detail: string | null;
};

/**
 * A letter's status as words and an icon, never colour alone. `today` is the
 * hospital's day from the server. An "active" letter whose end date has
 * passed reads as ended: fail toward no access.
 */
export function statusLine(c: ClearanceOut, today: string): StatusLine {
  switch (c.status) {
    case "checking":
      return { icon: "clock", words: STATUS_LABEL.checking, detail: null };
    case "refused":
      return {
        icon: "x",
        words: STATUS_LABEL.refused,
        detail: c.refused_reason ? REFUSED_TEXT[c.refused_reason] : null,
      };
    case "waiting":
      return {
        icon: "hourglass",
        words: STATUS_LABEL.waiting,
        detail: null,
      };
    case "rejected": {
      const r = c.rejection;
      return {
        icon: "ban",
        words: STATUS_LABEL.rejected,
        detail: r
          ? r.note
            ? `${REJECT_LABEL[r.reason]} · ${r.note}`
            : REJECT_LABEL[r.reason]
          : null,
      };
    }
    case "revoked": {
      const v = c.revocation;
      return {
        icon: "ban",
        words: v ? revokedWords(v.at.slice(0, 10)) : STATUS_LABEL.revoked,
        detail: v
          ? `By ${v.by.display_name} · ${REVOKE_LABEL[v.reason]}`
          : null,
      };
    }
    case "ended":
      return {
        icon: "calendar-x",
        words: endedWords(c.end_date),
        detail: null,
      };
    case "active": {
      const left = daysBetween(today, c.end_date);
      if (left < 0)
        return {
          icon: "calendar-x",
          words: endedWords(c.end_date),
          detail: null,
        };
      return {
        icon: left <= ENDING_SOON_DAYS ? "alert" : "check",
        words: activeWords(c.end_date, today),
        detail: null,
      };
    }
  }
}
