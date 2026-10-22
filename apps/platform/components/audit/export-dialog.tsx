"use client";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  EXPORT_MAX_ROWS,
  EXPORT_NOTE_MAX,
  EXPORT_REFERENCE_MAX,
  TooManyRowsError,
  type AuditFilters,
  type ExportKind,
  type ExportOut,
  type ExportReason,
  type NamedAccessFilters,
} from "@/lib/api/audit-contract";
import { useAuth } from "@/lib/auth/auth-context";
import { REASON_WORDS } from "@/lib/audit/kinds";
import { filtersInWords, type FilterNames } from "@/lib/audit/words";
import { num } from "@/lib/format";
import { useCreateExport } from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Sheet } from "@mhai/ui/sheet";
import { useToast } from "@mhai/ui/toast";
import { StepUpDialog } from "../hospitals/step-up-dialog";
import { ExportReady, exportOutOk, rowsWords } from "./export-ready";

const REASONS: readonly ExportReason[] = [
  "legal_request",
  "hospital_request",
  "regulator_request",
  "internal_review",
  "security_investigation",
  "other",
];

const TITLE: Record<ExportKind, string> = {
  events: "Export the audit log",
  named_access: "Export named access for a legal request",
};

/** "62,310 entries match. Exports stop at 50,000 rows. …" */
export const tooManyWords = (rows: number) =>
  `${num(rows)} entries match. Exports stop at ${num(EXPORT_MAX_ROWS)} rows. Narrow the dates or filters.`;

/** A dialog on desktop, a sheet on the body on phones; mounted while open. */
function Step({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  return desktop ? (
    <Dialog open onClose={onClose} title={title}>
      {children}
    </Dialog>
  ) : (
    createPortal(
      <Sheet open onClose={onClose} title={title}>
        <h2 className="mb-3 font-display text-[28px] font-black leading-none">
          {title}
        </h2>
        {children}
      </Sheet>,
      document.body,
    )
  );
}

type Stage =
  | { at: "form" }
  | { at: "too_many"; rows: number }
  | { at: "ready"; out: ExportOut };

/**
 * Makes an export (spec §7): a reason, an optional reference, the person's
 * two-step code; then either the ready step (id, checksum, one download) or,
 * over 50,000 rows, why nothing was made. The code never outlives the call.
 */
export function ExportDialog({
  kind,
  filters,
  names,
  count,
  prefillReason,
  open,
  onClose,
}: {
  kind: ExportKind;
  filters: AuditFilters | NamedAccessFilters;
  names: FilterNames;
  /** "1,284 events", when known. */
  count: string | null;
  prefillReason?: ExportReason;
  open: boolean;
  onClose(): void;
}) {
  const create = useCreateExport();
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [stage, setStage] = useState<Stage>({ at: "form" });
  // A download on its way: closing now would lose a file already used up.
  const [downloading, setDownloading] = useState(false);

  const close = () => {
    if (create.busy || downloading) return;
    create.clear();
    setStage({ at: "form" });
    onClose();
  };

  if (!open) return null;
  const title = TITLE[kind];

  if (stage.at === "too_many")
    return (
      <Step title={title} onClose={close}>
        <p role="alert" className="text-[14px] leading-relaxed">
          {tooManyWords(stage.rows)}
        </p>
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        </div>
      </Step>
    );

  if (stage.at === "ready")
    return (
      <Step
        title={
          exportOutOk(stage.out)
            ? `Export ${stage.out.export_id} is ready`
            : "Export"
        }
        onClose={close}
      >
        <ExportReady
          out={stage.out}
          kind={kind}
          onClose={close}
          onBusy={setDownloading}
        />
      </Step>
    );

  return (
    <StepUpDialog
      open
      title={title}
      intro={
        <>
          <p>{filtersInWords(filters, names)}</p>
          {count && <p className="mt-1">{count} will be exported.</p>}
          <p className="mt-1">
            The file is recorded with an export id and a checksum, and can be
            downloaded once within 15 minutes.
          </p>
        </>
      }
      reasons={REASONS.map((code) => ({ code, label: REASON_WORDS[code]! }))}
      initialReason={prefillReason}
      noteFor="other"
      noteMax={EXPORT_NOTE_MAX}
      extra={{
        label: "Reference (optional)",
        max: EXPORT_REFERENCE_MAX,
        required: false,
      }}
      confirmLabel="Make export"
      tone="primary"
      busy={create.busy}
      error={create.error}
      onClose={close}
      onConfirm={({ reason, note, extra, ...code }) =>
        create.run(
          {
            kind,
            filters,
            reason: reason as ExportReason,
            ...(note ? { note } : {}),
            ...(extra ? { reference: extra } : {}),
            ...code,
          },
          {
            onSuccess: (out) => {
              // A backup code works once: one fewer left.
              if ("backup_code" in code && user?.backupCodesLeft != null)
                updateUser({
                  backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
                });
              setStage({ at: "ready", out });
              if (exportOutOk(out))
                toast.show({
                  title: `Export ${out.export_id} ready · ${rowsWords(out.rows)}${out.capped ? " · capped" : ""}`,
                  tone: "ok",
                  live: "polite",
                });
            },
            onError: (e) => {
              if (!(e instanceof TooManyRowsError)) return false;
              // The code step closes: nothing was made, nothing is kept.
              setStage({ at: "too_many", rows: e.rows });
              return true;
            },
          },
        )
      }
    />
  );
}
