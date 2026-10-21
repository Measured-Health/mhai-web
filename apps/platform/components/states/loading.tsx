import { Skeleton } from "@mhai/ui/skeleton";

/** A placeholder while a page's data loads. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3 p-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
