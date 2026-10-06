/**
 * The only two ways to declare a namespace of endpoints. Each gives the group the server serves,
 * the wire group clients are built from, and the namespace's routes, from one list of
 * declarations, with the middleware order fixed here: `ProcedureScope` outermost on every
 * endpoint, `PlanningCenterSession` inside it where the namespace acts on Planning Center.
 *
 * Wire groups are top level, so a client built from them names each endpoint by its tag
 * (`client["people.search"]`) and a call by tag keeps that tag's types.
 */
import type { AnyDeclaration } from "@pcobooster/contracts/http/endpoint";
import { PlanningCenterSession } from "@pcobooster/contracts/http/planning-center-session";
import { ProcedureScope } from "@pcobooster/contracts/http/procedure-scope";
import type { ProcedureRoute } from "@pcobooster/contracts/http/route";
import type { NonEmptyReadonlyArray } from "effect/Array";
import { HttpApiGroup } from "effect/unstable/httpapi";

/** A declaration whose tag is in namespace `Name` (or is `Name`, as `health` is). */
type InNamespace<Name extends string> = AnyDeclaration & {
  readonly tag: Name | `${Name}.${string}`;
};

/** Each declaration's server endpoint, its type kept per declaration. */
const endpointsOf = <
  Declarations extends NonEmptyReadonlyArray<AnyDeclaration>,
>([first, ...rest]: Declarations): NonEmptyReadonlyArray<
  Declarations[number]["endpoint"]
> => [
  first.endpoint,
  ...rest.map(
    (declaration: Declarations[number]): Declarations[number]["endpoint"] =>
      declaration.endpoint
  ),
];

/** Each declaration's wire endpoint, its type kept per declaration. */
const wiresOf = <Declarations extends NonEmptyReadonlyArray<AnyDeclaration>>([
  first,
  ...rest
]: Declarations): NonEmptyReadonlyArray<Declarations[number]["wire"]> => [
  first.wire,
  ...rest.map(
    (declaration: Declarations[number]): Declarations[number]["wire"] =>
      declaration.wire
  ),
];

const routesOf = (
  declarations: readonly AnyDeclaration[],
  planningCenter: boolean
): ProcedureRoute[] =>
  declarations.map(({ route }) => ({ ...route, planningCenter }));

/** Endpoints that act on Planning Center as the caller, inside one resolved access. */
export const planningCenterGroup = <
  const Name extends string,
  const Declarations extends NonEmptyReadonlyArray<InNamespace<Name>>,
>(
  name: Name,
  ...declarations: Declarations
) => ({
  declarations,
  api: HttpApiGroup.make(name)
    .add(...endpointsOf(declarations))
    .middleware(PlanningCenterSession)
    .middleware(ProcedureScope),
  wire: HttpApiGroup.make(name, { topLevel: true })
    .add(...wiresOf(declarations))
    .middleware(PlanningCenterSession)
    .middleware(ProcedureScope),
  routes: routesOf(declarations, true),
});

/** Endpoints that do not act on Planning Center as the caller (identity, demo, feedback). */
export const plainGroup = <
  const Name extends string,
  const Declarations extends NonEmptyReadonlyArray<InNamespace<Name>>,
>(
  name: Name,
  ...declarations: Declarations
) => ({
  declarations,
  api: HttpApiGroup.make(name)
    .add(...endpointsOf(declarations))
    .middleware(ProcedureScope),
  wire: HttpApiGroup.make(name, { topLevel: true })
    .add(...wiresOf(declarations))
    .middleware(ProcedureScope),
  routes: routesOf(declarations, false),
});
