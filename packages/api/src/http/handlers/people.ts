import { getPeoplePlanWindowHistory } from "@pcobooster/api/application/people";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const PeopleHttpHandlers = HttpApiBuilder.group(
  ProductApi,
  "people",
  (handlers) =>
    handlers.handle("planWindowHistory", ({ query }) =>
      getPeoplePlanWindowHistory(query)
    )
);
