/**
 * The only two ways to declare a namespace of endpoints. Each gives the group the server serves,
 * the wire group clients are built from, and the namespace's routes, from one list of
 * declarations, with the middleware order fixed here: `ProcedureScope` outermost on every
 * endpoint, `PlanningCenterSession` inside it where the namespace acts on Planning Center.
 *
 * A client built from the wire groups names each endpoint by group and name
 * (`api.people.search`).
 */
import type { AnyDeclaration } from "@pcobooster/contracts/http/endpoint";
import { PlanningCenterSession } from "@pcobooster/contracts/http/planning-center-session";
import { ProcedureScope } from "@pcobooster/contracts/http/procedure-scope";
import type { ProcedureRoute } from "@pcobooster/contracts/http/route";
import type { NonEmptyReadonlyArray } from "effect/Array";
import { HttpApiGroup } from "effect/unstable/httpapi";

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

/** Each declaration's route, named `<group>.<endpoint>`, as outcome lines and the table name it. */
const routesOf = (
  group: string,
  declarations: readonly AnyDeclaration[],
  planningCenter: boolean
): ProcedureRoute[] =>
  declarations.map(({ name, route }) => ({
    ...route,
    tag: `${group}.${name}`,
    planningCenter,
  }));

/** Endpoints that act on Planning Center as the caller, inside one resolved access. */
export const planningCenterGroup = <
  const Name extends string,
  const Declarations extends NonEmptyReadonlyArray<AnyDeclaration>,
>(
  name: Name,
  ...declarations: Declarations
) => ({
  declarations,
  api: HttpApiGroup.make(name)
    .add(...endpointsOf(declarations))
    .middleware(PlanningCenterSession)
    .middleware(ProcedureScope),
  wire: HttpApiGroup.make(name)
    .add(...wiresOf(declarations))
    .middleware(PlanningCenterSession)
    .middleware(ProcedureScope),
  routes: routesOf(name, declarations, true),
});

/** Endpoints that do not act on Planning Center as the caller (identity, demo, feedback). */
export const plainGroup = <
  const Name extends string,
  const Declarations extends NonEmptyReadonlyArray<AnyDeclaration>,
>(
  name: Name,
  ...declarations: Declarations
) => ({
  declarations,
  api: HttpApiGroup.make(name)
    .add(...endpointsOf(declarations))
    .middleware(ProcedureScope),
  wire: HttpApiGroup.make(name)
    .add(...wiresOf(declarations))
    .middleware(ProcedureScope),
  routes: routesOf(name, declarations, false),
});
