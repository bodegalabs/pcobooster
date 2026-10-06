/**
 * The procedures route table's shape and how a request finds its route. `api.ts` builds the one
 * table, `procedureRoutes`, from the declarations; the client, the server's unknown-path answer,
 * fixture transports, and the contract test all read it instead of repeating paths.
 */
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import type { ProcedureKindValue } from "@pcobooster/contracts/rpc/procedure";

/** Every product path starts here; the `v1` is the breaking version. */
export const API_PREFIX = "/api/v1";

export type ProcedureMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** One procedure's HTTP shape. */
export interface ProcedureRoute {
  /** `<namespace>.<name>`, as callers name it. */
  readonly tag: string;
  readonly method: ProcedureMethod;
  /** The full path, `API_PREFIX` included, with `:name` for each path param. */
  readonly path: `/${string}`;
  /** Input fields that travel in the path, in path order. */
  readonly params: readonly string[];
  /** Where the rest of the input travels: URL query params, a JSON body, or nowhere. */
  readonly input: "query" | "body" | "none";
  readonly kind: ProcedureKindValue;
  /** The flag the procedure belongs to; it answers `NotFound` while the flag is off. */
  readonly feature: FeatureFlagName | null;
  /** Whether it acts on Planning Center as the caller (resolves the caller's access). */
  readonly planningCenter: boolean;
}

const segments = (path: string): string[] =>
  path.split("/").filter((segment) => segment !== "");

/**
 * The path params of `pathname` under `route`'s template, or undefined when it does not match.
 * A `:name` segment matches any one non-empty segment, decoded.
 */
export const matchRoutePath = (
  route: Pick<ProcedureRoute, "path">,
  pathname: string
): Record<string, string> | undefined => {
  const template = segments(route.path);
  const actual = segments(pathname);
  if (template.length !== actual.length) {
    return undefined;
  }
  const params: Record<string, string> = {};
  for (const [index, part] of template.entries()) {
    const value = actual[index] ?? "";
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(value);
    } else if (part !== value) {
      return undefined;
    }
  }
  return params;
};

/** How many of a template's segments are fixed text; a router prefers the most. */
const staticSegments = (route: Pick<ProcedureRoute, "path">): number =>
  segments(route.path).filter((part) => !part.startsWith(":")).length;

export type RouteMatch =
  | {
      readonly kind: "found";
      readonly route: ProcedureRoute;
      readonly params: Record<string, string>;
    }
  /** The path names procedures, none with this method. */
  | {
      readonly kind: "wrong-method";
      readonly allow: readonly ProcedureMethod[];
    }
  | { readonly kind: "unknown" };

/**
 * Which procedure `method` and `pathname` reach, as the server's router chooses: among routes
 * with this method, the template with the most fixed segments wins, so `PUT .../items/order`
 * is the reorder and never an item id.
 */
export const matchRoute = (
  routes: readonly ProcedureRoute[],
  method: string,
  pathname: string
): RouteMatch => {
  const matching = routes.flatMap((route) => {
    const params = matchRoutePath(route, pathname);
    return params === undefined ? [] : [{ route, params }];
  });
  const [found] = matching
    .filter(({ route }) => route.method === method)
    .toSorted((a, b) => staticSegments(b.route) - staticSegments(a.route));
  if (found !== undefined) {
    return { kind: "found", ...found };
  }
  if (matching.length > 0) {
    return {
      kind: "wrong-method",
      allow: [...new Set(matching.map(({ route }) => route.method))],
    };
  }
  return { kind: "unknown" };
};
