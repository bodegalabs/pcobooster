/**
 * Report resources a stage's live cloud state no longer matches, such as a Flagship flag or DNS
 * record edited in the dashboard. The next deploy would silently overwrite those edits, so the
 * nightly drift workflow fails on any and lists them. It never repairs; redeploy (or
 * `bun alchemy drift --stage <stage> --repair`) after deciding which side is right.
 *
 *   bun scripts/cloudflare/check-drift.ts <stage> [stack file]
 *
 * Env: the credentials and settings a deploy of that stage reads.
 */
import { appendFile } from "node:fs/promises";

import * as Alchemist from "alchemy/Alchemist";
import { Effect, Option, Schema } from "effect";

import { comparableDriftFields } from "./drift-comparison";
import { driftReport, driftValueSchema } from "./drift-report";
import type { DriftValue } from "./drift-report";

const [stage, entrypoint = "alchemy.run.ts"] = process.argv.slice(2);
if (stage === undefined) {
  throw new Error("Usage: check-drift.ts <stage> [stack file]");
}

const snapshot = await Effect.runPromise(
  Alchemist.Drift.inspect({ entrypoint, stage }).pipe(
    Effect.provide(Alchemist.layer()),
    Effect.scoped
  )
);
/** Attributes as JSON: values that do not survive a round trip read as null. */
const decodeDriftValue = Schema.decodeUnknownOption(
  Schema.fromJsonString(driftValueSchema)
);
const asDriftValue = (json: string): DriftValue =>
  Option.getOrNull(decodeDriftValue(json));

const jsonFieldsOf = (
  resourceType: string,
  expected: string,
  actual: string
): readonly string[] =>
  comparableDriftFields(
    resourceType,
    asDriftValue(expected),
    asDriftValue(actual)
  );

const typesByResource = new Map(
  snapshot.resources.map(({ fqn, resourceType }) => [fqn, resourceType])
);

const fieldsByResource = new Map<string, readonly string[]>();
for (const [fqn, node] of Object.entries(
  snapshot.repairPlan.native.resources
)) {
  if (node.drift !== undefined) {
    fieldsByResource.set(
      fqn,
      jsonFieldsOf(
        typesByResource.get(fqn) ?? "",
        JSON.stringify(node.drift.expected ?? null),
        JSON.stringify(node.drift.actual ?? null)
      )
    );
  }
}
const report = driftReport(
  entrypoint,
  stage,
  snapshot.resources,
  fieldsByResource
);
process.stdout.write(`${report.markdown}\n`);
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile !== undefined && summaryFile !== "") {
  await appendFile(summaryFile, `${report.markdown}\n`);
}
if (report.drifted) {
  process.exitCode = 1;
}
