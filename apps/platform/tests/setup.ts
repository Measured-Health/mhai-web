import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// Component tests run in mock mode unless a test stubs the flag itself.
process.env.NEXT_PUBLIC_USE_MOCK ??= "true";
