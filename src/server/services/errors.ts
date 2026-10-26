/** User-facing error with a safe message. Anything else is reported as a generic failure. */
export class AppError extends Error {
  constructor(message: string, public readonly code: "not_found" | "forbidden" | "invalid" | "conflict" | "limit" | "rate_limited" = "invalid") {
    super(message);
    this.name = "AppError";
  }
}
