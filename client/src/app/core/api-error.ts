/** Every failed API call surfaces as an ApiError (thrown by apiInterceptor). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A human-readable message for anything a subscription's error callback receives. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred.';
}
