import { faultOutcome, productFaultSchema } from "@pcobooster/contracts/faults";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { PersistenceFailure } from "@pcobooster/contracts/faults/persistence-failure";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const wire = Schema.toCodecJson(productFaultSchema);
const encode = Schema.encodeSync(wire);
const decode = Schema.decodeUnknownSync(wire);

describe("faults on the wire", () => {
  it("never encodes server-only detail", () => {
    const external = new ExternalServiceFailure({
      message: "Planning Center request failed.",
      service: "planning-center",
      cause: new Error("token=secret"),
    });
    const persistence = new PersistenceFailure({
      detail: "Could not load account data.",
      operation: "listAccounts",
      cause: new Error("D1_ERROR: no such table"),
    });

    expect(encode(external)).toStrictEqual({
      _tag: "ExternalServiceFailure",
      message: "Planning Center request failed.",
      service: "planning-center",
    });
    expect(encode(persistence)).toStrictEqual({
      _tag: "PersistenceFailure",
      message: "Internal server error",
    });
  });

  it("decodes each fault into its class, with the fixed persistence message", () => {
    const notFound = decode(
      encode(new NotFound({ message: "No plan", resource: "plan" }))
    );
    const persistence = decode(
      encode(new PersistenceFailure({ detail: "secret detail" }))
    );

    expect(notFound).toBeInstanceOf(NotFound);
    expect(persistence).toBeInstanceOf(PersistenceFailure);
    expect(persistence.message).toBe("Internal server error");
    expect(persistence).not.toHaveProperty("detail");
  });

  it("keeps main's status and code for every fault", () => {
    expect(faultOutcome).toStrictEqual({
      Unauthenticated: { status: 401, code: "UNAUTHORIZED" },
      Forbidden: { status: 403, code: "FORBIDDEN" },
      InvalidInput: { status: 400, code: "BAD_REQUEST" },
      RequestRejected: { status: 400, code: "BAD_REQUEST" },
      NotFound: { status: 404, code: "NOT_FOUND" },
      Conflict: { status: 409, code: "CONFLICT" },
      AlreadyScheduled: { status: 409, code: "ALREADY_SCHEDULED" },
      PositionMismatch: { status: 409, code: "POSITION_MISMATCH" },
      RateLimited: { status: 429, code: "TOO_MANY_REQUESTS" },
      ExternalServiceFailure: { status: 502, code: "BAD_GATEWAY" },
      PersistenceFailure: { status: 500, code: "INTERNAL_SERVER_ERROR" },
      InternalError: { status: 500, code: "INTERNAL_SERVER_ERROR" },
    });
  });
});
