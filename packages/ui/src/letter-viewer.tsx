"use client";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaType } from "@mhai/api-client/request";
import { Button } from "./button";
import { cn } from "./cn";
import { Dialog } from "./dialog";
import { LETTER_MAX_PAGES } from "./clearances";

/**
 * The only page types shown, and only ever in an `<img>`, where no script
 * runs. The server makes PNG or JPEG pages; the demos draw SVG ones.
 */
const PAGE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
];

type Result = { key: string; url: string | null };

/**
 * A clearance letter, one server-made page image at a time. Only the shown
 * page is fetched; its Blob lives only in an object URL, which is revoked
 * when the page changes, on close and on unmount. Nothing is cached or
 * stored, and there is no download, print or open-in-new-tab control.
 *
 * A modal dialog at every width (full width below `md`), so it never stacks
 * a sheet on the side panel it is opened from. Hidden in print.
 */
export function LetterViewer({
  title,
  pages,
  loadPage,
  onClose,
}: {
  title: string;
  pages: number;
  loadPage(n: number): Promise<Blob>;
  onClose(): void;
}) {
  const total =
    Number.isFinite(pages) && pages >= 1
      ? Math.min(Math.floor(pages), LETTER_MAX_PAGES)
      : 1;
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${page}:${attempt}`;

  // The latest loader, so a parent's re-render doesn't fetch again.
  const load = useRef(loadPage);
  useEffect(() => {
    load.current = loadPage;
  });

  // Previous is disabled on page 1, so the first focus goes to Close.
  const closeButton = useRef<HTMLButtonElement>(null);
  // A paging button that disables itself at either end hands the focus to
  // the other one, so a keyboard user keeps their place.
  const prevButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const pagedBy = useRef<"prev" | "next" | null>(null);
  useEffect(() => {
    const by = pagedBy.current;
    pagedBy.current = null;
    if (by === "next" && page >= total) prevButton.current?.focus();
    if (by === "prev" && page <= 1) nextButton.current?.focus();
  }, [page, total]);
  const shown = useRef<string | null>(null);
  const revoke = useCallback(() => {
    if (shown.current) URL.revokeObjectURL(shown.current);
    shown.current = null;
  }, []);

  useEffect(() => {
    let live = true;
    load.current(page).then(
      (blob) => {
        if (!live) return;
        if (
          !(blob instanceof Blob) ||
          !PAGE_TYPES.includes(mediaType(blob.type))
        ) {
          setResult({ key, url: null });
          return;
        }
        const url = URL.createObjectURL(blob);
        shown.current = url;
        setResult({ key, url });
      },
      () => {
        if (live) setResult({ key, url: null });
      },
    );
    return () => {
      live = false;
      revoke();
    };
  }, [page, key, revoke]);

  const close = () => {
    revoke();
    onClose();
  };

  const here = result?.key === key ? result : null;
  const label = `Page ${page} of ${total}`;

  return (
    <Dialog
      open
      onClose={close}
      title={title}
      initialFocus={closeButton}
      className={cn(
        "print:hidden",
        "max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:p-4",
        "md:max-h-[92dvh] md:w-[min(760px,92vw)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          ref={prevButton}
          disabled={page <= 1}
          onClick={() => {
            pagedBy.current = "prev";
            setPage((p) => Math.max(1, p - 1));
          }}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Button>
        <p aria-live="polite" className="text-sm font-semibold text-ink-2">
          {label}
        </p>
        <Button
          variant="ghost"
          size="sm"
          ref={nextButton}
          disabled={page >= total}
          onClick={() => {
            pagedBy.current = "next";
            setPage((p) => Math.min(total, p + 1));
          }}
        >
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <button
          ref={closeButton}
          type="button"
          onClick={close}
          aria-label="Close"
          className="ml-auto grid size-11 place-items-center rounded-xl text-ink-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div
        aria-busy={here === null}
        className="mt-3 grid min-h-[50dvh] place-items-center overflow-auto rounded-2xl bg-bg p-2"
      >
        {here === null ? (
          <p className="text-sm text-ink-3">Loading the page…</p>
        ) : here.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: page that must not be optimised or cached
          <img
            src={here.url}
            alt={label}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onError={() => setResult({ key, url: null })}
            className="h-auto max-w-full select-none bg-white shadow"
          />
        ) : (
          <div className="grid justify-items-center gap-3 text-center">
            <p className="text-sm font-semibold">
              Couldn&apos;t show this page
            </p>
            <Button
              variant="soft"
              size="sm"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
