import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB; the offline outbox needs one.
import "fake-indexeddb/auto";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// The offline outbox encrypts and writes to IndexedDB before the UI updates,
// which can take over a second when the whole suite runs in parallel.
configure({ asyncUtilTimeout: 5000 });

// Component tests run in mock mode unless a test stubs the flag itself.
process.env.NEXT_PUBLIC_USE_MOCK ??= "true";
