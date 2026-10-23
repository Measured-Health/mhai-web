"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { COVER_MAX } from "@mhai/ui/clearances";
import { ApiError } from "@/lib/api/errors";
import { isMfaRequired, useStaff } from "@/lib/admin-queries";
import { useAuth } from "@/lib/auth/auth-context";
import { useClearances, useUploadClearance } from "@/lib/clearance-queries";
import {
  endDateProblem,
  fileProblem,
  letterDateProblem,
} from "@/lib/clearances/file-check";
import { errorText, listNames } from "@/lib/clearances/summary";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Sheet } from "@mhai/ui/sheet";
import { useToast } from "@mhai/ui/toast";
import { StepUpFields, useStepUp } from "../step-up-fields";
import { eligibleIds, PeoplePicker } from "./people-picker";

/** What a renewal starts from: the old letter's people and signer. */
export type UploadPrefill = {
  covered: string[];
  signed_by: string;
  signer_title: string;
  renews: string;
  /** The old letter's names for its people, for anyone no longer on the staff list. */
  names?: Record<string, string>;
  /** Measured Health staff the old letter named; only their emails can be sent, so they are entered again. */
  platform?: string[];
};

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const CONFIRM =
  "This letter is signed by hospital leadership and names these people.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TITLE = "Upload a letter";

const field =
  "min-h-11 w-full rounded-xl border border-lilac-2 bg-white px-3 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-mint-deep";
const labelText = "block text-[12.5px] font-semibold text-ink-2";

/** "{n} B", "{n} KB" or "{n.n} MB". */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Problem({
  id,
  alert,
  children,
}: {
  id?: string;
  /** Announce it as it appears (a refusal after an action). */
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role={alert ? "alert" : undefined}
      className="mt-1 text-[13px] font-semibold text-bad-deep"
    >
      {children}
    </p>
  );
}

/**
 * Upload a clearance letter: the file, who signed it, its date, the people
 * it covers, any Measured Health staff it names, its end date, a
 * confirmation and the admin's two-step code. A dialog from `md`, a sheet
 * below. The file is only ever held in this form's state: it is never
 * shown, only named, and it is dropped when the form closes.
 */
export function UploadDialog({
  open,
  onClose,
  prefill,
  overPanel = false,
}: {
  open: boolean;
  onClose(): void;
  prefill?: UploadPrefill;
  /**
   * Opened from a side panel: below `md` it is a full-width modal dialog,
   * never a sheet on the panel's sheet (ruling 13).
   */
  overPanel?: boolean;
}) {
  // Mounted only while open, so closing forgets the file and every field.
  if (!open) return null;
  return (
    <UploadForm onClose={onClose} prefill={prefill} overPanel={overPanel} />
  );
}

