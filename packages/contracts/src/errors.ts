import type { ErrorMap } from "@orpc/contract";
import { z } from "zod";

export const messageErrorDataSchema = z.object({ message: z.string() });

export const notFoundErrorDataSchema = messageErrorDataSchema.extend({
  resource: z.string(),
});

export const conflictErrorDataSchema = messageErrorDataSchema.extend({
  reason: z.string(),
});

export const externalServiceErrorDataSchema = messageErrorDataSchema.extend({
  service: z.string(),
});

export const rateLimitedErrorDataSchema = externalServiceErrorDataSchema.extend(
  {
    retryAfterSeconds: z.number().nonnegative().optional(),
  }
);

export const applicationErrorMap = {
  UNAUTHORIZED: {
    status: 401,
    data: messageErrorDataSchema,
  },
  FORBIDDEN: {
    status: 403,
    data: messageErrorDataSchema,
  },
  NOT_FOUND: {
    status: 404,
    data: notFoundErrorDataSchema,
  },
  BAD_REQUEST: {
    status: 400,
    data: messageErrorDataSchema,
  },
  CONFLICT: {
    status: 409,
    data: conflictErrorDataSchema,
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    data: rateLimitedErrorDataSchema,
  },
  BAD_GATEWAY: {
    status: 502,
    data: externalServiceErrorDataSchema,
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    data: messageErrorDataSchema,
  },
} as const satisfies ErrorMap;

export type ApplicationErrorCode = keyof typeof applicationErrorMap;
