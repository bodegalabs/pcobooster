import { AsyncLocalStorage } from "node:async_hooks";

interface PlanningCenterRequestAuthContext {
  accessToken: string;
}

const planningCenterAuthStorage =
  new AsyncLocalStorage<PlanningCenterRequestAuthContext>();

export const runWithPlanningCenterRequestAuth = async <T>(
  context: PlanningCenterRequestAuthContext,
  fn: () => Promise<T>
): Promise<T> => await planningCenterAuthStorage.run(context, fn);

export const getPlanningCenterRequestAccessToken = (): string | null =>
  planningCenterAuthStorage.getStore()?.accessToken ?? null;
