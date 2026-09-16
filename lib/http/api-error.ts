import type { z } from "zod";

export class ApiError extends Error {
  override name = "ApiError";
  readonly status: number;
  readonly code: string;
  readonly details?: string | readonly z.core.$ZodIssue[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: string | readonly z.core.$ZodIssue[]
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
