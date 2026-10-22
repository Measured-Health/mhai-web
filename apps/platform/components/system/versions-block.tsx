import type { VersionsValue } from "@/lib/ops/health";
import { partLabel } from "@/lib/ops/labels";

/** Which version each part runs, folded away until asked for. */
export function VersionsBlock({ value }: { value: VersionsValue }) {
  return (
    <details className="group">
      <summary className="min-h-11 cursor-pointer py-2 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep">
        Versions
      </summary>
      <ul className="divide-y divide-line">
        {value.map((v) => (
          <li
            key={v.part}
            className="flex justify-between gap-4 py-2 text-[14px]"
          >
            <span>{partLabel[v.part]}</span>
            <span className="font-mono text-ink-2">{v.label}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
