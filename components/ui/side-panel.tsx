"use client";
import type { ReactNode } from "react";
import { Sheet } from "./sheet";

/**
 * A side panel from `md`, a bottom sheet below it (R13): the Sheet's right
 * variant. Traps focus, closes on Esc (not while a modal dialog is open on
 * top) and returns focus on close.
 */
export function SidePanel(props: {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
}) {
  return <Sheet side="right" {...props} />;
}
