import { mergeHeaders } from "@worship-admin/api/http/merge-headers";
import {
  elapsedMs,
  formatDurationMs,
  nowMs,
} from "@worship-admin/api/http/timing";
import type { JsonValue } from "@worship-admin/planning-center-models/json";
import { z } from "zod";

export class HttpClientError extends Error {
  override name = "HttpClientError";
  readonly status: number;
  readonly code?: string;
  readonly details?: JsonValue;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: JsonValue
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const errorResponseSchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
  details: z.json().optional(),
});

const parseError = async (response: Response): Promise<HttpClientError> => {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const result = errorResponseSchema.safeParse(await response.json());
    if (result.success) {
      return new HttpClientError(
        result.data.error ?? fallback,
        response.status,
        result.data.code,
        result.data.details
      );
    }
  } catch {
    // A failed request may return an empty body or an HTML error page.
  }
  return new HttpClientError(fallback, response.status);
};

const logHttpTiming = (
  url: string,
  init: RequestInit,
  startedAtMs: number,
  response?: Response,
  errorMessage?: string
): void => {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_HTTP_TIMING_LOGS !== "1"
  ) {
    return;
  }
  console.debug("[http]", {
    method: (init.method ?? "GET").toUpperCase(),
    url,
    status: response?.status ?? "ERR",
    durationMs: formatDurationMs(elapsedMs(startedAtMs)),
    routeMs: response?.headers.get("x-worshipadmin-route-ms"),
    error: errorMessage,
  });
};

const requestJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit
): Promise<T> => {
  const startedAtMs = nowMs();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    logHttpTiming(
      url,
      init,
      startedAtMs,
      undefined,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
  logHttpTiming(url, init, startedAtMs, response);
  if (!response.ok) {
    throw await parseError(response);
  }
  let payload: unknown;
  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new HttpClientError(
        "Expected a JSON response",
        response.status,
        "INVALID_RESPONSE"
      );
    }
    const text = await response.text();
    if (text.trim() !== "") {
      payload = JSON.parse(text);
    }
  }
  return schema.parse(payload);
};

export const getJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<T> => await requestJson(url, schema, { method: "GET", ...init });

interface JsonBody {
  [key: string]: JsonValue | undefined;
}

type MutationInit = Omit<RequestInit, "method" | "body">;

const mutateJson = async <T>(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  schema: z.ZodType<T>,
  body?: JsonBody,
  init?: MutationInit
): Promise<T> => {
  const { headers: initHeaders, ...rest } = init ?? {};
  return await requestJson(url, schema, {
    ...rest,
    method,
    headers: mergeHeaders({ "Content-Type": "application/json" }, initHeaders),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

export const postJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  body?: JsonBody,
  init?: MutationInit
): Promise<T> => await mutateJson("POST", url, schema, body, init);

export const patchJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  body?: JsonBody,
  init?: MutationInit
): Promise<T> => await mutateJson("PATCH", url, schema, body, init);

export const deleteJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  body?: JsonBody,
  init?: MutationInit
): Promise<T> => await mutateJson("DELETE", url, schema, body, init);
