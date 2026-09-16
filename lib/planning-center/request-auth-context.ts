import { AsyncLocalStorage } from "node:async_hooks";

type PlanningCenterRequestAuthContext = {
  accessToken: string;
};

const planningCenterAuthStorage =
  new AsyncLocalStorage<PlanningCenterRequestAuthContext>();

export function runWithPlanningCenterRequestAuth<T>(
  context: PlanningCenterRequestAuthContext,
  fn: () => Promise<T>
): Promise<T> {
  return planningCenterAuthStorage.run(context, fn);
}

export function getPlanningCenterRequestAccessToken(): string | null {
  return planningCenterAuthStorage.getStore()?.accessToken ?? null;
}