function UploadForm({
  onClose,
  prefill,
  overPanel,
}: {
  onClose(): void;
  prefill?: UploadPrefill;
  overPanel: boolean;
}) {
  const desktop = useIsDesktop();
  const letters = useClearances();
  const staff = useStaff();
  const upload = useUploadClearance();
  const toast = useToast();
  const { online } = useNetwork();
  const { user, updateUser } = useAuth();
  const step = useStepUp();
  const ids = {
    file: useId(),
    fileNote: useId(),
    fileProblem: useId(),
    signer: useId(),
    title: useId(),
    letterDate: useId(),
    letterProblem: useId(),
    end: useId(),
    endProblem: useId(),
    email: useId(),
    emailProblem: useId(),
    cap: useId(),
    offline: useId(),
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const fileTurn = useRef(0);
  const sending = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState(prefill?.signed_by ?? "");
  const [signerTitle, setSignerTitle] = useState(prefill?.signer_title ?? "");
  const [letterDate, setLetterDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [picked, setPicked] = useState<string[]>(prefill?.covered ?? []);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongCode, setWrongCode] = useState(false);
  const [required, setRequired] = useState(false);

  const today = letters.data?.today;
  const max = letters.data?.max_end_date;
  const people = staff.data ?? [];
  // Only people the letter can cover are sent, even from a prefill.
  const ok = eligibleIds(people);
  const covered = picked.filter((id) => ok.has(id));
  const total = covered.length + emails.length;
  const tooMany = total > COVER_MAX;
  const endProblem =
    endDate && today && max ? endDateProblem(endDate, today, max) : null;
  const letterProblem =
    letterDate && today ? letterDateProblem(letterDate, today, endDate) : null;
  const blocked = required || user?.mfaEnabled === false;
  const busy = upload.isPending;
  const nameOf = (id: string) => people.find((s) => s.id === id)?.full_name;
  // A renewal's people who can't be covered any more are left off, and said so.
  const leftOff =
    prefill && staff.isSuccess
      ? prefill.covered
          .filter((id) => !ok.has(id))
          .map((id) => nameOf(id) ?? prefill.names?.[id] ?? "Someone")
      : [];

  const ready =
    !!file &&
    !!today &&
    !!max &&
    signedBy.trim() !== "" &&
    signerTitle.trim() !== "" &&
    letterDate !== "" &&
    letterProblem === null &&
    endDate !== "" &&
    endProblem === null &&
    total >= 1 &&
    !tooMany &&
    confirmed &&
    step.ready &&
    !blocked;
  const can = ready && online && !busy;

  const close = () => {
    if (busy) return;
    // Forget the call, and with it the file and the code in its variables.
    upload.reset();
    onClose();
  };

  async function pick(f: File | null) {
    const turn = ++fileTurn.current;
    setFile(null);
    setFileError(null);
    if (!f) return;
    let problem: string | null;
    try {
      problem = await fileProblem(f);
    } catch {
      problem = "Couldn't read this file. Choose it again.";
    }
    if (turn !== fileTurn.current) return;
    if (problem) {
      setFileError(problem);
      if (fileInput.current) fileInput.current.value = "";
    } else setFile(f);
  }

  function addEmail() {
    const e = draft.trim().toLowerCase();
    if (!EMAIL.test(e)) return setDraftError("Enter a full email address");
    if (emails.includes(e)) return setDraftError("That email is already added");
    setEmails([...emails, e]);
    setDraft("");
    setDraftError(null);
  }

  function send() {
    if (!can || !file || sending.current) return;
    sending.current = true;
    setError(null);
    setWrongCode(false);
    const auth = step.auth();
    upload.mutate(
      {
        file,
        signed_by: signedBy.trim(),
        signer_title: signerTitle.trim(),
        letter_date: letterDate,
        covered,
        ...(emails.length ? { covered_platform: emails } : {}),
        end_date: endDate,
        ...(prefill ? { renews: prefill.renews } : {}),
        ...auth,
      },
      {
        onSuccess: () => {
          toast.show({
            title: "Letter uploaded",
            body: "It shows Checking the file until it's ready.",
            tone: "ok",
          });
          // A backup code works once; Profile & security shows what's left.
          if ("backupCode" in auth && user?.backupCodesLeft != null)
            updateUser({
              backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
            });
          upload.reset();
          onClose();
        },
        onError: (e) => {
          if (isMfaRequired(e)) setRequired(true);
          setError(errorText(e, nameOf));
          // A code is asked for again after any refusal.
          if (e instanceof ApiError && e.code === "mfa_invalid") {
            setWrongCode(true);
            step.wrong();
          } else step.setCode("");
        },
        onSettled: (_data, e) => {
          sending.current = false;
          // After a refusal, forget the call, and with it the file and the
          // spent code; the form keeps its own copy and the error words.
          if (e) upload.reset();
        },
      },
    );
  }

  const body = (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex flex-col gap-4 text-[14px]"
    >
      <p className="text-sm text-ink-2">
        Measured Health checks the letter before anyone sees names. Only its
        name and size show here.
      </p>

      <div>
        <label htmlFor={ids.file} className={labelText}>
          The letter
        </label>
        <input
          ref={fileInput}
          id={ids.file}
          type="file"
          accept={ACCEPT}
          disabled={busy}
          aria-invalid={fileError ? true : undefined}
          aria-describedby={
            fileError ? `${ids.fileNote} ${ids.fileProblem}` : ids.fileNote
          }
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
          className="mt-1 block min-h-11 w-full text-[13px] file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line file:bg-white file:px-4 file:font-semibold"
        />
        <p id={ids.fileNote} className="mt-1 text-[12px] text-ink-3">
          PDF, PNG or JPEG, up to 10 MB and 20 pages.
        </p>
        {file && (
          <p className="mt-1 text-[13px] [overflow-wrap:anywhere]">
            {file.name} · {sizeLabel(file.size)}
          </p>
        )}
        {fileError && (
          <Problem id={ids.fileProblem} alert>
            {fileError}
          </Problem>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={ids.signer} className={labelText}>
            Signed by
          </label>
          <input
            id={ids.signer}
            value={signedBy}
            maxLength={200}
            onChange={(e) => setSignedBy(e.target.value)}
            className={`${field} mt-1`}
          />
        </div>
        <div>
          <label htmlFor={ids.title} className={labelText}>
            Job title
          </label>
          <input
            id={ids.title}
            value={signerTitle}
            maxLength={200}
            onChange={(e) => setSignerTitle(e.target.value)}
            className={`${field} mt-1`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={ids.letterDate} className={labelText}>
          Letter date
        </label>
        <input
          id={ids.letterDate}
          type="date"
          value={letterDate}
          max={today}
          onChange={(e) => setLetterDate(e.target.value)}
          aria-invalid={letterProblem ? true : undefined}
          aria-describedby={letterProblem ? ids.letterProblem : undefined}
          className={`${field} mt-1`}
        />
        {letterProblem && (
          <Problem id={ids.letterProblem}>{letterProblem}</Problem>
        )}
      </div>

      {leftOff.length > 0 && (
        <p role="status" className="text-[13px] text-ink-2">
          {leftOff.length === 1
            ? `${leftOff[0]} can't be covered any more and was left off.`
            : `${listNames(leftOff)} can't be covered any more and were left off.`}
        </p>
      )}
      {staff.isError ? (
        <Banner tone="bad" title="Couldn't load the staff list">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void staff.refetch()}
          >
            Try again
          </Button>
        </Banner>
      ) : staff.isPending ? (
        <p className="text-[13px] text-ink-3">Loading the staff list…</p>
      ) : (
        <PeoplePicker
          staff={people}
          selected={covered}
          onChange={setPicked}
          disabled={busy}
        />
      )}

      <div>
        <label htmlFor={ids.email} className={labelText}>
          Measured Health staff named in the letter (optional)
        </label>
        {prefill?.platform && prefill.platform.length > 0 && (
          <p className="mt-1 text-[12px] text-ink-3">
            The old letter also named {listNames(prefill.platform)} from
            Measured Health. Add their email again if this letter names them.
          </p>
        )}
        <div className="mt-1 flex gap-2">
          <input
            id={ids.email}
            type="email"
            value={draft}
            maxLength={254}
            autoComplete="off"
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
            aria-invalid={draftError ? true : undefined}
            aria-describedby={draftError ? ids.emailProblem : undefined}
            className={field}
          />
          <Button
            variant="ghost"
            disabled={busy || emails.length >= COVER_MAX || !draft.trim()}
            onClick={addEmail}
          >
            Add
          </Button>
        </div>
        {draftError && (
          <Problem id={ids.emailProblem} alert>
            {draftError}
          </Problem>
        )}
        {emails.length > 0 && (
          <ul aria-label="Measured Health staff" className="mt-2 flex flex-col">
            {emails.map((e) => (
              <li key={e} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {e}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${e}`}
                  disabled={busy}
                  onClick={() => setEmails(emails.filter((x) => x !== e))}
                  className="min-h-11 px-2 text-[13px] font-semibold text-mint-deep"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {emails.length > 0 && (
          <p aria-live="polite" className="mt-1 text-[12px] text-ink-3">
            {total === 1 ? "1 person in all" : `${total} people in all`}
          </p>
        )}
        {tooMany && (
          <p
            id={ids.cap}
            role="alert"
            className="mt-1 text-[13px] font-semibold text-bad-deep"
          >
            A letter can cover {COVER_MAX} people at most. Remove some to
            continue.
          </p>
        )}
      </div>

      <div>
        <label htmlFor={ids.end} className={labelText}>
          End date
        </label>
        <input
          id={ids.end}
          type="date"
          value={endDate}
          min={today && nextDay(today)}
          max={max}
          onChange={(e) => setEndDate(e.target.value)}
          aria-invalid={endProblem ? true : undefined}
          aria-describedby={endProblem ? ids.endProblem : undefined}
          className={`${field} mt-1`}
        />
        {endProblem && <Problem id={ids.endProblem}>{endProblem}</Problem>}
      </div>

      <label className="flex min-h-11 items-start gap-2.5 text-[14px]">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-mint"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{CONFIRM}</span>
      </label>

      <StepUpFields
        step={step}
        busy={busy}
        invalid={wrongCode}
        blocked={blocked}
        blockedTitle="Turn on two-step verification in Profile & security to upload a letter."
        onToggle={() => setError(null)}
        autoSubmit={false}
      />

      {!online && (
        <p id={ids.offline} className="text-[13px] text-ink-3">
          You&apos;re offline. Uploading needs a connection.
        </p>
      )}
      {letters.isError && (
        <Banner tone="bad" title="Couldn't load the letters">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void letters.refetch()}
          >
            Try again
          </Button>
        </Banner>
      )}
      {error && <Banner tone="bad" title={error} />}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!can}
          aria-describedby={
            [!online && ids.offline, tooMany && ids.cap]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  );

  return desktop || overPanel ? (
    <Dialog
      open
      onClose={close}
      title={TITLE}
      className={
        overPanel
          ? "max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:p-4 md:w-[min(600px,92vw)]"
          : "w-[min(600px,92vw)]"
      }
    >
      {body}
    </Dialog>
  ) : (
    <Sheet open onClose={close} title={TITLE}>
      <h2 className="mb-3 font-display text-[28px] font-black leading-none">
        {TITLE}
      </h2>
      {body}
    </Sheet>
  );
}

/** The day after a `yyyy-mm-dd` day, as a calendar day; none for a bad day. */
function nextDay(ymd: string): string | undefined {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + 1);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}
