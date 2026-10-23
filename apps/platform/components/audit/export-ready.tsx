"use client";
import { CheckCircle2, Download, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { ExportKind, ExportOut } from "@/lib/api/audit-contract";
import { ID } from "@/lib/audit/read";
import { platformError } from "@/lib/errors";
import { num } from "@/lib/format";
import { useDownloadExport } from "@/lib/queries/audit";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { CopyButton } from "./copy-button";

/** The download's own refusal (410): scoped here, never a global code. */
export const GONE_WORDS =
  "This file was already downloaded or has expired. Make a new export.";
/** The server answered, then the file stopped coming: it is spent. */
export const INTERRUPTED_WORDS =
  "The download was interrupted and can't be fetched again. Make a new export.";
/** A 403 here means someone else made it (only its maker may download). */
export const NOT_YOURS_WORDS =
  "Only the person who made this export can download it.";

const SHA256 = /^[0-9a-f]{64}$/;
const EXT: Record<ExportKind, string> = { events: "csv", named_access: "zip" };
/** A letter or digit first, then safe characters, then the kind's extension. */
const SAFE_NAME: Record<ExportKind, RegExp> = {
  events: /^[A-Za-z0-9][A-Za-z0-9._-]{0,115}\.csv$/,
  named_access: /^[A-Za-z0-9][A-Za-z0-9._-]{0,115}\.zip$/,
};

/**
 * The server's file name when it is safe and ends in the kind's extension
 * (a zip is never named .csv); else one made from the id.
 */
export function safeName(name: string, id: string, kind: ExportKind): string {
  return typeof name === "string" && SAFE_NAME[kind].test(name)
    ? name
    : `audit-${id}.${EXT[kind]}`;
}

/** Before the server answered, or a server fault: the file may still be there. */
const mayRetry = (e: unknown) =>
  !(e instanceof ApiError) || e.status === 0 || e.status >= 500;

/** No file without an export id: the reply is checked before it shows. */
export function exportOutOk(o: unknown): o is ExportOut {
  if (typeof o !== "object" || o === null) return false;
  const x = o as Record<string, unknown>;
  return (
    typeof x.export_id === "string" &&
    ID.test(x.export_id) &&
    x.export_id.length <= 120 &&
    typeof x.rows === "number" &&
    Number.isSafeInteger(x.rows) &&
    x.rows >= 0 &&
    typeof x.capped === "boolean" &&
    typeof x.checksum === "string" &&
    SHA256.test(x.checksum) &&
    typeof x.expires_at === "string" &&
    !Number.isNaN(Date.parse(x.expires_at)) &&
    typeof x.file_name === "string"
  );
}

/** "1 row", "1,840 rows". */
export const rowsWords = (n: number) => (n === 1 ? "1 row" : `${num(n)} rows`);

const pad = (n: number) => String(n).padStart(2, "0");
/** "09:45" in the viewer's local time. */
const hhmm = (iso: string) => {
  const t = new Date(iso);
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
};

/**
 * The export's ready step: its id, rows, checksum and deadline, and the one
 * download. This is the only place the file can be fetched. The button is
 * spent after one click, unless the server never answered or failed (then
 * it may be tried again; a used or expired file answers 410). While the
 * file is on its way, the step can't be closed: it would be lost.
 */
export function ExportReady({
  out,
  kind,
  onClose,
  onBusy,
}: {
  out: ExportOut;
  kind: ExportKind;
  onClose(): void;
  /** Told when a download starts and ends. */
  onBusy?: (busy: boolean) => void;
}) {
  const download = useDownloadExport();
  const pending = download.isPending;
  useEffect(() => onBusy?.(pending), [pending, onBusy]);
  // While the file is on its way, leaving the page (reload, closing the
  // tab) would lose the once-only file: the browser asks first. In-app
  // navigation can't lose it: the hook saves it whatever happens here.
  useEffect(() => {
    if (!pending) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending]);
  const net = useNeedsConnection("export-download-offline");
  const [clicked, setClicked] = useState(false);
  const [saved, setSaved] = useState(false);
  const ok = exportOutOk(out);

  function save() {
    if (!ok || clicked) return;
    setClicked(true);
    // The hook saves the file, even if this step has gone by then.
    download.mutate(
      {
        id: out.export_id,
        name: safeName(out.file_name, out.export_id, kind),
      },
      {
        onSuccess: () => {
          download.reset();
          setSaved(true);
        },
        onError: (e) => {
          if (mayRetry(e)) setClicked(false);
        },
      },
    );
  }

  const words = download.error
    ? platformError(download.error, {
        gone: GONE_WORDS,
        interrupted: INTERRUPTED_WORDS,
        forbidden: NOT_YOURS_WORDS,
      })
    : null;

  return (
    <div className="flex flex-col gap-4 text-[13.5px]">
      {!ok ? (
        <Banner tone="bad" title="The reply wasn't what was expected.">
          No file was made available. Make a new export.
        </Banner>
      ) : (
        <>
          <div>
            <p className="font-semibold">{rowsWords(out.rows)}</p>
            {out.capped && (
              <p className="mt-1 inline-flex items-center gap-1.5 font-semibold text-warn-deep">
                <TriangleAlert aria-hidden className="size-3.5" />
                Capped by the server
              </p>
            )}
          </div>
          <div>
            <p className="text-[12.5px] text-ink-2">Checksum (SHA-256)</p>
            <div className="flex flex-wrap items-center gap-x-2">
              <code className="font-mono text-[12.5px] [overflow-wrap:anywhere]">
                {out.checksum}
              </code>
              <CopyButton value={out.checksum} label="checksum" />
            </div>
          </div>
          <p>Download by {hhmm(out.expires_at)}</p>
          <div aria-live="polite">
            {saved && (
              <p className="inline-flex items-center gap-1.5 text-ok-deep">
                <CheckCircle2 aria-hidden className="size-4" />
                Downloaded.
              </p>
            )}
          </div>
          {words && <Banner tone="bad" title={words.title} />}
        </>
      )}
      <OfflineNote id="export-download-offline" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          Close
        </Button>
        {ok && (
          <Button
            disabled={clicked}
            aria-busy={download.isPending}
            onClick={save}
            {...net.props}
          >
            <Download aria-hidden className="size-4" />
            Download file
          </Button>
        )}
      </div>
    </div>
  );
}
