import type { WriteOpts } from "./contract";
import type {
  ClearanceOut,
  ClearancesOut,
  ClearanceUpload,
  NamedAccessOut,
  NarrowBody,
  RevokeBody,
} from "./clearances-contract";
import { createLiveClearances } from "./live-clearances";
import { createMockClearances } from "./mock-clearances";

/** The hospital admin's clearance-letter calls (Plan 11). Scoped to one hospital. */
export interface ClearanceClient {
  /** The effective switch position; a 404 (the key is off) reads as Off. */
  getNamedAccess(): Promise<NamedAccessOut>;
  /** Newest first. */
  listClearances(): Promise<ClearancesOut>;
  getClearance(id: string): Promise<ClearanceOut>;
  uploadClearance(u: ClearanceUpload, opts: WriteOpts): Promise<ClearanceOut>;
  revokeClearance(
    id: string,
    body: RevokeBody,
    opts: WriteOpts,
  ): Promise<ClearanceOut>;
  narrowClearance(
    id: string,
    body: NarrowBody,
    opts: WriteOpts,
  ): Promise<ClearanceOut>;
  /** One watermarked page image, held in memory only. */
  getClearancePage(id: string, n: number): Promise<Blob>;
}

let client: ClearanceClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getClearanceClient(): ClearanceClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockClearances()
      : createLiveClearances());
}
