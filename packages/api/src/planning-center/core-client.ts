import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { mergeHeaders } from "@pcobooster/api/http/merge-headers";
import {
  elapsedMs,
  formatDurationMs,
  nowMs,
} from "@pcobooster/api/http/timing";
import { logger } from "@pcobooster/api/logger";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PlanningCenterRateLimitInfo } from "@pcobooster/api/planning-center/api-error";
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
import type { JsonValue } from "@pcobooster/planning-center-models/json";
import type {
  PCApiResponse,
  PCResource,
} from "@pcobooster/planning-center-models/types";
import { z } from "zod";

const log = logger.for("planning-center/core");
const PC_BASE_URL = "https://api.planningcenteronline.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const PROACTIVE_RATE_LIMIT_THRESHOLD = 0.8;
const PROACTIVE_RATE_LIMIT_DELAY_MS = 1000;
const inFlightJsonFetches = new Map<string, Promise<JsonValue>>();
const errorBodySchema = z.record(z.string(), z.json());

const endpointUrl = (endpoint: string): string =>
  new URL(endpoint, PC_BASE_URL).toString();

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

const parseJsonResponse = async (response: Response): Promise<JsonValue> => {
  const text = await response.text();
  if (response.status === 204 || text.trim() === "") {
    throw new PlanningCenterApiError({
      message:
        "Planning Center returned an empty response where JSON was required",
      status: response.status,
      code: "INVALID_RESPONSE",
    });
  }
  return jsonValueSchema.parse(JSON.parse(text));
};

const normalizeHeaders = (
  headers: HeadersInit | undefined
): [string, string][] =>
  [...new Headers(headers).entries()].toSorted(([left], [right]) =>
    left.localeCompare(right)
  );

const buildJsonFetchDedupeKey = ({
  authScope,
  endpoint,
  headers,
  method,
}: {
  authScope: string;
  endpoint: string;
  headers: HeadersInit | undefined;
  method: string;
}): string =>
  JSON.stringify({
    authScope,
    headers: normalizeHeaders(headers),
    method,
    url: endpointUrl(endpoint),
  });

const isReadMethod = (method: string): boolean =>
  method === "GET" || method === "HEAD";

