import pino from "pino";

const baseLogger = pino({
  level: "info",
  serializers: {
    err: pino.stdSerializers.err,
  },
});

const forModule = (moduleId: string) => baseLogger.child({ module: moduleId });

const withRequest = (request: Request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const path = new URL(request.url).pathname;
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
