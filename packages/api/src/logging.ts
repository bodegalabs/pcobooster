import { Cause, Effect, Logger } from "effect";

/** Writes one line whose `fields` become its log annotations. */
type LogLine<Result> = <const Fields extends object>(
  message: string,
  fields?: Fields
) => Result;

/** Like `LogLine`, keeping a caught error's stack in the line's cause. */
type ErrorLogLine<Result> = <const Fields extends object>(
  message: string,
  fields?: Fields,
  error?: Error
) => Result;

export interface ModuleLog {
  readonly info: LogLine<Effect.Effect<void>>;
  readonly warn: LogLine<Effect.Effect<void>>;
  readonly error: ErrorLogLine<Effect.Effect<void>>;
}

/**
 * Effect logs for one module. Each line carries `module` and its own fields as annotations,
 * so they arrive beside the request ID and procedure that `executeApplicationEffect` annotates,
 * and inside the procedure's span.
 */
export const moduleLog = (module: string): ModuleLog => ({
  info: (message, fields) =>
    Effect.annotateLogs(Effect.logInfo(message), { module, ...fields }),
  warn: (message, fields) =>
    Effect.annotateLogs(Effect.logWarning(message), { module, ...fields }),
  error: (message, fields, error) =>
    Effect.annotateLogs(
      error === undefined
        ? Effect.logError(message)
        : Effect.logError(message, Cause.die(error)),
      { module, ...fields }
    ),
});

/** One structured object per line, which Workers Logs indexes field by field. */
export const structuredLogging = Logger.layer([Logger.consoleStructured]);

/**
 * Writes a log line from code that runs outside any Effect, such as Better Auth hooks and HTTP
 * handlers, in the same structured shape.
 */
export const logOutsideEffect = (line: Effect.Effect<void>): void => {
  Effect.runSync(Effect.provide(line, structuredLogging));
};

export interface BoundaryLog {
  readonly info: LogLine<void>;
  readonly warn: ErrorLogLine<void>;
  readonly error: ErrorLogLine<void>;
}

/**
 * `moduleLog` for callbacks that run outside any Effect (Better Auth hooks and endpoints, D1
 * and flag clients): each call writes its line at once.
 */
export const boundaryLog = (module: string): BoundaryLog => {
  const log = moduleLog(module);
  return {
    info: (message, fields) => {
      logOutsideEffect(log.info(message, fields));
    },
    warn: (message, fields, error) => {
      logOutsideEffect(
        error === undefined
          ? log.warn(message, fields)
          : Effect.annotateLogs(log.warn(message, fields), {
              error: error.message,
            })
      );
    },
    error: (message, fields, error) => {
      logOutsideEffect(log.error(message, fields, error));
    },
  };
};
