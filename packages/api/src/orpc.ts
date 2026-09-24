import { RequestContext } from "@pcobooster/api/application/context";
import { releaseVersion } from "@pcobooster/api/config/release";
import { catalogRouter } from "@pcobooster/api/transport/orpc/catalog";
import { demoRouter } from "@pcobooster/api/transport/orpc/demo";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { identityRouter } from "@pcobooster/api/transport/orpc/identity";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import { peopleRouter } from "@pcobooster/api/transport/orpc/people";
import { planItemsRouter } from "@pcobooster/api/transport/orpc/plan-items";
import {
  planPeopleRouter,
  planTimesRouter,
} from "@pcobooster/api/transport/orpc/plan-times";
import { scheduleRouter } from "@pcobooster/api/transport/orpc/schedule";
import { songsRouter } from "@pcobooster/api/transport/orpc/songs";
import { Effect } from "effect";

const health = rpc.health.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      Effect.as(RequestContext, {
        status: "ok" as const,
        version: releaseVersion(),
      }),
      context,
      signal
    )
);

export const appRouter = rpc.router({
  accounts: identityRouter.accounts,
  admin: identityRouter.admin,
  catalog: catalogRouter,
  demo: demoRouter,
  features: identityRouter.features,
  health,
  people: peopleRouter,
  planItems: planItemsRouter,
  planPeople: planPeopleRouter,
  planTimes: planTimesRouter,
  session: identityRouter.session,
  schedule: scheduleRouter,
  songs: songsRouter,
});

export type AppRouter = typeof appRouter;

export const disposeApplicationRuntime = async (): Promise<void> => {
  await applicationRuntime.dispose();
};
