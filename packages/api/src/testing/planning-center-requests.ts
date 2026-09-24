import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { Effect, Option } from "effect";

/**
 * A fake Planning Center read that the procedure's accounting counts as `requests` sent, the way
 * the client counts a real one. Pass 0 for a read served from a cache.
 */
export const countedRead = <Value>(
  value: Value,
  requests = 1
): Effect.Effect<Value> =>
  Effect.flatMap(Effect.serviceOption(PlanningCenterAccounting), (accounting) =>
    Effect.sync(() => {
      if (Option.isSome(accounting)) {
        for (let index = 0; index < requests; index += 1) {
          accounting.value.recordRequest();
        }
      }
      return structuredClone(value);
    })
  );
