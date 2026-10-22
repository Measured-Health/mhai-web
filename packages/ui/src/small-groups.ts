// The small-group rule (analysis design; usage alert analytics design §4):
// any number from a group of fewer than 5 shows "Fewer than 5". The server
// hides such values; the UI shows the words and never a bar. Shared by
// Usage (Plan 5b) and Analysis (Plan 6).

export const SMALL_GROUP_MIN = 5;
export const FEWER_THAN_5 = "Fewer than 5";

/** 1 to 4: a count the server should have hidden. Zero identifies no one. */
export const isSmallCount = (n: number) => n > 0 && n < SMALL_GROUP_MIN;
