"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

/** Links hovering or focusing a source tag to its source card. */
const Ctx = createContext<{
  source: string | null;
  set(s: string | null): void;
}>({ source: null, set() {} });

export const useHighlight = () => useContext(Ctx);

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [source, set] = useState<string | null>(null);
  return <Ctx.Provider value={{ source, set }}>{children}</Ctx.Provider>;
}
