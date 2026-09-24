import { createHash } from "node:crypto";

import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PlanningCenterRateLimitInfo } from "@pcobooster/api/planning-center/api-error";
import { PlanningCenterNetworkError } from "@pcobooster/api/planning-center/network-error";
import { PlanningCenterReadOnlyError } from "@pcobooster/api/planning-center/read-only-error";
import {
  pcCollectionResponseSchema,
  pcResourceResponseSchema,
} from "@pcobooster/api/planning-center/resource-schemas";
import {
  isNonEmptyString,
  isString,
  jsonValueSchema,
} from "@pcobooster/planning-center-models/json";
import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";
import type {
  PCApiResponse,
  PCResource,
} from "@pcobooster/planning-center-models/types";
import { Clock, Duration, Effect, Schedule } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type { HttpClientError } from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { HttpClientResponse } from "effect/unstable/http/HttpClientResponse";
import type { HttpMethod } from "effect/unstable/http/HttpMethod";
import { z } from "zod";

const log = logger.for("planning-center/core");
const PC_BASE_URL = "https://api.planningcenteronline.com";
/** Each attempt (request, error body, and rate-limit pause) and its JSON body share this budget. */
const ATTEMPT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const PROACTIVE_RATE_LIMIT_THRESHOLD = 0.8;
const PROACTIVE_RATE_LIMIT_DELAY = Duration.seconds(1);
const errorBodySchema = z.record(z.string(), z.json());

/** Every expected Planning Center failure; anything else is a defect. */
export type PlanningCenterError =
  | PlanningCenterApiError
  | PlanningCenterNetworkError
  | PlanningCenterReadOnlyError;

/** Failures that can come from one attempt and may be retried. */
type AttemptError = PlanningCenterApiError | PlanningCenterNetworkError;

export const isPlanningCenterError = (
  value: unknown
): value is PlanningCenterError =>
  value instanceof PlanningCenterApiError ||
  value instanceof PlanningCenterNetworkError ||
  value instanceof PlanningCenterReadOnlyError;

type ResponseHeaders = HttpClientResponse["headers"];

interface SentResponse {
  readonly response: HttpClientResponse;
  readonly startedAt: number;
}

const endpointUrl = (endpoint: string): string =>
  new URL(endpoint, PC_BASE_URL).toString();

const invalidProviderResponse = (
  status: number,
  cause: unknown
): PlanningCenterApiError =>
  new PlanningCenterApiError({
    message: "Planning Center returned an invalid response",
    status,
    code: "INVALID_RESPONSE",
    cause,
  });

const attemptTimedOut = (): PlanningCenterNetworkError =>
  new PlanningCenterNetworkError({
    cause: new DOMException(
      "Planning Center request timed out",
      "TimeoutError"
    ),
  });

const networkFailure = (error: HttpClientError): PlanningCenterNetworkError =>
  new PlanningCenterNetworkError({ cause: error.cause ?? error });