const isRetryableError = (error: Error): boolean => {
  if (error instanceof PlanningCenterApiError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  return error.name === "AbortError" || error.name === "TimeoutError";
};

const getRetryDelayMs = (attempt: number, error: Error): number => {
  if (!(error instanceof PlanningCenterApiError)) {
    return (attempt + 1) * 300;
  }
  if (error.status === 429 && error.retryAfterSeconds !== undefined) {
    return Math.max(error.retryAfterSeconds, 1) * 1000;
  }
  return (attempt + 1) * 500;
};

const readIntegerHeader = (
  headers: Headers,
  name: string
): number | undefined => {
  const value = headers.get(name);
  if (!isNonEmptyString(value)) {
    return undefined;
  }
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readRateLimitInfo = (headers: Headers): PlanningCenterRateLimitInfo => ({
  limit: readIntegerHeader(headers, "x-pco-api-request-rate-limit"),
  count: readIntegerHeader(headers, "x-pco-api-request-rate-count"),
  period: headers.get("x-pco-api-request-rate-period") ?? undefined,
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

const buildApiError = (
  status: number,
  responseBody: string,
  headers: Headers
): PlanningCenterApiError => {
  let code: string | undefined;
  let details: JsonValue | undefined;
  let message = `Planning Center API error: ${status}`;
  const rateLimit = readRateLimitInfo(headers);
  try {
    const errorJson = errorBodySchema.parse(JSON.parse(responseBody));
    code = isString(errorJson.code) ? errorJson.code : undefined;
    details = errorJson;
    const title = errorTitle(errorJson);
    if (isNonEmptyString(title)) {
      message += ` - ${title}`;
    }
  } catch {
    if (responseBody !== "") {
      message += ` - ${responseBody}`;
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

const maybePauseNearRateLimit = async (
  headers: Headers,
  method: string
): Promise<void> => {
  if (!isReadMethod(method)) {
    return;
  }
  const rateLimit = readRateLimitInfo(headers);
  if (
    rateLimit.limit === undefined ||
    rateLimit.count === undefined ||
    rateLimit.count < rateLimit.limit * PROACTIVE_RATE_LIMIT_THRESHOLD
  ) {
    return;
  }
  log.debug(
    { rateLimit },
    "Planning Center API rate limit threshold reached; pausing briefly"
  );
  await sleep(PROACTIVE_RATE_LIMIT_DELAY_MS);
};

const describePlanningCenterEndpoint = (value: string) => {
  const url = new URL(value, PC_BASE_URL);
  return {
    path: url.pathname,
    queryKeys: [...url.searchParams.keys()].toSorted(),
  };
};

const logPlanningCenterTiming = ({
  url,
  method,
  attempt,
  status,
  durationMs,
  rateLimit,
  error,
}: {
  url: string;
  method: string;
  attempt: number;
  status?: number;
  durationMs: number;
  rateLimit?: PlanningCenterRateLimitInfo;
  error?: Error;
}) => {
  if (process.env.LOG_PLANNING_CENTER_TIMINGS !== "1") {
    return;
  }
  log.debug(
    {
      method,
      status,
      attempt: attempt + 1,
      durationMs: formatDurationMs(durationMs),
      endpoint: describePlanningCenterEndpoint(url),
      rateLimit,
      error: error?.message.slice(0, 100),
    },
    "Planning Center API timing"
  );
};

/** A Planning Center personal access token: application ID plus secret. */
export interface PlanningCenterPersonalAccessToken {
  readonly applicationId: string;
  readonly secret: string;
}

export type PlanningCenterAuthentication =
  | ({ readonly kind: "basic" } & PlanningCenterPersonalAccessToken)
  | { readonly kind: "bearer"; readonly accessToken: string };

export interface PlanningCenterCoreClientOptions {
  /** Rejects every non-read request before it reaches Planning Center. */
  readonly readOnly: boolean;
}

export class PlanningCenterCoreClient {
  private readonly auth: PlanningCenterAuthentication;
  private readonly options: PlanningCenterCoreClientOptions;

  constructor(
    auth: PlanningCenterAuthentication,
    options?: PlanningCenterCoreClientOptions
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
    this.auth = { ...auth };
    this.options = { readOnly: options?.readOnly ?? false };
  }

  private getAuthHeader(): string {
    return this.auth.kind === "bearer"
      ? `Bearer ${this.auth.accessToken}`
      : `Basic ${Buffer.from(`${this.auth.applicationId}:${this.auth.secret}`).toString("base64")}`;
  }

  getCacheScope(): string {
    const credential =
      this.auth.kind === "bearer"
        ? this.auth.accessToken
        : `${this.auth.applicationId}:${this.auth.secret}`;
    return `${this.auth.kind}:${createHash("sha256").update(credential).digest("hex")}`;
  }

  private async requestAttempt(
    url: string,
    options: RequestInit,
    attempt: number
  ): Promise<Response> {
    const method = (options.method ?? "GET").toUpperCase();
    const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const startedAt = nowMs();
    try {
      const headers = mergeHeaders(
        { Accept: "application/json" },
        options.headers
      );
      headers.set("Authorization", this.getAuthHeader());
      const response = await fetch(url, {
        ...options,
        signal,
        headers,
      });
      logPlanningCenterTiming({
        url,
        method,
        attempt,
        status: response.status,
        durationMs: elapsedMs(startedAt),
        rateLimit: readRateLimitInfo(response.headers),
      });
      if (!response.ok) {
        throw buildApiError(
          response.status,
          await response.text(),
          response.headers
        );
      }
      await maybePauseNearRateLimit(response.headers, method);
      return response;
    } catch (error) {
      const requestError =
        error instanceof Error ? error : new Error(String(error));
      logPlanningCenterTiming({
        url,
        method,
        attempt,
        durationMs: elapsedMs(startedAt),
        error: requestError,
      });
      if (
        options.signal?.aborted === true ||
        !isReadMethod(method) ||
        !isRetryableError(requestError) ||
        attempt >= MAX_RETRIES
      ) {
        throw requestError;
      }
      const retryDelayMs = getRetryDelayMs(attempt, requestError);
      log.warn(
        {
          attempt: attempt + 1,
          retryDelayMs,
          endpoint: describePlanningCenterEndpoint(url),
          error: requestError.message.slice(0, 100),
        },
        "Planning Center request failed, retrying"
      );
      await sleep(retryDelayMs, null, { signal: options.signal ?? undefined });
      return await this.requestAttempt(url, options, attempt + 1);
    }
  }

  async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const method = (options.method ?? "GET").toUpperCase();
    if (this.options.readOnly && !isReadMethod(method)) {
      throw new PlanningCenterReadOnlyError({
        method,
        path: describePlanningCenterEndpoint(endpointUrl(endpoint)).path,
      });
    }
    return await this.requestAttempt(endpointUrl(endpoint), options, 0);
  }

  private async loadJson(
    endpoint: string,
    options: RequestInit
  ): Promise<JsonValue> {
    return await parseJsonResponse(await this.request(endpoint, options));
  }

  private async fetchJson(
    endpoint: string,
    options: RequestInit
  ): Promise<JsonValue> {
    const method = (options.method ?? "GET").toUpperCase();
    // Caller-owned cancellation must not cancel another caller's shared request.
    if (
      method !== "GET" ||
      (options.body !== undefined && options.body !== null) ||
      options.signal
    ) {
      return await this.loadJson(endpoint, options);
    }
    const key = buildJsonFetchDedupeKey({
      authScope: this.getCacheScope(),
      endpoint,
      headers: options.headers,
      method,
    });
    const existing = inFlightJsonFetches.get(key);
    if (existing) {
      return structuredClone(await existing);
    }
    const pending = this.loadJson(endpoint, options);
    inFlightJsonFetches.set(key, pending);
    try {
      return structuredClone(await pending);
    } finally {
      if (inFlightJsonFetches.get(key) === pending) {
        inFlightJsonFetches.delete(key);
      }
    }
  }

  async fetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<PCApiResponse<PCResource>> {
    return pcResourceResponseSchema.parse(
      await this.fetchJson(endpoint, options)
    );
  }

  async fetchCollection(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<PCApiResponse<PCResource[]>> {
    return pcCollectionResponseSchema.parse(
      await this.fetchJson(endpoint, options)
    );
  }

  async fetchAll(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages = 10,
    signal?: AbortSignal
  ): Promise<PCResource[]> {
    const response = await this.fetchAllWithIncluded(
      endpoint,
      params,
      maxPages,
      signal
    );
    return response.data;
  }

  async fetchAllWithIncluded(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages = 5,
    signal?: AbortSignal
  ): Promise<{ data: PCResource[]; included: PCResource[] }> {
    const data: PCResource[] = [];
    const included: PCResource[] = [];
    const seenIncluded = new Set<string>();
    const seenUrls = new Set<string>();
    const visit = async (
      url: string,
      pagesRemaining: number
    ): Promise<void> => {
      if (pagesRemaining <= 0 || seenUrls.has(url)) {
        return;
      }
      seenUrls.add(url);
      const response = await this.fetchCollection(url, { signal });
      data.push(...response.data);
      for (const resource of response.included ?? []) {
        const key = `${resource.type}:${resource.id}`;
        if (!seenIncluded.has(key)) {
          seenIncluded.add(key);
          included.push(resource);
        }
      }
      const nextUrl = response.links?.next;
      if (isNonEmptyString(nextUrl)) {
        await visit(nextUrl, pagesRemaining - 1);
      }
    };
    await visit(
      buildPlanningCenterUrl(endpoint, { ...params, per_page: "100" }),
      maxPages
    );
    return { data, included };
  }
}

/** The local personal access token used by scripts and the development auth bypass. */
export const readLocalPlanningCenterPersonalAccessToken =
  (): PlanningCenterPersonalAccessToken => {
    const applicationId = process.env.PLANNING_CENTER_CLIENT;
    const secret = process.env.PLANNING_CENTER_PAT;
    if (!isNonEmptyString(applicationId)) {
      throw new Error("Missing PLANNING_CENTER_CLIENT environment variable");
    }
    if (!isNonEmptyString(secret)) {
      throw new Error("Missing PLANNING_CENTER_PAT environment variable");
    }
    return { applicationId, secret };
  };

/** Explicit application credentials for scripts and the development auth bypass. */
export const createBasicPlanningCenterClient = (): PlanningCenterCoreClient =>
  new PlanningCenterCoreClient({
    kind: "basic",
    ...readLocalPlanningCenterPersonalAccessToken(),
  });
