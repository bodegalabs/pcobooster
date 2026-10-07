import type * as Alchemist from "alchemy/Alchemist";
import { z } from "zod";

type DriftedResource = Alchemist.Drift.DriftedResource;

/** Deployed or live resource attributes, round-tripped through JSON. */
export const driftValueSchema = z.json();
export type DriftValue = z.infer<typeof driftValueSchema>;

/** How many differing fields a row lists before summarizing the rest. */
const MAX_LISTED_FIELDS = 6;

const isRecord = (value: DriftValue): value is { [key: string]: DriftValue } =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Dotted paths whose deployed and live values differ. Only paths are reported, never values:
 * attributes can carry tokens and binding secrets. Arrays compare as a whole.
 */
export const differingFields = (
  expected: DriftValue,
  actual: DriftValue,
  path = ""
): string[] => {
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [
      ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
    ].toSorted();
    return keys.flatMap((key) =>
      differingFields(
        expected[key] ?? null,
        actual[key] ?? null,
        path === "" ? key : `${path}.${key}`
      )
    );
  }
  return JSON.stringify(expected) === JSON.stringify(actual)
    ? []
    : [path === "" ? "(whole value)" : path];
};

const describeFields = (fields: readonly string[] | undefined): string => {
  if (fields === undefined || fields.length === 0) {
    return "";
  }
  const listed = fields
    .slice(0, MAX_LISTED_FIELDS)
    .map((field) => `\`${field}\``)
    .join(", ");
  const more = fields.length - MAX_LISTED_FIELDS;
  return more > 0 ? `${listed}, and ${more} more` : listed;
};

export interface DriftReport {
  readonly drifted: boolean;
  readonly markdown: string;
}

/** A Markdown summary of a drift check, listing every resource that is not in sync. */
export const driftReport = (
  entrypoint: string,
  stage: string,
  resources: readonly DriftedResource[],
  /** Comparable field paths by FQN; an explicit empty list means normalized attributes match. */
  fieldsByResource: ReadonlyMap<string, readonly string[]> = new Map()
): DriftReport => {
  const outOfSync = resources
    .filter(
      (resource) =>
        resource.status !== "in-sync" &&
        !(
          resource.status === "drifted" &&
          fieldsByResource.get(resource.fqn)?.length === 0
        )
    )
    .toSorted((a, b) => a.fqn.localeCompare(b.fqn));
  const heading = `### Drift: \`${entrypoint}\` stage \`${stage}\``;
  if (outOfSync.length === 0) {
    return {
      drifted: false,
      markdown: `${heading}\n\nAll ${resources.length} resources match their last deploy.`,
    };
  }
  const rows = outOfSync.map(
    (resource) =>
      `| \`${resource.fqn}\` | ${resource.resourceType} | ${resource.status} | ${describeFields(fieldsByResource.get(resource.fqn))} |`
  );
  return {
    drifted: true,
    markdown: [
      heading,
      "",
      `${outOfSync.length} of ${resources.length} resources differ from their last deploy:`,
      "",
      "| Resource | Type | Status | Differing fields |",
      "| --- | --- | --- | --- |",
      ...rows,
    ].join("\n"),
  };
};