export const buildPlanningCenterUrl = (
  endpoint: string,
  params: Record<string, string> = {}
): string => {
  const url = new URL(endpoint, PC_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  return url.toString();
};

const isReadMethod = (method: HttpMethod): boolean =>
  method === "GET" || method === "HEAD";

const isRetryableError = (error: AttemptError): boolean => {
  if (error instanceof PlanningCenterApiError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  const { cause } = error;
  return (
    cause instanceof Error &&
    (cause.name === "AbortError" || cause.name === "TimeoutError")
  );
};

/** `retry` is 1 for the first retry. */
const retryDelayMs = (retry: number, error: AttemptError): number => {
  if (!(error instanceof PlanningCenterApiError)) {
    return retry * 300;
  }
  if (error.status === 429 && error.retryAfterSeconds !== undefined) {
    return Math.max(error.retryAfterSeconds, 1) * 1000;
  }
  return retry * 500;
};

const describePlanningCenterEndpoint = (value: string) => {
  const url = new URL(value, PC_BASE_URL);
  return {
    path: url.pathname,
    queryKeys: [...url.searchParams.keys()].toSorted(),
  };
};

/** Idempotent reads retry transient failures; writes never do. */
const transientReadRetries = (url: string) =>
  Schedule.recurs(MAX_RETRIES).pipe(
    Schedule.setInputType<AttemptError>(),
    Schedule.while(({ input }) => isRetryableError(input)),
    Schedule.addDelay(({ attempt, input }) =>
      Effect.sync(() => {
        const delayMs = retryDelayMs(attempt, input);
        log.warn(
          {
            attempt,
            retryDelayMs: delayMs,
            endpoint: describePlanningCenterEndpoint(url),
            error: input.message.slice(0, 100),
          },
          "Planning Center request failed, retrying"
        );
        return Duration.millis(delayMs);
      })
    )
  );

const readIntegerHeader = (
  headers: ResponseHeaders,
  name: string
): number | undefined => {
  const value = headers[name];
  if (!isNonEmptyString(value)) {
    return undefined;
  }
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readRateLimitInfo = (
  headers: ResponseHeaders
): PlanningCenterRateLimitInfo => ({
  limit: readIntegerHeader(headers, "x-pco-api-request-rate-limit"),
  count: readIntegerHeader(headers, "x-pco-api-request-rate-count"),
  period: headers["x-pco-api-request-rate-period"] ?? undefined,
  retryAfterSeconds: readIntegerHeader(headers, "retry-after"),
});

const errorTitle = (
  body: z.infer<typeof errorBodySchema>
): string | undefined => {
  if (isString(body.error)) {
    return body.error;
  }
  return isString(body.message) ? body.message : undefined;
};

const parseErrorBody = (
  responseBody: string
): z.infer<typeof errorBodySchema> | null => {
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(responseBody));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const buildApiError = (
  status: number,
  responseBody: string,
  headers: ResponseHeaders
): PlanningCenterApiError => {
  let code: string | undefined;
  let details: JsonValue | undefined;
  let message = `Planning Center API error: ${status}`;
  const rateLimit = readRateLimitInfo(headers);
  const errorJson = parseErrorBody(responseBody);
  if (errorJson === null) {
    if (responseBody !== "") {
      message += ` - ${responseBody}`;
    }
  } else {
    code = isString(errorJson.code) ? errorJson.code : undefined;
    details = errorJson;
    const title = errorTitle(errorJson);
    if (isNonEmptyString(title)) {
      message += ` - ${title}`;
    }
  }
  return new PlanningCenterApiError({
    message,
    status,
    code,
    details,
    responseBody,
    rateLimit,
    retryAfterSeconds: rateLimit.retryAfterSeconds,
  });
};

const readResponseText = (
  response: HttpClientResponse
): Effect.Effect<string, PlanningCenterNetworkError> =>
  Effect.mapError(response.text, networkFailure);

const pauseNearRateLimit = (headers: ResponseHeaders): Effect.Effect<void> => {
  const rateLimit = readRateLimitInfo(headers);
  if (
    rateLimit.limit === undefined ||
    rateLimit.count === undefined ||
    rateLimit.count < rateLimit.limit * PROACTIVE_RATE_LIMIT_THRESHOLD
  ) {
    return Effect.void;
  }
  return Effect.sync(() => {
    log.debug(
      { rateLimit },
      "Planning Center API rate limit threshold reached; pausing briefly"
    );
  }).pipe(Effect.andThen(Effect.sleep(PROACTIVE_RATE_LIMIT_DELAY)));
};

const decodeResponse = <Output>(
  schema: z.ZodType<Output>,
  json: JsonValue
): Effect.Effect<Output, PlanningCenterApiError> => {
  const parsed = schema.safeParse(json);
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(invalidProviderResponse(200, parsed.error));
};

/** Reads the JSON body within whatever remains of the attempt's time budget. */
const readJsonBody = ({
  response,
  startedAt,
}: SentResponse): Effect.Effect<JsonValue, AttemptError> =>
  Effect.gen(function* readJson() {
    const elapsedMs = (yield* Clock.currentTimeMillis) - startedAt;
    const text = yield* readResponseText(response).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(Math.max(ATTEMPT_TIMEOUT_MS - elapsedMs, 0)),
        orElse: () => Effect.fail(attemptTimedOut()),
      })
    );
    if (response.status === 204 || text.trim() === "") {
      return yield* Effect.fail(
        new PlanningCenterApiError({
          message:
            "Planning Center returned an empty response where JSON was required",
          status: response.status,
          code: "INVALID_RESPONSE",
        })
      );
    }
    // Both a syntax error and a non-JSON value mean the provider response is unusable.
    return yield* Effect.try({
      try: () => jsonValueSchema.parse(JSON.parse(text)),
      catch: (error) => invalidProviderResponse(response.status, error),
    });
  });

