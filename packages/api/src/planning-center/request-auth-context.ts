import { AsyncLocalStorage } from "node:async_hooks";

interface PlanningCenterRequestAuthContext {
  accessToken: string;
}

const planningCenterAuthStorage =
  new AsyncLocalStorage<PlanningCenterRequestAuthContext>();

export const runWithPlanningCenterRequestAuth = <T>(
  context: PlanningCenterRequestAuthContext,
  fn: () => T
): T => planningCenterAuthStorage.run(context, fn);

export const getPlanningCenterRequestAccessToken = (): string | null =>
  planningCenterAuthStorage.getStore()?.accessToken ?? null;
