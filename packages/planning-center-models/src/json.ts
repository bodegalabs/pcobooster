import { z } from "zod";

export const jsonValueSchema = z.json();
export type JsonValue = z.infer<typeof jsonValueSchema>;
export interface JsonObject {
  [key: string]: JsonValue;
}

export const isString = (value: unknown): value is string =>
  typeof value === "string";

export const isNumber = (value: unknown): value is number =>
  typeof value === "number";

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
