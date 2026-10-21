import { useId, type ReactNode } from "react";

/** One part of a hospital's page: a labelled card with an optional action. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={id} className="text-[15px] font-semibold">
          {title}
        </h2>
        {action && <div className="ml-auto flex gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}
