import { PlanningCenterCoreClient } from "@pcobooster/api/planning-center/core-client";
import type {
  PlanningCenterAuthentication,
  PlanningCenterError,
  PlanningCenterPersonalAccessToken,
  PlanningCenterRequestOptions,
} from "@pcobooster/api/planning-center/core-client";
import type {
  PCApiResponse,
  PCResource,
} from "@pcobooster/planning-center-models/types";
import { Cause, Effect, Exit } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";

// Temporary Promise surface while services still await Planning Center calls.
// It runs the Effect client and goes away once services compose it directly.

/** Resolves `globalThis.fetch` per request, as the Promise services always have. */
const globalFetchHttpClient: HttpClient.HttpClient = HttpClient.transform(
  Effect.runSync(
    Effect.provide(
      Effect.gen(function* readFetchHttpClient() {
        return yield* HttpClient.HttpClient;
      }),
      FetchHttpClient.layer
    )
  ),
  (effect) =>
    Effect.provideService(
      effect,
      FetchHttpClient.Fetch,
      async (input, init) => await globalThis.fetch(input, init)
    )
);

/** Rejects with the typed failure, or an `AbortError` when the signal interrupted it. */
const runPlanningCenter = async <Value>(
  effect: Effect.Effect<Value, PlanningCenterError>,
  signal?: AbortSignal
): Promise<Value> => {
  const exit = await Effect.runPromiseExit(effect, { signal });
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  const failure = exit.cause.reasons.find(Cause.isFailReason);
  if (failure !== undefined) {
    throw failure.error;
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
  const defect = Cause.squash(exit.cause);
  throw defect instanceof Error
    ? defect
    : new Error("Planning Center request failed", { cause: defect });
};

export interface PlanningCenterPromiseClientOptions {
  /** Rejects every non-read request before it reaches Planning Center. */
  readonly readOnly: boolean;
}

interface PromiseRequestOptions extends PlanningCenterRequestOptions {
  readonly signal?: AbortSignal;
}

export class PlanningCenterPromiseClient {
  private readonly client: PlanningCenterCoreClient;

  constructor(
    auth: PlanningCenterAuthentication,
    options?: PlanningCenterPromiseClientOptions
  ) {
    this.client = new PlanningCenterCoreClient(auth, {
      httpClient: globalFetchHttpClient,
      readOnly: options?.readOnly ?? false,
    });
  }

  getCacheScope(): string {
    return this.client.getCacheScope();
  }

  async request(
    endpoint: string,
    { signal, ...options }: PromiseRequestOptions = {}
  ): Promise<{ readonly status: number }> {
    return await runPlanningCenter(
      this.client.request(endpoint, options),
      signal
    );
  }

  async fetch(
    endpoint: string,
    { signal, ...options }: PromiseRequestOptions = {}
  ): Promise<PCApiResponse<PCResource>> {
    return await runPlanningCenter(
      this.client.fetch(endpoint, options),
      signal
    );
  }

  async fetchCollection(
    endpoint: string,
    { signal, ...options }: PromiseRequestOptions = {}
  ): Promise<PCApiResponse<PCResource[]>> {
    return await runPlanningCenter(
      this.client.fetchCollection(endpoint, options),
      signal
    );
  }

  async fetchAll(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages = 10,
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    return await runPlanningCenter(
      this.client.fetchAll(endpoint, params, maxPages),
      signal
    );
  }

  async fetchAllWithIncluded(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages = 5,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    return await runPlanningCenter(
      this.client.fetchAllWithIncluded(endpoint, params, maxPages),
      signal
    );
  }
}

/** Explicit application credentials for scripts and the development auth bypass. */
export const createBasicPlanningCenterPromiseClient = (
  token: PlanningCenterPersonalAccessToken
): PlanningCenterPromiseClient =>
  new PlanningCenterPromiseClient({ kind: "basic", ...token });
