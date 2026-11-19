"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { ShareLinkOut } from "@/lib/api/admin-contract";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

/** One link to show: who it is for, and the link core handed back. */
export interface SharedLink {
  /** The person's email address. */
  who: string;
  link: ShareLinkOut;
}

const UNTIL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Core's link may be relative to this app ("/reset-password?token=...") when
 * it has no base address; the person needs the full address.
 */
export function fullLink(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function until(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? UNTIL.format(t) : null;
}

function LinkRow({ item }: { item: SharedLink }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = fullLink(item.link.url);
  const ends = until(item.link.expires_at);
  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Never logged: the link is a way in to that person's account.
      setFailed(true);
    }
  }
  return (
    <li className="flex flex-col gap-1.5 border-t border-line py-3 first:border-t-0">
      <b className="text-[13.5px] [overflow-wrap:anywhere]">{item.who}</b>
      <code className="block rounded-lg bg-bg px-2.5 py-2 font-mono text-[12.5px] [overflow-wrap:anywhere] select-all">
        {url}
      </code>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void copy()}
          aria-label={`Copy the link for ${item.who}`}
        >
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {ends && (
          <span className="text-[12.5px] text-ink-3">Works until {ends}</span>
        )}
      </span>
      {failed && (
        <span role="alert" className="text-[12.5px] text-bad-deep">
          Couldn&apos;t copy. Select the link and copy it yourself.
        </span>
      )}
    </li>
  );
}

/** The links to share, with the one-time warning. */
export function SharedLinks({ links }: { links: SharedLink[] }) {
  return (
    <>
      <p className="text-sm text-ink-2">
        {links.length === 1
          ? "No email was sent. Share this link with the person yourself. It is shown only now: once you close this, it can't be shown again."
          : "No emails were sent. Share each link with its person yourself. They are shown only now: once you close this, they can't be shown again."}
      </p>
      <ul
        aria-label="Links to share"
        className="mt-3 flex max-h-80 flex-col overflow-auto"
      >
        {links.map((l, i) => (
          <LinkRow key={`${i}-${l.who}`} item={l} />
        ))}
      </ul>
    </>
  );
}

/**
 * The demo deployment sends no email, so core hands the link back: shown
 * here once, and forgotten when the dialog closes. It is never stored,
 * cached, logged or put in this app's address.
 */
export function ShareLinkDialog({
  title,
  links,
  onClose,
}: {
  title: string;
  links: SharedLink[];
  onClose(): void;
}) {
  return (
    <Dialog open onClose={onClose} title={title}>
      <SharedLinks links={links} />
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}
