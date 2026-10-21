import { useId, type ReactNode } from "react";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";

/**
 * One number on Usage. `muted` is for words in place of a number ("Fewer
 * than 5", "No data yet"); `icon` sits beside the label (a severity's icon);
 * `footer` is the change against the previous period.
 */
export function Tile({
  label,
  value,
  icon,
  muted = false,
  footer,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  muted?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="card-v3 px-5 py-4">
      <b
        className={cn(
          "block font-display font-black leading-none",
          muted ? "text-[18px] text-ink-2" : "text-[34px]",
        )}
      >
        {value}
      </b>
      <span
        className={cn(
          "mt-1 text-[12.5px] text-ink-3 [overflow-wrap:anywhere]",
          icon ? "flex items-center gap-1.5" : "block",
        )}
      >
        {icon}
        {label}
      </span>
      {footer}
    </div>
  );
}

export function Card({
  title,
  level = 3,
  children,
}: {
  title: string;
  level?: 3 | 4;
  children: ReactNode;
}) {
  const id = useId();
  const H = level === 3 ? "h3" : "h4";
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <H id={id} className="mb-3 text-[14px] font-semibold">
        {title}
      </H>
      {children}
    </section>
  );
}

/** A failure on Usage, with Try again. */
export function RetryBanner({
  title,
  children,
  onRetry,
}: {
  title: string;
  children: ReactNode;
  onRetry: () => void;
}) {
  return (
    <Banner tone="bad" title={title}>
      {children}
      <span className="mt-2 block">
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      </span>
    </Banner>
  );
}
