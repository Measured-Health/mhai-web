import { dateLabel } from "@/lib/format";
import { Button } from "@mhai/ui/button";

/**
 * A credential is write-only, so it is only ever "Set · {date}" or "Not
 * set". Replace (when given) lets the person type a new one.
 */
export function CredentialRow({
  label,
  setAt,
  onReplace,
  disabled,
  describedBy,
  replaceId,
}: {
  label: string;
  setAt: string | null;
  onReplace?(): void;
  disabled?: boolean;
  describedBy?: string;
  replaceId?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[12.5px] text-ink-2">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px]">
          {setAt ? `Set · ${dateLabel(setAt)}` : "Not set"}
        </span>
        {onReplace && (
          <Button
            id={replaceId}
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={onReplace}
          >
            Replace
          </Button>
        )}
      </div>
    </div>
  );
}
