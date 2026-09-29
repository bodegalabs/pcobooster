import { Server } from "@pcobooster/api/server";
import { accessRouter } from "@pcobooster/api/transport/orpc/access";
import { catalogRouter } from "@pcobooster/api/transport/orpc/catalog";
import { chordChartsRouter } from "@pcobooster/api/transport/orpc/chord-charts";
import { cleanupRouter } from "@pcobooster/api/transport/orpc/cleanup";
import { demoRouter } from "@pcobooster/api/transport/orpc/demo";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import { feedbackRouter } from "@pcobooster/api/transport/orpc/feedback";
import { identityRouter } from "@pcobooster/api/transport/orpc/identity";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";
import { neededPositionsRouter } from "@pcobooster/api/transport/orpc/needed-positions";
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
      Server.pipe(
        Effect.map(({ config }) => ({
          status: "ok" as const,
          version: config.releaseVersion,
        }))
      ),
      context,
      signal
    )
);

export const appRouter = rpc.router({
  access: accessRouter,
  accounts: identityRouter.accounts,
  catalog: catalogRouter,
  chordCharts: chordChartsRouter,
  cleanup: cleanupRouter,
  demo: demoRouter,
  features: identityRouter.features,
  feedback: feedbackRouter,
  health,
  neededPositions: neededPositionsRouter,
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
