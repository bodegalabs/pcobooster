import { planSchema } from "@pcobooster/contracts/catalog";
import { demoStartOutputSchema } from "@pcobooster/contracts/demo";
import { RpcError } from "@pcobooster/contracts/errors";
import { planItemSchema } from "@pcobooster/contracts/plan-item-schemas";
import { ProductRpc } from "@pcobooster/contracts/router";
import {
  isoInstantSchema,
  isoInstantWithOffsetSchema,
} from "@pcobooster/contracts/schema";
import { Schema, Result } from "effect";
import { describe, expect, it } from "vitest";

describe("native Effect RPC contracts", () => {
  it("contains every product operation with a single declared failure schema", () => {
    expect(ProductRpc.requests.size).toBe(48);
    expect(ProductRpc.requests.has("health")).toBeFalsy();
    expect(ProductRpc.requests.has("people.candidateDetails")).toBeTruthy();
    expect(ProductRpc.requests.has("schedule.assign")).toBeTruthy();
    for (const request of ProductRpc.requests.values()) {
      expect(request.errorSchema).toBe(RpcError);
    }
  });

  it("roundtrips valid native dates through the JSON codec used by RPC", () => {
    const value = {
      id: "plan-1",
      title: "Sunday",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      sortDate: new Date("2026-09-20T00:30:00Z"),
    };
    const codec = Schema.toCodecJson(planSchema);
    const encoded = Schema.encodeSync(codec)(value);
    expect(encoded).toStrictEqual({
      id: value.id,
      title: value.title,
      createdAt: "2026-09-01T00:00:00.000Z",
      sortDate: "2026-09-20T00:30:00.000Z",
    });
    const json = JSON.stringify(encoded);
    expect(Schema.decodeUnknownSync(codec)(JSON.parse(json))).toStrictEqual(
      value
    );
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(codec)({
          id: value.id,
          title: value.title,
          createdAt: "2026-09-01T00:00:00.000Z",
          sortDate: "invalid",
        })
      )
    ).toBeFalsy();
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(Schema.toCodecJson(planItemSchema))({})
      )
    ).toBeFalsy();
  });

  it("roundtrips rate limits with actionable retry data and a real error instance", () => {
    const failure = new RpcError({
      code: "TOO_MANY_REQUESTS",
      status: 429,
      message: "Wait before retrying",
      data: {
        message: "Wait before retrying",
        service: "Planning Center",
        retryAfterSeconds: 3,
      },
      retryAfterSeconds: 3,
    });
    const codec = Schema.toCodecJson(RpcError);
    const json = JSON.stringify(Schema.encodeSync(codec)(failure));
    const result = Schema.decodeUnknownSync(codec)(JSON.parse(json));
    expect(result).toBeInstanceOf(RpcError);
    expect(result.code).toBe("TOO_MANY_REQUESTS");
    expect(result.retryAfterSeconds).toBe(3);
    expect(result.data).toStrictEqual(failure.data);
  });

  it("rejects inconsistent statuses, malformed conflict data, and private details", () => {
    const failure = {
      _tag: "RpcError",
      code: "ALREADY_SCHEDULED",
      status: 409,
      message: "Duplicate",
      data: { message: "Duplicate", details: "Already assigned" },
    };
    const decode = Schema.decodeUnknownResult(Schema.toCodecJson(RpcError));
    expect(Result.isSuccess(decode(failure))).toBeTruthy();
    expect(Result.isSuccess(decode({ ...failure, status: 500 }))).toBeFalsy();
    expect(
      Result.isSuccess(
        decode({
          ...failure,
          data: { message: "Duplicate", details: { private: true } },
        })
      )
    ).toBeFalsy();
    expect(
      Result.isSuccess(
        decode({
          ...failure,
          data: { message: "Duplicate", accessToken: "secret" },
        })
      )
    ).toBeFalsy();
    expect(
      Result.isSuccess(decode({ ...failure, code: "POSITION_MISMATCH" }))
    ).toBeFalsy();
  });

  it("requires real calendar instants and preserves the supplied offset", () => {
    const value = "2028-02-29T00:30:00-07:00";
    expect(Schema.decodeUnknownSync(isoInstantWithOffsetSchema)(value)).toBe(
      value
    );
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(isoInstantWithOffsetSchema)(
          "2026-02-29T00:30:00-07:00"
        )
      )
    ).toBeFalsy();
    expect(
      Result.isSuccess(Schema.decodeUnknownResult(isoInstantSchema)(value))
    ).toBeFalsy();
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(isoInstantSchema)("2026-02-30T00:30:00Z")
      )
    ).toBeFalsy();
  });

  it("returns a derived native demo session credential independently of browser cookies", () => {
    expect(
      Schema.decodeUnknownSync(demoStartOutputSchema)({
        demo: true,
        sessionToken: "derived-token",
      })
    ).toStrictEqual({ demo: true, sessionToken: "derived-token" });
  });
});
