const previewStagePattern = /^pr-(?<number>[1-9]\d*)$/u;
const previewResourcePattern =
  /^pcobooster-pr-(?<number>[1-9]\d*)(?:-(?:api|web|admin))?$/u;

/** Pull request stages are the only stages CI may create or destroy without approval. */
export const isPreviewStage = (stage: string): boolean =>
  previewStagePattern.test(stage);

/** Pull request numbers owned by Worker scripts and D1 databases named by `alchemy.run.ts`. */
export const previewPullRequests = (
  resourceNames: readonly string[]
): number[] => {
  const numbers = new Set<number>();
  for (const name of resourceNames) {
    const found = previewResourcePattern.exec(name)?.groups?.number;
    if (found !== undefined) {
      numbers.add(Number(found));
    }
  }
  return [...numbers].toSorted((a, b) => a - b);
};
