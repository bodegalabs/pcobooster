import type { JsonValue } from "@pcobooster/planning-center-models/json";

export interface PlanningCenterRateLimitInfo {
  limit?: number;
  count?: number;
  period?: string;
  retryAfterSeconds?: number;
}

interface PlanningCenterApiErrorOptions {
  message: string;
  status: number;
  cause?: unknown;
  code?: string;
  details?: JsonValue;
  responseBody?: string;
  rateLimit?: PlanningCenterRateLimitInfo;
  retryAfterSeconds?: number;
}

export class PlanningCenterApiError extends Error {
  override readonly name = "PlanningCenterApiError";
  readonly status: number;
  readonly code?: string;
  readonly details?: JsonValue;
  readonly responseBody?: string;
  readonly rateLimit?: PlanningCenterRateLimitInfo;
  readonly retryAfterSeconds?: number;

  constructor(options: PlanningCenterApiErrorOptions) {
    super(options.message, { cause: options.cause });
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.responseBody = options.responseBody;
    this.rateLimit = options.rateLimit;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
