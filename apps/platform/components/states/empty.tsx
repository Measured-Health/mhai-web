import type { ReactNode } from "react";

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-lilac-2 bg-white px-6 py-10 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      {children && (
        <div className="mt-1.5 text-[13.5px] text-ink-3">{children}</div>
      )}
    </div>
  );
}
