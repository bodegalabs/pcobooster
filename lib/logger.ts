import type { NextRequest } from "next/server";
import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/** Default `info` in all environments; set `LOG_LEVEL=warn` in production to reduce noise. */
const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  serializers: {
    err: pino.stdSerializers.err,
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "yyyy-mm-dd HH:MM:ss",
        },
      },
});

const forModule = (moduleId: string) => baseLogger.child({ module: moduleId });

const withRequest = (request: Request | NextRequest) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const path =
    "nextUrl" in request
      ? request.nextUrl.pathname
      : new URL(request.url).pathname;
  return baseLogger.child({
    path,
    method: request.method,
    requestId,
  });
};

export const logger = Object.assign(baseLogger, {
  for: forModule,
  withRequest,
});

export type Logger = typeof baseLogger;
