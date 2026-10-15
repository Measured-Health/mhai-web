import {
  MISSING_CONSULTATION,
  NotFoundState,
} from "@/components/states/not-found-state";

// Outside the shell (and the sign-in gate), so it brings its own <main>.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col">
      <NotFoundState message={MISSING_CONSULTATION} />
    </main>
  );
}
