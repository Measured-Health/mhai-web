import {
  MISSING_CONSULTATION,
  NotFoundState,
} from "@/components/states/not-found-state";

export default function NotFound() {
  return <NotFoundState message={MISSING_CONSULTATION} />;
}
