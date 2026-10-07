import {
  createRequestScheduler,
  SPECULATIVE_QUIET_MS,
} from "@pcobooster/client/request-scheduler";

/** The tab's one scheduler: every product call and every speculative task goes through it. */
export const requestScheduler = createRequestScheduler({
  quietMs: SPECULATIVE_QUIET_MS,
});
