import { Schema, Struct, Result } from "effect";

export const messageErrorDataSchema = Schema.Struct({ message: Schema.String });
export const notFoundErrorDataSchema = Schema.Struct({
  ...messageErrorDataSchema.fields,
  resource: Schema.String,
});
export const conflictErrorDataSchema = Schema.Struct({
  ...messageErrorDataSchema.fields,
  reason: Schema.String,
});
export const externalServiceErrorDataSchema = Schema.Struct({
  ...messageErrorDataSchema.fields,
  service: Schema.String,
});
export const rateLimitedErrorDataSchema = Schema.Struct({
  ...externalServiceErrorDataSchema.fields,
  retryAfterSeconds: Schema.optional(
    Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
  ),
});
export const scheduleAlreadyScheduledErrorDataSchema = Schema.Struct({
  message: Schema.String,
  details: Schema.optional(Schema.String),
});
const requiredId = Schema.Trim.check(Schema.isMinLength(1));
export const schedulePositionMismatchErrorDataSchema = Schema.Struct({
  message: Schema.String,
  details: Schema.Struct({
    selected: Schema.Struct({
      teamId: requiredId,
      teamName: Schema.String,
      positionId: requiredId,
      positionName: Schema.String,
    }),
    created: Schema.Struct({
      planPersonId: requiredId,
      teamPositionName: Schema.String,
    }),
  }),
});

/** Safe public details and status for each declared product failure. */
export const applicationErrorMap = {
  CLIENT_CLOSED_REQUEST: { status: 499, data: messageErrorDataSchema },
  UNAUTHORIZED: { status: 401, data: messageErrorDataSchema },
  FORBIDDEN: { status: 403, data: messageErrorDataSchema },
  NOT_FOUND: { status: 404, data: notFoundErrorDataSchema },
  BAD_REQUEST: { status: 400, data: messageErrorDataSchema },
  CONFLICT: { status: 409, data: conflictErrorDataSchema },
  ALREADY_SCHEDULED: {
    status: 409,
    data: scheduleAlreadyScheduledErrorDataSchema,
  },
  POSITION_MISMATCH: {
    status: 409,
    data: schedulePositionMismatchErrorDataSchema,
  },
  TOO_MANY_REQUESTS: { status: 429, data: rateLimitedErrorDataSchema },
  BAD_GATEWAY: { status: 502, data: externalServiceErrorDataSchema },
  INTERNAL_SERVER_ERROR: { status: 500, data: messageErrorDataSchema },
} as const;

export type ApplicationErrorCode = keyof typeof applicationErrorMap;
const applicationErrorCodeSchema = Schema.Literals([
  "CLIENT_CLOSED_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "BAD_REQUEST",
  "CONFLICT",
  "ALREADY_SCHEDULED",
  "POSITION_MISMATCH",
  "TOO_MANY_REQUESTS",
  "BAD_GATEWAY",
  "INTERNAL_SERVER_ERROR",
]);
const rpcErrorFields = Schema.Struct({
  code: applicationErrorCodeSchema,
  status: Schema.Literals([400, 401, 403, 404, 409, 429, 499, 500, 502]),
  message: Schema.String,
  data: Schema.StructWithRest(messageErrorDataSchema, [
    Schema.Record(Schema.String, Schema.Json),
  ]),
  retryAfterSeconds: Schema.optional(
    Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
  ),
})
  .mapFields(Struct.map(Schema.mutableKey))
  .check(
    Schema.makeFilter((failure) => {
      const definition = applicationErrorMap[failure.code];
      return failure.status === definition.status &&
        Result.isSuccess(
          Schema.decodeUnknownResult(definition.data, {
            onExcessProperty: "error",
          })(failure.data)
        )
        ? undefined
        : "The failure status and details must match its declared code";
    })
  );

/** Declared RPC failure, preserved as an actionable error by every client. */
const { TaggedError: taggedFailure } = Schema;
export class RpcError extends taggedFailure<RpcError>()(
  "RpcError",
  rpcErrorFields
) {}
