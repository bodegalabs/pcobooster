/**
 * The only ways to declare a product endpoint: `read` (GET) and the `write` methods. Each
 * returns the endpoint the server serves and its wire twin, which clients are built from: the
 * same endpoint with its params, query, and payload reduced to their encoded side, so a client
 * sends what the caller passed and every input rule (trimming, lengths, patterns) runs once, on
 * the server. Both carry the `ProcedureKind` annotation and, when flagged, `RequiredFeature`.
 *
 * One helper per write method, not one taking the method: HttpApi's schema codecs depend on
 * whether the method has a body, which TypeScript cannot resolve for a generic method.
 */
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { urlQuery } from "@pcobooster/contracts/http/query";
import { ProcedureKind } from "@pcobooster/contracts/rpc/procedure";
import type { ProcedureKindValue } from "@pcobooster/contracts/rpc/procedure";
import { RequiredFeature } from "@pcobooster/contracts/rpc/required-feature";
import { Context, Schema } from "effect";
import { HttpApiEndpoint } from "effect/unstable/httpapi";

type Path = `/${string}`;

const PATH_PARAM = /:(?<name>[A-Za-z]+)/gu;

/** Fails at module load when the declared params and the path's `:names` differ. */
const checkParams = (path: Path, params: Schema.Struct.Fields): void => {
  const inPath = [...path.matchAll(PATH_PARAM)]
    .map((match) => match.groups?.name ?? "")
    .toSorted();
  const declared = Object.keys(params).toSorted();
  if (inPath.join(",") !== declared.join(",")) {
    throw new Error(
      `${path} names params [${inPath.join(", ")}] but declares [${declared.join(", ")}]`
    );
  }
};

/** The kind and flag annotations, merged onto an endpoint with `annotateMerge`. */
const annotations = (
  kind: ProcedureKindValue,
  feature: FeatureFlagName | undefined
) => {
  const withKind = Context.make(ProcedureKind, kind);
  return feature === undefined
    ? withKind
    : Context.add(withKind, RequiredFeature, feature);
};

export interface EndpointOptions<
  Params extends Schema.Struct.Fields,
  Success extends Schema.Top,
> {
  /** Path params, each named in the path as `:name`; `{}` for none. */
  readonly params: Params;
  readonly success: Success;
  readonly feature?: FeatureFlagName;
}

export interface ReadOptions<
  Params extends Schema.Struct.Fields,
  Query extends Schema.Struct.Fields,
  Success extends Schema.Top,
> extends EndpointOptions<Params, Success> {
  /** Everything else the read takes, sent as URL query params; `{}` for none. */
  readonly query: Query;
}

/** A read: `GET`, safe to retry, stops when its caller leaves. */
export const read = <
  const Name extends string,
  const EndpointPath extends Path,
  Params extends Schema.Struct.Fields,
  Query extends Schema.Struct.Fields,
  Success extends Schema.Top,
>(
  name: Name,
  path: EndpointPath,
  { params, query, success, feature }: ReadOptions<Params, Query, Success>
) => {
  checkParams(path, params);
  const paramsSchema = Schema.Struct(params);
  const querySchema = Schema.Struct(query);
  return {
    kind: "read" as const,
    endpoint: HttpApiEndpoint.get(name, path, {
      params: paramsSchema,
      query: urlQuery(querySchema),
      success,
    }).annotateMerge(annotations("read", feature)),
    wire: HttpApiEndpoint.get(name, path, {
      params: Schema.toEncoded(paramsSchema),
      query: urlQuery(Schema.toEncoded(querySchema)),
      success,
    }),
  };
};

export interface WriteOptions<
  Params extends Schema.Struct.Fields,
  Payload extends Schema.Struct.Fields,
  Success extends Schema.Top,
> extends EndpointOptions<Params, Success> {
  /** Everything else the write takes, sent as a JSON body; `{}` for none. */
  readonly payload: Payload;
}

/**
 * Writes: never retried automatically; the server runs them uninterruptibly so a provider write
 * and its audit always finish and report the real outcome. The method says what the change
 * means: `post` creates or acts, `patch` changes part, `put` sets, `delete` removes.
 */
export const write = {
  patch: <
    const Name extends string,
    const EndpointPath extends Path,
    Params extends Schema.Struct.Fields,
    Payload extends Schema.Struct.Fields,
    Success extends Schema.Top,
  >(
    name: Name,
    path: EndpointPath,
    {
      params,
      payload,
      success,
      feature,
    }: WriteOptions<Params, Payload, Success>
  ) => {
    checkParams(path, params);
    const paramsSchema = Schema.Struct(params);
    const payloadSchema = Schema.Struct(payload);
    return {
      kind: "write" as const,
      endpoint: HttpApiEndpoint.patch(name, path, {
        params: paramsSchema,
        payload: payloadSchema,
        success,
      }).annotateMerge(annotations("write", feature)),
      wire: HttpApiEndpoint.patch(name, path, {
        params: Schema.toEncoded(paramsSchema),
        payload: Schema.toEncoded(payloadSchema),
        success,
      }),
    };
  },
};
