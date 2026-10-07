import { Schema } from "effect";

/**
 * Rows a create shows before Planning Center answers carry these ids. They exist only on this
 * device, so no write may ever send one: row actions are hidden for them, the writers resolve
 * them to the created id when the create has landed, and `requireSavedRequestIds` refuses
 * anything that still carries one.
 */
const PLACEHOLDER_PREFIXES = [
  "optimistic-",
  "optimistic:",
  "pending-",
] as const;

export const isPlaceholderId = (id: string): boolean =>
  PLACEHOLDER_PREFIXES.some((prefix) => id.startsWith(prefix));

/** A write that still names a row Planning Center never created; refused before sending. */
export class PlaceholderIdError extends Error {
  override readonly name = "PlaceholderIdError";
  constructor(id: string) {
    super(`"${id}" hasn't been created in Planning Center yet.`);
  }
}

export interface PlaceholderIds {
  land: (placeholder: string, id: string) => void;
  /** The created id for a landed placeholder, any other id unchanged. */
  resolve: (id: string) => string;
  /** The id to send, or a refusal when its create hasn't landed (or failed). */
  require: (id: string) => string;
}

/** Placeholder ids and the ids Planning Center gave them, so writes queued behind a create send the real one. */
export const makePlaceholderIds = (): PlaceholderIds => {
  const created = new Map<string, string>();
  const resolve = (id: string): string => created.get(id) ?? id;
  return {
    land: (placeholder, id) => {
      created.set(placeholder, id);
    },
    resolve,
    require: (id) => {
      const resolved = resolve(id);
      if (isPlaceholderId(resolved)) {
        throw new PlaceholderIdError(resolved);
      }
      return resolved;
    },
  };
};

const namesIds = (field: string): boolean =>
  field === "sequence" || field.endsWith("Id") || field.endsWith("Ids");

const isId = Schema.is(Schema.String);
const isIdList = Schema.is(Schema.Array(Schema.String));

interface PlanWriteFields {
  readonly [field: string]:
    | string
    | number
    | boolean
    | readonly string[]
    | null
    | undefined;
}

/** Refuses unresolved device-only IDs before constructing a native HTTP request. */
export const requireSavedRequestIds = (input: PlanWriteFields): void => {
  const named = Object.entries(input).flatMap(
    ([field, value]): readonly string[] => {
      if (!namesIds(field)) {
        return [];
      }
      if (isId(value)) {
        return [value];
      }
      return isIdList(value) ? value : [];
    }
  );
  const placeholder = named.find(isPlaceholderId);
  if (placeholder !== undefined) {
    throw new PlaceholderIdError(placeholder);
  }
};
