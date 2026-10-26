import type { ReactNode } from "react";

// The chart data types, apart from the chart components so lib code (the
// usage alerts wording) can build columns and bars without importing UI.

/** One column in a ColumnChart. */
export interface Column {
  key: string;
  /** e.g. "14 Oct" or "Week of 6 Oct". */
  label: string;
  value: number;
  /** Why this column is marked, e.g. "about 3× the usual"; null when not. */
  mark?: string | null;
  /** Under the small-group rule: reads "Fewer than 5", draws no column, `value` is ignored. */
  hidden?: boolean;
  /** Written instead of the value, e.g. "No data yet"; draws no column. */
  text?: string;
  /** A second mark on the column, e.g. the median of similar hospitals; null or absent draws none. */
  second?: number | null;
}

/** One row in a BarList. */
export interface BarItem {
  key: string;
  label: ReactNode;
  /** Bar length in the list's scale; null draws no bar. */
  value: number | null;
  /** Written beside the bar, e.g. "412" or "62%". */
  text: string;
  /** Under the small-group rule: writes "Fewer than 5" and draws no bar. */
  hidden?: boolean;
  icon?: ReactNode;
  /** A line under the label, e.g. the change against the previous period. Never with a hidden value. */
  note?: ReactNode;
  /** Bar colour class; `bg-mint` by default. */
  barClass?: string;
}
