import { createHash } from "node:crypto";

import { mergeHeaders } from "@/lib/http/merge-headers";
import { elapsedMs, formatDurationMs, nowMs } from "@/lib/http/timing";
import { logger } from "@/lib/logger";
import { getPlanningCenterRequestAccessToken } from "@/lib/planning-center/request-auth-context";
import type { PCApiResponse, PCResource } from "@/lib/types";

const log = logger.for("planning-center/core");
const PC_BASE_URL = "https://api.planningcenteronline.com";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const PROACTIVE_RATE_LIMIT_THRESHOLD = 0.8;
const PROACTIVE_RATE_LIMIT_DELAY_MS = 1000;
const inFlightJsonFetches = new Map<string, Promise<unknown>>();

export interface PlanningCenterRateLimitInfo {
  limit?: number;
  count?: number;
  period?: string;
  retryAfterSeconds?: number;
}

export class PlanningCenterApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly responseBody?: string;
  readonly rateLimit?: PlanningCenterRateLimitInfo;
  readonly retryAfterSeconds?: number;

  constructor({
    message,
    status,
    code,
    details,
    responseBody,
    rateLimit,
    retryAfterSeconds,
  }: {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
    responseBody?: string;
    rateLimit?: PlanningCenterRateLimitInfo;
    retryAfterSeconds?: number;
  }) {
    super(message);
    this.name = "PlanningCenterApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.responseBody = responseBody;
    this.rateLimit = rateLimit;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PlanningCenterCoreClient {
  constructor(
    private readonly auth?: {
      accessToken: string;
    }
  ) {}

  private getClientId(): string {
    const id = process.env.PLANNING_CENTER_CLIENT;
    if (!id) {
      throw new Error("Missing PLANNING_CENTER_CLIENT environment variable");
    }
    return id;
  }

  private getPat(): string {
    const pat = process.env.PLANNING_CENTER_PAT;
    if (!pat) {
      throw new Error("Missing PLANNING_CENTER_PAT environment variable");
    }
    return pat;
  }

  private getAuthHeader(): string {
    const requestAccessToken = getPlanningCenterRequestAccessToken();
    if (requestAccessToken) {
      return `Bearer ${requestAccessToken}`;
    }

    if (this.auth?.accessToken) {
      return `Bearer ${this.auth.accessToken}`;
    }

    const credentials = Buffer.from(
      `${this.getClientId()}:${this.getPat()}`
    ).toString("base64");
    return `Basic ${credentials}`;
  }

  getCacheScope(): string {
    const accessToken =
      getPlanningCenterRequestAccessToken() ?? this.auth?.accessToken;
    if (accessToken) {
      return `bearer:${createHash("sha256").update(accessToken).digest("hex")}`;
    }

    return "basic";
  }

  async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${PC_BASE_URL}${endpoint}`;
    let lastError: Error | null = null;
    const method = (options.method ?? "GET").toUpperCase();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      const attemptStartedAtMs = nowMs();

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: mergeHeaders(
            {
              Authorization: this.getAuthHeader(),
              Accept: "application/json",
            },
            options.headers
          ),
        });
        clearTimeout(timeout);
        logPlanningCenterTiming({
          url,
          method,
          attempt,
          status: response.status,
          durationMs: elapsedMs(attemptStartedAtMs),
          rateLimit: readRateLimitInfo(response.headers),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const apiError = buildApiError(
            response.status,
            errorText,
            response.headers
          );
          const canRetry =
            isSafeToRetry(method) &&
            RETRYABLE_STATUS_CODES.has(response.status) &&
            attempt < MAX_RETRIES;
          if (canRetry) {
            const retryDelayMs = getRetryDelayMs(
              response.status,
              attempt,
              apiError
            );
            log.warn(
              {
                status: response.status,
                attempt: attempt + 1,
                retryDelayMs,
                rateLimit: apiError.rateLimit,
                url: url.replace(/\/$/, "").slice(-80),
              },
              "Planning Center API retry"
            );
            await sleep(retryDelayMs);
            continue;
          }

          throw apiError;
        }

        await maybePauseNearRateLimit(response.headers, method);

        return response;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error instanceof Error ? error : new Error(String(error));
        logPlanningCenterTiming({
          url,
          method,
          attempt,
          durationMs: elapsedMs(attemptStartedAtMs),
          error: lastError,
        });
        if (lastError instanceof PlanningCenterApiError) {
          break;
        }
        if (!isSafeToRetry(method)) {
          break;
        }
        if (!isRetryableError(lastError)) {
          break;
        }
        const canRetry = attempt < MAX_RETRIES;
        if (!canRetry) break;
        log.debug(
          { attempt: attempt + 1, error: lastError.message.slice(0, 100) },
          "Planning Center request failed, retrying"
        );
        await sleep((attempt + 1) * 300);
      }
    }

    throw lastError || new Error("Planning Center API request failed");
  }

  async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<PCApiResponse<T>> {
    const method = (options.method ?? "GET").toUpperCase();
    if (method !== "GET" || options.body) {
      const response = await this.request(endpoint, options);
      return parseJsonResponse<T>(response);
    }

    const key = buildJsonFetchDedupeKey({
      authScope: this.getCacheScope(),
      endpoint,
      headers: options.headers,
      method,
    });
    const existingRequest = inFlightJsonFetches.get(key) as
      | Promise<PCApiResponse<T>>
      | undefined;
    if (existingRequest) {
      return cloneJson(await existingRequest);
    }

    const request = this.request(endpoint, options).then(parseJsonResponse<T>);
    inFlightJsonFetches.set(key, request);

    try {
      return cloneJson(await request);
    } finally {
      if (inFlightJsonFetches.get(key) === request) {
        inFlightJsonFetches.delete(key);
      }
    }
  }

  buildUrl(endpoint: string, params: Record<string, string> = {}): string {
    const url = new URL(endpoint, PC_BASE_URL);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    return url.toString();
  }

  async fetchAll<T>(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages: number = 10
  ): Promise<T[]> {
    const allData: T[] = [];
    let url = this.buildUrl(endpoint, { ...params, per_page: "100" });
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      const response = await this.fetch<T[] | T>(url);
      const data = Array.isArray(response.data)
        ? response.data
        : [response.data];
      allData.push(...data);

      const nextUrl = response.links?.next;
      if (nextUrl && nextUrl !== url) {
        url = nextUrl;
      } else {
        hasMore = false;
      }
    }

    return allData;
  }

  async fetchAllWithIncluded<T>(
    endpoint: string,
    params: Record<string, string> = {},
    maxPages: number = 5
  ): Promise<{ data: T[]; included: PCResource[] }> {
    const allData: T[] = [];
    const allIncluded: PCResource[] = [];
    const seenIncluded = new Set<string>();
    let url = this.buildUrl(endpoint, { ...params, per_page: "100" });
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      const response = await this.fetch<T[] | T>(url);
      const data = Array.isArray(response.data)
        ? response.data
        : [response.data];
      allData.push(...data);

      for (const resource of response.included || []) {
        const key = `${resource.type}:${resource.id}`;
        if (!seenIncluded.has(key)) {
          seenIncluded.add(key);
          allIncluded.push(resource);
        }
      }

      const nextUrl = response.links?.next;
      if (nextUrl && nextUrl !== url) {
        url = nextUrl;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, included: allIncluded };
  }
}

async function parseJsonResponse<T>(
  response: Response
): Promise<PCApiResponse<T>> {
  if (response.status === 204) {
    return undefined as unknown as PCApiResponse<T>;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as unknown as PCApiResponse<T>;
  }

  return JSON.parse(text) as PCApiResponse<T>;
}

function buildApiError(
  status: number,
  responseBody: string,
  headers?: Headers
): PlanningCenterApiError {
  let code: string | undefined;
  let details: unknown;
  let message = `Planning Center API error: ${status}`;
  const rateLimit = headers ? readRateLimitInfo(headers) : undefined;

  try {
    const errorJson = JSON.parse(responseBody) as Record<string, unknown>;
    code = typeof errorJson.code === "string" ? errorJson.code : undefined;
    details = errorJson;

    const title =
      typeof errorJson.error === "string"
        ? errorJson.error
        : typeof errorJson.message === "string"
          ? errorJson.message
          : undefined;

    if (title) {
      message += ` - ${title}`;
    }
  } catch {
    if (responseBody) {
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
    retryAfterSeconds: rateLimit?.retryAfterSeconds,
  });
}

function isRetryableError(error: Error): boolean {
  if (error instanceof PlanningCenterApiError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  return error.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function buildJsonFetchDedupeKey({
  authScope,
  endpoint,
  headers,
  method,
}: {
  authScope: string;
  endpoint: string;
  headers: HeadersInit | undefined;
  method: string;
}): string {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${PC_BASE_URL}${endpoint}`;

  return JSON.stringify({
    authScope,
    headers: normalizeHeaders(headers),
    method,
    url,
  });
}

function normalizeHeaders(
  headers: HeadersInit | undefined
): [string, string][] {
  if (!headers) return [];

  return Array.from(new Headers(headers).entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
}

function isSafeToRetry(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function getRetryDelayMs(
  status: number,
  attempt: number,
  error: PlanningCenterApiError
): number {
  if (status === 429 && error.retryAfterSeconds !== undefined) {
    return Math.max(error.retryAfterSeconds, 1) * 1000;
  }

  return (attempt + 1) * 500;
}

async function maybePauseNearRateLimit(
  headers: Headers,
  method: string
): Promise<void> {
  if (!isSafeToRetry(method)) return;

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
}

function readRateLimitInfo(headers: Headers): PlanningCenterRateLimitInfo {
  return {
    limit: readIntegerHeader(headers, "x-pco-api-request-rate-limit"),
    count: readIntegerHeader(headers, "x-pco-api-request-rate-count"),
    period: headers.get("x-pco-api-request-rate-period") ?? undefined,
    retryAfterSeconds: readIntegerHeader(headers, "retry-after"),
  };
}

function readIntegerHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function logPlanningCenterTiming({
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
}) {
  if (process.env.LOG_PLANNING_CENTER_TIMINGS !== "1") return;

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
}

function describePlanningCenterEndpoint(value: string): {
  path: string;
  queryKeys: string[];
} {
  const url = new URL(value, PC_BASE_URL);
  return {
    path: url.pathname,
    queryKeys: Array.from(url.searchParams.keys()).sort(),
  };
}
