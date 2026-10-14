export function ErrorSummary({
  errors,
  labels,
}: {
  errors: Record<string, string | undefined>;
  labels: Record<string, string>;
}) {
  const keys = Object.keys(errors).filter((k) => errors[k]);
  if (!keys.length) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-bad-line bg-bad-wash px-4 py-3 text-[13.5px] text-bad-deep"
    >
      <b className="block">
        {keys.length === 1 ? "1 thing needs" : `${keys.length} things need`}{" "}
        fixing before we can analyse
      </b>
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && " · "}
          <a href={`#f-${k}`} className="underline">
            {labels[k]}: {errors[k]}
          </a>
        </span>
      ))}
    </div>
  );
}
