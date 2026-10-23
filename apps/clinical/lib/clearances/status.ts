import {
  activeWords,
  dayLabel,
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
  try {
    return line(c, today);
  } catch {
    // A malformed date from the server fails closed: no access, no date.
    return {
      icon:
        c.status === "revoked" || c.status === "rejected"
          ? "ban"
          : "calendar-x",
      words: STATUS_LABEL[c.status === "active" ? "ended" : c.status],
      detail: null,
    };
  }
}

function line(c: ClearanceOut, today: string): StatusLine {
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
        // The hospital's day, as the server sends it; never cut from the instant.
        words: v ? revokedWords(v.day) : STATUS_LABEL.revoked,
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

/**
 * An instant from the server (an upload, a verification) as the viewer's
 * day, "12 Mar 2027"; null if it isn't a time.
 */
export function instantLabel(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return dayLabel(
    `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
  );
}

/** A day from the server as "12 Mar 2027", or null if it isn't one. */
export function safeDayLabel(ymd: string): string | null {
  try {
    return dayLabel(ymd);
  } catch {
    return null;
  }
}
