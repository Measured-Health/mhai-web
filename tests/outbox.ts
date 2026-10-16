import { ownerId } from "@/lib/offline/crypto";
import { createOutbox } from "@/lib/offline/outbox";

/** Test helpers for the offline outbox (fake-indexeddb in unit tests). */
export const resetOutbox = () =>
  new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase("mhai-outbox");
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });

const Q = {
  clinical_question: "Central chest pain for 40 minutes. Likely diagnosis?",
  urgency: "urgent" as const,
  patient_data: { age: 54, sex: "male" as const, symptoms: ["Chest pain"] },
};

/** One waiting question saved for `username`, as the app would save it. */
export async function seedOutbox(username: string) {
  await createOutbox().add(await ownerId(username), "query", {
    q: Q,
    localId: "local-seeded",
  });
}

export const outboxCount = async (username: string) =>
  (await createOutbox().list(await ownerId(username))).length;
