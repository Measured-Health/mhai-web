import { describe, expect, it } from "vitest";
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CirclePause,
} from "lucide-react";
import {
  SYNC_ERROR_CODES,
  type EmrConnectionSummary,
} from "@/lib/api/emr-contract";
import {
  STATE_ICON,
  UNKNOWN_SYNC_ERROR,
  stateLabel,
  syncErrorLabel,
  syncLine,
} from "./labels";

const NOW = Date.parse("2026-10-23T09:30:00.000Z");
const MIN = 60_000;

const summary = (
  over: Partial<EmrConnectionSummary> = {},
): EmrConnectionSummary => ({
  id: "emr_1",
  hospital: { id: "h_havana", name: "Havana Hospital" },
  type: "fhir_r4",
  type_label: "FHIR R4 server",
  source_label: "Main record",
  enabled: true,
  health: "ok",
  last_test: null,
  last_sync: null,
  errors_24h: 0,
  ...over,
});

describe("record connection words", () => {
  it("words the four states, each with an icon", () => {
    expect(stateLabel("not_tested")).toBe("Not tested");
    expect(stateLabel("connected")).toBe("Connected");
    expect(stateLabel("needs_attention")).toBe("Needs attention");
    expect(stateLabel("off")).toBe("Switched off");
    expect(STATE_ICON).toEqual({
      connected: CheckCircle2,
      needs_attention: CircleAlert,
      off: CirclePause,
      not_tested: CircleDashed,
    });
  });

  it("every SyncErrorCode has words", () => {
    const words: Record<string, string> = {
      unreachable: "Couldn't reach the record system",
      sign_in_refused:
        "The record system refused the sign-in. Check the credentials.",
      timed_out: "The record system took too long to answer",
      unreadable_data: "Some records couldn't be read",
      unmapped_codes: "Some results use codes MHAI doesn't know yet",
      too_many_requests: "The record system asked MHAI to slow down",
    };
    expect([...SYNC_ERROR_CODES].sort()).toEqual(Object.keys(words).sort());
    for (const code of SYNC_ERROR_CODES)
      expect(syncErrorLabel(code), code).toBe(words[code]);
  });

  it("an unknown code reads the fallback", () => {
    expect(UNKNOWN_SYNC_ERROR).toBe(
      "Something went wrong with this connection.",
    );
    for (const code of ["", "server_said_no", "toString", "__proto__"])
      expect(syncErrorLabel(code), code).toBe(UNKNOWN_SYNC_ERROR);
  });

  it("the sync line: the last update and its records, or none yet", () => {
    expect(syncLine(summary(), NOW)).toBe("No updates yet");
    expect(
      syncLine(
        summary({
          last_sync: {
            at: new Date(NOW - 2 * MIN).toISOString(),
            ok: true,
            records: 1284,
          },
        }),
        NOW,
      ),
    ).toBe("Last update 2 min ago · 1,284 records");
    expect(
      syncLine(
        summary({
          last_sync: {
            at: new Date(NOW - 6 * 60 * MIN).toISOString(),
            ok: true,
            records: 1,
          },
        }),
        NOW,
      ),
    ).toBe("Last update 6 h ago · 1 record");
    expect(
      syncLine(
        summary({
          last_sync: {
            at: new Date(NOW - 5 * 24 * 60 * MIN).toISOString(),
            ok: true,
            records: 0,
          },
        }),
        NOW,
      ),
    ).toBe("Last update 5 d ago · 0 records");
    expect(
      syncLine(
        summary({
          last_sync: { at: new Date(NOW).toISOString(), ok: true, records: 3 },
        }),
        NOW,
      ),
    ).toBe("Last update just now · 3 records");
    // An unreadable time is never "NaN".
    expect(
      syncLine(
        summary({ last_sync: { at: "nope", ok: true, records: 3 } }),
        NOW,
      ),
    ).toBe("No updates yet");
  });
});
