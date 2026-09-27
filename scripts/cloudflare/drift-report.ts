import type * as Alchemist from "alchemy/Alchemist";

type DriftedResource = Alchemist.Drift.DriftedResource;

export interface DriftReport {
  readonly drifted: boolean;
  readonly markdown: string;
}

/** A Markdown summary of a drift check, listing every resource that is not in sync. */
export const driftReport = (
  entrypoint: string,
  stage: string,
  resources: readonly DriftedResource[]
): DriftReport => {
  const outOfSync = resources
    .filter((resource) => resource.status !== "in-sync")
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
      `| \`${resource.fqn}\` | ${resource.resourceType} | ${resource.status} |`
  );
  return {
    drifted: true,
    markdown: [
      heading,
      "",
      `${outOfSync.length} of ${resources.length} resources differ from their last deploy:`,
      "",
      "| Resource | Type | Status |",
      "| --- | --- | --- |",
      ...rows,
    ].join("\n"),
  };
};