/** A Planning Center personal access token: application ID plus secret. */
export interface PlanningCenterPersonalAccessToken {
  readonly applicationId: string;
  readonly secret: string;
}

export type PlanningCenterAuthentication =
  | ({ readonly kind: "basic" } & PlanningCenterPersonalAccessToken)
  | { readonly kind: "bearer"; readonly accessToken: string };

export interface PlanningCenterCoreClientOptions {
  /** Sends every request; the Worker provides `FetchHttpClient`. */
  readonly httpClient: HttpClient.HttpClient;
  /** Rejects every non-read request before it reaches Planning Center. */
  readonly readOnly?: boolean;
}

export interface PlanningCenterRequestOptions {
  readonly method?: HttpMethod;
  /** Sent as the `application/json` request body. */
  readonly body?: JsonObject;
}

/**
 * Binds one credential to its Authorization header and cache scope for its entire lifetime.
 * Interrupting a returned Effect aborts its in-flight fetch.
 */
export class PlanningCenterCoreClient {
  private readonly authorization: string;
  private readonly cacheScope: string;
  private readonly httpClient: HttpClient.HttpClient;
  private readonly readOnly: boolean;

  constructor(
    auth: PlanningCenterAuthentication,
    options: PlanningCenterCoreClientOptions
  ) {
    if (auth.kind === "bearer" && !isNonEmptyString(auth.accessToken.trim())) {
      throw new Error(
        "Planning Center bearer authentication requires a non-empty access token"
      );
    }
    if (
      auth.kind === "basic" &&
      !(
        isNonEmptyString(auth.applicationId.trim()) &&
        isNonEmptyString(auth.secret.trim())
      )
    ) {
      throw new Error(
        "Planning Center basic authentication requires an application ID and secret"
      );
    }
    const credential =
      auth.kind === "bearer"
        ? auth.accessToken
        : `${auth.applicationId}:${auth.secret}`;
    this.authorization =
      auth.kind === "bearer"
        ? `Bearer ${auth.accessToken}`
        : `Basic ${Buffer.from(credential).toString("base64")}`;
    this.cacheScope = `${auth.kind}:${createHash("sha256").update(credential).digest("hex")}`;
    // Trace headers would leak internal span IDs to a third party.
    this.httpClient = HttpClient.transform(options.httpClient, (effect) =>
      Effect.provideService(effect, HttpClient.TracerPropagationEnabled, false)
    );
    this.readOnly = options.readOnly ?? false;
  }

  getCacheScope(): string {
    return this.cacheScope;
  }

