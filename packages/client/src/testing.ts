import { applicationErrorMap, RpcError } from "@pcobooster/contracts/errors";
import { Schema } from "effect";

/** Valid declared failures for boundary tests, rather than malformed transport doubles. */
export const makeRpcError = (
  code: string,
  options: { status?: number; message?: string; data?: unknown } = {}
): RpcError => {
  const definition = Object.entries(applicationErrorMap).find(
    ([key]) => key === code
  )?.[1];
  const message = options.message ?? "Test failure";
  const data = options.data ?? {
    message,
    service: "planning-center",
    reason: "test",
    resource: "test",
  };
  const details =
    code === "POSITION_MISMATCH"
      ? {
          selected: {
            teamId: "t",
            teamName: "Team",
            positionId: "p",
            positionName: "Position",
          },
          created: { planPersonId: "pp", teamPositionName: "Other position" },
        }
      : undefined;
  const withDetails = details === undefined ? data : { ...data, details };
  return Schema.decodeUnknownSync(RpcError)({
    _tag: "RpcError",
    code,
    status: options.status ?? definition?.status,
    message,
    data:
      definition === undefined
        ? withDetails
        : Schema.decodeUnknownSync(definition.data)(withDetails),
  });
};
