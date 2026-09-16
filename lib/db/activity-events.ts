import { db } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";

export type ActivityEventType =
  | "schedule_attempt"
  | "schedule_status_change"
  | "schedule_remove"
  | "auth_session_created"
  | "auth_session_deleted"
  | "auth_account_linked";

export type ActivityEventInput = {
  eventType: ActivityEventType;
  actorUserId?: string | null;
  actorAccountId?: string | null;
  requestId?: string | null;
  path?: string | null;
  method?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean | null;
  statusCode?: number | null;
  errorCode?: string | null;
  serviceTypeId?: string | null;
  personId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type HeadersLike = {
  get: (name: string) => string | null;
};

type RequestLike = {
  method?: string;
  url?: string;
  headers?: HeadersLike;
};

type RequestContextSource =
  | RequestLike
  | {
      request?: RequestLike;
      headers?: HeadersLike;
    }
  | null
  | undefined;

export type ActivityRequestContext = {
  requestId: string | null;
  path: string | null;
  method: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getHeader(
  headers: HeadersLike | undefined,
  name: string
): string | null {
  return toNullableString(headers?.get(name));
}

function pathFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

export function getActivityRequestContext(
  source: RequestContextSource
): ActivityRequestContext {
  const request =
    source && "request" in source
      ? source.request
      : (source as RequestLike | null | undefined);
  const headers =
    source && "headers" in source && source.headers
      ? source.headers
      : request?.headers;

  return {
    requestId: getHeader(headers, "x-request-id"),
    path: pathFromUrl(request?.url),
    method: toNullableString(request?.method),
    ipAddress:
      getHeader(headers, "x-forwarded-for") ?? getHeader(headers, "x-real-ip"),
    userAgent: getHeader(headers, "user-agent"),
  };
}

function normalizeMetadata(
  metadata: ActivityEventInput["metadata"]
): Record<string, unknown> {
  if (!metadata) return {};
  try {
    return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function recordActivityEvent(
  input: ActivityEventInput
): Promise<void> {
  await db.insert(activityEvents).values({
    eventType: input.eventType,
    actorUserId: toNullableString(input.actorUserId),
    actorAccountId: toNullableString(input.actorAccountId),
    requestId: toNullableString(input.requestId),
    path: toNullableString(input.path),
    method: toNullableString(input.method),
    ipAddress: toNullableString(input.ipAddress),
    userAgent: toNullableString(input.userAgent),
    success: typeof input.success === "boolean" ? input.success : null,
    statusCode: toNullableNumber(input.statusCode),
    errorCode: toNullableString(input.errorCode),
    serviceTypeId: toNullableString(input.serviceTypeId),
    personId: toNullableString(input.personId),
    planId: toNullableString(input.planId),
    teamId: toNullableString(input.teamId),
    positionId: toNullableString(input.positionId),
    metadata: normalizeMetadata(input.metadata),
  });
}