  private attempt(
    request: HttpClientRequest.HttpClientRequest
  ): Effect.Effect<SentResponse, AttemptError> {
    const { httpClient } = this;
    return Effect.gen(function* attemptRequest() {
      const startedAt = yield* Clock.currentTimeMillis;
      const response = yield* httpClient
        .execute(request)
        .pipe(Effect.mapError(networkFailure));
      if (response.status < 200 || response.status >= 300) {
        const responseBody = yield* readResponseText(response);
        return yield* Effect.fail(
          buildApiError(response.status, responseBody, response.headers)
        );
      }
      if (isReadMethod(request.method)) {
        yield* pauseNearRateLimit(response.headers);
      }
      return { response, startedAt };
    }).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(ATTEMPT_TIMEOUT_MS),
        orElse: () => Effect.fail(attemptTimedOut()),
      })
    );
  }

  private send(
    endpoint: string,
    options: PlanningCenterRequestOptions
  ): Effect.Effect<SentResponse, PlanningCenterError> {
    const method = options.method ?? "GET";
    const url = endpointUrl(endpoint);
    if (this.readOnly && !isReadMethod(method)) {
      return Effect.fail(
        new PlanningCenterReadOnlyError({
          method,
          path: describePlanningCenterEndpoint(url).path,
        })
      );
    }
    const headers = HttpClientRequest.setHeaders({
      Accept: "application/json",
      Authorization: this.authorization,
    });
    const request =
      options.body === undefined
        ? headers(HttpClientRequest.make(method)(url))
        : HttpClientRequest.bodyText(
            headers(HttpClientRequest.make(method)(url)),
            JSON.stringify(options.body),
            "application/json"
          );
    const attempt = this.attempt(request);
    return isReadMethod(method)
      ? Effect.retry(attempt, transientReadRetries(url))
      : attempt;
  }

  /** Sends a request whose body is not needed, such as a DELETE. */
  request(
    endpoint: string,
    options: PlanningCenterRequestOptions = {}
  ): Effect.Effect<HttpClientResponse, PlanningCenterError> {
    return Effect.map(this.send(endpoint, options), ({ response }) => response);
  }

  private fetchJson(
    endpoint: string,
    options: PlanningCenterRequestOptions
  ): Effect.Effect<JsonValue, PlanningCenterError> {
    return Effect.flatMap(this.send(endpoint, options), readJsonBody);
  }

  fetch(
    endpoint: string,
    options: PlanningCenterRequestOptions = {}
  ): Effect.Effect<PCApiResponse<PCResource>, PlanningCenterError> {
    return Effect.flatMap(this.fetchJson(endpoint, options), (json) =>
      decodeResponse(pcResourceResponseSchema, json)
    );
  }

  fetchCollection(
    endpoint: string,
    options: PlanningCenterRequestOptions = {}
  ): Effect.Effect<PCApiResponse<PCResource[]>, PlanningCenterError> {
    return Effect.flatMap(this.fetchJson(endpoint, options), (json) =>
      decodeResponse(pcCollectionResponseSchema, json)
    );
  }

  fetchAll(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages = 10
  ): Effect.Effect<PCResource[], PlanningCenterError> {
    return Effect.map(
      this.fetchAllWithIncluded(endpoint, params, maxPages),
      ({ data }) => data
    );
  }

  /** Follows `links.next` once per URL, deduplicating included resources. */
  fetchAllWithIncluded(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages = 5
  ): Effect.Effect<
    { data: PCResource[]; included: PCResource[] },
    PlanningCenterError
  > {
    const fetchPage = (url: string) => this.fetchCollection(url);
    return Effect.gen(function* fetchPages() {
      const data: PCResource[] = [];
      const included: PCResource[] = [];
      const seenIncluded = new Set<string>();
      const seenUrls = new Set<string>();
      let pagesRemaining = maxPages;
      let url: string | undefined = buildPlanningCenterUrl(endpoint, {
        ...params,
        per_page: "100",
      });
      while (url !== undefined && pagesRemaining > 0 && !seenUrls.has(url)) {
        seenUrls.add(url);
        pagesRemaining -= 1;
        const response: PCApiResponse<PCResource[]> = yield* fetchPage(url);
        data.push(...response.data);
        for (const resource of response.included ?? []) {
          const key = `${resource.type}:${resource.id}`;
          if (!seenIncluded.has(key)) {
            seenIncluded.add(key);
            included.push(resource);
          }
        }
        const nextUrl: string | undefined = response.links?.next;
        url = isNonEmptyString(nextUrl) ? nextUrl : undefined;
      }
      return { data, included };
    });
  }
}

/** Explicit application credentials for scripts and the development auth bypass. */
export const createBasicPlanningCenterClient = (
  token: PlanningCenterPersonalAccessToken,
  httpClient: HttpClient.HttpClient
): PlanningCenterCoreClient =>
  new PlanningCenterCoreClient({ kind: "basic", ...token }, { httpClient });
