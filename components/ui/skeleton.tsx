import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-[sk_1.4s_linear_infinite] rounded-lg bg-[linear-gradient(90deg,#ece4ef_0%,#f7f3f9_40%,#ece4ef_80%)] bg-[length:300%_100%]",
        className,
      )}
    />
  );
}
