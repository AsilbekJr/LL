/**
 * A database write that Postgres (or PostgREST) rejected, with its error code.
 * The code lets the offline outbox tell a permanent rejection (the row can
 * never be written, e.g. its card was deleted) from a temporary failure
 * (network, expired session, server down) that is worth retrying.
 */
export class DbWriteError extends Error {
  readonly code: string | undefined;

  constructor(error: { message: string; code?: string }) {
    super(error.message);
    this.name = "DbWriteError";
    this.code = error.code;
  }
}

/**
 * Permanent = Postgres data exception (class 22) or integrity violation
 * (class 23: foreign key, check, not-null...). Sending the same payload
 * again will fail the same way, so retrying forever would block every
 * later answer in the queue.
 */
export function isPermanentWriteError(error: unknown): boolean {
  return (
    error instanceof DbWriteError && typeof error.code === "string" && /^2[23][0-9A-Z]{3}$/.test(error.code)
  );
}
