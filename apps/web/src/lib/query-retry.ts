import { ORPCError } from "@orpc/client";

const MAX_READ_RETRIES = 1;
const SERVER_ERROR_STATUS = 500;

/**
 * Retries a failed read once, unless the API answered with a 4xx. Sign-in, permission,
 * missing-record, and rate-limit answers come back the same on a retry, which would only
 * spend another Planning Center request. Server and network failures may be transient.
 */
export const retryTransientReadFailure = (
  failureCount: number,
  error: Error
): boolean =>
  failureCount < MAX_READ_RETRIES &&
  !(error instanceof ORPCError && error.status < SERVER_ERROR_STATUS);
