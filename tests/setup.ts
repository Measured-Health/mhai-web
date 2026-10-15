import "@testing-library/jest-dom/vitest";
// jsdom has no IndexedDB; the offline outbox needs one.
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// Component tests run in mock mode unless a test stubs the flag itself.
process.env.NEXT_PUBLIC_USE_MOCK ??= "true";
