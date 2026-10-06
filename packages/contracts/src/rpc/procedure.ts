/**
 * The only two ways to declare a procedure. Both fail with `ProductFault` and carry the
 * `ProcedureKind` annotation, so no procedure can miss either; `product.test.ts` checks every
 * procedure in `ProductRpc` has a kind. A flagged procedure also carries `RequiredFeature`.
 */
import { productFaultSchema } from "@pcobooster/contracts/faults";
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { REQUEST_PRIORITY_HEADER } from "@pcobooster/contracts/request-priority";
import { RequiredFeature } from "@pcobooster/contracts/rpc/required-feature";
import { Context } from "effect";
import type { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";

/**
 * read:  safe to retry; stops when the caller disconnects.
 * write: never retried automatically; the server runs it uninterruptibly so a provider write
 *        and its audit always finish and report the real outcome. A prepared write reopens
 *        interruption for its prepare step only (`preparedWrite` in packages/api).
 */
export type ProcedureKindValue = "read" | "write";

/** The kind annotation on each procedure; read by the server's ProcedureScope and the client. */
export class ProcedureKind extends Context.Service<
  ProcedureKind,
  ProcedureKindValue
>()("@pcobooster/contracts/ProcedureKind") {}

export interface ProcedureSchemas<
  Payload extends Schema.Top,
  Success extends Schema.Top,
> {
  /** `Schema.Void` for a procedure that takes no input (main's `.output` without `.input`). */
  readonly payload: Payload;
  readonly success: Success;
  readonly feature?: FeatureFlagName;
}

/**
 * A declared procedure. `kind` is also visible to types, so client APIs that only make sense for
 * reads (speculative priority, prefetching) accept read tags only.
 */
export type Procedure<
  Kind extends ProcedureKindValue,
  Tag extends string,
  Payload extends Schema.Top,
  Success extends Schema.Top,
> = Rpc.Rpc<
  Tag,
  // Mirrors `Rpc.make`'s payload type; a schema payload passes through unchanged.
  Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
  Success,
  typeof productFaultSchema
> & {
  readonly kind: Kind;
};

const procedure =
  <const Kind extends ProcedureKindValue>(kind: Kind) =>
  <
    const Tag extends string,
    Payload extends Schema.Top,
    Success extends Schema.Top,
  >(
    tag: Tag,
    { payload, success, feature }: ProcedureSchemas<Payload, Success>
  ): Procedure<Kind, Tag, Payload, Success> => {
    const declared = Rpc.make(tag, {
      payload,
      success,
      error: productFaultSchema,
    }).annotate(ProcedureKind, kind);
    return Object.assign(
      feature === undefined
        ? declared
        : declared.annotate(RequiredFeature, feature),
      { kind }
    );
  };

export const read = procedure("read");
export const write = procedure("write");

/** The kind a procedure was declared with; undefined only for an `Rpc.make` that skipped both. */
export const procedureKindOf = (
  rpc: Pick<Rpc.AnyWithProps, "annotations">
): ProcedureKindValue | undefined =>
  Context.getOrUndefined(rpc.annotations, ProcedureKind);

/** Request headers the RPC transport reads, lowercase as Effect stores them. */
export const RPC_HEADERS = {
  /** RPC message header, per call. Absent means interactive. */
  priority: REQUEST_PRIORITY_HEADER,
  /** HTTP header: `<web|ssr|expo|deploy>;rpc=<protocol version>` (`client-version.ts`). */
  client: "x-pcobooster-client",
  requestId: "x-request-id",
} as const;

/** Response header on every RPC response: the API's release, for version-skew handling. */
export const SERVER_VERSION_HEADER = "x-pcobooster-version";
