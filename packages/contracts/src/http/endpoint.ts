/**
 * The only ways to declare a product endpoint: `read` (GET, or `read.post` when the input is too
 * large for a URL) and `write.post`, `write.put`, `write.patch`, `write.delete`. Each returns the
 * endpoint the server serves, its wire twin that clients are built from, and its route in the
 * procedures table. The wire twin is the same endpoint with its params, query, and payload
 * reduced to their encoded side, so a client sends what the caller passed and every input rule
 * (trimming, lengths, patterns) runs once, on the server. Both carry the `ProcedureKind`
 * annotation and, when flagged, `RequiredFeature`.
 *
 * An endpoint's name is its method on the client (`api.people.search`); its group adds the
 * namespace to make the procedure's tag (`people.search`), which outcome lines and the route
 * table use. A part with no fields is left out entirely, so an endpoint that takes nothing is
 * called with no argument (`api.health.get()`).
 */
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { ProcedureKind } from "@pcobooster/contracts/http/procedure-kind";
import type { ProcedureKindValue } from "@pcobooster/contracts/http/procedure-kind";
import { RequiredFeature } from "@pcobooster/contracts/http/required-feature";
import { API_PREFIX } from "@pcobooster/contracts/http/route";
import type {
  ProcedureMethod,
  ProcedureRoute,
} from "@pcobooster/contracts/http/route";
import { Context, Schema } from "effect";
import { HttpApiEndpoint } from "effect/unstable/httpapi";

type Path = `/${string}`;

type Fields = Schema.Struct.Fields;

/** What a declaration that leaves a part out has for it. */
type NoFields = Record<never, never>;

const PATH_PARAM = /:(?<name>[A-Za-z]+)/gu;

const paramNames = (path: Path): string[] =>
  [...path.matchAll(PATH_PARAM)].map((match) => match.groups?.name ?? "");

/** Fails at module load when the declared params and the path's `:names` differ. */
const checkParams = (path: Path, params: Fields): void => {
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

const hasFields = (fields: Fields): boolean => Object.keys(fields).length > 0;

/**
 * A part's fields; a part the declaration left out defaults to no fields, which is what its type
 * parameter defaults to as well.
 */
function declared<Part extends Fields>(fields: Part | undefined): Part;
function declared(fields: Fields | undefined): Fields {
  return fields ?? {};
}

/**
 * A part with fields, or none. HttpApi leaves out a part whose schema type is `never`, so a part
 * with no fields is typed `never` and is absent (`undefined`) at runtime.
 */
type PartOf<Part extends Fields> = [keyof Part] extends [never]
  ? never
  : Schema.Struct<Part>;
type EncodedPartOf<Part extends Fields> = [keyof Part] extends [never]
  ? never
  : Schema.toEncoded<Schema.Struct<Part>>;

function partOf<Part extends Fields>(fields: Part): PartOf<Part>;
function partOf(fields: Fields): Schema.Struct<Fields> | undefined {
  return hasFields(fields) ? Schema.Struct(fields) : undefined;
}

function encodedPartOf<Part extends Fields>(fields: Part): EncodedPartOf<Part>;
function encodedPartOf(
  fields: Fields
): Schema.toEncoded<Schema.Struct<Fields>> | undefined {
  return hasFields(fields)
    ? Schema.toEncoded(Schema.Struct(fields))
    : undefined;
}

/** A declared endpoint: what the server serves, what clients send, and its route. */
export interface Declaration<
  Name extends string,
  Kind extends ProcedureKindValue,
  Endpoint extends HttpApiEndpoint.Constraint,
  Wire extends HttpApiEndpoint.Constraint,
> {
  readonly name: Name;
  readonly kind: Kind;
  readonly endpoint: Endpoint;
  readonly wire: Wire;
  /** The route, before its group names the procedure and its Planning Center access. */
  readonly route: Omit<ProcedureRoute, "tag" | "planningCenter">;
}

export type AnyDeclaration = Declaration<
  string,
  ProcedureKindValue,
  HttpApiEndpoint.Constraint,
  HttpApiEndpoint.Constraint
>;

const routeOf = (
  method: ProcedureMethod,
  path: Path,
  kind: ProcedureKindValue,
  input: ProcedureRoute["input"],
  feature: FeatureFlagName | undefined
): Omit<ProcedureRoute, "tag" | "planningCenter"> => ({
  method,
  path: `${API_PREFIX}${path}`,
  params: paramNames(path),
  input,
  kind,
  feature: feature ?? null,
});

export interface EndpointOptions<
  Params extends Fields,
  Success extends Schema.Top,
> {
  /** Path params, each named in the path as `:name`; leave out for none. */
  readonly params?: Params;
  readonly success: Success;
  readonly feature?: FeatureFlagName;
}

export interface QueryOptions<
  Params extends Fields,
  Query extends Fields,
  Success extends Schema.Top,
> extends EndpointOptions<Params, Success> {
  /** Everything else the endpoint takes, as URL query params (scalars or arrays of them). */
  readonly query?: Query;
}

export interface BodyOptions<
  Params extends Fields,
  Payload extends Fields,
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
    const Name extends string,
    const EndpointPath extends Path,
    Success extends Schema.Top,
    Params extends Fields = NoFields,
    Query extends Fields = NoFields,
  >(
    name: Name,
    path: EndpointPath,
    { params, query, success, feature }: QueryOptions<Params, Query, Success>
  ) => {
    const pathFields = declared<Params>(params);
    const queryFields = declared<Query>(query);
    checkParams(path, pathFields);
    const make = HttpApiEndpoint.make(method);
    return {
      name,
      kind,
      endpoint: make(name, path, {
        params: partOf(pathFields),
        query: partOf(queryFields),
        success,
      }).annotateMerge(annotations(kind, feature)),
      wire: make(name, path, {
        params: encodedPartOf(pathFields),
        query: encodedPartOf(queryFields),
        success,
      }),
      route: routeOf(
        method,
        path,
        kind,
        hasFields(queryFields) ? "query" : "none",
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
    const Name extends string,
    const EndpointPath extends Path,
    Payload extends Fields,
    Success extends Schema.Top,
    Params extends Fields = NoFields,
  >(
    name: Name,
    path: EndpointPath,
    { params, payload, success, feature }: BodyOptions<Params, Payload, Success>
  ) => {
    const pathFields = declared<Params>(params);
    checkParams(path, pathFields);
    const make = HttpApiEndpoint.make(method);
    return {
      name,
      kind,
      endpoint: make(name, path, {
        params: partOf(pathFields),
        payload: Schema.Struct(payload),
        success,
      }).annotateMerge(annotations(kind, feature)),
      wire: make(name, path, {
        params: encodedPartOf(pathFields),
        payload: Schema.toEncoded(Schema.Struct(payload)),
        success,
      }),
      route: routeOf(method, path, kind, "body", feature),
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
