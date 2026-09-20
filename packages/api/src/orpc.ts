import { RequestContext } from "@worship-admin/api/application/context";
import { catalogRouter } from "@worship-admin/api/transport/orpc/catalog";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import { identityRouter } from "@worship-admin/api/transport/orpc/identity";
import {
  applicationRuntime,
  rpc,
} from "@worship-admin/api/transport/orpc/implementation";
import { peopleRouter } from "@worship-admin/api/transport/orpc/people";
import { planItemsRouter } from "@worship-admin/api/transport/orpc/plan-items";
import {
  planPeopleRouter,
  planTimesRouter,
} from "@worship-admin/api/transport/orpc/plan-times";
import { scheduleRouter } from "@worship-admin/api/transport/orpc/schedule";
import { songsRouter } from "@worship-admin/api/transport/orpc/songs";
import { Effect } from "effect";

const health = rpc.health.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      Effect.as(RequestContext, { status: "ok" as const }),
      context,
      signal
    )
);

export const appRouter = rpc.router({
  accounts: identityRouter.accounts,
  admin: identityRouter.admin,
  catalog: catalogRouter,
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
