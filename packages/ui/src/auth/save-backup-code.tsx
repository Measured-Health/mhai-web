"use client";
import { Check, Copy } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type RefObject,
} from "react";
import {
  clearNewBackupCode,
  onNewBackupCode,
  pendingBackupCode,
} from "@mhai/api-client/new-backup-code";
import { Button } from "../button";
import { cn } from "../cn";
import { Dialog } from "../dialog";
import { AuthHeading } from "./auth-heading";

/** How long Continue waits, in seconds, so the code is seen before it goes. */
export const SAVE_WAIT_S = 3;
const COPIED_MS = 2000;

export type SaveKind = "setup" | "new";

const TITLE: Record<SaveKind, string> = {
  setup: "Save your backup code",
  new: "Save your new backup code",
};
const SUB: Record<SaveKind, string> = {
  setup:
    "Save it somewhere safe. You'll need it if you don't have your phone. It works once, and you get a new one each time you use it.",
  new: "Save it somewhere safe. Your old backup code no longer works. You'll need this one if you don't have your phone.",
};

/** Where "Lost your phone?" goes, and how the app gets there. */
export type LostPhoneLink = { href: string; navigate(href: string): void };

/**
 * Copies the code with one click; the icon turns to a tick for 2 s and
 * "Copied" is read out. Without a clipboard, the code's text is selected
 * so it can be copied by hand. The code is never logged.
 */
export function CopyCodeButton({
  code,
  target,
}: {
  code: string;
  /** The element holding the code, selected when copying can't work. */
  target: RefObject<HTMLElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const [said, setSaid] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const select = () => {
    const el = target.current;
    const sel = typeof window === "undefined" ? null : window.getSelection();
    if (!el || !sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    setSaid("Code selected. Copy it yourself.");
  };
  const copy = async () => {
    const clip =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clip?.writeText) return select();
    try {
      await clip.writeText(code);
    } catch {
      return select();
    }
    setCopied(true);
    setSaid("Copied");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setSaid("");
    }, COPIED_MS);
  };
  const Icon = copied ? Check : Copy;
  return (
    <>
      <button
        type="button"
        aria-label="Copy backup code"
        onClick={() => void copy()}
        className="inline-flex size-11 flex-none items-center justify-center rounded-full border border-line bg-white text-ink-2 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep"
      >
        <Icon
          aria-hidden
          className={cn("size-[18px]", copied && "text-ok-deep")}
        />
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
  );
}

/** The seconds left before Continue works: 3, 2, 1, then 0. */
export function useCountdown(from = SAVE_WAIT_S) {
  const [left, setLeft] = useState(from);
  const done = left <= 0;
  // One steady clock from the first render: a re-render never restarts it.
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [done]);
  return left;
}

/**
 * One backup code, shown once: large, with a copy button beside it. Continue
 * waits 3 s (3, 2, 1, read out too; the same wait with reduced motion) so
 * the code is seen before it can go. The caller forgets the code on
 * Continue. "Lost your phone?" leads to moving to a new authenticator app.
 */
export function SaveBackupCode({
  code,
  kind,
  onContinue,
  continueLabel = "Continue",
  eyebrow,
  page = false,
  lostPhone,
}: {
  code: string;
  kind: SaveKind;
  onContinue(): void;
  continueLabel?: string;
  eyebrow?: string;
  /** A page of its own (a heading); in a dialog, its title is the heading. */
  page?: boolean;
  lostPhone?: LostPhoneLink;
}) {
  const left = useCountdown();
  const id = useId();
  const codeRef = useRef<HTMLSpanElement>(null);
  const waiting = left > 0;
  const go = () => {
    if (!waiting) onContinue();
  };
  const lost = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!lostPhone) return;
    e.preventDefault();
    onContinue();
    lostPhone.navigate(lostPhone.href);
  };
  return (
    <div>
      {page ? (
        <AuthHeading eyebrow={eyebrow} title={TITLE[kind]} sub={SUB[kind]} />
      ) : (
        <p className="mb-4 text-[14.5px] text-ink-2">{SUB[kind]}</p>
      )}
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex items-center gap-3 rounded-2xl bg-bg p-4"
      >
        <span id={`${id}-label`} className="sr-only">
          Your backup code
        </span>
        <span
          ref={codeRef}
          className="min-w-0 flex-1 break-all font-mono text-[26px] font-semibold tracking-wider"
        >
          {code}
        </span>
        <CopyCodeButton code={code} target={codeRef} />
      </div>
      <p
        aria-live="polite"
        className="mt-4 text-center text-[13px] text-ink-3 print:hidden"
      >
        {waiting
          ? `You can continue in ${left}…`
          : "Saved it? You can continue."}
      </p>
      <Button
        className={cn(
          "mt-2 w-full print:hidden",
          waiting &&
            "cursor-not-allowed opacity-40 motion-safe:blur-[1px] hover:brightness-100 active:scale-100",
        )}
        aria-disabled={waiting || undefined}
        onClick={go}
      >
        {continueLabel}
      </Button>
      {lostPhone && (
        <p className="mt-3 text-center text-[13px] print:hidden">
          <a
            href={lostPhone.href}
            onClick={lost}
            className="inline-flex min-h-11 items-center font-semibold text-mint-deep"
          >
            Lost your phone? Move to a new authenticator app
          </a>
        </p>
      )}
    </div>
  );
}

/**
 * Shows the new backup code core issued after a backup code confirmed an
 * action, on top of whatever is open, until Continue (or the lost-phone
 * link) forgets it. Mounted once per app, inside the signed-in shell.
 */
export function NewBackupCodeHost({
  lostPhone,
}: {
  lostPhone?: LostPhoneLink;
}) {
  const code = useSyncExternalStore(
    onNewBackupCode,
    pendingBackupCode,
    () => null,
  );
  return (
    <Dialog
      open={code !== null}
      // Only Continue closes it: Escape can't skip the code.
      onClose={() => {}}
      title={TITLE.new}
    >
      {code !== null && (
        <SaveBackupCode
          key={code}
          code={code}
          kind="new"
          onContinue={clearNewBackupCode}
          lostPhone={lostPhone}
        />
      )}
    </Dialog>
  );
}
