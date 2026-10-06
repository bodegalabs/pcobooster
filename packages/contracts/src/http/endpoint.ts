/**
 * The only ways to declare a product endpoint: `read` (GET, or `read.post` when the input is too
 * large for a URL) and `write.post`, `write.put`, `write.patch`, `write.delete`. Each returns the
 * endpoint the server serves, its wire twin that clients are built from, and its route in the
 * procedures table. The wire twin is the same endpoint with its params, query, and payload
 * reduced to their encoded side, so a client sends what the caller passed and every input rule
 * (trimming, lengths, patterns) runs once, on the server. Both carry the `ProcedureKind`
 * annotation and, when flagged, `RequiredFeature`.
 *
 * An endpoint's identifier is its procedure tag (`people.planWindowHistory`), the name callers,
 * handlers, and outcome lines use. Query and payload are declared only when they have fields: an
 * empty struct would pass a whole caller input through unchanged. Each wire part also accepts
 * `undefined`, which is what a call that takes no input sends.
 */
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { urlQuery } from "@pcobooster/contracts/http/query";
import { API_PREFIX } from "@pcobooster/contracts/http/route";
import type {
  ProcedureMethod,
  ProcedureRoute,
} from "@pcobooster/contracts/http/route";
import { ProcedureKind } from "@pcobooster/contracts/rpc/procedure";
import type { ProcedureKindValue } from "@pcobooster/contracts/rpc/procedure";
import { RequiredFeature } from "@pcobooster/contracts/rpc/required-feature";
import { Context, Schema } from "effect";
import { HttpApiEndpoint } from "effect/unstable/httpapi";

type Path = `/${string}`;

const PATH_PARAM = /:(?<name>[A-Za-z]+)/gu;

const paramNames = (path: Path): string[] =>
  [...path.matchAll(PATH_PARAM)].map((match) => match.groups?.name ?? "");

