import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  decodeSource,
  decodeStamp,
  sourceState,
  stampArtifact,
  treeSha256,
  verifyArtifact,
  verifySmokeEvidence,
} from "./artifact-provenance";

const repo = path.resolve(import.meta.dirname, "../../../..");
const [command, file, app, kind] = process.argv.slice(2);
const json = (
  value: ReturnType<typeof sourceState> | ReturnType<typeof stampArtifact>
) => `${JSON.stringify(value, null, 2)}\n`;
const required = (value: string | undefined): string => {
  if (value === undefined) {
    throw new Error("Missing artifact CLI argument.");
  }
  return value;
};
const artifactKind = (value: string | undefined) => {
  if (value !== "release-smoke-app" && value !== "release-archive-app") {
    throw new Error("Specify release-smoke-app or release-archive-app.");
  }
  return value;
};

if (command === "source") {
  console.log(json(sourceState(repo)));
} else if (command === "record") {
  // `file` holds the source snapshot taken before building, and becomes the artifact stamp.
  const before = decodeSource(
    JSON.parse(readFileSync(required(file), "utf-8"))
  );
  writeFileSync(
    required(file),
    json(
      stampArtifact(
        artifactKind(kind),
        before,
        sourceState(repo),
        required(app)
      )
    )
  );
} else if (command === "verify") {
  const stamp = decodeStamp(JSON.parse(readFileSync(required(file), "utf-8")));
  verifyArtifact(stamp, sourceState(repo), required(app), artifactKind(kind));
} else if (command === "tree-hash") {
  console.log(treeSha256(required(file)));
} else if (command === "seal-evidence") {
  writeFileSync(`${required(file)}.sha256`, `${treeSha256(required(file))}\n`);
} else if (command === "verify-evidence") {
  verifySmokeEvidence(
    required(file),
    readFileSync(`${required(file)}.sha256`, "utf-8").trim(),
    sourceState(repo),
    required(app)
  );
} else {
  throw new Error(
    "artifact-cli.ts source|record <file> <app> <kind>|verify <file> <app> <kind>|tree-hash <directory>"
  );
}
