import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hospitals" };

// A placeholder until the hospital list lands (Plan 7b, Task 9).
export default function HospitalsPage() {
  return (
    <main className="p-6">
      <h1 className="font-display text-3xl font-black text-ink">Hospitals</h1>
    </main>
  );
}