/** Fails at module load when the declared params and the path's `:names` differ. */
const checkParams = (path: Path, params: Schema.Struct.Fields): void => {
  const inPath = paramNames(path).toSorted();
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

const hasFields = (fields: Schema.Struct.Fields): boolean =>
  Object.keys(fields).length > 0;

/** A declared endpoint: what the server serves, what clients send, and its route. */
export interface Declaration<
  Tag extends string,
  Kind extends ProcedureKindValue,
  Endpoint extends HttpApiEndpoint.Constraint,
  Wire extends HttpApiEndpoint.Constraint,
> {
  readonly tag: Tag;
  readonly kind: Kind;
  readonly endpoint: Endpoint;
  readonly wire: Wire;
  /** The route, before its group says whether it acts on Planning Center. */
  readonly route: Omit<ProcedureRoute, "planningCenter">;
}

export type AnyDeclaration = Declaration<
  string,
  ProcedureKindValue,
  HttpApiEndpoint.Constraint,
  HttpApiEndpoint.Constraint
>;

const routeOf = (
  tag: string,
  method: ProcedureMethod,
  path: Path,
  kind: ProcedureKindValue,
  input: ProcedureRoute["input"],
  feature: FeatureFlagName | undefined
): Omit<ProcedureRoute, "planningCenter"> => ({
  tag,
  method,
  path: `${API_PREFIX}${path}`,
  params: paramNames(path),
  input,
  kind,
  feature: feature ?? null,
});

export interface EndpointOptions<
  Params extends Schema.Struct.Fields,
  Success extends Schema.Top,
> {
  /** Path params, each named in the path as `:name`; `{}` for none. */
  readonly params: Params;
  readonly success: Success;
  readonly feature?: FeatureFlagName;
}

export interface QueryOptions<
  Params extends Schema.Struct.Fields,
  Query extends Schema.Struct.Fields,
  Success extends Schema.Top,
> extends EndpointOptions<Params, Success> {
  /** Everything else the endpoint takes, sent as URL query params; `{}` for none. */
  readonly query: Query;
}

export interface BodyOptions<
  Params extends Schema.Struct.Fields,
  Payload extends Schema.Struct.Fields,
  Success extends Schema.Top,
> extends EndpointOptions<Params, Success> {
  /** Everything else the endpoint takes, sent as a JSON body. */
  readonly payload: Payload;
}

/** An endpoint whose input travels in the URL: GET reads and DELETE writes. */
const queryEndpoint =
  <
    const Kind extends ProcedureKindValue,
    const Method extends "GET" | "DELETE",
  >(
    kind: Kind,
    method: Method
  ) =>
  <
    const Tag extends string,
    const EndpointPath extends Path,
    Params extends Schema.Struct.Fields,
    Query extends Schema.Struct.Fields,
    Success extends Schema.Top,
  >(
    tag: Tag,
    path: EndpointPath,
    { params, query, success, feature }: QueryOptions<Params, Query, Success>
  ) => {
    checkParams(path, params);
    const make = HttpApiEndpoint.make(method);
    const paramsSchema = Schema.Struct(params);
    const querySchema = Schema.Struct(query);
    const sendsQuery = hasFields(query);
    return {
      tag,
      kind,
      endpoint: make(tag, path, {
        params: paramsSchema,
        query: sendsQuery ? urlQuery(querySchema) : undefined,
        success,
      }).annotateMerge(annotations(kind, feature)),
      wire: make(tag, path, {
        params: Schema.UndefinedOr(Schema.toEncoded(paramsSchema)),
        query: sendsQuery
          ? Schema.UndefinedOr(urlQuery(Schema.toEncoded(querySchema)))
          : undefined,
        success,
      }),
      route: routeOf(
        tag,
        method,
        path,
        kind,
        sendsQuery ? "query" : "none",
        feature
      ),
    };
  };

/**
 * An endpoint whose input travels as a JSON body: POST, PUT, and PATCH. One builder for all
 * three: HttpApi's payload codec depends on whether the method has a body, which every method
 * here does.
 */
const bodyEndpoint =
  <const Kind extends ProcedureKindValue>(
    kind: Kind,
    method: "POST" | "PUT" | "PATCH"
  ) =>
  <
    const Tag extends string,
    const EndpointPath extends Path,
    Params extends Schema.Struct.Fields,
    Payload extends Schema.Struct.Fields,
    Success extends Schema.Top,
  >(
    tag: Tag,
    path: EndpointPath,
    { params, payload, success, feature }: BodyOptions<Params, Payload, Success>
  ) => {
    checkParams(path, params);
    const make = HttpApiEndpoint.make(method);
    const paramsSchema = Schema.Struct(params);
    const payloadSchema = Schema.Struct(payload);
    const sendsBody = hasFields(payload);
    return {
      tag,
      kind,
      endpoint: make(tag, path, {
        params: paramsSchema,
        payload: sendsBody ? payloadSchema : undefined,
        success,
      }).annotateMerge(annotations(kind, feature)),
      wire: make(tag, path, {
        params: Schema.UndefinedOr(Schema.toEncoded(paramsSchema)),
        payload: sendsBody
          ? Schema.UndefinedOr(Schema.toEncoded(payloadSchema))
          : undefined,
        success,
      }),
      route: routeOf(
        tag,
        method,
        path,
        kind,
        sendsBody ? "body" : "none",
        feature
      ),
    };
  };

/**
 * A read: safe to retry, stops when its caller leaves, and may be sent at speculative priority.
 * `GET`, except `read.post` for input that can outgrow a URL (Cloudflare refuses URLs over 16 KB),
 * which is still a read in every other way.
 */
export const read = Object.assign(queryEndpoint("read", "GET"), {
  post: bodyEndpoint("read", "POST"),
});

/**
 * Writes: never retried automatically; the server runs them uninterruptibly so a provider write
 * and its audit always finish and report the real outcome. The method says what the change
 * means: `post` creates or acts, `put` sets, `patch` changes part, `delete` removes. A delete's
 * input beyond its path travels in the query, never a body.
 */
export const write = {
  post: bodyEndpoint("write", "POST"),
  put: bodyEndpoint("write", "PUT"),
  patch: bodyEndpoint("write", "PATCH"),
  delete: queryEndpoint("write", "DELETE"),
};
