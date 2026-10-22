"use client";
import { CheckCircle2, Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ExportKind, ExportOut } from "@/lib/api/audit-contract";
import { ID } from "@/lib/audit/read";
import { platformError } from "@/lib/errors";
import { num } from "@/lib/format";
import { useDownloadExport } from "@/lib/queries/audit";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { downloadBlob } from "@mhai/ui/csv";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { CopyButton } from "./copy-button";

/** The download's own refusal (410): scoped here, never a global code. */
export const GONE_WORDS =
  "This file was already downloaded or has expired. Make a new export.";

const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** The server's file name when it is safe, else one made from the id. */
export function safeName(name: string, id: string, kind: ExportKind): string {
  return typeof name === "string" && SAFE_NAME.test(name)
    ? name
    : `audit-${id}.${kind === "named_access" ? "zip" : "csv"}`;
}

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
 * download. This is the only place the file can be fetched; the button is
 * spent after one click, whatever the answer.
 */
export function ExportReady({
  out,
  kind,
  onClose,
}: {
  out: ExportOut;
  kind: ExportKind;
  onClose(): void;
}) {
  const download = useDownloadExport();
  const net = useNeedsConnection("export-download-offline");
  const [clicked, setClicked] = useState(false);
  const [saved, setSaved] = useState(false);
  const ok = exportOutOk(out);

  function save() {
    if (!ok || clicked) return;
    setClicked(true);
    download.mutate(out.export_id, {
      onSuccess: (blob) => {
        downloadBlob(safeName(out.file_name, out.export_id, kind), blob);
        // The file is in the browser's hands now: not kept here.
        download.reset();
        setSaved(true);
      },
    });
  }

  const words = download.error
    ? platformError(download.error, { gone: GONE_WORDS })
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
        <Button variant="ghost" onClick={onClose}>
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
