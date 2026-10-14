import type { ResultView } from "@/lib/result-view";
import { Banner } from "../ui/banner";

export function ResultBanner({ view }: { view: ResultView }) {
  if (!view.banner) return null;
  const open = view.claims.total - view.claims.verified;
  const body =
    view.banner.tone === "bad"
      ? "The evidence didn't support enough of this answer for the system to stand behind it."
      : open > 0
        ? `${open} recommendation${open === 1 ? "" : "s"} couldn't be matched to a guideline. Check before acting.`
        : "Check this answer against your own judgement before acting.";
  return (
    <div className="mb-3.5">
      <Banner tone={view.banner.tone} title={view.banner.title}>
        {body}
      </Banner>
    </div>
  );
}
