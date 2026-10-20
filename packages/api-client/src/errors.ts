/** A refused or failed call to the app's own API proxy: its status and problem `code` only. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}
