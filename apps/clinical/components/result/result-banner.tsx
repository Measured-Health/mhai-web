import type { ResultView } from "@/lib/result-view";
import { Banner } from "@mhai/ui/banner";

export function ResultBanner({ view }: { view: ResultView }) {
  if (!view.banner) return null;
  return (
    <div className="mb-3.5">
      <Banner tone={view.banner.tone} title={view.banner.title}>
        {view.banner.body}
      </Banner>
    </div>
  );
}
