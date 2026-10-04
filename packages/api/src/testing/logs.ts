import { isString } from "@pcobooster/planning-center-models/json";
import { Effect, Logger, References } from "effect";
import type { Fiber } from "effect";

/** A line's annotations, without `module`. */
const fieldsOf = (fiber: Fiber.Fiber<unknown, unknown>) => {
  const { module: _module, ...fields } = fiber.getRef(
    References.CurrentLogAnnotations
  );
  return fields;
};

export interface LoggedLine {
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly fields: ReturnType<typeof fieldsOf>;
}

const levelOf = (level: string): LoggedLine["level"] => {
  if (level === "Warn") {
    return "warn";
  }
  return level === "Error" || level === "Fatal" ? "error" : "info";
};

/** Captures every Effect log line a program writes, for assertions. */
export const recordLogs = () => {
  const lines: LoggedLine[] = [];
  const logger = Logger.make(({ message, logLevel, fiber }) => {
    const parts: readonly unknown[] = Array.isArray(message)
      ? message
      : [message];
    const [first] = parts;
    lines.push({
      level: levelOf(logLevel),
      message: isString(first) ? first : "",
      fields: fieldsOf(fiber),
    });
  });
  const layer = Logger.layer([logger]);
  const capture = <Value, Failure, Services>(
    effect: Effect.Effect<Value, Failure, Services>
  ): Effect.Effect<Value, Failure, Services> => Effect.provide(effect, layer);
  return { lines, layer, capture };
};
